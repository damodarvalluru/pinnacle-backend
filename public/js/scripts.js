function toggleTheme() {
        const currentTheme = document.documentElement.getAttribute('data-theme');
        const targetTheme = currentTheme === 'dark' ? 'light' : 'dark';
        document.documentElement.setAttribute('data-theme', targetTheme);
        
        const toggleBtn = document.getElementById('themeToggleBtn');
        if (targetTheme === 'dark') {
            toggleBtn.innerHTML = '☀️ Light Mode';
        } else {
            toggleBtn.innerHTML = '🌙 Dark Mode';
        }
    }


function startIntroAnimations(){

    const intro =
        document.getElementById("welcomeIntro");

    if(!intro) return;

    setTimeout(() => {
        intro.classList.add("drop-bars");
    }, 500);

    setTimeout(() => {
        intro.classList.add("open-bars");
    }, 2500);

    setTimeout(() => {
        intro.classList.add("show-ppt");
    }, 4000);

    setTimeout(() => {
        intro.classList.add("open-ppt");
    }, 5500);

    setTimeout(() => {

        intro.classList.add("hide");

        document.body.style.overflow = "auto";

    }, 8000);
}

function navigateTo(target) {
        if (target === 'student') window.location.href = 'student-portal.html'; 
        else if (target === 'faculty') window.location.href = 'faculty-portal.html';
        else if (target === 'results') window.location.href = 'results-portal.html';
        else if (target === 'enroll') window.location.href = 'enrollment.html';
    }


    function handleNavigation() {
        const scrollBtn = document.getElementById('globalScrollBtn');
        if (scrollBtn.classList.contains('pointing-down')) {
            window.scrollTo({
                top: document.documentElement.scrollHeight,
                behavior: 'smooth'
            });
        } else {
            window.scrollTo({
                top: 0,
                behavior: 'smooth'
            });
        }
    }

    // Unified Razorpay Checkout Engine Function
    async function processRazorpayPayment(amountInINR, studentDetails = {}) {
    try {
        if (!amountInINR || amountInINR < 1) {
            alert("Payment amount must be at least ₹1");
            return;
        }
        const targetAmountPaise = Math.round(amountInINR * 100);
        console.log("Creating Razorpay Order...");
        console.log("Sending Request To Backend...");
        const response = await fetch('https://pinnacle-backend-5i7n.onrender.com/api/payments/create-order', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                amount: targetAmountPaise,
                currency: 'INR',
                receipt: 'receipt_' + Date.now()
            })
        });
        console.log("Response Status:", response.status);
        console.log("Response OK:", response.ok);
        if (!response.ok) {
            const errorText = await response.text();
            console.log("Server Error:", errorText);
            throw new Error("Backend server responded with error");
        }
        const orderData = await response.json();
        console.log("full backedn response:", orderData);
        const options = {
            key: "rzp_live_Su10APgukCxwdi",
            amount: orderData.amount,
            currency: orderData.currency,
            name: "Pinnacle Scholars Academy",
            description: "Educational Fee Payment",
            order_id: orderData.order_id,
            handler: async function (paymentReceipt) {
                try {
                    const verificationResponse = await fetch('https://pinnacle-backend-5i7n.onrender.com/api/payments/verify-payment', {
                        method: 'POST',
                        headers: {
                            'Content-Type': 'application/json'
                        },
                       body: JSON.stringify({

    razorpay_order_id:
        paymentReceipt.razorpay_order_id,

    razorpay_payment_id:
        paymentReceipt.razorpay_payment_id,

    razorpay_signature:
        paymentReceipt.razorpay_signature,

    student_id:
        studentDetails.student_id,

    payment_type:
        studentDetails.payment_type,

    paid_amount:
        amountInINR

})
                    });
                    const verificationResult = await verificationResponse.json();
                    console.log("Verification Result:", verificationResult);
                    if (verificationResult.success) {

    // UPDATE LOCAL STORAGE

    const students =
        JSON.parse(
            localStorage.getItem('registered_students')
        ) || [];

    const studentIndex = students.findIndex(
        s => s.id === studentDetails.student_id
    );

    if (studentIndex !== -1) {

        const oldPaid =
            parseFloat(
                students[studentIndex].feesPaid
            ) || 0;

        const totalFees =
            parseFloat(
                students[studentIndex].totalFees
            ) || 50000;

        const newPaid =
            oldPaid + amountInINR;

        const remaining =
            totalFees - newPaid;

        students[studentIndex].feesPaid =
            newPaid;

        students[studentIndex].remainingFees =
            remaining;

        localStorage.setItem(
            'registered_students',
            JSON.stringify(students)
        );
    }

    alert(

"Payment Successful!\n\n" +

"Payment ID: " +
paymentReceipt.razorpay_payment_id +

"\n\nPaid Amount: ₹" +
amountInINR +

"\n\nRemaining Fees: ₹" +
remaining
);

}
                    else {
                        alert("Payment verification failed");
                    }
                } catch (verificationError) {
                    console.log("Verification Error:", verificationError);
                    alert("Payment verification server error");
                }
            },
            prefill: {
                name: studentDetails.name || "Student",
                email: studentDetails.email || "student@example.com",
                contact: studentDetails.contact || "9999999999"
            },
            theme: {
                color: "#1a365d"
            },
            modal: {
                ondismiss: function () {
                    console.log("Payment popup closed");
                }
            }
        };
        const razorpayWindow = new Razorpay(options);
        razorpayWindow.on('payment.failed', function (response) {
            console.log("Payment Failed:", response);
            alert(
                "Payment Failed\n" +
                response.error.description
            );
        });
        razorpayWindow.open();
    } catch (error) {
        console.log("FULL PAYMENT ERROR:", error);
        alert(
            "Backend connection failed.\n\n" + "Check:\n" + "1. Node server running\n" + "2. Port 3000 active\n" + "3. CORS enabled\n" + "4. API route exists");
    }
}
    
