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

        await ensureTable();
        await db.execute(
            `INSERT INTO contact_messages (name, mobile, email, location, dob, message) VALUES (?, ?, ?, ?, ?, ?)`,
            [name, mobile, email, location, dob, message]
        );

        // Persist first, then return immediately. Provider delivery runs in the
        // background, so a slow WhatsApp request does not block the visitor.
        dispatchNotifications({ name, mobile, email, location, dob, message });
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
