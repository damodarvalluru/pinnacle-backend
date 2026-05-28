require('dotenv').config();
const express = require('express');
const Razorpay = require('razorpay');
const crypto = require('crypto');
const path = require('path');
const cors = require('cors');
const studentRoutes = require('./routes/studentRoutes');
const facultyRoutes = require('./routes/facultyRoutes');
const paymentRoutes = require('./routes/paymentRoutes');
const testRoutes = require('./routes/testRoutes');
const cron = require('node-cron');
const twilio = require('twilio');
const { v4: uuidv4 } = require('uuid');
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
    methods: ['GET', 'POST'],
    credentials: true
}));

// 3. Payload parsing middleware structures
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// 4. Serve static assets 
app.use(express.static(path.join(__dirname, 'public')));

app.get('/api/backend-status', (req, res) => {
    res.json({
        success: true,
        message: 'Backend Active'
    });
});

// 5. Verify credentials exist
if (!process.env.RAZORPAY_KEY_ID || !process.env.RAZORPAY_KEY_SECRET) {
    console.error("❌ CRITICAL ERROR: Razorpay credentials are completely missing from your .env file!");
    process.exit(1);
}

// 6. Instantiating wrappers
const razorpayClientInstance = new Razorpay({
    key_id: process.env.RAZORPAY_KEY_ID,
    key_secret: process.env.RAZORPAY_KEY_SECRET
});

const twilioClient = twilio(
    process.env.TWILIO_SID,
    process.env.TWILIO_AUTH_TOKEN
);


app.post('/api/create-order', async (req, res) => {
    try {
        console.log("BODY RECEIVED:", req.body);
        console.log("Razorpay Key Exists:", !!process.env.RAZORPAY_KEY_ID);
console.log("Razorpay Secret Exists:", !!process.env.RAZORPAY_KEY_SECRET);
        const { amount, currency, receipt } = req.body;

        if (!amount || parseInt(amount) < 100) {
            return res.status(400).json({
                error: "Amount must be at least 100 paise"
            });
        }

        const options = {
            amount: parseInt(amount),
            currency: currency || 'INR',
            receipt: receipt || `receipt_${Date.now()}`
        };

        console.log("ORDER OPTIONS:", options);
        console.log("Attempting Razorpay Order Creation...");
        const order = await razorpayClientInstance.orders.create(options);
        console.log("ORDER CREATED:", order);

        res.status(200).json({
            order_id: order.id,
            amount: order.amount,
            currency: order.currency
        });
    } catch (err) {
        console.log("========== CREATE ORDER ERROR ==========");
        console.log(err);
        console.log("========================================");
        res.status(500).json({
            success: false,
            error: err.message
        });
    }
});

app.post('/api/verify-payment', async (req, res) => {

    try {

        const {
            razorpay_order_id,
            razorpay_payment_id,
            razorpay_signature
        } = req.body;

        // VALIDATION
        if (
            !razorpay_order_id ||
            !razorpay_payment_id ||
            !razorpay_signature
        ) {
            return res.status(400).json({
                success: false,
                message: "Incomplete Validation Data"
            });
        }

        // SIGNATURE CHECK
        const generatedSignature =
            crypto
                .createHmac(
                    'sha256',
                    process.env.RAZORPAY_KEY_SECRET
                )
                .update(
                    razorpay_order_id +
                    "|" +
                    razorpay_payment_id
                )
                .digest('hex');

        // INVALID SIGNATURE
        if (generatedSignature !== razorpay_signature) {

            return res.status(400).json({
                success: false,
                message: "Payment Verification Failed"
            });
        }

        // SUCCESS
        res.status(200).json({
            success: true,
            message: 'Payment Verified Successfully'
        });

    } catch(err) {

        console.log(err);

        res.status(500).json({
            success: false,
            message: 'Server Error'
        });
    }
});// ======================================================
// FACULTY CORE DATA OPERATIONS
// ======================================================

