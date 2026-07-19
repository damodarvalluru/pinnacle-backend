/* ==========================================================
   CONTACT FORM ROUTES
   Handles submissions from the new premium Contact Form on the
   public site. On a valid submission this:
     1. Stores the enquiry in the `contact_messages` table
        (created automatically if it doesn't exist yet).
     2. Emails the full details to the academy Gmail inbox via
        Nodemailer.
     3. Sends the same details to the academy WhatsApp number via
        the same Twilio client already used elsewhere in this
        backend for SMS alerts (Twilio's WhatsApp channel).
   Steps 2 and 3 are each wrapped so that a failure in one never
   blocks the other, and the DB write always happens first so no
   enquiry is ever lost even if both notification channels fail.
   ========================================================== */

const express = require("express");
const router = express.Router();
const db = require("../db");
const nodemailer = require("nodemailer");
const twilio = require("twilio");

// ----------------------------------------------------------
// One-time table bootstrap (mirrors the lazy-create style used
// elsewhere in this project rather than requiring a manual migration)
// ----------------------------------------------------------
let tableReady = false;
async function ensureTable() {
    if (tableReady) return;
    await db.execute(`
        CREATE TABLE IF NOT EXISTS contact_messages (
            id INT AUTO_INCREMENT PRIMARY KEY,
            name VARCHAR(150) NOT NULL,
            mobile VARCHAR(20) NOT NULL,
            email VARCHAR(150) NOT NULL,
            location VARCHAR(150) NOT NULL,
            dob DATE NOT NULL,
            message TEXT NOT NULL,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
    `);
    tableReady = true;
}

// ----------------------------------------------------------
// Nodemailer transporter — Gmail via App Password
// (GMAIL_USER / GMAIL_APP_PASSWORD come from .env, see README)
//
// FIX #1: credentials are now trimmed/sanitized. Google displays App
// Passwords in 4-character groups with spaces ("abcd efgh ijkl mnop")
// and it's extremely common to paste that straight into an env var —
// Gmail then rejects the login outright, which looks exactly like
// "email is not working at all" with no useful client-side symptom.
//
// FIX #2: two transporters are configured — port 465 (implicit TLS)
// as the primary, and port 587 (STARTTLS) as a fallback. Some
// network paths only allow one of the two outbound SMTP ports; if
// 465 is blocked/unreliable from the host, every send would fail
// silently until now. sendContactEmail() below tries 465 first and
// automatically retries on 587 if that attempt fails for a
// connection-level reason (not a credentials/auth rejection).
//
// FIX #3 (from before): explicit short timeouts so a stuck
// connection fails fast instead of hanging for minutes.
// ----------------------------------------------------------
const GMAIL_USER = (process.env.GMAIL_USER || "").trim();
const GMAIL_APP_PASSWORD = (process.env.GMAIL_APP_PASSWORD || "").replace(/\s+/g, "");

// FIX #4: third-tier fallback over HTTPS (port 443) via the Resend
// API. Render logs showed port 465 timing out and port 587 was also
// failing to verify - that pattern (both SMTP ports unreachable)
// means outbound SMTP itself is being blocked/throttled by the
// host's network, not a Gmail credentials problem. No amount of
// SMTP retrying fixes that, because SMTP as a protocol is what's
// blocked. Resend's API runs over plain HTTPS, the same port your
// app already uses for every other outbound call (Razorpay, Twilio),
// so it isn't subject to that block.
// This is OPTIONAL: if RESEND_API_KEY / RESEND_FROM aren't set in
// the environment, this fallback is simply skipped and behavior is
// identical to before. To enable it:
//   1. Create a free account at https://resend.com
//   2. Verify a sending domain (or use their test address during
//      setup) and generate an API key.
//   3. Set RESEND_API_KEY and RESEND_FROM (e.g. "Pinnacle Scholars
//      <noreply@yourdomain.com>") as environment variables on Render.
const RESEND_API_KEY = (process.env.RESEND_API_KEY || "").trim();
const RESEND_FROM = (process.env.RESEND_FROM || "").trim();
const RESEND_CONFIGURED = Boolean(RESEND_API_KEY && RESEND_FROM);

