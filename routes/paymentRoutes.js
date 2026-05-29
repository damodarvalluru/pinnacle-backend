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

        const verified =
            expectedSignature === razorpay_signature;

        if (!verified) {

            return res.status(400).json({
                success: false,
                message: 'Payment Verification Failed'
            });
        }
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

    const updatedPaid =
        parseFloat(student.fees_paid)
        +
        parseFloat(paid_amount);

    const updatedRemaining =
        parseFloat(student.total_fees)
        -
        updatedPaid;

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
            paid_amount,
            payment_type,
            'SUCCESS'
        ]
    );

    await connection.commit();

    res.json({
        success: true,
        message: 'Payment Verified'
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

module.exports = router;