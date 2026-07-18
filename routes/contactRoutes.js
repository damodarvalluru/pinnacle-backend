const express = require("express");
const nodemailer = require("nodemailer");
const twilio = require("twilio");
const db = require("../db");

const router = express.Router();
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

<<<<<<< HEAD
// ----------------------------------------------------------
// Nodemailer transporter — Gmail via App Password
// (GMAIL_USER / GMAIL_APP_PASSWORD come from .env, see README)
//
// FIX: previously this had no timeouts configured, so on hosts
// like Render where outbound SMTP (port 465/587) can be slow or
// silently blocked, a stuck connection would hang for the OS-level
// TCP timeout (often 2-3+ minutes) before failing. Since the old
// code awaited the email step BEFORE the WhatsApp step, that hang
// delayed the WhatsApp send too — which is exactly the "WhatsApp
// takes 2-3 minutes" symptom. Explicit short timeouts below cap
// the worst case at ~10s, and the email/WhatsApp sends are now
// fired in parallel (see router.post below) so neither one blocks
// the other at all.
// ----------------------------------------------------------
const mailTransporter = nodemailer.createTransport({
    host: "smtp.gmail.com",
    port: 465,
    secure: true,
    auth: {
        user: process.env.GMAIL_USER,
        pass: process.env.GMAIL_APP_PASSWORD
    },
    connectionTimeout: 10000, // fail fast instead of hanging for minutes
    greetingTimeout: 10000,
    socketTimeout: 10000
});

// Verify the transporter once at startup so misconfigured Gmail
// credentials (wrong app password, 2FA not enabled, etc.) show up
// clearly in the server logs immediately, instead of silently
// failing only when a real visitor submits the form.
if (process.env.GMAIL_USER && process.env.GMAIL_APP_PASSWORD) {
    mailTransporter.verify((verifyErr) => {
        if (verifyErr) {
            console.error("❌ Nodemailer transporter verification FAILED — emails will not send:", {
                message: verifyErr.message,
                code: verifyErr.code,
                response: verifyErr.response
            });
            console.error(
                "   ➜ Check: GMAIL_USER is a full Gmail address, GMAIL_APP_PASSWORD is a 16-character " +
                "Google App Password (NOT your normal Gmail password), and 2-Step Verification is ON for that account."
            );
        } else {
            console.log("✅ Nodemailer transporter verified — ready to send contact form emails.");
        }
    });
} else {
    console.warn("⚠️  GMAIL_USER / GMAIL_APP_PASSWORD not set in environment — contact form emails are disabled.");
}

// ----------------------------------------------------------
// Twilio client for WhatsApp — reuses the same credentials the
// project already uses for SMS cron alerts in server.js
// ----------------------------------------------------------
const twilioClient = twilio(
    process.env.TWILIO_SID,
    process.env.TWILIO_AUTH_TOKEN
);

=======
>>>>>>> 152f18b5c8fcc33c47dd934df61fe354a46f3b21
function isValidEmail(email) {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

function isValidMobile(mobile) {
    return /^[0-9+\-\s]{7,15}$/.test(mobile);
}

function isPastOrToday(date) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return false;
    const parsed = new Date(`${date}T00:00:00.000Z`);
    return !Number.isNaN(parsed.getTime()) && date <= new Date().toISOString().slice(0, 10);
}

function escapeHtml(value) {
    return String(value).replace(/[&<>"']/g, (character) => ({
        "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
    }[character]));
}

function getMailTransporter() {
    return nodemailer.createTransport({
        host: process.env.SMTP_HOST || "smtp.gmail.com",
        port: Number(process.env.SMTP_PORT) || 465,
        secure: (process.env.SMTP_SECURE || "true") === "true",
        auth: { user: process.env.GMAIL_USER, pass: process.env.GMAIL_APP_PASSWORD },
        connectionTimeout: 10000,
        greetingTimeout: 10000,
        socketTimeout: 15000
    });
}