async function sendViaResendHttp(mailOptions) {
    const response = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: {
            "Authorization": `Bearer ${RESEND_API_KEY}`,
            "Content-Type": "application/json"
        },
        body: JSON.stringify({
            from: RESEND_FROM,
            to: [mailOptions.to],
            reply_to: mailOptions.replyTo,
            subject: mailOptions.subject,
            html: mailOptions.html
        })
    });

    if (!response.ok) {
        const errorBody = await response.text().catch(() => "");
        const httpErr = new Error(`Resend API error ${response.status}: ${errorBody}`);
        httpErr.code = `RESEND_HTTP_${response.status}`;
        throw httpErr;
    }

    return response.json();
}

function buildTransporter(port, secure) {
    return nodemailer.createTransport({
        host: "smtp.gmail.com",
        port,
        secure, // true for 465, false for 587 (STARTTLS)
        auth: {
            user: GMAIL_USER,
            pass: GMAIL_APP_PASSWORD
        },
        connectionTimeout: 10000, // fail fast instead of hanging for minutes
        greetingTimeout: 10000,
        socketTimeout: 10000
    });
}

const mailTransporterPrimary = buildTransporter(465, true);
const mailTransporterFallback = buildTransporter(587, false);

const CONNECTION_LEVEL_CODES = ["ETIMEDOUT", "ECONNECTION", "ESOCKET", "ECONNREFUSED"];

async function sendContactEmail(mailOptions) {
    try {
        await mailTransporterPrimary.sendMail(mailOptions);
        return { sent: true, via: "465" };
    } catch (primaryErr) {
        // Only retry on connection-level failures — an auth rejection
        // (wrong password) will fail on 587 too, so don't waste time.
        if (!CONNECTION_LEVEL_CODES.includes(primaryErr.code)) throw primaryErr;

        console.warn("⚠️  Port 465 email send failed, retrying on port 587 (STARTTLS)...", primaryErr.code);
        try {
            await mailTransporterFallback.sendMail(mailOptions);
            return { sent: true, via: "587" };
        } catch (fallbackErr) {
            const fallbackConnectionLevel = CONNECTION_LEVEL_CODES.includes(fallbackErr.code);
            if (!fallbackConnectionLevel || !RESEND_CONFIGURED) throw fallbackErr;

            console.warn("⚠️  Port 587 email send also failed, retrying via Resend HTTPS API...", fallbackErr.code);
            await sendViaResendHttp(mailOptions);
            return { sent: true, via: "resend-http" };
        }
    }
}