app.post('/api/register-faculty', async (req, res) => {
    try {
        const { faculty_id, name, address, domain, mobile, mail, dob, qualifications, achievements, awards, enrollment_date } = req.body;
        if (!faculty_id || !name || !mobile || !mail) {
            return res.status(400).json({ success: false, message: 'Required fields missing' });
        }

        await db.execute(
            `INSERT INTO faculty (faculty_id, name, address, domain, mobile, mail, dob, qualifications, achievements, awards, enrollment_date) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [faculty_id, name, address, domain, mobile, mail, dob, qualifications, achievements, awards, enrollment_date]
        );
        res.json({ success: true });
    } catch (err) {
        console.log(err);
        res.status(500).json({ success: false });
    }
});

app.post('/api/faculty-login', async (req, res) => {
    try {
        const { faculty_id, dob } = req.body;
        const [rows] = await db.execute('SELECT * FROM faculty WHERE faculty_id = ? AND dob = ?', [faculty_id, dob]);

        if (rows.length > 0) {
            res.json({ success: true, faculty: rows[0] });
        } else {
            res.json({ success: false, message: 'Invalid Faculty ID or DOB' });
        }
    } catch (err) {
        console.log('Faculty Login Error:', err);
        res.status(500).json({ success: false, message: 'Internal Server Error' });
    }
});

// ======================================================
// CORE EXAMINATION TESTING LOGIC
// ======================================================

app.post('/api/publish-test', async (req, res) => {
    try {
        const { test_type, faculty_id, faculty_name, title, questions } = req.body;
        const testId = 'TEST-' + Date.now();

        await db.execute(
            `INSERT INTO tests (test_id, test_type, faculty_id, faculty_name, title, questions) VALUES (?, ?, ?, ?, ?, ?)`,
            [testId, test_type, faculty_id, faculty_name, title, JSON.stringify(questions)]
        );
        res.json({ success: true, message: 'Test Published Successfully' });
    } catch (err) {
        console.log('Publish Test Error:', err);
        res.status(500).json({ success: false, message: 'Unable to publish test' });
    }
});

app.get('/api/tests/:type', async (req, res) => {
    try {
        const type = req.params.type;
        const [tests] = await db.execute('SELECT * FROM tests WHERE test_type = ? ORDER BY published_at DESC', [type]);
        const parsedTests = tests.map(test => ({ ...test, questions: JSON.parse(test.questions) }));
        res.json(parsedTests);
    } catch (err) {
        console.log('Fetch Tests Error:', err);
        res.status(500).json({ success: false, message: 'Unable to fetch tests' });
    }
});

app.get('/api/student-eligible-test/:studentId', async (req, res) => {
    try {
        const studentId = req.params.studentId;
        const [students] = await db.execute('SELECT * FROM students WHERE student_id = ?', [studentId]);

        if (students.length === 0) {
            return res.json({ eligible: false, message: 'Student not found' });
        }

        const student = students[0];
        const enrollDate = new Date(student.enrollment_date);
        const currentDate = new Date();
        const days = Math.floor((currentDate - enrollDate) / (1000 * 60 * 60 * 24));

        if (days >= 60) {
            res.json({ eligible: true, days });
        } else {
            res.json({ eligible: false, remainingDays: 60 - days });
        }
    } catch (err) {
        console.log('Eligibility Check Error:', err);
        res.status(500).json({ success: false, message: 'Unable to check eligibility' });
    }
});

app.post('/api/submit-result', async (req, res) => {
    try {
        const { student_id, student_name, test_id, score } = req.body;
        const resultId = uuidv4();

        await db.execute(
            `INSERT INTO test_results (result_id, student_id, student_name, test_id, score) VALUES (?, ?, ?, ?, ?)`,
            [resultId, student_id, student_name, test_id, score]
        );
        res.json({ success: true, message: 'Result submitted. Certificate available after 12 hours.' });
    } catch (err) {
        console.log('Submit Result Error:', err);
        res.status(500).json({ success: false, message: 'Unable to submit result' });
    }
});

app.get('/api/result/:studentId', async (req, res) => {
    try {
        const studentId = req.params.studentId;
        const [results] = await db.execute('SELECT * FROM test_results WHERE student_id = ?', [studentId]);
        res.json(results);
    } catch (err) {
        console.log('Fetch Results Error:', err);
        res.status(500).json({ success: false, message: 'Unable to fetch results' });
    }
});

app.get('/test', (req, res) => {
    res.json({ success: true, message: 'Backend working properly' });
});

// CRITICAL FIX: Wildcard router placed at the absolute bottom of the stack
// Wildcard route ONLY for frontend pages
app.get('*', (req, res, next) => {

    // Prevent wildcard from handling API routes
    if (req.originalUrl.startsWith('/api')) {
        return res.status(404).json({
            success: false,
            message: 'API Route Not Found'
        });
    }

    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Error handling fallback
app.use((err, req, res, next) => {
    console.error(err.stack);
    res.status(500).json({ success: false, message: 'Internal Server Error' });
});

// ======================================================
// AUTOMATION CRON ENGINES & SYSTEM BINDINGS
// ======================================================
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
app.listen(TARGET_BINDING_PORT, () => {
    console.log(`====================================================================`);
    console.log(`    PINNACLE ACADEMY PAYMENT PROCESSING BACKEND ENGINE ACTIVE       `);
    console.log(`    Gateway Secure Server Endpoint: http://localhost:${TARGET_BINDING_PORT}  `);
    console.log(`====================================================================`);
});