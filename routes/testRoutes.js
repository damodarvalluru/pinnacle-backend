const express = require('express');

const router = express.Router();

const pool = require('../db');

/*
PUBLISH TEST
*/

router.post('/publish', async (req, res) => {

    try {

        const {

            test_id,
            test_type,
            faculty_id,
            faculty_name,
            title,
            questions

        } = req.body;

        await pool.query(

            `INSERT INTO tests
            (
                test_id,
                test_type,
                faculty_id,
                faculty_name,
                title,
                questions
            )

            VALUES (?, ?, ?, ?, ?, ?)`,

            [
                test_id,
                test_type,
                faculty_id,
                faculty_name,
                title,
                questions
            ]
        );

        res.json({
            success: true,
            message: 'Test Published'
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