// Verify transporters once at startup so misconfigured Gmail
// credentials (wrong app password, 2FA not enabled, etc.) show up
// clearly in the server logs immediately, instead of silently
// failing only when a real visitor submits the form.
//
// FIX: this used to verify ONLY the primary (465) transporter and
// log a flat "emails will not send" failure the moment that one
// call timed out - even though sendContactEmail() already falls
// back to port 587 for exactly that class of error. That made the
// startup log say email was completely broken when it may well
// still work via the fallback port, which is misleading and (on
// hosts like Render, where outbound port 465 is sometimes
// slow/unreliable while 587 works fine) was the normal case rather
// than the exception. Now: if the primary fails with a
// connection-level error, the fallback is verified too before we
// decide email is actually down.
if (GMAIL_USER && GMAIL_APP_PASSWORD) {
    const CONNECTION_LEVEL_CODES = ["ETIMEDOUT", "ECONNECTION", "ESOCKET", "ECONNREFUSED"];

    mailTransporterPrimary.verify((primaryErr) => {
        if (!primaryErr) {
            console.log("✅ Nodemailer transporter verified on port 465 — ready to send contact form emails.");
            return;
        }

        const isConnectionLevel = CONNECTION_LEVEL_CODES.includes(primaryErr.code);
        if (!isConnectionLevel) {
            // Auth/credential rejection — port 587 will fail the same way, no point checking it.
            console.error("❌ Nodemailer transporter verification FAILED — emails will not send:", {
                message: primaryErr.message,
                code: primaryErr.code,
                response: primaryErr.response
            });
            console.error(
                "   ➜ Check: GMAIL_USER is a full Gmail address, GMAIL_APP_PASSWORD is the 16-character " +
                "Google App Password with NO spaces (NOT your normal Gmail password), and 2-Step Verification " +
                "is ON for that Google account. Generate a fresh one at https://myaccount.google.com/apppasswords"
            );
            return;
        }

        console.warn(`⚠️  Port 465 verification failed (${primaryErr.code}), checking fallback port 587...`);

        mailTransporterFallback.verify((fallbackErr) => {
            if (!fallbackErr) {
                console.log(
                    "✅ Nodemailer transporter verified on fallback port 587 — contact form emails will still " +
                    "send (port 465 is currently slow/blocked on this network, but sendContactEmail() already " +
                    "falls back to 587 automatically)."
                );
                return;
            }

            console.error("❌ Nodemailer transporter verification FAILED on both ports — SMTP emails will not send:", {
                port465: { message: primaryErr.message, code: primaryErr.code },
                port587: { message: fallbackErr.message, code: fallbackErr.code }
            });
            console.error(
                "   ➜ Both ports timed out, which usually means outbound SMTP is being blocked/throttled by " +
                "the host's network rather than a credentials problem."
            );
            if (RESEND_CONFIGURED) {
                console.log(
                    "✅ Resend HTTPS fallback is configured (RESEND_API_KEY / RESEND_FROM set) — contact form " +
                    "emails will still go out via Resend instead of SMTP."
                );
            } else {
                console.error(
                    "   ➜ Resend HTTPS fallback is NOT configured yet, so email is currently fully down. Set " +
                    "RESEND_API_KEY and RESEND_FROM in the environment to route around the SMTP block " +
                    "(see comments above GMAIL_USER for setup steps)."
                );
            }
        });
    });
} else {
    console.warn("⚠️  GMAIL_USER / GMAIL_APP_PASSWORD not set in environment — contact form emails are disabled.");
}

// ----------------------------------------------------------
// Twilio client for WhatsApp — reuses the same credentials the
// project already uses for SMS cron alerts in server.js
//
// FIX: an explicit request `timeout` is now set so a stalled
// Twilio API call fails fast instead of hanging (mirrors the
// Nodemailer timeouts above). A startup check also fetches the
// account status once so a suspended/expired Twilio account (a
// very common reason WhatsApp can go from "sometimes fails" to
// "always fails" with ZERO code changes) shows up immediately
// in the logs instead of only failing silently per-submission.
// ----------------------------------------------------------
const TWILIO_SID = (process.env.TWILIO_SID || "").trim();
const TWILIO_AUTH_TOKEN = (process.env.TWILIO_AUTH_TOKEN || "").trim();
const TWILIO_WHATSAPP_FROM = (process.env.TWILIO_WHATSAPP_FROM || "").trim();
const CONTACT_NOTIFY_WHATSAPP = (process.env.CONTACT_NOTIFY_WHATSAPP || "").trim();

const twilioClient = twilio(TWILIO_SID, TWILIO_AUTH_TOKEN, { timeout: 8000 });

