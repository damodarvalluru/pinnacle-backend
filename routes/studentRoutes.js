const express = require('express');

const router = express.Router();

const pool = require('../db');

/*
REGISTER STUDENT
*/

router.post('/register', async (req, res) => {

    try {

        const {
            name,
            dob,
            domain
        } = req.body;
console.log("REQUEST BODY:", req.body);
        /*
        VALIDATION
        */

        if (!name || !dob || !domain) {

            return res.status(400).json({
                success: false,
                message: "All fields required"
            });
        }

        /*
        CURRENT YEAR
        */

        const currentYear =
            new Date().getFullYear();

        let prefix = "";
        let totalFees = 0;
        let formattedNumber = "";
        let nextNumber = 0;

        /*
        MPC
        */

        if (domain === "MPC-JEE") {

            prefix = `PS-I-${currentYear}`;

            totalFees = 55000;

            const [rows] = await pool.query(

                `SELECT COUNT(*) AS total
                 FROM students
                 WHERE domain = ?`,

                [domain]
            );

            nextNumber = rows[0].total + 1;

            /*
            PS-I-2026-001
            */

            formattedNumber =
                String(nextNumber).padStart(3, '0');
        }

        /*
        BIPC
        */

        else if (domain === "BIPC-NEET") {

            prefix = `PS-I-${currentYear}`;

            totalFees = 65000;

            const [rows] = await pool.query(

                `SELECT COUNT(*) AS total
                 FROM students
                 WHERE domain = ?`,

                [domain]
            );

            nextNumber = rows[0].total + 1;

            /*
            PS-I-2026-0001
            */

            formattedNumber =
                String(nextNumber).padStart(4, '0');
        }

        /*
        MTECH
        */

        else if (
            domain.startsWith("MTECH")
        ) {

            prefix = `PS-M-${currentYear}`;

            totalFees = 80000;

            const [rows] = await pool.query(

                `SELECT COUNT(*) AS total
                 FROM students
                 WHERE domain LIKE 'MTECH%'`
            );

            nextNumber = rows[0].total + 1;

            /*
            PS-M-2026-001
            */

            formattedNumber =
                String(nextNumber).padStart(3, '0');
        }

        /*
        INVALID DOMAIN
        */

        else {

            return res.status(400).json({
                success: false,
                message: "Invalid domain"
            });
        }

        /*
        FINAL STUDENT ID
        */

        const student_id =
            `${prefix}-${formattedNumber}`;

        /*
        FEES
        */

        const fees_paid = 0;

        const remaining_fees =
            totalFees;

            /*
        INSERT INTO DATABASE
        */

        await pool.query(

            `INSERT INTO students
            (
                student_id,
                name,
                dob,
                domain,
                total_fees,
                fees_paid,
                remaining_fees
            )

            VALUES (?, ?, ?, ?, ?, ?, ?)`,

            [
                student_id,
                name,
                dob,
                domain,
                totalFees,
                fees_paid,
                remaining_fees
            ]
        );

        /*
        SUCCESS
        */

        res.json({

            success: true,

            message:
                "Student Registered Successfully",

            student: {

                student_id,
                name,
                dob,
                domain,
                total_fees: totalFees,
                fees_paid,
                remaining_fees
            }
        });
}
    catch (error) {
console.log(error);
        res.status(500).json({

            success: false,

            message:
                "Backend server error",

            error: error.message
        });
    }
});
/*GET STUDENT*/
router.get('/:studentId', async (req, res) => {

    try {

        const studentId =
            req.params.studentId;

        const [rows] = await pool.query(

            `SELECT * FROM students
             WHERE student_id = ?`,

            [studentId]
        );

        if (rows.length === 0) {

            return res.status(404).json({

                success: false,

                message:
                    'Student Not Found'
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

