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
// ----------------------------------------------------------
const mailTransporter = nodemailer.createTransport({
    service: "gmail",
    auth: {
        user: process.env.GMAIL_USER,
        pass: process.env.GMAIL_APP_PASSWORD
    }
});

// ----------------------------------------------------------
// Twilio client for WhatsApp — reuses the same credentials the
// project already uses for SMS cron alerts in server.js
// ----------------------------------------------------------
const twilioClient = twilio(
    process.env.TWILIO_SID,
    process.env.TWILIO_AUTH_TOKEN
);

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

        // ---- 2. Email to Gmail (non-blocking failure) ----
        let emailSent = false;
        try {
            if (process.env.GMAIL_USER && process.env.GMAIL_APP_PASSWORD) {
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
                emailSent = true;
            }
        } catch (mailErr) {
            console.error("Contact form email failed:", mailErr.message);
        }

        // ---- 3. WhatsApp via Twilio (non-blocking failure) ----
        let whatsappSent = false;
        try {
            if (process.env.TWILIO_SID && process.env.TWILIO_AUTH_TOKEN && process.env.TWILIO_WHATSAPP_FROM && process.env.CONTACT_NOTIFY_WHATSAPP) {
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
                whatsappSent = true;
            }
        } catch (waErr) {
            console.error("Contact form WhatsApp send failed:", waErr.message);
        }

        return res.json({
            success: true,
            message: "Your message has been received. We'll get back to you shortly.",
            emailSent,
            whatsappSent
        });

    } catch (error) {
        console.error("Contact form submission error:", error);
        return res.status(500).json({
            success: false,
            message: "Something went wrong. Please try again later."
        });
    }
});

module.exports = router;
