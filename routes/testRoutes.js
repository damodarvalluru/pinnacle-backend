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
    !((Array.isArray(questions) && questions.length > 0) ||
      (typeof questions === 'string' && questions.trim().length > 0))
){
    return res.status(400).json({
        success:false,
        message:"Questions Required"
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
                String(test_type).trim().toLowerCase(),
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

        const domain = req.query.domain;

        const [students] = await db.execute(
    `SELECT * FROM students WHERE student_id = ?`,
    [studentId]
);

if(students.length === 0){

    return res.json({
        eligible:false,
        message:"Student ID not found"
    });
}

        const student = students[0];
        if(
domain === "jee" &&
!student.domain.includes("JEE")
){

    return res.json({
        eligible:false,
        message:
        "You are not enrolled in JEE program"
    });
}

if(
domain === "gate" &&
!student.domain.includes("MTECH")
){

    return res.json({
        eligible:false,
        message:
        "You are not enrolled in GATE program"
    });
}
    const dbDob =
new Date(student.dob)
.toISOString()
.split("T")[0];
        if(dbDob !== dob){

    return res.json({
        eligible:false,
        message:"Incorrect Date of Birth"
    });
}

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
                success:true,
                eligible: true,
                days
            });

        } else {

            res.json({
                success:true,
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
// INITIALIZE TEST PROGRESS TABLE
(async () => {
    try {
        await db.execute(`
            CREATE TABLE IF NOT EXISTS test_progress (
                student_id VARCHAR(100) NOT NULL,
                test_id VARCHAR(100) NOT NULL,
                answers JSON,
                current_index INT DEFAULT 0,
                started_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
                PRIMARY KEY (student_id, test_id)
            )
        `);
        console.log('✅ test_progress table active');
    } catch (err) {
        console.error('❌ test_progress initialization error:', err.message);
    }
})();

// INITIALIZE TEST RESPONSES TABLE (keeps submitted answers for review)
(async () => {
    try {
        await db.execute(`
            CREATE TABLE IF NOT EXISTS test_responses (
                student_id VARCHAR(100) NOT NULL,
                test_id VARCHAR(100) NOT NULL,
                answers JSON,
                score INT DEFAULT 0,
                total_marks INT DEFAULT 0,
                submitted_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                PRIMARY KEY (student_id, test_id)
            )
        `);
        console.log('✅ test_responses table active');
    } catch (err) {
        console.error('❌ test_responses initialization error:', err.message);
    }
})();

// CHECK TEST ATTEMPT STATUS
router.get('/attempt-status/:studentId/:testId', async (req, res) => {
    try {
        const { studentId, testId } = req.params;
        const [existing] = await db.execute(
            `SELECT result_id, score, total_marks, submitted_at FROM test_results WHERE student_id=? AND test_id=?`,
            [studentId, testId]
        );
        if (existing.length > 0) {
            return res.json({
                success: true,
                attempted: true,
                message: "you cannot take this test again",
                result: existing[0]
            });
        }
        res.json({
            success: true,
            attempted: false
        });
    } catch (err) {
        console.error(err);
        res.status(500).json({ success: false, message: "Unable to check attempt status" });
    }
});

// SAVE TEST PROGRESS
router.post('/save-progress', async (req, res) => {
    try {
        const { student_id, test_id, answers, current_index } = req.body;
        if (!student_id || !test_id) {
            return res.status(400).json({ success: false, message: "Missing required parameters" });
        }
        const [existingResult] = await db.execute(
            `SELECT result_id FROM test_results WHERE student_id=? AND test_id=?`,
            [student_id, test_id]
        );
        if (existingResult.length > 0) {
            return res.json({
                success: false,
                attempted: true,
                message: "you cannot take this test again"
            });
        }

        const answersStr = typeof answers === 'string' ? answers : JSON.stringify(answers || {});
        const idx = typeof current_index === 'number' ? current_index : 0;

        await db.execute(
            `INSERT INTO test_progress (student_id, test_id, answers, current_index)
             VALUES (?, ?, ?, ?)
             ON DUPLICATE KEY UPDATE answers = VALUES(answers), current_index = VALUES(current_index)`,
            [student_id, test_id, answersStr, idx]
        );

        res.json({ success: true, message: "Progress saved successfully" });
    } catch (err) {
        console.error(err);
        res.status(500).json({ success: false, message: "Unable to save progress" });
    }
});

// FETCH TEST PROGRESS
router.get('/progress/:studentId/:testId', async (req, res) => {
    try {
        const { studentId, testId } = req.params;
        const [existingResult] = await db.execute(
            `SELECT result_id FROM test_results WHERE student_id=? AND test_id=?`,
            [studentId, testId]
        );
        if (existingResult.length > 0) {
            return res.json({
                success: true,
                attempted: true,
                message: "you cannot take this test again"
            });
        }

        const [rows] = await db.execute(
            `SELECT answers, current_index, started_at FROM test_progress WHERE student_id=? AND test_id=?`,
            [studentId, testId]
        );

        if (rows.length === 0) {
            return res.json({ success: true, progress: null, attempted: false });
        }

        let answers = rows[0].answers;
        try {
            if (typeof answers === 'string') answers = JSON.parse(answers);
        } catch {}

        res.json({
            success: true,
            attempted: false,
            progress: {
                answers: answers || {},
                current_index: rows[0].current_index || 0,
                started_at: rows[0].started_at
            }
        });
    } catch (err) {
        console.error(err);
        res.status(500).json({ success: false, message: "Unable to fetch progress" });
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
    total_marks,
    answers
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
const [existing] =
await db.execute(

`SELECT result_id
 FROM test_results
 WHERE student_id=?
 AND test_id=?`,

[
    student_id,
    test_id
]
);

if(existing.length){

    return res.json({

        success:false,
        message:
        "Result Already Submitted. you cannot take this test again"
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

        // Preserve the submitted answers so the student can review them
        // question-by-question from the portal after submission.
        try {
            await db.execute(
                `INSERT INTO test_responses
                 (student_id, test_id, answers, score, total_marks)
                 VALUES (?, ?, ?, ?, ?)
                 ON DUPLICATE KEY UPDATE
                    answers = VALUES(answers),
                    score = VALUES(score),
                    total_marks = VALUES(total_marks),
                    submitted_at = CURRENT_TIMESTAMP`,
                [
                    student_id,
                    test_id,
                    JSON.stringify(answers || {}),
                    score,
                    total_marks
                ]
            );
        } catch (respErr) {
            console.error('Response save error:', respErr);
        }

        // Delete test_progress upon successful submission
        try {
            await db.execute(
                `DELETE FROM test_progress WHERE student_id=? AND test_id=?`,
                [student_id, test_id]
            );
        } catch (delErr) {
            console.error('Progress cleanup error:', delErr);
        }

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
             ORDER BY submitted_at DESC `,

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

// REVIEW SUBMITTED ANSWERS FOR A TEST
router.get('/review/:studentId/:testId', async (req, res) => {

    try {

        const { studentId, testId } = req.params;
        const dob = req.query.dob;

        const [student] = await db.execute(
            `SELECT student_id FROM students WHERE student_id=? AND dob=?`,
            [studentId, dob]
        );

        if (student.length === 0) {
            return res.json({
                success: false,
                message: 'Invalid Credentials'
            });
        }

        const [resultRows] = await db.execute(
            `SELECT score, total_marks, submitted_at
             FROM test_results
             WHERE student_id=? AND test_id=?`,
            [studentId, testId]
        );

        if (resultRows.length === 0) {
            return res.json({
                success: false,
                message: 'No Result Found For This Test'
            });
        }

        const [testRows] = await db.execute(
            `SELECT title, test_type, questions FROM tests WHERE test_id=?`,
            [testId]
        );

        if (testRows.length === 0) {
            return res.json({
                success: false,
                message: 'Test Not Found'
            });
        }

        const [responseRows] = await db.execute(
            `SELECT answers FROM test_responses WHERE student_id=? AND test_id=?`,
            [studentId, testId]
        );

        let questions = [];
        try {
            questions = typeof testRows[0].questions === 'string'
                ? JSON.parse(testRows[0].questions)
                : (testRows[0].questions || []);
        } catch (parseErr) {
            console.error('Question parse error:', parseErr);
            questions = [];
        }

        let submittedAnswers = {};
        if (responseRows.length > 0) {
            try {
                submittedAnswers = typeof responseRows[0].answers === 'string'
                    ? JSON.parse(responseRows[0].answers)
                    : (responseRows[0].answers || {});
            } catch (parseErr) {
                console.error('Answer parse error:', parseErr);
                submittedAnswers = {};
            }
        }

        const review = questions.map((q, index) => {
            const key = `q${index}`;
            const given = submittedAnswers[key] !== undefined && submittedAnswers[key] !== null
                ? String(submittedAnswers[key]).trim()
                : null;
            const correct = q && q.answer !== undefined && q.answer !== null
                ? String(q.answer).trim()
                : null;
            return {
                index,
                subject: q ? q.subject : null,
                type: q ? q.type : null,
                question: q ? q.question : null,
                options: q && Array.isArray(q.options) ? q.options : [],
                givenAnswer: given,
                correctAnswer: correct,
                isCorrect: given !== null && correct !== null && given === correct
            };
        });

        res.json({
            success: true,
            title: testRows[0].title,
            test_type: testRows[0].test_type,
            score: resultRows[0].score,
            total_marks: resultRows[0].total_marks,
            submitted_at: resultRows[0].submitted_at,
            answersStored: responseRows.length > 0,
            review
        });

    } catch(error) {

        console.log(error);

        res.status(500).json({
            success:false,
            message:'Unable To Fetch Review'
        });
    }
});

router.get('/latest/:type',async(req,res)=>{

try{

    const type =
    req.params.type;

    const [tests] =
    await db.execute(

    `
    SELECT *
    FROM tests
    WHERE LOWER(test_type)=LOWER(?)
    ORDER BY published_at DESC
    LIMIT 1
    `,
    [type]
    );

    if(!tests.length){

        return res.json({
            success:false,
            message:"No Test Published"
        });
    }

    const test =
    tests[0];

    try{
        test.questions =
        JSON.parse(
            test.questions
        );
    }
    catch{}

    res.json({
        success:true,
        test
    });

}
catch(err){

    console.log(err);

    res.status(500).json({
        success:false,
        message:
        "Unable To Fetch Test"
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
             WHERE LOWER(test_type)=LOWER(?)
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
