let currentStudent=null;

async function fetchStudentDetails(){

    const studentId =
    document.getElementById('studentId')
    .value.trim();

    const fetchBtn =
document.getElementById('fetchBtn');

fetchBtn.disabled = true;

fetchBtn.innerText = "Fetching...";

if(!studentId){
    fetchBtn.disabled = false;

fetchBtn.innerText = "Fetch Details";
    alert("Enter Student ID");
    return;
}

try {

    const controller = new AbortController();

    const timeoutId = setTimeout(() => {
        controller.abort();
    }, 15000);

    const response = await fetch(
        `https://pinnacle-backend-5i7n.onrender.com/api/students/${studentId}`,
        {
            signal: controller.signal
        }
    );

    clearTimeout(timeoutId);

          let data;
try{
    data = await response.json();
}catch{
    throw new Error("Invalid backend response");
}

        if(!data.success){
            fetchBtn.disabled = false;

fetchBtn.innerText = "Fetch Details";
            alert("Student Not Found");
            return;
        }

        const student = data.student;

        currentStudent = {

    ...student,

    totalFees:
        Number(student.total_fees
        ) || 0,

    feesPaid:
        Number(
            student.fees_paid
        ) || 0,

    remainingFees:
        Number(student.remaining_fees || 0)
};
        

        const totalFees = currentStudent.totalFees;

        const paidFees = currentStudent.feesPaid;

        const remainingFees = currentStudent.remainingFees;

        document.getElementById('sName')
        .innerText = student.name;

        document.getElementById('sDomain')
        .innerText = student.domain;

        document.getElementById('sTotal')
        .innerText = totalFees;

        document.getElementById('sPaid')
        .innerText = paidFees;

        document.getElementById('sRemain')
        .innerText = remainingFees;

        document.getElementById('studentDetails')
        .style.display='block';
        
        fetchBtn.disabled = false;

fetchBtn.innerText = "Fetch Details";

    } catch(error){
        fetchBtn.disabled = false;

fetchBtn.innerText = "Fetch Details";
        console.log(error);

        if(error.name === "AbortError"){

    alert("Server timeout. Railway backend took too long.");

} else {

    alert("Backend error");
}
    }
}

function togglePartialBox(){

    const type=
    document.getElementById('paymentType').value;

    document.getElementById('partialBox')
    .style.display=
    type==='PARTIAL'
    ?'block'
    :'none';
}

function continuePayment(){
    const payBtn =
document.getElementById('payBtn');

payBtn.disabled = true;

payBtn.innerText = "Processing...";

    if(!currentStudent){
        payBtn.disabled = false;

    payBtn.innerText = "Continue Payment";
        alert("Fetch Student First");
        return;
    }

    const totalFees=
    Number(currentStudent.totalFees) || 0;

    const paidFees=
    Number(currentStudent.feesPaid)||0;

    const remainingFees =
Math.max(0, totalFees - paidFees);
if (remainingFees <= 0) {

    payBtn.disabled = false;

    payBtn.innerText = "Continue Payment";

    alert("Fees already fully paid");

    return;
}

    let amountToPay=remainingFees;

    const paymentType=
    document.getElementById('paymentType').value;

    if(paymentType==='PARTIAL'){

        amountToPay=
        parseFloat(
            document.getElementById('partialAmount').value
        );

        if(
            isNaN(amountToPay) ||
            amountToPay<=0 ||
            amountToPay>remainingFees
        ){
            payBtn.disabled = false;

payBtn.innerText = "Continue Payment";
            alert("Invalid Partial Amount");
            return;
        }
    }

    processRazorpayPayment(
        amountToPay,
        {
            student_id:currentStudent.student_id || currentStudent.id,
            payment_type:paymentType,
            name:currentStudent.name,
            email:currentStudent.email,
            contact:currentStudent.mobile
        }
    );
}

async function processRazorpayPayment(amountInINR, studentDetails = {}) {
    const payBtn = document.getElementById('payBtn');
    try {
        if (!amountInINR || amountInINR < 1) {
            payBtn.disabled = false;
            payBtn.innerText = "Continue Payment";
            alert("Payment amount must be at least ₹1");
            return;
        }
        const targetAmountPaise = Math.round(amountInINR * 100);
        console.log("Creating Razorpay Order...");
        console.log("Sending Request To Backend...");
        const controller = new AbortController();

const timeoutId = setTimeout(() => {
    controller.abort();
}, 15000);
        const response = await fetch('https://pinnacle-backend-5i7n.onrender.com/api/payments/create-order', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },signal: controller.signal,
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
        clearTimeout(timeoutId);
        const orderData = await response.json();
        console.log("full backend response:", orderData);
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
                    if (!verificationResponse.ok) {

    payBtn.disabled = false;

    payBtn.innerText = "Continue Payment";

    alert(
        verificationResult.message ||
        "Payment verification failed"
    );

    return;
}
                    console.log("Verification Result:", verificationResult);
                    const updatedPaid =
    verificationResult.paidFees;

const updatedRemaining =
    verificationResult.remainingFees;
                    if (verificationResult.success) {

    currentStudent.feesPaid =
        Number(verificationResult.paidFees);

    currentStudent.remainingFees =
        Number(verificationResult.remainingFees);

    document.getElementById('sPaid').innerText =
        currentStudent.feesPaid;

    document.getElementById('sRemain').innerText =
        currentStudent.remainingFees;

    payBtn.disabled = false;

    payBtn.innerText = "Continue Payment";

    alert(
        "Payment Successful!\n\n" +

        "Payment ID: " +
        paymentReceipt.razorpay_payment_id +

        "\n\nTotal Fees: ₹" +
        verificationResult.totalFees +

        "\n\nPaid Fees: ₹" +
        verificationResult.paidFees +

        "\n\nRemaining Fees: ₹" +
        verificationResult.remainingFees
    );

setTimeout(async () => {

    await fetchStudentDetails();

}, 1000);
}
                    else {
                        payBtn.disabled = false;
                        payBtn.innerText = "Continue Payment";
                        alert("Payment verification failed");
                    }
                } catch (verificationError) {
                    payBtn.disabled = false;

payBtn.innerText = "Continue Payment";
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
                        payBtn.disabled = false;
                payBtn.innerText = "Continue Payment";
                    console.log("Payment popup closed");
                }
            }
        };
        const razorpayWindow = new Razorpay(options);
        razorpayWindow.on('payment.failed', function (response) {
            payBtn.disabled = false;
            payBtn.innerText = "Continue Payment";
            console.log("Payment Failed:", response);
            alert(
                "Payment Failed\n" +
                response.error.description
            );
        });
        razorpayWindow.open();
    } catch (error) {
        payBtn.disabled = false;
        payBtn.innerText = "Continue Payment";
        console.log("FULL PAYMENT ERROR:", error);
        if(error.name === "AbortError"){

    alert(
        "Server timeout.\n\nRailway backend is waking up or taking too long."
    );

} else {

    alert(
        "Backend connection failed.\n\n" +
        "Check:\n" +
        "1. Railway backend active\n" +
        "2. API routes working\n" +
        "3. CORS enabled"
    );
}
}
}