// General Payment Flow Function
async function initiateGeneralPayment() {

    try {

        // STEP 1
        const studentId = prompt("Enter Student ID");

        if (!studentId) {
            return;
        }

        // STEP 2
        const students =
            JSON.parse(
                localStorage.getItem('registered_students')
            ) || [];

        // STEP 3
        const student = students.find(
            s =>
                s.id &&
                s.id.trim().toLowerCase() ===
                studentId.trim().toLowerCase()
        );

        // STEP 4
        if (!student) {

            alert("Student Not Found");
            return;
        }

        // STEP 5
        const totalFees =
            parseFloat(student.totalFees) || 50000;

        const paidFees =
            parseFloat(student.feesPaid) || 0;

        const remainingFees =
            totalFees - paidFees;

        // STEP 6
        alert(

`Student Details

Name: ${student.name}

Domain: ${student.domain}

Total Fees: ₹${totalFees}

Paid Fees: ₹${paidFees}

Remaining Fees: ₹${remainingFees}
`
        );

        // STEP 7
        if (remainingFees <= 0) {

            alert("All Fees Already Paid");
            return;
        }

        // STEP 8
        const paymentOption = prompt(
            "Choose Payment Type\n\n1 = Full Payment\n2 = Partial Payment"
        );

        let amountToPay = 0;
        let paymentType = '';

        // FULL
        if (paymentOption === '1') {

            amountToPay = remainingFees;
            paymentType = 'FULL';

        }

        // PARTIAL
        else if (paymentOption === '2') {

            const partialAmount = prompt(
                `Enter Partial Amount\nRemaining Fees: ₹${remainingFees}`
            );

            amountToPay = parseFloat(partialAmount);

            paymentType = 'PARTIAL';

            if (
                isNaN(amountToPay) ||
                amountToPay <= 0 ||
                amountToPay > remainingFees
            ) {

                alert("Invalid Amount");
                return;
            }

        }

        else {

            alert("Invalid Option");
            return;
        }

        // STEP 9
        processRazorpayPayment(
            amountToPay,
            {
                student_id: student.id,
                payment_type: paymentType,
                name: student.name,
                email: student.email,
                contact: student.mobile
            }
        );

    } catch(err) {

        console.log(err);
        alert("Payment Initialization Failed");
    }
}


/// TEST PORTAL 

