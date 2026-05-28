const express = require('express');

const router = express.Router();

const pool = require('../db');

/*
FACULTY REGISTER
*/

router.post('/register', async (req, res) => {

    try {

        const {

            faculty_id,
            name,
            address,
            domain,
            mobile,
            mail,
            dob,
            qualifications,
            achievements,
            awards,
            enrollment_date

        } = req.body;

        await pool.query(

            `INSERT INTO faculty
            (
                faculty_id,
                name,
                address,
                domain,
                mobile,
                mail,
                dob,
                qualifications,
                achievements,
                awards,
                enrollment_date
            )

            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,

            [
                faculty_id,
                name,
                address,
                domain,
                mobile,
                mail,
                dob,
                qualifications,
                achievements,
                awards,
                enrollment_date
            ]
        );

        res.json({
            success: true,
            message: 'Faculty Registered'
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