const express = require('express');

const router = express.Router();

const pool = require('../db');

/*FACULTY REGISTER*/
router.post('/register', async (req, res) => {

    try {

        const {
            name,
            address,
            domain,
            mobile,
            mail,
            dob,
            qualifications,
            achievements,
            awards,
            enrollmentDate
        } = req.body;

        const facultyId =
            "PS-FAC-2026-" +
            Math.floor(
                1000 + Math.random() * 9000
            );

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
                facultyId,
                name,
                address,
                domain,
                mobile,
                mail,
                dob,
                qualifications,
                achievements,
                awards,
                enrollmentDate
            ]
        );

        res.json({
            success: true,
            message: "Faculty Registered",
            faculty: {
                id: facultyId
            }
        });

    } catch(error){

        console.log(error);

        res.status(500).json({
            success:false,
            error:error.message
        });
    }
});

/*FACULTY LOGIN*/
router.post('/login', async (req, res) => {

    try {

        const { faculty_id, dob } = req.body;

        const [rows] = await pool.query(

            `SELECT * FROM faculty
             WHERE faculty_id = ?
             AND dob = ?`,

            [faculty_id, dob]
        );

        if (rows.length > 0) {

            res.json({
                success: true,
                faculty: rows[0]
            });

        } else {

            res.json({
                success: false,
                message: 'Invalid Faculty ID or DOB'
            });
        }

    } catch (error) {

        console.log('Faculty Login Error:', error);

        res.status(500).json({
            success: false,
            message: 'Internal Server Error'
        });
    }
});

module.exports = router;