if (TWILIO_SID && TWILIO_AUTH_TOKEN) {
    twilioClient.api.v2010.accounts(TWILIO_SID).fetch()
        .then((account) => {
            if (account.status !== "active") {
                console.error(`❌ Twilio account status is "${account.status}" (not "active") — WhatsApp sends will fail. Check https://console.twilio.com/`);
            } else {
                console.log("✅ Twilio account verified and active — ready to send WhatsApp notifications.");
                console.log(
                    "   ➜ Reminder: if TWILIO_WHATSAPP_FROM is the Twilio Sandbox number (+14155238886), " +
                    "the recipient's WhatsApp must re-send \"join <your-sandbox-code>\" to it every 72 hours " +
                    "of inactivity, or every send will silently fail with error 63016/63018."
                );
            }
        })
        .catch((err) => {
            console.error("❌ Twilio account verification FAILED — WhatsApp will not send:", {
                message: err.message,
                code: err.code,
                moreInfo: err.moreInfo
            });
            console.error("   ➜ Check TWILIO_SID and TWILIO_AUTH_TOKEN are current and the account isn't suspended (trial funds exhausted, etc.) at https://console.twilio.com/");
        });
} else {
    console.warn("⚠️  TWILIO_SID / TWILIO_AUTH_TOKEN not set in environment — WhatsApp notifications are disabled.");
}

// One retry for genuinely transient network failures only — Twilio
// error codes for bad numbers, unjoined sandbox, etc. won't succeed
// on retry, so those are NOT retried (no point burning the extra
// round-trip / delaying the response).
const TWILIO_RETRYABLE_CODES = new Set([20429, 429]); // rate limited
async function sendContactWhatsApp(body) {
    const payload = {
        from: `whatsapp:${TWILIO_WHATSAPP_FROM}`,
        to: `whatsapp:${CONTACT_NOTIFY_WHATSAPP}`,
        body
    };
    try {
        await twilioClient.messages.create(payload);
    } catch (err) {
        if (TWILIO_RETRYABLE_CODES.has(err.code)) {
            await twilioClient.messages.create(payload); // single immediate retry
            return;
        }
        throw err;
    }
}

