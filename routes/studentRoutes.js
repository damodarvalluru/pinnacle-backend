const express = require('express');

const router = express.Router();

const pool = require('../db');

/*
REGISTER STUDENT
*/

router.post('/register', async (req, res) => {

    try {

        const {

            student_id,
            name,
            email,
            mobile,
            dob,
            domain,
            address,
            enrollment_date,
            total_fees

        } = req.body;

        await pool.query(

            `INSERT INTO students
            (
                student_id,
                name,
                email,
                mobile,
                dob,
                domain,
                address,
                enrollment_date,
                total_fees,
                fees_paid,
                remaining_fees
            )

            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [
                student_id,
                name,
                email,
                mobile,
                dob,
                domain,
                address,
                enrollment_date,
                total_fees,
                0,
                total_fees
            ]
        );

        res.json({
            success: true,
            message: 'Student Registered'
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
GET STUDENT
*/

router.get('/:studentId', async (req, res) => {

    try {

        const studentId = req.params.studentId;

        const [rows] = await pool.query(

            `SELECT * FROM students
             WHERE student_id = ?`,

            [studentId]
        );

        if (rows.length === 0) {

            return res.status(404).json({
                success: false,
                message: 'Student Not Found'
            });
        }

        res.json({
            success: true,
            student: rows[0]
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

module.exports = router;