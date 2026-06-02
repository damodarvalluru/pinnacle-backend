const express = require('express');
const router = express.Router();
const db = require('../db');
// PUBLISH TEST
router.post('/publish-test', async (req, res) => {

    try {

        const {
            test_type,
            faculty_id,
            faculty_name,
            title,
            questions
        } = req.body;
        if(
    !test_type ||
    !faculty_id ||
    !faculty_name ||
    !title ||
    !questions
){
    return res.status(400).json({
        success:false,
        message:"Missing Required Fields"
    });
}
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
                typeof questions === "string" ? questions : JSON.stringify(questions)
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
// STUDENT TEST ELIGIBILITY
router.get('/student-eligible/:studentId', async (req, res) => {

    try {

        const studentId = req.params.studentId;

        const dob = req.query.dob;

const [students] = await db.execute(`SELECT * FROM students WHERE student_id = ? AND dob = ?`,[studentId,dob]);

        if (students.length === 0) {
            return res.json({
                eligible: false,
                message: 'Student Not Found'
            });
        }

        const student = students[0];

        const enrollDate =
            new Date(student.enrollment_date);

        const currentDate =
            new Date();

        const days =
            Math.floor(
                (currentDate - enrollDate)
                /
                (1000 * 60 * 60 * 24)
            );

        if (days >= 60) {

            res.json({
                eligible: true,
                days
            });

        } else {

            res.json({
                eligible: false,
                remainingDays: 60 - days
            });
        }

    } catch(error) {

        console.log(error);

        res.status(500).json({
            success:false,
            message:'Unable To Check Eligibility'
        });
    }
});
// SUBMIT RESULT
router.post('/submit-result', async (req, res) => {

    try {

        const {
    student_id,
    student_name,
    test_id,
    score,
    total_marks
} = req.body;

        const resultId =
            require('uuid').v4();
if(
    !student_id ||
    !student_name ||
    !test_id ||
    score === undefined
){
    return res.status(400).json({
        success:false,
        message:"Missing Required Fields"
    });
}
        await db.execute(

            `INSERT INTO test_results
(
    result_id,
    student_id,
    student_name,
    test_id,
    score,
    total_marks
)

            VALUES (?, ?, ?, ?, ?, ?)`,

            [
                resultId,
                student_id,
                student_name,
                test_id,
                score,
                total_marks
            ]
        );

        res.json({
            success: true,
            message:
            'Result Submitted Successfully'
        });

    } catch(error) {

        console.log(error);

        res.status(500).json({
            success:false,
            message:'Unable To Submit Result'
        });
    }
});
// FETCH STUDENT RESULTS
router.get('/result/:studentId', async (req, res) => {

    try {

        const studentId =
            req.params.studentId;

             const dob =
        req.query.dob;
        const [student] =
        await db.execute(

        `
        SELECT *
        FROM students
        WHERE student_id=?
        AND dob=?
        `,
        [
            studentId,
            dob
        ]
        );

        if(student.length===0){

            return res.json({
                success:false,
                message:"Invalid Credentials"
            });
        }
        const [results] =
        await db.execute(

            `SELECT *
             FROM test_results
             WHERE student_id = ?
             ORDER BY submitted_at DESC LIMIT 1`,

            [studentId]
        );

        res.json({
            success: true,
            results
        });

    } catch(error) {

        console.log(error);

        res.status(500).json({
            success:false,
            message:'Unable To Fetch Results'
        });
    }
});
// FETCH TESTS BY TYPE
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

           questions: (() => {

    try{
        return JSON.parse(test.questions);
    }
    catch{
        return test.questions;
    }

})()
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