function isValidEmail(email) {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

function isValidMobile(mobile) {
    return /^[0-9+\-\s]{7,15}$/.test(mobile);
}

router.post("/submit", async (req, res) => {
    try {
        const { name, mobile, email, location, dob, message } = req.body;

        // ---- Validation ----
        if (!name || !mobile || !email || !location || !dob || !message) {
            return res.status(400).json({
                success: false,
                message: "All fields are required."
            });
        }

        if (!isValidEmail(email)) {
            return res.status(400).json({
                success: false,
                message: "Please enter a valid email address."
            });
        }

        if (!isValidMobile(mobile)) {
            return res.status(400).json({
                success: false,
                message: "Please enter a valid mobile number."
            });
        }

        // ---- Date of Birth: format + future-date validation ----
        // A date of birth can never be in the future, so this is
        // rejected here as well as on the frontend (the frontend
        // check can always be bypassed by calling the API directly,
        // so the backend is the real source of truth).
        const dobDate = new Date(dob);
        if (isNaN(dobDate.getTime())) {
            return res.status(400).json({
                success: false,
                message: "Please enter a valid Date of Birth."
            });
        }
        const todayEnd = new Date();
        todayEnd.setHours(23, 59, 59, 999);
        if (dobDate.getTime() > todayEnd.getTime()) {
            return res.status(400).json({
                success: false,
                message: "Date of Birth cannot be a future date."
            });
        }

        await ensureTable();

        // ---- 1. Store in DB (always happens first) ----
        await db.execute(
            `
            INSERT INTO contact_messages
            (name, mobile, email, location, dob, message)
            VALUES (?, ?, ?, ?, ?, ?)
            `,
            [name, mobile, email, location, dob, message]
        );

        // ---- 2 & 3. Email + WhatsApp — fired in PARALLEL ----
        // FIX: these used to run sequentially (await email, THEN await
        // WhatsApp). If the Gmail SMTP connection was slow/stuck, the
        // WhatsApp message — which normally sends in under a second —
        // only went out AFTER that email step finally timed out, which
        // is why WhatsApp appeared to "take 2-3 minutes". Running both
        // with Promise.allSettled() means neither one waits on the
        // other, and the 10s timeouts on the mail transporter (above)
        // put a hard ceiling on the worst case.
        let emailError = null;
        let whatsappError = null;

        const emailPromise = (async () => {
            if (!GMAIL_USER || !GMAIL_APP_PASSWORD) {
                emailError = "Email notifications are not configured on the server (missing GMAIL_USER / GMAIL_APP_PASSWORD).";
                console.warn("⚠️  Contact form:", emailError);
                return false;
            }
            try {
                const result = await sendContactEmail({
                    from: `"Pinnacle Scholars Website" <${GMAIL_USER}>`,
                    to: process.env.CONTACT_NOTIFY_EMAIL || GMAIL_USER,
                    replyTo: email,
                    subject: `New Contact Form Enquiry — ${name}`,
                    html: `
                        <h2>New Enquiry — Pinnacle Scholars Academy</h2>
                        <p><strong>Name:</strong> ${name}</p>
                        <p><strong>Mobile:</strong> ${mobile}</p>
                        <p><strong>Email:</strong> ${email}</p>
                        <p><strong>Location:</strong> ${location}</p>
                        <p><strong>Date of Birth:</strong> ${dob}</p>
                        <p><strong>Message:</strong><br>${message}</p>
                    `
                });
                console.log(`✅ Contact form: email sent to ${process.env.CONTACT_NOTIFY_EMAIL || GMAIL_USER} via port ${result.via}`);
                return true;
            } catch (mailErr) {
                // Log the FULL error (not just .message) — Nodemailer/Gmail auth
                // failures (wrong app password, 2FA not enabled, etc.) usually
                // carry a `.code` / `.response` with the real reason.
                console.error("❌ Contact form email failed on BOTH ports (465 and 587):", {
                    message: mailErr.message,
                    code: mailErr.code,
                    response: mailErr.response
                });
                emailError = `${mailErr.code || "EMAIL_ERROR"}: ${mailErr.message}`;
                return false;
            }
        })();

        const whatsappPromise = (async () => {
            if (!TWILIO_SID || !TWILIO_AUTH_TOKEN || !TWILIO_WHATSAPP_FROM || !CONTACT_NOTIFY_WHATSAPP) {
                whatsappError = "WhatsApp notifications are not configured on the server (missing Twilio env vars).";
                console.warn("⚠️  Contact form:", whatsappError);
                return false;
            }
            try {
                await sendContactWhatsApp(
                    `📩 *New Website Enquiry*\n` +
                    `Name: ${name}\n` +
                    `Mobile: ${mobile}\n` +
                    `Email: ${email}\n` +
                    `Location: ${location}\n` +
                    `DOB: ${dob}\n` +
                    `Message: ${message}`
                );
                console.log("✅ Contact form: WhatsApp sent to", CONTACT_NOTIFY_WHATSAPP);
                return true;
            } catch (waErr) {
                // Twilio errors carry a `.code` (e.g. 63016/63018 = recipient
                // hasn't joined the sandbox in the last 72h, 21211 = invalid
                // "to" number) and `.moreInfo` link — log and surface both.
                console.error("❌ Contact form WhatsApp send failed:", {
                    message: waErr.message,
                    code: waErr.code,
                    moreInfo: waErr.moreInfo
                });
                whatsappError = `Twilio ${waErr.code || "ERROR"}: ${waErr.message}`;
                return false;
            }
        })();

        const [emailResult, whatsappResult] = await Promise.allSettled([emailPromise, whatsappPromise]);
        const emailSent = emailResult.status === "fulfilled" && emailResult.value === true;
        const whatsappSent = whatsappResult.status === "fulfilled" && whatsappResult.value === true;

        return res.json({
            success: true,
            message: "Your message has been received. We'll get back to you shortly.",
            emailSent,
            whatsappSent,
            emailError: emailSent ? null : emailError,
            whatsappError: whatsappSent ? null : whatsappError
        });

    } catch (error) {
        console.error("Contact form submission error:", error);
        return res.status(500).json({
            success: false,
            message: "Something went wrong. Please try again later."
        });
    }
});

// ----------------------------------------------------------
// SELF-DIAGNOSTICS
// GET /api/contact/diagnostics
// Visit this URL directly in a browser any time the contact form's
// email or WhatsApp notifications stop working. It live-checks both
// channels and reports the EXACT reason — no server log access or
// asking for help needed. Nothing sensitive (passwords/tokens) is
// ever included in the response.
// ----------------------------------------------------------
router.get("/diagnostics", async (req, res) => {
    const report = {
        checkedAt: new Date().toISOString(),
        email: {
            configured: Boolean(GMAIL_USER && GMAIL_APP_PASSWORD),
            gmailUserSet: Boolean(GMAIL_USER),
            gmailAppPasswordSet: Boolean(GMAIL_APP_PASSWORD),
            gmailAppPasswordLength: GMAIL_APP_PASSWORD.length || 0, // should be 16
            verified: false,
            verifiedVia: null, // "465", "587", or null
            error: null,
            resendFallbackConfigured: RESEND_CONFIGURED,
            resendFallbackNote: RESEND_CONFIGURED
                ? "Resend HTTPS fallback is set up — emails will send via Resend if both SMTP ports fail."
                : "Resend HTTPS fallback is NOT set up. If SMTP is blocked on this host, set RESEND_API_KEY and RESEND_FROM to fix email delivery."
        },
        whatsapp: {
            configured: Boolean(TWILIO_SID && TWILIO_AUTH_TOKEN && TWILIO_WHATSAPP_FROM && CONTACT_NOTIFY_WHATSAPP),
            twilioSidSet: Boolean(TWILIO_SID),
            twilioAuthTokenSet: Boolean(TWILIO_AUTH_TOKEN),
            twilioWhatsappFromSet: Boolean(TWILIO_WHATSAPP_FROM),
            contactNotifyWhatsappSet: Boolean(CONTACT_NOTIFY_WHATSAPP),
            accountStatus: null,
            error: null,
            sandboxReminder:
                "If TWILIO_WHATSAPP_FROM is the Twilio Sandbox number (+14155238886), the recipient's " +
                "WhatsApp must send \"join <your-sandbox-code>\" to it again every 72 hours of inactivity, " +
                "or ALL sends will fail with error 63016/63018 regardless of code."
        }
    };

    if (report.email.configured) {
        try {
            await mailTransporterPrimary.verify();
            report.email.verified = true;
            report.email.verifiedVia = "465";
        } catch (primaryErr) {
            try {
                await mailTransporterFallback.verify();
                report.email.verified = true;
                report.email.verifiedVia = "587";
                report.email.error = `Port 465 failed (${primaryErr.code || "ERROR"}), but port 587 works, so email is still sending fine.`;
            } catch (fallbackErr) {
                report.email.error =
                    `Both SMTP ports failed — 465: ${primaryErr.code || "ERROR"}: ${primaryErr.message} | ` +
                    `587: ${fallbackErr.code || "ERROR"}: ${fallbackErr.message}` +
                    (RESEND_CONFIGURED ? " (Resend HTTPS fallback will be used instead)" : "");
            }
        }
    } else {
        report.email.error = "GMAIL_USER / GMAIL_APP_PASSWORD missing in environment.";
    }

    if (report.whatsapp.configured) {
        try {
            const account = await twilioClient.api.v2010.accounts(TWILIO_SID).fetch();
            report.whatsapp.accountStatus = account.status;
            if (account.status !== "active") {
                report.whatsapp.error = `Twilio account status is "${account.status}", not "active" — sends will fail until this is resolved in the Twilio console.`;
            }
        } catch (err) {
            report.whatsapp.error = `${err.code || "ERROR"}: ${err.message}`;
        }
    } else {
        report.whatsapp.error = "One or more of TWILIO_SID / TWILIO_AUTH_TOKEN / TWILIO_WHATSAPP_FROM / CONTACT_NOTIFY_WHATSAPP is missing in environment.";
    }

    res.json(report);
});

module.exports = router;