async function sendEmailNotification(details) {
    if (!process.env.GMAIL_USER || !process.env.GMAIL_APP_PASSWORD) {
        throw new Error("GMAIL_USER and GMAIL_APP_PASSWORD are required for email notifications.");
    }

    await getMailTransporter().sendMail({
        from: `"Pinnacle Scholars Website" <${process.env.GMAIL_USER}>`,
        to: process.env.CONTACT_NOTIFY_EMAIL || process.env.GMAIL_USER,
        replyTo: details.email,
        subject: `New contact form enquiry - ${details.name}`,
        text: `Name: ${details.name}\nMobile: ${details.mobile}\nEmail: ${details.email}\nLocation: ${details.location}\nDate of Birth: ${details.dob}\n\nMessage:\n${details.message}`,
        html: `
            <h2>New enquiry - Pinnacle Scholars Academy</h2>
            <p><strong>Name:</strong> ${escapeHtml(details.name)}</p>
            <p><strong>Mobile:</strong> ${escapeHtml(details.mobile)}</p>
            <p><strong>Email:</strong> ${escapeHtml(details.email)}</p>
            <p><strong>Location:</strong> ${escapeHtml(details.location)}</p>
            <p><strong>Date of Birth:</strong> ${escapeHtml(details.dob)}</p>
            <p><strong>Message:</strong><br>${escapeHtml(details.message).replace(/\n/g, "<br>")}</p>
        `
    });
}

async function sendWhatsAppNotification(details) {
    const { TWILIO_SID, TWILIO_AUTH_TOKEN, TWILIO_WHATSAPP_FROM, CONTACT_NOTIFY_WHATSAPP } = process.env;
    if (!TWILIO_SID || !TWILIO_AUTH_TOKEN || !TWILIO_WHATSAPP_FROM || !CONTACT_NOTIFY_WHATSAPP) {
        throw new Error("Twilio WhatsApp environment variables are incomplete.");
    }

    const client = twilio(TWILIO_SID, TWILIO_AUTH_TOKEN);
    await client.messages.create({
        from: `whatsapp:${TWILIO_WHATSAPP_FROM}`,
        to: `whatsapp:${CONTACT_NOTIFY_WHATSAPP}`,
        body: `New website enquiry\nName: ${details.name}\nMobile: ${details.mobile}\nEmail: ${details.email}\nLocation: ${details.location}\nDOB: ${details.dob}\nMessage: ${details.message}`
    });
}

function dispatchNotifications(details) {
    void Promise.allSettled([sendEmailNotification(details), sendWhatsAppNotification(details)])
        .then(([emailResult, whatsappResult]) => {
            if (emailResult.status === "fulfilled") console.log("Contact form: email notification sent.");
            else console.error("Contact form email failed:", emailResult.reason.message);

            if (whatsappResult.status === "fulfilled") console.log("Contact form: WhatsApp notification sent.");
            else console.error("Contact form WhatsApp failed:", whatsappResult.reason.message);
        });
}

