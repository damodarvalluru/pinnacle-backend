const express = require('express');

const router = express.Router();

const db = require('../db');


// ======================================================
// PUBLISH TEST
// ======================================================

router.post('/publish-test', async (req, res) => {

    try {

        const {
            test_type,
            faculty_id,
            faculty_name,
            title,
            questions
        } = req.body;

        const testId =
        'TEST-' + Date.now();

        await db.execute(

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
                testId,
                test_type,
                faculty_id,
                faculty_name,
                title,
                JSON.stringify(questions)
            ]
        );

        res.json({
            success: true,
            message: 'Test Published Successfully'
        });

    } catch (err) {

        console.log(err);

        res.status(500).json({
            success: false,
            message: 'Unable To Publish Test'
        });
    }
});


// ======================================================
// FETCH TESTS BY TYPE
// ======================================================

router.get('/:type', async (req, res) => {

    try {

        const type = req.params.type;

        const [tests] =
        await db.execute(

            `SELECT *
             FROM tests
             WHERE test_type=?
             ORDER BY published_at DESC`,

            [type]
        );

        const parsedTests =
        tests.map(test => ({

            ...test,

            questions:
            JSON.parse(test.questions)
        }));

        res.json(parsedTests);

    } catch(err) {

        console.log(err);

        res.status(500).json({
            success:false,
            message:'Unable To Fetch Tests'
        });
    }
});

module.exports = router;