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
/* Recover a student ID using the recorded date of birth. This route must be
   above /:studentId, otherwise Express treats "recover-id" as an ID. */
router.post('/recover-id', async (req, res) => {
    try {
        const dob = String(req.body.dob || '');
        if (!/^\d{4}-\d{2}-\d{2}$/.test(dob)) {
            return res.status(400).json({ success: false, message: 'A valid date of birth is required.' });
        }

        const [rows] = await pool.query(
            `SELECT student_id, name, dob, domain FROM students WHERE dob = ? ORDER BY id ASC LIMIT 1`,
            [dob]
        );
        if (rows.length === 0) {
            return res.status(404).json({ success: false, message: 'No student record was found for that date of birth.' });
        }
        return res.json({ success: true, student: rows[0] });
    } catch (error) {
        console.error('Student ID recovery error:', error.message);
        return res.status(500).json({ success: false, message: 'Unable to recover the student ID right now.' });
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

