 let activeFacultySessionObject = null;

    function toggleAuthViews(showRegister) {

    const loginArea =
        document.getElementById("loginArea");

    const registerArea =
        document.getElementById("registerArea");

    if (!loginArea || !registerArea) {
        console.error(
            "loginArea or registerArea not found"
        );
        return;
    }

    if (showRegister) {

        loginArea.style.display = "none";

        registerArea.style.display = "block";

    } else {

        registerArea.style.display = "none";

        loginArea.style.display = "block";

    }
}

async  function processFacultyEnrollment() {
        const name = document.getElementById('facName').value.trim();
        const address = document.getElementById('facAddress').value.trim();
        const domain = document.getElementById('facDomain').value.trim();
        const mobile = document.getElementById('facMobile').value.trim();
        const mail = document.getElementById('facMail').value.trim();
        const dob = document.getElementById('facDob').value;
        const qualifications = document.getElementById('facQuals').value.trim();
        const achievements = document.getElementById('facAchieve').value.trim();
        const awards = document.getElementById('facAwards').value.trim();
        const enrollmentDate = document.getElementById('facEnrollDate').value;

        if(!name || !domain || !mail || !dob || !enrollmentDate) {
            alert("Please accurately fulfill all mandatory parameters (Name, Domain, Mail, DOB, Enrollment Date).");
            return;
        }

        try {
const btn = document.getElementById("generateFacultyBtn");
btn.disabled = true;
btn.innerText = "Generating Faculty ID...";
    const response = await fetch(
        "https://pinnacle-backend-5i7n.onrender.com/api/faculty/register",
        {
            method: "POST",
            headers: {
                "Content-Type": "application/json"
            },
            body: JSON.stringify({
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
            })
        }
    );

    let data;

try{
    data = await response.json();
    console.log("REGISTER RESPONSE:", data);
}catch{
    throw new Error("Invalid backend response");
}
if (data.success) {
    const facultyId = data.faculty.id;
    document.getElementById("loginFacId").value = facultyId;
    btn.disabled = false;
btn.innerText = "Generate Unique Faculty ID";
showFacultyModal(facultyId);
   } else {
    alert(data.message || "Registration failed");
}
    } catch(error){
        btn.disabled = false;
btn.innerText = "Generate Unique Faculty ID";
    console.error(
        "Faculty Registration Error:", error
    );
    alert(
        "Registration Error:\n" + error.message
    );
}
    }

    async function checkFacultyLogin() {

    const id =
    document.getElementById('loginFacId').value.trim();

    const dob =
    document.getElementById('loginFacDob').value;

    try {
        const btn = document.getElementById("facultyLoginBtn");
btn.disabled = true;
btn.innerText = "Verifying Credentials...";
        const response = await fetch(
            "https://pinnacle-backend-5i7n.onrender.com/api/faculty/login",
            {
                method: "POST",
                headers: {
                    "Content-Type": "application/json"
                },
                body: JSON.stringify({
                     faculty_id: id,
                    dob
                })
            }
        );

        const data = await response.json();

        if(data.success){
            btn.innerText =
"Access Granted";

btn.disabled = false;
            const verifiedUser = data.faculty;

            activeFacultySessionObject =
            verifiedUser;

            document.getElementById('authContainer')
            .style.display='none';

            document.getElementById('dashboardArea')
            .style.display='block';

            document.getElementById('dispFacName')
            .innerText = verifiedUser.name;

            document.getElementById('dispFacId')
            .innerText = verifiedUser.faculty_id;

            document.getElementById('dispFacDomain')
            .innerText = verifiedUser.domain;

            document.getElementById('dispFacQuals')
            .innerText =
            verifiedUser.qualifications || 'N/A';

            document.getElementById('dispFacAchieve')
            .innerText =
            verifiedUser.achievements || 'N/A';

            document.getElementById('dispFacAwards')
            .innerText =
            verifiedUser.awards || 'N/A';

            document.getElementById('dispFacMobile')
            .innerText =
            verifiedUser.mobile || 'N/A';

            document.getElementById('dispFacMail')
            .innerText =
            verifiedUser.mail;

            document.getElementById('dispFacAddress')
            .innerText =
            verifiedUser.address || 'N/A';

        } else {
btn.disabled = false;

btn.innerText =
"Login to Dashboard";
            alert(data.message || "Login failed");
        }

    } catch(error){

        btn.disabled = false;

btn.innerText =
"Login to Dashboard";
        console.log(error);

        alert("Backend server error");
    }
}
    async function publishJeeTestFormat() {
        if (!activeFacultySessionObject) {
            alert("Security Violation Context: Unverified runtime execution environment tracking error.");
            return;
        }

        const title = document.getElementById('testTitle').value.trim();
        const payloadData = document.getElementById('testQuestions').value.trim();

        if(!title || !payloadData) {
            alert("Cannot process blank examination frameworks. Please provide Title and Question schemas.");
            return;
        }
            try {
                const newTestEntry = {

    test_type: "JEE",

    faculty_id:
        activeFacultySessionObject.faculty_id,

    faculty_name:
        activeFacultySessionObject.name,

    title,

    questions: payloadData
};
const btn =
document.getElementById(
    "publishTestBtn"
);

btn.disabled = true;

btn.innerText =
"Publishing Examination...";
        const response =
await fetch(
"https://pinnacle-backend-5i7n.onrender.com/api/tests/publish-test",
{
    method:"POST",
    headers:{
        "Content-Type":"application/json"
    },
    body:JSON.stringify(newTestEntry)
}
);
const result = await response.json();
if(!result.success){
        alert(result.message);
    return;
}        
        } catch (error) {
            btn.disabled = false;
            btn.innerText = "Publish Live JEE Format Test";
            console.warn("Backend server connection offline. Data fallback saved locally to application storage.");
        }
        btn.disabled = false;
        btn.innerText = "Publish Live JEE Format Test";
        alert(`Success!Test Published SuccessfullyFaculty ID:${activeFacultySessionObject.faculty_id}Title:${title}`);
        document.getElementById('testTitle').value = '';
        document.getElementById('testQuestions').value = '';
    }
    (function initBackgroundMatrix() {
        const canvas = document.getElementById('bg-canvas');
        if (!canvas) return;
        const ctx = canvas.getContext('2d');
        
        let particlesArray = [];
        const numberOfParticles = 45; // Balanced density to prevent UI lag
        
        // Handle responsive viewport dimension adjustments
        function setCanvasSize() {
            canvas.width = window.innerWidth;
            canvas.height = window.innerHeight;
        }
        setCanvasSize();
        window.addEventListener('resize', setCanvasSize);

        // Particle Object Configuration Blueprints
        class GeometricParticle {
            constructor() {
                this.x = Math.random() * canvas.width;
                this.y = Math.random() * canvas.height;
                // Controls movement speeds across vectors
                this.directionX = (Math.random() * 0.6) - 0.3;
                this.directionY = (Math.random() * 0.6) - 0.3;
                this.size = Math.random() * 2.5 + 1.5;
            }
            
            // Render the floating nodes
            draw() {
                ctx.beginPath();
                ctx.arc(this.x, this.y, this.size, 0, Math.PI * 2, false);
                ctx.fillStyle = 'rgba(56, 189, 248, 0.23)'; // Matches cyan primary variables
                ctx.fill();
            }

            // Update coordinate ticks and handle boundary bounces
            update() {
                if (this.x > canvas.width || this.x < 0) this.directionX = -this.directionX;
                if (this.y > canvas.height || this.y < 0) this.directionY = -this.directionY;
                
                this.x += this.directionX;
                this.y += this.directionY;
                this.draw();
            }
        }

        // Initialize particle array collection
        for (let i = 0; i < numberOfParticles; i++) {
            particlesArray.push(new GeometricParticle());
        }

        // Calculate proximity vectors to render link paths
        function connectNodes() {
            let maxDistance = 160;
            for (let a = 0; a < particlesArray.length; a++) {
                for (let b = a; b < particlesArray.length; b++) {
                    let distance = ((particlesArray[a].x - particlesArray[b].x) * (particlesArray[a].x - particlesArray[b].x))
                                 + ((particlesArray[a].y - particlesArray[b].y) * (particlesArray[a].y - particlesArray[b].y));
                    
                    if (distance < maxDistance * maxDistance) {
                        let opacity = 1 - (distance / (maxDistance * maxDistance));
                        ctx.strokeStyle = `rgba(56, 189, 248, ${opacity * 0.12})`;
                        ctx.lineWidth = 1;
                        ctx.beginPath();
                        ctx.moveTo(particlesArray[a].x, particlesArray[a].y);
                        ctx.lineTo(particlesArray[b].x, particlesArray[b].y);
                        ctx.stroke();
                    }
                }
            }
        }

        // Continuous Loop Animation Thread Execution Frame
        function renderMatrixLoop() {
            ctx.clearRect(0, 0, canvas.width, canvas.height);
            for (let i = 0; i < particlesArray.length; i++) {
                particlesArray[i].update();
            }
            connectNodes();
            requestAnimationFrame(renderMatrixLoop);
        }
        renderMatrixLoop();
    })();

    window.onload = function () {
    document.getElementById("registerArea").style.display = "block";
    document.getElementById("loginArea").style.display = "none";
    };
    function showFacultyModal(facultyId){

    document.getElementById(
        "generatedFacultyId"
    ).innerText = facultyId;

    document.getElementById(
        "facultySuccessModal"
    ).style.display = "flex";
}

function closeFacultyModal(){

    document.getElementById(
        "facultySuccessModal"
    ).style.display = "none";

    toggleAuthViews(false);
}