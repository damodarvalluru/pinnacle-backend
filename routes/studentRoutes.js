const express = require('express');

const router = express.Router();

const pool = require('../db');

/*
REGISTER STUDENT
*/
router.post('/register', async (req, res) => {
let connection;
    try {
        
            let {
            name,
            dob,
            domain
        } = req.body;


name = name?.trim();
domain = domain?.trim();
        /*
        VALIDATION
        */

        if (!name || !dob || !domain) {

    return res.status(400).json({
        success: false,
        message: "All fields are required"
    });
}


// Name validation
if (name.length < 3) {

    return res.status(400).json({
        success: false,
        message: "Name must contain at least 3 characters"
    });
}

// Date validation
const dobDate = new Date(dob);

if (isNaN(dobDate.getTime())) {

    return res.status(400).json({
        success: false,
        message: "Invalid date of birth format"
    });
}

connection = await pool.getConnection();

        await connection.beginTransaction();
       /*
================================================
STUDENT ID GENERATION (NO EXTRA TABLE)
================================================
*/

const currentYear =
    new Date().getFullYear();


let prefix = "";

let totalFees = 0;

let formattedNumber = "";

let nextNumber = 1;



/*
MPC-JEE
*/

if(domain === "MPC-JEE"){

    prefix = `PS-I-${currentYear}`;

    totalFees = 55000;


    const [rows] = await connection.query(

        `SELECT student_id
         FROM students
         WHERE domain = ?
         ORDER BY id DESC
         LIMIT 1
         FOR UPDATE`,

        [domain]

    );


    if(rows.length > 0){

        const lastId =
        rows[0].student_id;


        const lastNumber =
        parseInt(
            lastId.split("-").pop()
        );


        nextNumber =
        lastNumber + 1;

    }


    formattedNumber =
    String(nextNumber)
    .padStart(3,'0');


}



/*
BIPC-NEET
*/

else if(domain === "BIPC-NEET"){

    prefix = `PS-I-${currentYear}`;

    totalFees = 65000;



    const [rows] = await connection.query(

        `SELECT student_id
         FROM students
         WHERE domain = ?
         ORDER BY id DESC
         LIMIT 1
         FOR UPDATE`,

        [domain]

    );



    if(rows.length > 0){


        const lastNumber =
        parseInt(
            rows[0].student_id
            .split("-")
            .pop()
        );


        nextNumber =
        lastNumber + 1;

    }


    formattedNumber =
    String(nextNumber)
    .padStart(4,'0');


}



/*
MTECH
*/

else if(domain.startsWith("MTECH")){


    prefix = `PS-M-${currentYear}`;

    totalFees = 80000;



    const [rows] = await connection.query(

        `SELECT student_id
         FROM students
         WHERE domain LIKE 'MTECH%'
         ORDER BY id DESC
         LIMIT 1
         FOR UPDATE`

    );



    if(rows.length > 0){


        const lastNumber =
        parseInt(
            rows[0].student_id
            .split("-")
            .pop()
        );


        nextNumber =
        lastNumber + 1;


    }



    formattedNumber =
    String(nextNumber)
    .padStart(3,'0');


}



else{

    return res.status(400).json({

        success:false,

        message:"Invalid domain"

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
        try{
        await connection.query(

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
}
catch(insertError){


if(insertError.code === "ER_DUP_ENTRY"){


    return res.status(409).json({

        success:false,

        message:
        "Student ID generation conflict. Please try again."

    });


}


throw insertError;

}
        await connection.commit();

connection.release();
connection = null;
        /*
        SUCCESS
        */

        res.status(201).json({

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
       if(connection){

        try{

            await connection.rollback();

        }
        catch(rollbackError){

            console.error(
                "Rollback Error:",
                rollbackError.message
            );

        }


        connection.release();

    }
console.error(
    "Student Registration Error:",
    error.message
);
        res.status(500).json({

            success: false,

            message:
                "Backend server error"
        });
    }
});
/*
====================================================
FORGOT STUDENT ID
Recovery mechanism: the student provides their Date of
Birth only, and every student record matching that DOB
is returned (name, student ID, DOB, course/domain) so it
can be shown to them in an alert on the frontend.
NOTE: this route is registered BEFORE the "/:studentId"
GET route below on purpose — it's a different HTTP method
(POST) so there's no real routing collision, but keeping
it here keeps every student-lookup route grouped together.
====================================================
*/
router.post('/forgot-id', async (req, res) => {

    try {

        let { dob } = req.body;
        dob = (dob || '').trim();

        if (!dob) {
            return res.status(400).json({
                success: false,
                message: "Date of Birth is required"
            });
        }

        const dobDate = new Date(dob);

        if (isNaN(dobDate.getTime())) {
            return res.status(400).json({
                success: false,
                message: "Invalid date of birth format"
            });
        }

        // A date of birth can never be in the future
        const todayEnd = new Date();
        todayEnd.setHours(23, 59, 59, 999);

        if (dobDate.getTime() > todayEnd.getTime()) {
            return res.status(400).json({
                success: false,
                message: "Date of Birth cannot be a future date"
            });
        }

        const [rows] = await pool.query(

            `SELECT student_id, name, dob, domain
             FROM students
             WHERE dob = ?`,

            [dob]
        );

        if (rows.length === 0) {
            return res.status(404).json({
                success: false,
                message: "No student record found for that Date of Birth"
            });
        }

        const students = rows.map(r => ({
            student_id: r.student_id,
            name: r.name,
            dob: new Date(r.dob).toISOString().split("T")[0],
            domain: r.domain
        }));

        res.json({
            success: true,
            students,
            note: "Please remember your ID."
        });

    } catch (error) {

        console.error(
            "Forgot Student ID Error:",
            error.message
        );

        res.status(500).json({
            success: false,
            message: "Backend server error"
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

        console.error(
    "Student Fetch Error:",
    error.message
);

        res.status(500).json({

            success: false,

            message: "Backend server error"
        });
    }
});

module.exports = router;
  