router.post("/submit", async (req, res) => {
    try {
        const name = String(req.body.name || "").trim();
        const mobile = String(req.body.mobile || "").trim();
        const email = String(req.body.email || "").trim();
        const location = String(req.body.location || "").trim();
        const dob = String(req.body.dob || "");
        const message = String(req.body.message || "").trim();

        if (!name || !mobile || !email || !location || !dob || !message) {
            return res.status(400).json({ success: false, message: "All fields are required." });
        }
        if (!isValidEmail(email)) {
            return res.status(400).json({ success: false, message: "Please enter a valid email address." });
        }
        if (!isValidMobile(mobile)) {
            return res.status(400).json({ success: false, message: "Please enter a valid mobile number." });
        }
        if (!isPastOrToday(dob)) {
            return res.status(400).json({ success: false, message: "Date of birth cannot be in the future." });
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
        await db.execute(
            `INSERT INTO contact_messages (name, mobile, email, location, dob, message) VALUES (?, ?, ?, ?, ?, ?)`,
            [name, mobile, email, location, dob, message]
        );

<<<<<<< HEAD
        // ---- 2 & 3. Email + WhatsApp — fired in PARALLEL ----
        // FIX: these used to run sequentially (await email, THEN await
        // WhatsApp). If the Gmail SMTP connection was slow/stuck, the
        // WhatsApp message — which normally sends in under a second —
        // only went out AFTER that email step finally timed out, which
        // is why WhatsApp appeared to "take 2-3 minutes". Running both
        // with Promise.allSettled() means neither one waits on the
        // other, and the 10s timeouts on the mail transporter (above)
        // put a hard ceiling on the worst case.
        const emailPromise = (async () => {
            if (!process.env.GMAIL_USER || !process.env.GMAIL_APP_PASSWORD) {
                console.warn("⚠️  Contact form: GMAIL_USER / GMAIL_APP_PASSWORD not set — skipping email notification.");
                return false;
            }
            try {
                await mailTransporter.sendMail({
                    from: `"Pinnacle Scholars Website" <${process.env.GMAIL_USER}>`,
                    to: process.env.CONTACT_NOTIFY_EMAIL || process.env.GMAIL_USER,
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
                console.log("✅ Contact form: email sent to", process.env.CONTACT_NOTIFY_EMAIL || process.env.GMAIL_USER);
                return true;
            } catch (mailErr) {
                // Log the FULL error (not just .message) — Nodemailer/Gmail auth
                // failures (wrong app password, 2FA not enabled, etc.) usually
                // carry a `.code` / `.response` with the real reason.
                console.error("❌ Contact form email failed:", {
                    message: mailErr.message,
                    code: mailErr.code,
                    response: mailErr.response
                });
                return false;
            }
        })();

        const whatsappPromise = (async () => {
            if (!process.env.TWILIO_SID || !process.env.TWILIO_AUTH_TOKEN || !process.env.TWILIO_WHATSAPP_FROM || !process.env.CONTACT_NOTIFY_WHATSAPP) {
                console.warn("⚠️  Contact form: TWILIO_WHATSAPP_FROM / CONTACT_NOTIFY_WHATSAPP not set — skipping WhatsApp notification.");
                return false;
            }
            try {
                await twilioClient.messages.create({
                    from: `whatsapp:${process.env.TWILIO_WHATSAPP_FROM}`,
                    to: `whatsapp:${process.env.CONTACT_NOTIFY_WHATSAPP}`,
                    body:
                        `📩 *New Website Enquiry*\n` +
                        `Name: ${name}\n` +
                        `Mobile: ${mobile}\n` +
                        `Email: ${email}\n` +
                        `Location: ${location}\n` +
                        `DOB: ${dob}\n` +
                        `Message: ${message}`
                });
                console.log("✅ Contact form: WhatsApp sent to", process.env.CONTACT_NOTIFY_WHATSAPP);
                return true;
            } catch (waErr) {
                // Twilio errors carry a `.code` (e.g. 63016 = recipient hasn't
                // joined the sandbox) and `.moreInfo` link — log both.
                console.error("❌ Contact form WhatsApp send failed:", {
                    message: waErr.message,
                    code: waErr.code,
                    moreInfo: waErr.moreInfo
                });
                return false;
            }
        })();

        const [emailResult, whatsappResult] = await Promise.allSettled([emailPromise, whatsappPromise]);
        const emailSent = emailResult.status === "fulfilled" && emailResult.value === true;
        const whatsappSent = whatsappResult.status === "fulfilled" && whatsappResult.value === true;

=======
        // Persist first, then return immediately. Provider delivery runs in the
        // background, so a slow WhatsApp request does not block the visitor.
        dispatchNotifications({ name, mobile, email, location, dob, message });
>>>>>>> 152f18b5c8fcc33c47dd934df61fe354a46f3b21
        return res.json({
            success: true,
            message: "Your message has been received. We'll get back to you shortly.",
            notificationsQueued: true
        });
    } catch (error) {
        console.error("Contact form submission error:", error);
        return res.status(500).json({ success: false, message: "Something went wrong. Please try again later." });
    }
});

module.exports = router;