async function startTest(domain) {
    
    const examConfig = {

    jee: {

        portalTitle:
        "JEE Monthly Test Portal",

        instructions: `
        <li>Total Questions : <b>75 Questions</b></li>

        <li>
        Physics → 25 Questions
        (20 MCQ + 5 Numerical)
        </li>

        <li>
        Chemistry → 25 Questions
        (20 MCQ + 5 Numerical)
        </li>

        <li>
        Mathematics → 25 Questions
        (20 MCQ + 5 Numerical)
        </li>

        <li>
        Questions appear continuously :
        Physics → Chemistry → Maths
        </li>

        <li>
        MCQ Correct Answer :
        <b>+4 Marks</b>
        </li>

        <li>
        MCQ Wrong Answer :
        <b>-1 Negative Marking</b>
        </li>

        <li>
        Numerical Questions :
        <b>+4 Marks</b>
        and
        <b>No Negative Marking</b>
        </li>

        <li>
        Student can attempt questions in any order.
        </li>

        <li>
        Student ID & DOB required.
        </li>
        `
    },

    gate: {

        portalTitle:
        "GATE Monthly Test Portal",

        instructions: `
        <li>Total Questions : <b>65 Questions</b></li>

        <li>
        General Aptitude →
        10 Questions
        </li>

        <li>
        Core Subject →
        55 Questions
        </li>

        <li>
        1 Mark Questions :
        <b>+1</b>
        </li>

        <li>
        2 Mark Questions :
        <b>+2</b>
        </li>

        <li>
        MCQ Negative Marking Applicable
        </li>

        <li>
        Numerical Questions :
        No Negative Marking
        </li>

        <li>
        Total Marks :
        <b>100</b>
        </li>

        <li>
        Student can attempt questions in any order.
        </li>

        <li>
        Student ID & DOB required.
        </li>
        `
    }
};

    const existingPortal = document.getElementById("ultimateJeePortal");
    if(existingPortal) existingPortal.remove();

    const portal = document.createElement("div");

    portal.id = "ultimateJeePortal";

    portal.innerHTML = `

    <style>

        #ultimateJeePortal{
            position:fixed;
            inset:0;
            overflow:auto;
            z-index:999999;
            background:
            radial-gradient(circle at top left,#16355d,#07111d 60%);
            font-family:'Segoe UI',sans-serif;
        }

        /* MOVING LINES */

        .portal-line{
            position:absolute;
            width:2px;
            height:220px;
            background:linear-gradient(to bottom,transparent,#00d9ff,transparent);
            opacity:0.25;
            animation:lineMove linear infinite;
        }

        .portal-line.reverse{
            animation-name:lineReverse;
        }

        @keyframes lineMove{
            from{
                transform:translateY(-250px);
            }
            to{
                transform:translateY(120vh);
            }
        }

        @keyframes lineReverse{
            from{
                transform:translateY(120vh);
            }
            to{
                transform:translateY(-250px);
            }
        }

        /* FLOATING OBJECTS */

        .floating-orb{
            position:absolute;
            border-radius:50%;
            background:rgba(0,217,255,0.08);
            animation:floatOrb 12s infinite ease-in-out;
            backdrop-filter:blur(5px);
        }

        @keyframes floatOrb{

            0%{
                transform:translateY(0px) rotate(0deg);
            }

            50%{
                transform:translateY(-40px) rotate(180deg);
            }

            100%{
                transform:translateY(0px) rotate(360deg);
            }
        }

        /* MAIN CARD */

        .jee-card{
            position:relative;
            width:92%;
            max-width:1000px;
            margin:40px auto;
            padding:35px;
            border-radius:25px;
            background:rgba(255,255,255,0.08);
            border:1px solid rgba(255,255,255,0.12);
            backdrop-filter:blur(18px);
            box-shadow:0 10px 50px rgba(0,0,0,0.45);
            color:white;
        }

        .jee-card h1{
            text-align:center;
            font-size:40px;
            margin-bottom:12px;
        }

        .jee-card p{
            line-height:1.8;
            color:#d9efff;
        }

        .instruction-box{
            margin-top:25px;
            padding:25px;
            border-radius:18px;
            background:rgba(255,255,255,0.05);
            border:1px solid rgba(255,255,255,0.08);
        }

        .instruction-box h2{
            color:#00d9ff;
            margin-bottom:18px;
        }

        .instruction-box li{
            margin-bottom:14px;
            line-height:1.8;
        }

        .verify-section{
            margin-top:35px;
            display:flex;
            flex-direction:column;
            gap:18px;
        }

        .verify-section input{
            padding:16px;
            border:none;
            border-radius:12px;
            outline:none;
            background:rgba(255,255,255,0.12);
            color:white;
            font-size:16px;
        }

        .verify-section input::placeholder{
            color:#cdefff;
        }

        .verify-section input:focus{
            box-shadow:0 0 18px rgba(0,217,255,0.4);
        }

        .jee-btn{
            padding:16px;
            border:none;
            border-radius:12px;
            background:linear-gradient(90deg,#00d9ff,#0077ff);
            color:white;
            font-size:17px;
            font-weight:bold;
            cursor:pointer;
            transition:0.3s;
        }

        .jee-btn:hover{
            transform:translateY(-3px);
            box-shadow:0 10px 25px rgba(0,217,255,0.3);
        }

        .statusText{
            display:none;
            color:#9ae6ff;
            text-align:center;
        }

    </style>

    <!-- MOVING LINES -->

    ${Array.from({length:30}).map((_,i)=>`
        <div class="portal-line ${i%2===0 ? 'reverse':''}"
            style="
                left:${Math.random()*100}%;
                animation-duration:${5 + Math.random()*8}s;
                animation-delay:${Math.random()*5}s;
            ">
        </div>
    `).join("")}

    <!-- FLOATING ORBS -->

    ${Array.from({length:12}).map(()=>`
        <div class="floating-orb"
            style="
                width:${80 + Math.random()*140}px;
                height:${80 + Math.random()*140}px;
                top:${Math.random()*100}%;
                left:${Math.random()*100}%;
                animation-duration:${8 + Math.random()*10}s;
            ">
        </div>
    `).join("")}

    <div class="jee-card">

        <h1>${examConfig[domain].portalTitle}</h1>

        <p>
            Read all instructions carefully before proceeding.
        </p>

        <div class="instruction-box">

            <h2>Exam Instructions</h2>

            <ul>

${examConfig[domain].instructions}

</ul>
        </div>

        <div class="verify-section">

            <input
                type="text"
                id="jeeStudentId"
                placeholder="Enter Student ID"
            >

            <input
                type="date"
                id="jeeStudentDob"
            >

            <button class="jee-btn" id="verifyEligibilityBtn">
                Verify Eligibility & Start Test
            </button>

            <p align="center"><a href="index.html" class="back">← Return Home</a></p>

            <div class="statusText" id="statusText">
                Verifying student...
            </div>

        </div>

    </div>
    `;

    document.body.appendChild(portal);

    // VERIFY BUTTON

    document
    .getElementById("verifyEligibilityBtn")
    .addEventListener("click", async function(){

        const studentId =
            document.getElementById("jeeStudentId").value.trim();

        const dob =
            document.getElementById("jeeStudentDob").value;

        if(!studentId || !dob){

            alert("Please enter Student ID and DOB");

            return;
        }

        // SAVE LOGIN INFO

        localStorage.setItem("active_student_id", studentId);
        localStorage.setItem("active_student_dob", dob);

        const status =
            document.getElementById("statusText");

        status.style.display = "block";

        try{

            // ELIGIBILITY CHECK

            const eligibilityResponse =
await fetch(

`https://pinnacle-backend-5i7n.onrender.com/api/tests/student-eligible/${studentId}?dob=${encodeURIComponent(dob)}&domain=${domain}`

);

            if(!eligibilityResponse.ok){
                throw new Error("Eligibility API Failed");
            }

            const eligibilityData =
                await eligibilityResponse.json();

            if(!eligibilityData.eligible){

    status.style.display = "none";

    if(eligibilityData.message){

        alert(eligibilityData.message);

    }else{

        alert(
            `You are not eligible for monthly test.\n\nRemaining Days : ${eligibilityData.remainingDays}`
        );
    }

    return;
}

            status.innerHTML =
                "Eligibility verified. Fetching test...";
            // calls student api for student name
                const studentResponse =
await fetch(
`https://pinnacle-backend-5i7n.onrender.com/api/student/${studentId}`
);

const studentData =
await studentResponse.json();

if(studentData.success){

    localStorage.setItem(
        "active_student_name",
        studentData.student.name
    );
}
            // FETCH TEST

            const response = await fetch(
                `https://pinnacle-backend-5i7n.onrender.com/api/tests/latest/${domain}`
            );

            if(!response.ok){
                throw new Error("Test API Failed");
            }

            const data =
await response.json();

if(!data.success){

    alert(
        data.message
    );

    return;
}

const latestTest =
data.test;
            document
            .getElementById("ultimateJeePortal")
            .remove();

            showTestInterface(latestTest);

        }catch(err){

            console.error(err);

            alert(
                "Test system failed.\n\n" +
                "Check backend server & APIs."
            );
        }

    });

}

