const express = require('express');

const router = express.Router();

const pool = require('../db');


/*
====================================================
FACULTY REGISTER
====================================================
*/

router.post('/register', async (req, res) => {

    try {


        let {
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



        /*
        DATA CLEANING
        */

        name = name?.trim();
        address = address?.trim();
        domain = domain?.trim();
        mobile = mobile?.trim();
        mail = mail?.trim();



        /*
        VALIDATION
        */


        if (
            !name ||
            !domain ||
            !mobile ||
            !mail ||
            !dob
        ) {

            return res.status(400).json({

                success:false,

                message:
                "Required fields are missing"

            });

        }



        /*
        NAME VALIDATION
        */

        if(name.length < 3){

            return res.status(400).json({

                success:false,

                message:
                "Name must contain at least 3 characters"

            });

        }



        /*
        MOBILE VALIDATION
        */

        if(!/^[0-9]{10}$/.test(mobile)){


            return res.status(400).json({

                success:false,

                message:
                "Invalid mobile number"

            });

        }



        /*
        EMAIL VALIDATION
        */

        if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(mail)){


            return res.status(400).json({

                success:false,

                message:
                "Invalid email address"

            });

        }



        /*
        DOB VALIDATION
        */

        const dobDate = new Date(dob);


        if(isNaN(dobDate.getTime())){


            return res.status(400).json({

                success:false,

                message:
                "Invalid date of birth"

            });

        }
        /*
        FACULTY ID GENERATION
        Current format maintained:
        PS-FAC-2026-XXXX
        */
        const currentYear =
        new Date().getFullYear();

        const [facultyRows] = await pool.query(

    `SELECT id
     FROM faculty
     ORDER BY id DESC
     LIMIT 1`

);


const facultyNumber =
facultyRows.length > 0
?
facultyRows[0].id + 1
:
1;



const facultyId =
    
"PS-FAC-" +
currentYear +
"-" +

String(facultyNumber).padStart(4,'0');

        /*
        DATABASE INSERT
        */


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




        /*
        SUCCESS RESPONSE
        */


        res.status(201).json({

            success:true,

            message:
            "Faculty Registered Successfully",


            faculty:{

                id:
                facultyId

            }

        });



    }


    catch(error){


        console.error(

            "Faculty Registration Error:",

            error.message

        );



        res.status(500).json({

            success:false,

            message:
            "Backend server error"

        });


    }

});






/*
====================================================
FACULTY LOGIN
====================================================
*/


router.post('/login', async (req,res)=>{


    try{


        const {

            faculty_id,

            dob

        } = req.body;



        if(!faculty_id || !dob){


            return res.status(400).json({

                success:false,

                message:
                "Faculty ID and DOB required"

            });

        }





        const [rows] = await pool.query(


            `SELECT * FROM faculty

             WHERE faculty_id = ?

             AND dob = ?`,


            [

                faculty_id,

                dob

            ]

        );




        if(rows.length > 0){


            res.status(200).json({

                success:true,

                faculty:rows[0]

            });



        }


        else{


            res.status(401).json({

                success:false,

                message:
                "Invalid Faculty ID or DOB"

            });


        }



    }


    catch(error){



        console.error(

            "Faculty Login Error:",

            error.message

        );



        res.status(500).json({

            success:false,

            message:
            "Internal Server Error"

        });



    }


});



module.exports = router;