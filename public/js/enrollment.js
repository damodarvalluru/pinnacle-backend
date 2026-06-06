 // --- INTEGRATED 2D LIVE PARTICLE BACKGROUND SIMULATION ---
    const canvas = document.getElementById('bg-canvas');
    const ctx = canvas.getContext('2d');
    let particles = [];

    function resizeCanvas() {
        canvas.width = window.innerWidth;
        canvas.height = window.innerHeight;
    }
    window.addEventListener('resize', resizeCanvas);
    resizeCanvas();

    class Particle {
        constructor() {
            this.x = Math.random() * canvas.width;
            this.y = Math.random() * canvas.height;
            this.vx = (Math.random() - 0.5) * 0.6;
            this.vy = (Math.random() - 0.5) * 0.6;
            this.radius = Math.random() * 2 + 1;
        }
        update() {
            this.x += this.vx;
            this.y += this.vy;
            if (this.x < 0 || this.x > canvas.width) this.vx *= -1;
            if (this.y < 0 || this.y > canvas.height) this.vy *= -1;
        }
        draw() {
            ctx.beginPath();
            ctx.arc(this.x, this.y, this.radius, 0, Math.PI * 2);
            ctx.fillStyle = 'rgba(255, 255, 255, 0.25)';
            ctx.fill();
        }
    }

    function initParticles() {
        particles = [];
        const count = Math.min(Math.floor(canvas.width / 15), 75);
        for (let i = 0; i < count; i++) {
            particles.push(new Particle());
        }
    }
    initParticles();

    function animateBackground() {
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        
        for (let i = 0; i < particles.length; i++) {
            particles[i].update();
            particles[i].draw();
            
            for (let j = i + 1; j < particles.length; j++) {
                const dx = particles[i].x - particles[j].x;
                const dy = particles[i].y - particles[j].y;
                const dist = Math.sqrt(dx * dx + dy * dy);
                
                if (dist < 120) {
                    ctx.beginPath();
                    ctx.moveTo(particles[i].x, particles[i].y);
                    ctx.lineTo(particles[j].x, particles[j].y);
                    ctx.strokeStyle = `rgba(249, 115, 22, ${0.12 * (1 - dist / 120)})`;
                    ctx.lineWidth = 0.8;
                    ctx.stroke();
                }
            }
        }
        requestAnimationFrame(animateBackground);
    }
    animateBackground();
   // --- DATA LOGIC & CORE PROCESSING ENGINES ---
       async function enrollStudent() {

    const studentName =
    document.getElementById('studentName')
    .value.trim();

    const dob =
    document.getElementById('dob').value;

    const domain =
    document.getElementById('domain').value;

    // DOB VALIDATION
const selectedDate = new Date(dob);
const today = new Date();

today.setHours(0, 0, 0, 0);

if (selectedDate > today) {

    alert("Future dates are not allowed.");

    return;
}

    if (!studentName || !dob || !domain) {

        alert("All fields required");
        return;
    }
    const btn =
document.getElementById('enrollBtn');

btn.disabled = true;

btn.innerText = "Processing...";
const controller = new AbortController();

const timeoutId = setTimeout(() => {
    controller.abort();
}, 15000);
    try {
                const response = await fetch(
            "https://pinnacle-backend-5i7n.onrender.com/api/students/register",
            {
                method: "POST",
                headers: {
                    "Content-Type": "application/json"
                },    signal: controller.signal,
                body: JSON.stringify({
                    name: studentName,
                    dob,
                    domain
                })
            }
        );
clearTimeout(timeoutId);
        
let data = await response.json();

console.log("Backend Response:", data);

btn.disabled = false;
btn.innerText = "Complete Enrollment";

if (data.success  && data.student) {

    document.getElementById('newId').innerText =
        data.student.student_id

    document.getElementById(
        'enrollFormContainer'
    ).style.display = 'none';

    document.getElementById(
        'successBox'
    ).style.display = 'block';

    document.getElementById('studentName').value = "";
    document.getElementById('dob').value = "";
    document.getElementById('domain').selectedIndex = 0;

} else {

    alert(data.message || "Enrollment failed");
}
      } catch(error){
        btn.disabled = false;
        btn.innerText = "Complete Enrollment";
        console.log(error);
        if(error.name === "AbortError"){

    alert(
        "Server timeout.\n\nRailway backend is waking up."
    );

}else if(!navigator.onLine){

    alert(
        "No internet connection detected."
    );

}else{

    alert(
        "Backend server error."
    );
}
    }
    finally {

    clearTimeout(timeoutId);
}
}

document.addEventListener("DOMContentLoaded", () => {

    const dobInput = document.getElementById("dob");

    const today = new Date().toISOString().split("T")[0];

    dobInput.max = today;

});