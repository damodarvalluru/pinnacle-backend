 let activeSessionUserObject = null;

    async function checkLogin() {
    const id = document.getElementById('loginId').value.trim();
    const dob = document.getElementById('loginDob').value;
    const loginBtn = document.getElementById("studentLoginBtn");
    loginBtn.disabled = true;
    loginBtn.innerText = "Authenticating...";
    if (!id || !dob) {
        alert("Please enter ID and DOB");
        return;
    }
    try {
        if(!/^PS-[A-Z]\/?[A-Z]?-\d{4}-\d+$/.test(id)){
            alert("Invalid Enrollment ID format.");
        return;
}
        const response = await fetch(
            `https://pinnacle-backend-5i7n.onrender.com/api/students/${id}`
        );
        const data = await response.json();
        if (!data.success || !data.student) {
            alert("Student not found");
            loginBtn.disabled = false;
            loginBtn.innerText = "Login to Dashboard";
            return;
        }
        const user = data.student;console.log(user);
        const dbDob =  String(user.dob).split("T")[0];
        if (dbDob !== dob) {
            alert("Invalid DOB");
            return;
        }
        activeSessionUserObject = user;
        localStorage.setItem("active_student_id",user.student_id);
        localStorage.setItem("active_student_name",user.name);
        const totalFees = Number(user.total_fees || 0);
        const feesPaid = Number(user.fees_paid || 0);
        const remainingFees = Number(user.remaining_fees || 0);
        document.getElementById('loginArea').style.display = "none";
        document.getElementById('dashboardArea').style.display = "block";
        document.getElementById('dispName').innerText = user.name || "N/A";
        document.getElementById('dispId').innerText = user.student_id || "N/A";
        document.getElementById('dispDomain').innerText = user.domain || "N/A";
        document.getElementById('dispTotal').innerText = totalFees.toFixed(2);
        document.getElementById('dispPaid').innerText = feesPaid.toFixed(2);
        document.getElementById('dispBalance').innerText = remainingFees.toFixed(2);
        document.getElementById('remainingFees').innerText = "₹" + remainingFees;
        activeSessionUserObject.calculatedBalance = remainingFees;
        if (remainingFees <= 0) {
            document.getElementById('dispStatus').innerText = "FULLY SETTLED & VERIFIED";
            document.getElementById('dispStatus').style.color = "#38a169";
            document.getElementById('portalPaymentButton').style.display = "none";
        }
    }
    catch(error) {
        loginBtn.disabled = false;
        loginBtn.innerText = "Login to Dashboard";
        console.log(error);
        alert(
            "Unable to connect to server"
        );
    }
}
    function executeStudentPortalPayment() {
        const payBtn = document.getElementById("portalPaymentButton");
        payBtn.disabled = true;
        payBtn.innerText = "Creating Payment Order...";
        if (!activeSessionUserObject) {
            alert("Session assessment sync breakdown. Please log in again.");
            return;
        }

        const outstandingLiabilityAmount = activeSessionUserObject.calculatedBalance;

        if (outstandingLiabilityAmount <= 0) {
            alert("Account has zero pending liabilities.");
            return;
        }

        const calculatedPaiseUnits = Math.round(outstandingLiabilityAmount * 100);

        fetch('https://pinnacle-backend-5i7n.onrender.com/api/payments/create-order', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                amount: calculatedPaiseUnits,
                currency: 'INR',
                receipt: 'rcpt_portal_' + activeSessionUserObject.student_id + '_' + Date.now()
            })
        })
        .then(res => {
            if(!res.ok) throw new Error("Internal authentication pipeline rejection.");
            return res.json();
        })
        .then(orderPayload => {
            const checkoutConfigurations = {
                "key": "rzp_live_Su10APgukCxwdi", 
                "amount": orderPayload.amount,
                "currency": orderPayload.currency,
                "name": "Pinnacle Scholars Academy",
                "description": "Student Dashboard Balance Tuition Settlement",
                "order_id": orderPayload.order_id,
                "handler": function (paymentVerificationData) {
                    fetch('https://pinnacle-backend-5i7n.onrender.com/api/payments/verify-payment', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({
                            razorpay_order_id: paymentVerificationData.razorpay_order_id,
                            razorpay_payment_id: paymentVerificationData.razorpay_payment_id,
                            razorpay_signature: paymentVerificationData.razorpay_signature,
                            student_id: activeSessionUserObject.student_id,
                            payment_type: "STUDENT_PORTAL_PAYMENT",
                            paid_amount: outstandingLiabilityAmount
                        })
                    })
                    .then(verifyResponse => verifyResponse.json())
                    .then(verificationOutput => {
                        if (verificationOutput.success || verificationOutput.status === "verified") {
                            alert("Payment processed and verified successfully! ID: " + paymentVerificationData.razorpay_payment_id);
                           alert(
    "Payment verified and database updated successfully."
);
                            location.reload();
                        } else {
                            alert("Verification confirmation rejected by server security checklist.");
                        }
                    })
                    .catch(err => {
                        console.error(err);
                        alert("Cryptographic computation validation connection transmission link error.");
                    });
                },
                "prefill": {
                    "name": activeSessionUserObject.name,
                    "email": "student." + activeSessionUserObject.student_id.toLowerCase() + "@pinnacle.edu.in",
                    "contact": activeSessionUserObject.mobile || ""
                },
                "theme": { "color": "#1a365d" },
                "modal": {
                    "ondismiss": function() {
                           payBtn.disabled = false;
                           payBtn.innerText = "Pay Online Now";
                        alert("Transaction interface cancelled by student.");
                    }
                }
            };

            const portalRazorpayModalInstance = new Razorpay(checkoutConfigurations);
            portalRazorpayModalInstance.open();
        })
        .catch(err => {
            console.error(err);
            alert("Failed to build Order reference payload mappings. Check server status logs.");
        });
    }

    (function() {
        const canvas = document.getElementById('portalGeometryCanvas');
        const ctx = canvas.getContext('2d');

        let shapesArray = [];
        const shapeTypes = ['sphere', 'cube', 'torusRing'];
        const totalShapesCount = 18; // Clean, premium distribution without visual overcrowding

        function dynamicCanvasResize() {
            canvas.width = window.innerWidth;
            canvas.height = window.innerHeight;
        }
        dynamicCanvasResize();
        window.addEventListener('resize', dynamicCanvasResize);

        // Abstract Geometry Object Constructor Blueprint
        class Floating3DGeometry {
            constructor() {
                this.resetProperties(true);
            }

            resetProperties(isInitialSetup = false) {
                this.x = Math.random() * canvas.width;
                // Distribute vertically on initial launch, else spawn from below screen space boundary
                this.y = isInitialSetup ? (Math.random() * canvas.height) : (canvas.height + 100);
                this.size = Math.random() * 45 + 20; // Varied sizing scale
                this.speedY = -(Math.random() * 0.5 + 0.2); // Smooth upward drift velocity
                this.speedX = (Math.random() * 0.4) - 0.2; // Slight horizontal oscillation
                this.shapeType = shapeTypes[Math.floor(Math.random() * shapeTypes.length)];
                
                // Rotational physics for pseudo-3D engine illusion
                this.rotationAngle = Math.random() * Math.PI * 2;
                this.rotationVelocity = (Math.random() * 0.01) - 0.005;
                
                // Translucent premium neon lighting accents
                this.gradientColorPrimary = Math.random() > 0.5 ? 'rgba(59, 130, 246, 0.22)' : 'rgba(168, 85, 247, 0.18)';
                this.gradientColorSecondary = 'rgba(15, 23, 42, 0.4)';
            }

            update() {
                this.y += this.speedY;
                this.x += this.speedX;
                this.rotationAngle += this.rotationVelocity;

                // Recycle shape to bottom tracking pool once completely off-screen top border
                if (this.y + this.size < -50 || this.x + this.size < -50 || this.x - this.size > canvas.width + 50) {
                    this.resetProperties(false);
                }
            }

            draw() {
                ctx.save();
                ctx.translate(this.x, this.y);
                ctx.rotate(this.rotationAngle);

                // Initialize sleek glassmorphic pseudo-3D shading engine
                let coreGradientMesh = ctx.createRadialGradient(
                    -this.size * 0.2, -this.size * 0.2, this.size * 0.1,
                    0, 0, this.size
                );
                coreGradientMesh.addColorStop(0, this.gradientColorPrimary);
                coreGradientMesh.addColorStop(0.7, 'rgba(255, 255, 255, 0.02)');
                coreGradientMesh.addColorStop(1, this.gradientColorSecondary);

                ctx.fillStyle = coreGradientMesh;
                ctx.strokeStyle = 'rgba(255, 255, 255, 0.12)';
                ctx.lineWidth = 1.5;

                // Render vector-specific geometric profiles
                switch(this.shapeType) {
                    case 'sphere':
                        ctx.beginPath();
                        ctx.arc(0, 0, this.size, 0, Math.PI * 2);
                        ctx.fill();
                        ctx.stroke();
                        
                        // Internal glassy reflection accent crescent arc
                        ctx.beginPath();
                        ctx.arc(-this.size * 0.1, -this.size * 0.1, this.size * 0.7, Math.PI * 1.2, Math.PI * 1.8);
                        ctx.strokeStyle = 'rgba(255, 255, 255, 0.08)';
                        ctx.stroke();
                        break;

                    case 'cube':
                        ctx.beginPath();
                        ctx.rect(-this.size, -this.size, this.size * 2, this.size * 2);
                        ctx.fill();
                        ctx.stroke();

                        // Isometric crosswire projections to mimic transparent glass 3D depth dimensions
                        ctx.beginPath();
                        ctx.moveTo(-this.size, -this.size);
                        ctx.lineTo(this.size, this.size);
                        ctx.moveTo(this.size, -this.size);
                        ctx.lineTo(-this.size, this.size);
                        ctx.strokeStyle = 'rgba(255, 255, 255, 0.04)';
                        ctx.stroke();
                        break;

                    case 'torusRing':
                        ctx.beginPath();
                        ctx.arc(0, 0, this.size, 0, Math.PI * 2);
                        ctx.arc(0, 0, this.size * 0.45, 0, Math.PI * 2, true); // Clean doughnut cutout stroke mask
                        ctx.fill();
                        ctx.stroke();
                        break;
                }

                ctx.restore();
            }
        }

        function buildRenderEnvironment() {
            shapesArray = [];
            for (let i = 0; i < totalShapesCount; i++) {
                shapesArray.push(new Floating3DGeometry());
            }
        }

        function coreEngineLoop() {
            ctx.clearRect(0, 0, canvas.width, canvas.height);
            
            for (let i = 0; i < shapesArray.length; i++) {
                shapesArray[i].update();
                shapesArray[i].draw();
            }
            
            requestAnimationFrame(coreEngineLoop);
        }

        buildRenderEnvironment();
        coreEngineLoop();
    })();