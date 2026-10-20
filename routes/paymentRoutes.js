const express = require('express');
const Razorpay = require('razorpay');
const crypto = require('crypto');
const router = express.Router();
const pool = require('../db');
const razorpay = new Razorpay({
    key_id: process.env.RAZORPAY_KEY_ID,
    key_secret: process.env.RAZORPAY_KEY_SECRET
});
/*CREATE ORDER*/
router.post('/create-order', async (req, res) => {
    try {
        const options = {
            amount: req.body.amount,
            currency: 'INR',
            receipt: req.body.receipt
       };
        const order = await razorpay.orders.create(options);
        res.json({
            success: true,
            order_id: order.id,
            amount: order.amount,
            currency: order.currency
        });
    }
    catch (error) {
        console.log(error);
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

/*
VERIFY PAYMENT
*/

router.post('/verify-payment', async (req, res) => {

    try {

        const {

            razorpay_order_id,
            razorpay_payment_id,
            razorpay_signature,
            student_id,
            payment_type,
            paid_amount

        } = req.body;

        const body =
            razorpay_order_id +
            "|" +
            razorpay_payment_id;

        const expectedSignature =
            crypto
            .createHmac(
                'sha256',
                process.env.RAZORPAY_KEY_SECRET
            )
            .update(body.toString())
            .digest('hex');

        const providedSignature = Buffer.from(razorpay_signature || '', 'hex');
        const expectedSignatureBuffer = Buffer.from(expectedSignature, 'hex');
        const verified = providedSignature.length === expectedSignatureBuffer.length && crypto.timingSafeEqual(
            expectedSignatureBuffer,
            providedSignature
        );

        if (!verified) {

            return res.status(400).json({
                success: false,
                message: 'Payment Verification Failed'
            });
        }

        // Do not trust a fee amount posted by the browser. Razorpay is the
        // source of truth for the order, payment amount and payment state.
        const razorpayPayment = await razorpay.payments.fetch(razorpay_payment_id);
        if (razorpayPayment.order_id !== razorpay_order_id ||
            !['captured', 'authorized'].includes(razorpayPayment.status)) {
            return res.status(400).json({ success: false, message: 'Payment status could not be verified' });
        }
        const verifiedPaymentAmount = Number(razorpayPayment.amount) / 100;
/*
DATABASE SAFE TRANSACTION
*/
const connection = await pool.getConnection();

try {

    await connection.beginTransaction();

    /*
    FETCH STUDENT
    */

    const [studentRows] = await connection.query(

        `SELECT * FROM students
         WHERE student_id = ?`,

        [student_id]
    );

    if (studentRows.length === 0) {

        await connection.rollback();

        return res.status(404).json({
            success: false,
            message: 'Student Not Found'
        });
    }

    const student = studentRows[0];

    const currentPaid =
    Number(student.fees_paid || 0);

const totalFees =
    Number(student.total_fees || 0);

const paymentAmount = verifiedPaymentAmount;

if (!Number.isFinite(paymentAmount) || paymentAmount <= 0) {
    await connection.rollback();
    return res.status(400).json({ success: false, message: 'Invalid payment amount' });
}

const [previousPayment] = await connection.query(
    'SELECT razorpay_payment_id FROM payment_history WHERE razorpay_payment_id = ? LIMIT 1',
    [razorpay_payment_id]
);
if (previousPayment.length) {
    await connection.rollback();
    return res.status(409).json({ success: false, message: 'This payment has already been processed' });
}

const updatedPaid =
    currentPaid + paymentAmount;

if (updatedPaid > totalFees) {

    await connection.rollback();

    return res.status(400).json({

        success:false,

        message:
        "Payment exceeds remaining fees"
    });
}

    const updatedRemaining =
        Math.max(
        0,
        Number(student.total_fees || 0) - updatedPaid
    );

    /*
    UPDATE FEES
    */

    await connection.query(

        `UPDATE students
         SET
         fees_paid = ?,
         remaining_fees = ?
         WHERE student_id = ?`,

        [
            updatedPaid,
            updatedRemaining,
            student_id
        ]
    );

    /*
    SAVE PAYMENT HISTORY
    */

    await connection.query(

        `INSERT INTO payment_history
        (
            student_id,
            razorpay_order_id,
            razorpay_payment_id,
            amount_paid,
            payment_type,
            payment_status
        )

        VALUES (?, ?, ?, ?, ?, ?)`,

        [
            student_id,
            razorpay_order_id,
            razorpay_payment_id,
            paymentAmount,
            payment_type,
            'SUCCESS'
        ]
    );

    await connection.commit();

    const [updatedRows] =
await connection.query(

    `SELECT
        total_fees,
        fees_paid,
        remaining_fees
     FROM students
     WHERE student_id = ?`,

    [student_id]
);

const updatedStudent =
    updatedRows[0];

    res.json({

    success: true,

    message:
        'Payment Verified',

    totalFees:
        Number(
            updatedStudent.total_fees
        ),

    paidFees:
        Number(
            updatedStudent.fees_paid
        ),

    remainingFees:
        Number(
            updatedStudent.remaining_fees
        )
});
} catch(transactionError) {

    await connection.rollback();

    throw transactionError;

} finally {

    connection.release();
}
        }

    catch (error) {

        console.log(error);

        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

/*
PAYMENT HISTORY
Returns every recorded fee payment for one student, newest first, together with
the live fee summary. The caller proves ownership with the same student_id +
date-of-birth pair the result portal already uses, so a student can only ever
read their own receipts.
*/
router.get('/history/:studentId', async (req, res) => {

    try {

        const studentId = (req.params.studentId || '').trim();
        const dob = (req.query.dob || '').trim();

        if (!studentId || !dob) {
            return res.status(400).json({
                success: false,
                message: 'Student ID and DOB are required'
            });
        }

        const [studentRows] = await pool.query(
            `SELECT student_id, name, domain, total_fees, fees_paid, remaining_fees
             FROM students
             WHERE student_id = ? AND dob = ?`,
            [studentId, dob]
        );

        if (studentRows.length === 0) {
            return res.status(401).json({
                success: false,
                message: 'Invalid Credentials'
            });
        }

        const [payments] = await pool.query(
            `SELECT
                razorpay_order_id,
                razorpay_payment_id,
                amount_paid,
                payment_type,
                payment_status,
                paid_at
             FROM payment_history
             WHERE student_id = ?
             ORDER BY paid_at DESC`,
            [studentId]
        );

        res.json({
            success: true,
            student: studentRows[0],
            payments
        });

    } catch (error) {

        console.log(error);

        res.status(500).json({
            success: false,
            message: 'Unable To Fetch Payment History'
        });
    }
});

/*
SINGLE RECEIPT
Fetches one verified payment so a saved receipt can be re-opened from the
history list. Ownership is proven with student_id + DOB, exactly as above.
*/
router.get('/receipt/:studentId/:paymentId', async (req, res) => {

    try {

        const studentId = (req.params.studentId || '').trim();
        const paymentId = (req.params.paymentId || '').trim();
        const dob = (req.query.dob || '').trim();

        if (!studentId || !paymentId || !dob) {
            return res.status(400).json({
                success: false,
                message: 'Student ID, payment ID and DOB are required'
            });
        }

        const [studentRows] = await pool.query(
            `SELECT student_id, name, domain, total_fees, fees_paid, remaining_fees
             FROM students
             WHERE student_id = ? AND dob = ?`,
            [studentId, dob]
        );

        if (studentRows.length === 0) {
            return res.status(401).json({
                success: false,
                message: 'Invalid Credentials'
            });
        }

        const [paymentRows] = await pool.query(
            `SELECT
                razorpay_order_id,
                razorpay_payment_id,
                amount_paid,
                payment_type,
                payment_status,
                paid_at
             FROM payment_history
             WHERE student_id = ? AND razorpay_payment_id = ?
             LIMIT 1`,
            [studentId, paymentId]
        );

        if (paymentRows.length === 0) {
            return res.status(404).json({
                success: false,
                message: 'Payment record not found'
            });
        }

        res.json({
            success: true,
            student: studentRows[0],
            payment: paymentRows[0]
        });

    } catch (error) {

        console.log(error);

        res.status(500).json({
            success: false,
            message: 'Unable To Fetch Receipt'
        });
    }
});

module.exports = router;
