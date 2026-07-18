require('dotenv').config();
const express = require('express');
const cors = require('cors');
const studentRoutes = require('./routes/studentRoutes');
const facultyRoutes = require('./routes/facultyRoutes');
const paymentRoutes = require('./routes/paymentRoutes');
const testRoutes = require('./routes/testRoutes');
const visitorRoutes = require('./routes/visitorRoutes');
const contactRoutes = require('./routes/contactRoutes');
const cron = require('node-cron');
const twilio = require('twilio');
const db = require('./db');


const app = express();

// 1. Initialize DB Connection Checks
(async () => {
    try {
        await db.execute('SELECT 1');
        console.log('✅ Database Connected Successfully');
    } catch (err) {
        console.error('❌ Database Connection Failed:', err);
        process.exit(1);
    }
})();

// 2. Enable CORS globally before setting up route structures
app.use(cors({
    origin: ['http://127.0.0.1:5500', 'http://localhost:5500','https://damodarvalluru.github.io'],
    methods: ['GET', 'POST', 'PUT', 'DELETE','PATCH'],
    credentials: true
}));

// 3. Payload parsing middleware structures
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.get('/api/backend-status', (req, res) => {
    res.json({
        success: true,
        message: 'Backend Active'
    });
});
// 6. Instantiating wrappers
const twilioClient = twilio(
    process.env.TWILIO_SID,
    process.env.TWILIO_AUTH_TOKEN
);

app.get('/test', (req, res) => {
    res.json({ success: true, message: 'Backend working properly' });
});
// AUTOMATION CRON ENGINES & SYSTEM BINDINGS
function initializeCronJobs() {
    cron.schedule('0 9 * * *', async () => {
        try {
            const [tests] = await db.execute('SELECT * FROM tests');
            if (tests.length === 0) {
                await twilioClient.messages.create({
                    body: 'Alert: No faculty has published any test paper yet.',
                    from: process.env.TWILIO_PHONE,
                    to: '+919573102505'
                });
                console.log('SMS Alert Sent');
            }
        } catch (err) {
            console.log('Cron Test Alert Error:', err);
        }
    });

    cron.schedule('0 * * * *', async () => {
        try {
            await db.execute(`UPDATE test_results SET certificate_available = TRUE WHERE TIMESTAMPDIFF(HOUR, submitted_at, NOW()) >= 12`);
            console.log('Certificate release check completed');
        } catch (err) {
            console.log('Certificate Cron Error:', err);
        }
    });

    // ------------------------------------------------------------
    // KEEP-ALIVE SELF-PING
    // FIX: on Render's free tier, a web service with no traffic for
    // ~15 minutes is put to sleep. The NEXT request has to "wake" the
    // whole container from a cold start — this alone can take
    // anywhere from 30 seconds to a few minutes, which is almost
    // certainly the real cause of the contact form "taking 2-3
    // minutes to deliver". It affects every route (DB, email,
    // WhatsApp all included), not just the notification logic.
    // Pinging our own /api/backend-status endpoint every 10 minutes
    // keeps the container warm so a real visitor's submission never
    // has to pay that cold-start cost.
    // SELF_URL should be set in the Render env vars to this exact
    // service's public URL (e.g. https://pinnacle-backend-5i7n.onrender.com).
    // If it isn't set, this simply logs a warning once and skips —
    // it never breaks the server.
    // ------------------------------------------------------------
    const selfUrl = process.env.SELF_URL;
    if (selfUrl) {
        cron.schedule('*/10 * * * *', async () => {
            try {
                const response = await fetch(`${selfUrl.replace(/\/$/, "")}/api/backend-status`);
                console.log(`🔄 Keep-alive ping: ${response.status}`);
            } catch (err) {
                console.log('Keep-alive ping failed (server may still be waking up):', err.message);
            }
        });
        console.log(`🔄 Keep-alive ping scheduled every 10 minutes against ${selfUrl}`);
    } else {
        console.warn(
            '⚠️  SELF_URL is not set — keep-alive ping is disabled, so this service may cold-start ' +
            'and cause multi-minute delays on the first request after inactivity. Set SELF_URL in your ' +
            'Render environment variables to this service\'s public URL to fix that.'
        );
    }
}

initializeCronJobs();

const TARGET_BINDING_PORT = process.env.PORT || 3000;
app.use('/api/students', studentRoutes);
app.use('/api/faculty', facultyRoutes);
app.use('/api/payments', paymentRoutes);
app.use('/api/tests', testRoutes);
app.use('/api/visitors', visitorRoutes);
app.use('/api/contact', contactRoutes);
// Error handling fallback
app.use((err, req, res, next) => {
    console.error(err.stack);
    res.status(500).json({ success: false, message: 'Internal Server Error' });
});

app.listen(TARGET_BINDING_PORT, () => {
    console.log(`====================================================================`);
    console.log(`    PINNACLE ACADEMY PAYMENT PROCESSING BACKEND ENGINE ACTIVE       `);
    console.log(`    Gateway Secure Server Endpoint: http://localhost:${TARGET_BINDING_PORT}  `);
    console.log(`====================================================================`);
});