//show test interface
async function showTestInterface(testObject) {

    let parsedQuestions = [];

    try{

        if(typeof testObject.questions === "string"){

            parsedQuestions =
                JSON.parse(testObject.questions);

        }else{

            parsedQuestions = testObject.questions;
        }

    }catch(err){

        alert("Question paper invalid");

        console.error(err);

        return;
    }

    if(parsedQuestions.length === 0){

        alert("No questions available");

        return;
    }

    let htmlQuestions = "";

    parsedQuestions.forEach((q,index)=>{

        const subject =
            q.subject || "GENERAL";

        htmlQuestions += `

        <div class="question-card">

            <div class="question-top">

                <span class="subject-badge">
                    ${subject}
                </span>

                <span class="question-number">
                    Q${index + 1}
                </span>

            </div>

            <h3 class="question-title">
                ${q.question}
            </h3>

            <div class="options-box">

                ${q.type === "numerical" ? `

                    <input
                        type="number"
                        name="q${index}"
                        placeholder="Enter Numerical Answer"
                        class="numerical-input"
                    >

                ` : `

                    ${q.options.map(opt=>`

                        <label class="option-label">

                            <input
                                type="radio"
                                name="q${index}"
                                value="${opt}"
                            >

                            ${opt}

                        </label>

                    `).join("")}

                `}

            </div>

        </div>
        `;
    });

    const wrapper = document.createElement("div");

    wrapper.id = "jeeTestInterface";

    wrapper.innerHTML = `

    <style>

        #jeeTestInterface{

            position:fixed;
            inset:0;
            overflow:auto;
            background:#07111d;
            z-index:999999;
            font-family:'Segoe UI',sans-serif;
        }

        .test-header{

            position:sticky;
            top:0;
            z-index:999;
            background:#0d1f33;
            padding:18px;
            display:flex;
            justify-content:space-between;
            align-items:center;
            border-bottom:1px solid rgba(255,255,255,0.08);
        }

        .test-header h1{
            color:white;
            margin:0;
        }

        .submit-btn{

            background:linear-gradient(90deg,#00d9ff,#0077ff);
            border:none;
            padding:14px 25px;
            border-radius:10px;
            color:white;
            cursor:pointer;
            font-weight:bold;
        }

        .questions-container{

            max-width:1100px;
            margin:auto;
            padding:30px;
        }

        .question-card{

            background:#10253d;
            margin-bottom:28px;
            border-radius:18px;
            padding:25px;
            border:1px solid rgba(255,255,255,0.08);
        }

        .question-top{

            display:flex;
            justify-content:space-between;
            margin-bottom:15px;
        }

        .subject-badge{

            background:#00d9ff22;
            color:#7cecff;
            padding:6px 12px;
            border-radius:30px;
            font-size:14px;
        }

        .question-number{

            color:#ffffff;
            font-weight:bold;
        }

        .question-title{

            color:white;
            line-height:1.7;
            margin-bottom:18px;
        }

        .option-label{

            display:block;
            padding:14px;
            margin-bottom:12px;
            border-radius:12px;
            background:#18324f;
            color:white;
            cursor:pointer;
            transition:0.3s;
        }

        .option-label:hover{

            background:#214467;
        }

        .numerical-input{

            width:100%;
            padding:15px;
            border:none;
            border-radius:10px;
            background:#18324f;
            color:white;
            outline:none;
        }

    </style>

    <div class="test-header">

        <div>
    <h1>${testObject.title}</h1>
    <div id="testTimer"
         style="
            color:#00d9ff;
            font-weight:bold;
            margin-top:5px;
         ">
         03:00:00
    </div>
</div>

        <button class="submit-btn" id="submitTestBtn">
            Submit Test
        </button>

    </div>

    <div class="questions-container">

        ${htmlQuestions}

    </div>
    `;

    document.body.appendChild(wrapper);
    window.onbeforeunload = function () {
    return "Your test is still in progress.";
};
let timeLeft = 180 * 60;

const timer = setInterval(() => {

    const hrs =
        Math.floor(timeLeft / 3600);

    const mins =
        Math.floor((timeLeft % 3600) / 60);

    const secs =
        timeLeft % 60;

    document.getElementById(
        "testTimer"
    ).innerHTML =
    `${String(hrs).padStart(2,'0')}:${
        String(mins).padStart(2,'0')
    }:${
        String(secs).padStart(2,'0')
    }`;

    if(timeLeft <= 0){

        clearInterval(timer);

        document
        .getElementById("submitTestBtn")
        .click();
    }

    timeLeft--;

},1000);
// SUBMIT
    document
    .getElementById("submitTestBtn")
    .addEventListener("click", async function(){
        const submitBtn =
document.getElementById(
    "submitTestBtn"
);

submitBtn.disabled = true;

submitBtn.innerHTML =
"Submitting...";
        let score = 0;

        parsedQuestions.forEach((q,index)=>{

            let selected;

            if(q.type === "numerical"){

                selected =
                    document.querySelector(
                        `input[name="q${index}"]`
                    )?.value;

            }else{

                selected =
                    document.querySelector(
                        `input[name="q${index}"]:checked`
                    )?.value;
            }

            if(selected){

                if(String(selected).trim() === String(q.answer).trim()){

                    score += 4;

                }else{

                    if(q.type !== "numerical"){

                        score -= 1;
                    }
                }
            }

        });
        // SAVE RESULT
        try{
            const totalMarks = parsedQuestions.length * 4;
    const saveResponse =
    await fetch(

    "https://pinnacle-backend-5i7n.onrender.com/api/tests/submit-result",

    {
        method:"POST",

        headers:{
            "Content-Type":"application/json"
        },

        body:JSON.stringify({

            student_id:
            localStorage.getItem("active_student_id"),

            student_name:
            localStorage.getItem("active_student_name"),

            test_id:
            testObject.test_id,

            score,

            total_marks: totalMarks
        })
    });

    const saveData =
    await saveResponse.json();

    if(!saveData.success){

        throw new Error(
            "Result save failed"
        );
    }
    clearInterval(timer);
    window.onbeforeunload = null;
    alert(
        `Test Submitted Successfully\n\nScore : ${score}`
    );

    location.reload();

}
catch(err){
    submitBtn.disabled = false;

submitBtn.innerHTML =
"Submit Test";
    console.error(err);
    alert(
        "Database save failed.\nContact administrator."
    );
}
    });
}


