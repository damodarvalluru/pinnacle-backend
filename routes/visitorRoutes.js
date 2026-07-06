const express = require("express");
const router = express.Router();
const db = require("../db");

router.post("/visit", async (req, res) => {

    try {

        const visitorKey =
            req.body.visitorKey;

        if(!visitorKey){

            return res.status(400).json({
                success:false
            });
        }

        await db.execute(
        `
        INSERT IGNORE INTO visitors
        (
            visitor_key
        )
        VALUES (?)
        `,
        [visitorKey]
        );

        const [rows] =
        await db.execute(
        `
        SELECT COUNT(*) AS total
        FROM visitors
        `
        );

        res.json({
            success:true,
            totalVisitors:rows[0].total
        });

    } catch(error){

        console.log(error);

        res.status(500).json({
            success:false
        });
    }

});

module.exports = router;
