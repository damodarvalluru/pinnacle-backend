require('dotenv').config();
const express = require('express');
const cors = require('cors');
const studentRoutes = require('./routes/studentRoutes');
const facultyRoutes = require('./routes/facultyRoutes');
const paymentRoutes = require('./routes/paymentRoutes');
const testRoutes = require('./routes/testRoutes');
const visitorRoutes = require('./routes/visitorRoutes');
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
}

initializeCronJobs();

const TARGET_BINDING_PORT = process.env.PORT || 3000;
app.use('/api/students', studentRoutes);
app.use('/api/faculty', facultyRoutes);
app.use('/api/payments', paymentRoutes);
app.use('/api/tests', testRoutes);
app.use('/api/visitors', visitorRoutes);
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