function downloadBrochure() {
    const watermark = "PINNACLE ACADEMY";
    // Render a clean interface modal layout container
    let modal = document.getElementById('prospectusViewModal');
    if (!modal) {
        modal = document.createElement('div');

        modal.id = 'prospectusViewModal';

        modal.style.position = 'fixed';
        modal.style.top = '0';
        modal.style.left = '0';
        modal.style.width = '100%';
        modal.style.height = '100%';
        modal.style.backgroundColor = 'rgba(15, 23, 42, 0.85)';
        modal.style.backdropFilter = 'blur(4px)';
        modal.style.zIndex = '10000';
        modal.style.display = 'flex';
        modal.style.justifyContent = 'center';
        modal.style.alignItems = 'center';
        modal.style.padding = '15px';
        modal.style.boxSizing = 'border-box';

        document.body.appendChild(modal);
    }

    modal.innerHTML = `

    <div id="printableProspectusArea"
        style="
            position: relative;
            background: #ffffff;
            color: #2d3748;
            width: 100%;
            max-width: 900px;
            max-height: calc(100vh - 30px);
            overflow-y: auto;
            padding: 20px;
            border-radius: 8px;
            box-shadow: 0 20px 25px -5px rgba(0,0,0,0.5);
            font-family: 'Segoe UI', Arial, sans-serif;
            line-height: 1.5;
            box-sizing: border-box;
        ">

        <!-- Fixed Watermark Configuration Layer -->
        <div class="pdf-watermark-text"
            style="
                position: absolute;
                top: 50%;
                left: 50%;
                transform: translate(-50%, -50%) rotate(-30deg);
                font-size: 4.5rem;
                font-weight: 900;
                color: rgba(0, 0, 0, 0.02);
                z-index: 0;
                white-space: nowrap;
                letter-spacing: 5px;
                pointer-events: none;
                user-select: none;
            ">

            ${watermark}

        </div>

        <!-- Top Interactive System Control Utility Bar -->
        <div class="no-print"
            style="
                display: flex;
                justify-content: space-between;
                align-items: center;
                margin-bottom: 20px;
                background: #ebf8ff;
                padding: 10px 15px;
                border-radius: 6px;
                border: 1px solid #bee3f8;
                font-size: 0.9rem;
            ">

            <span style="color: #2b6cb0; font-weight: 600;">
                📄 Prospectus Core Viewer Active
            </span>

            <div style="display: flex; gap: 8px;">

                <button
                    onclick="window.location.href='index.html'"
                    style="
                        background: #1a365d;
                        color: white;
                        border: none;
                        padding: 6px 12px;
                        border-radius: 4px;
                        font-weight: bold;
                        cursor: pointer;
                    ">

                    🏠 Home

                </button>

                <button
                    onclick="printProspectus()"
                    style="
                        background: #3182ce;
                        color: white;
                        border: none;
                        padding: 6px 12px;
                        border-radius: 4px;
                        font-weight: bold;
                        cursor: pointer;
                    ">

                    🖨️ Print / Download Syllabus

                </button>

                <button
                    onclick="document.getElementById('prospectusViewModal').style.display='none'"
                    style="
                        background: #e5e7eb;
                        color: #4b5563;
                        border: none;
                        padding: 6px 12px;
                        border-radius: 4px;
                        font-weight: bold;
                        cursor: pointer;
                    ">

                    Close

                </button>

            </div>

        </div>

        <!-- Primary Document Layout Box Blueprint -->
        <div style="position: relative; z-index: 1;">

            <table
                style="
                    width: 100%;
                    border-bottom: 2px solid #1a365d;
                    padding-bottom: 10px;
                    margin-bottom: 20px;
                ">

                <tr>

                    <td>

                        <h1
                            style="
                                color: #1a365d;
                                margin: 0;
                                font-size: 22px;
                                text-transform: uppercase;
                                letter-spacing: 0.5px;
                            ">

                            ${watermark}

                        </h1>

                        <h2
                            style="
                                color: #2b6cb0;
                                font-size: 14px;
                                margin-top: 4px;
                                margin-bottom: 0;
                                font-weight: 600;
                            ">

                            Official Academic Prospectus Summary (2026)

                        </h2>

                    </td>

                </tr>

            </table>

            <!-- SECTION 1 -->
            <div
                style="
                    background: #f7fafc;
                    border-left: 3px solid #ed8936;
                    padding: 4px 10px;
                    font-weight: bold;
                    color: #1a365d;
                    margin-top: 15px;
                    text-transform: uppercase;
                    font-size: 11px;
                ">

                [1. Syllabus Blueprint Tracking]

            </div>

            <ul
                style="
                    padding-left: 15px;
                    margin-top: 5px;
                    font-size: 0.9rem;
                    margin-bottom: 10px;
                ">

                <li style="margin-bottom: 4px;">
                    <strong>Intermediate Domain:</strong>
                    MPC / BiPC Comprehensive Matrices,
                    JEE Main/Advanced Foundations &
                    NEET Preparation.
                </li>

                <li style="margin-bottom: 4px;">
                    <strong>Postgraduate Track:</strong>
                    M.Tech Specialized Advanced Computing Systems,
                    GATE Subject Metrics,
                    & Project Research.
                </li>

            </ul>

            <!-- SECTION 2 -->
            <div
                style="
                    background: #f7fafc;
                    border-left: 3px solid #ed8936;
                    padding: 4px 10px;
                    font-weight: bold;
                    color: #1a365d;
                    margin-top: 15px;
                    text-transform: uppercase;
                    font-size: 11px;
                ">

                [2. Expert Core Faculty Directory]

            </div>

            <ul
                style="
                    padding-left: 15px;
                    margin-top: 5px;
                    font-size: 0.9rem;
                    margin-bottom: 10px;
                ">

                <li style="margin-bottom: 3px;">
                    <strong>Dr. Amit Sharma</strong>
                    — PhD in Quantum Physics |
                    Senior Campus Specialist Coordinator
                </li>

                <li style="margin-bottom: 3px;">
                    <strong>Prof. S. Verma</strong>
                    — M.Tech,
                    Indian Institute of Technology (IIT-D) |
                    Structural Systems
                </li>

            </ul>

            <div class="pdf-page-break"></div>

            <!-- SECTION 3 -->
            <div
                style="
                    background: #f7fafc;
                    border-left: 3px solid #ed8936;
                    padding: 4px 10px;
                    font-weight: bold;
                    color: #1a365d;
                    margin-top: 15px;
                    text-transform: uppercase;
                    font-size: 11px;
                ">

                [3. Base Fees & Special Discount Criteria]

            </div>

            <ul
                style="
                    padding-left: 15px;
                    margin-top: 5px;
                    font-size: 0.9rem;
                    margin-bottom: 10px;
                ">

                <li style="margin-bottom: 3px;">
                    <strong>Intermediate Core Coaching Fee:</strong>
                    Base rate at ₹50,000 annually.
                </li>

                <li style="margin-bottom: 3px;">
                    <strong>M.Tech Specialized Depth Track Fee:</strong>
                    Base rate at ₹80,000 annually.
                </li>

            </ul>

            <div
                style="
                    border: 1px dashed #ed8936;
                    background: #fffaf0;
                    padding: 10px;
                    border-radius: 4px;
                    margin-top: 8px;
                    font-size: 0.88rem;
                ">

                <span style="color: #ed8936; font-weight: bold;">
                    ✨ PROMOTIONAL BONUS DISCOUNT:
                </span>

                A flat
                <strong>5% reduction discount waiver</strong>
                is actively subtracted from full tuition balances
                upon launching verification sequences through
                the active hyperlink channel declared below.

            </div>

            <!-- SECTION 4 -->
            <div
                style="
                    background: #f7fafc;
                    border-left: 3px solid #ed8936;
                    padding: 4px 10px;
                    font-weight: bold;
                    color: #1a365d;
                    margin-top: 15px;
                    text-transform: uppercase;
                    font-size: 11px;
                ">

                [4. Active Database Verification Gateway Link]

            </div>

            <p
                style="
                    margin-top: 8px;
                    margin-bottom: 8px;
                    font-size: 0.88rem;
                ">

                Clicking the active hyperlink element opens a
                localized authorization tunnel context to match
                your profile metrics and execute financial
                settlements online:

            </p>

            <a
                href="javascript:void(0);"
                onclick="window.location.href='fees-payment.html'"
                style="
                    display: inline-block;
                    padding: 10px 20px;
                    background: #38a169;
                    color: white !important;
                    text-decoration: none;
                    border-radius: 4px;
                    font-weight: bold;
                    font-size: 0.9rem;
                ">

                🔗 CLICK HERE TO ENTER ID & PAY FEES

            </a><br><br>
            <hr><hr><br>
            <div class="website-qr" style="width:140px;text-align:center;margin:auto;padding:10px;border:2px solid #1a365d;border-radius:10px;">
            <strong>Scan to Visit Pinnacle Scholars Academy</strong><br>
    <img src="images/website-qr.png" alt="Website QR"  style="
        width:120px;
        height:120px;
        object-fit:contain;
        display:block;
        margin:auto;
    ">
    </div><br><br>

            <footer
                style="
                    margin-top: 30px;
                    border-top: 1px solid #e2e8f0;
                    padding-top: 10px;
                    font-size: 10px;
                    color: #a0aec0;
                    text-align: center;
                ">

                © 2026 Pinnacle Scholars Academy, Noida.
                All rights reserved.
                Verified System Output Document.

            </footer>

        </div>

    </div>

    `;

    modal.style.display = 'flex';
}

