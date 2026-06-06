async function checkResult(){

    const studentId =
        document.getElementById("roll-input").value.trim();

    const dob =
        document.getElementById("dob-input").value;

    if(!studentId || !dob){

        showResultPopup(
            "Missing Details",
            "Please enter Student ID and Date of Birth."
        );

        return;
    }

    try{

        // VERIFY STUDENT

        const studentResponse =
            await fetch(
                `https://pinnacle-backend-5i7n.onrender.com/api/student/${studentId}`
            );

        const studentData =
            await studentResponse.json();

        if(
            !studentData.success ||
            !studentData.student
        ){

            showResultPopup(
                "Student Not Found",
                "Invalid Student ID."
            );

            return;
        }
       // FETCH RESULT
        const resultResponse =
await fetch(
`https://pinnacle-backend-5i7n.onrender.com/api/tests/result/${studentId}?dob=${encodeURIComponent(dob)}`
);
        const resultData =
            await resultResponse.json();

        if(
            !resultData.success ||
            !resultData.results ||
            resultData.results.length === 0
        ){

            showResultPopup(
                "Result Not Found",
                "No result found."
            );

            return;
        }

        const matchedResult =
            resultData.results[0];

        const totalMarks =
            matchedResult.total_marks;

        const percentage =
            (
                matchedResult.score /
                totalMarks
            ) * 100;

        let performanceMessage = "";

        if(percentage >= 90){

            performanceMessage =
                "Outstanding Performance";

        }else if(percentage >= 75){

            performanceMessage =
                "Excellent Performance";

        }else if(percentage >= 60){

            performanceMessage =
                "Good Performance";

        }else if(percentage >= 40){

            performanceMessage =
                "Average Performance";

        }else{

            performanceMessage =
                "Needs Improvement";
        }

        showResultPopup(
            "Result Found",
            `
            <div style="text-align:left;line-height:2;">

                <h2 style="
                    color:#f59e0b;
                    text-align:center;
                ">
                    Pinnacle Scholars Academy
                </h2>

                <p>
                    <strong>Student ID :</strong>
                    ${matchedResult.student_id}
                </p>

                <p>
                    <strong>Name :</strong>
                    ${matchedResult.student_name}
                </p>

                <p>
                    <strong>Test ID :</strong>
                    ${matchedResult.test_id}
                </p>

                <p>
                    <strong>Score :</strong>
                    ${matchedResult.score}/${totalMarks}
                </p>

                <p>
                    <strong>Percentage :</strong>
                    ${percentage.toFixed(2)}%
                </p>

                <p>
                    <strong>Performance :</strong>
                    ${performanceMessage}
                </p>

                <p>
                    <strong>Submitted On :</strong>
                    ${matchedResult.submitted_at}
                </p>

            </div>
            `
        );

    }catch(err){

        console.error(err);

        showResultPopup(
            "Server Error",
            "Unable to fetch result."
        );
    }
}
/* PROFESSIONAL RESULT POPUP */

function showResultPopup(title, message){

    // REMOVE EXISTING POPUP

    const existing =
        document.getElementById("resultPopupOverlay");

    if(existing) existing.remove();

    // CREATE OVERLAY

    const overlay = document.createElement("div");

    overlay.id = "resultPopupOverlay";

    overlay.innerHTML = `

    <div id="resultPopupBox">

        <div class="popup-glow"></div>

        <h1>${title}</h1>

        <div class="popup-content">

            ${message}

        </div>

        <button onclick="closeResultPopup()">

            Close

        </button>

    </div>
    `;

    document.body.appendChild(overlay);

}

/* CLOSE POPUP */

function closeResultPopup(){

    const popup =
        document.getElementById("resultPopupOverlay");

    if(popup){

        popup.remove();
    }
}