function printProspectus(){

    const content =
        document.getElementById(
            "printableProspectusArea"
        );

    const printWindow =
        window.open('', '_blank');

    printWindow.document.write(`
        <html>
        <head>
            <title>Pinnacle Prospectus</title>

            <style>

                body{
                    font-family:Arial,sans-serif;
                    padding:20px;
                }

                img{
                    max-width:100%;
                }

                .no-print{
                    display:none;
                }

                @page{
                    size:A4;
                    margin:10mm;
                }

            </style>

        </head>

        <body>

            ${content.innerHTML}

        </body>

        </html>
    `);

    printWindow.document.close();

    printWindow.focus();

    setTimeout(()=>{

        printWindow.print();

    },500);
}

async function updateVisitorCount(){

    try{

        let visitorKey =
        localStorage.getItem(
            "visitor_key"
        );

        if(!visitorKey){

            visitorKey =
            crypto.randomUUID();

            localStorage.setItem(
                "visitor_key",
                visitorKey
            );
        }

        const response =
        await fetch(
            "https://pinnacle-backend-5i7n.onrender.com/api/visitors/visit",
            {
                method:"POST",
                headers:{
                    "Content-Type":
                    "application/json"
                },
                body:JSON.stringify({
                    visitorKey
                })
            }
        );

        const data =
        await response.json();

        if(data.success){

            animateCounter(
                data.totalVisitors
            );
        }

    }
    catch(error){

        console.log(
            "Visitor Error",
            error
        );
    }
}

function animateCounter(target){
const counter = document.getElementById("visitor-count");
let count = 0;
const increment = Math.ceil(target / 100);
const timer = setInterval(()=>{count += increment;
    if(count >= target){
        count = target;
        clearInterval(timer);
    }
    counter.innerText = count.toLocaleString();
        },20);
}


// Populate Dynamic Registered Faculty into Directory
    window.addEventListener('DOMContentLoaded', () => {
        const directoryGrid = document.getElementById('facultyDirectoryGrid');
        const registeredFaculty = JSON.parse(localStorage.getItem('registered_faculty')) || [];
        const currentYear = 2026;

        registeredFaculty.forEach(fac => {
            let yearsOfTenure = 0;
            if (fac.enrollmentDate) {
                const enrollYear = new Date(fac.enrollmentDate).getFullYear();
                yearsOfTenure = currentYear - enrollYear;
                if(yearsOfTenure < 0) yearsOfTenure = 0;
            }

            const facCard = document.createElement('div');
            facCard.className = 'card';
            facCard.setAttribute('data-aos', 'zoom-in-up');
            facCard.innerHTML = `
                <h3 style="color: var(--accent); margin-bottom:5px;">${fac.name}</h3>
                <p style="margin:2px 0;"><strong>Domain:</strong> ${fac.domain}</p>
                <p style="margin:2px 0;"><strong>Qualifications:</strong> ${fac.qualifications}</p>
                <p style="margin:2px 0;"><strong>Mobile:</strong> ${fac.mobile} | <strong>Email:</strong> ${fac.mail}</p>
                <p style="margin:2px 0;"><strong>Address:</strong> ${fac.address}</p>
                <p style="margin:2px 0;"><strong>Achievements:</strong> ${fac.achievements}</p>
                <p style="margin:2px 0;"><strong>Awards:</strong> ${fac.awards}</p>
                <p style="margin:5px 0 0 0; color: var(--accent); font-weight:bold;">🕒 Institute System Tenure Count: ${yearsOfTenure} Years</p>
            `;
            directoryGrid.appendChild(facCard);
        });
             if(typeof AOS !== "undefined"){

    AOS.init({
        duration: 800,
        once: true
    });

}

        handleNavigation();

    updateVisitorCount();
    });

// Dynamic Tracking Monitoring scroll context boundaries
    window.addEventListener('scroll', () => {
        const scrollBtn = document.getElementById('globalScrollBtn');
        const midPoint = document.documentElement.scrollHeight / 2;
        
        if (window.scrollY > midPoint) {
            scrollBtn.classList.remove('pointing-down');
        } else {
            scrollBtn.classList.add('pointing-down');
        }
    });

// Welcome Intro Animation Sequence
window.addEventListener("load", () => {

    setTimeout(() => {
        startIntroAnimations();
    }, 4500);

});


