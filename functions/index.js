const { onDocumentCreated } = require("firebase-functions/v2/firestore");
const { onCall } = require("firebase-functions/v2/https");
const admin = require("firebase-admin");
const axios = require("axios");

admin.initializeApp();
const db = admin.firestore();

exports.runCode = onCall(async (request) => {
    const data = request.data;
    const response = await axios.post(
        "https://judge0-ce.p.rapidapi.com/submissions?base64_encoded=false&wait=true",
        {
            source_code: data.code,
            language_id: data.languageId,
            stdin: data.stdin || "",
            cpu_time_limit: 2,
            wall_time_limit: 5,
        },
        {
            headers: {
                "Content-Type": "application/json",
                "X-RapidAPI-Key": process.env.JUDGE0_KEY,
                "X-RapidAPI-Host": "judge0-ce.p.rapidapi.com",
            },
        }
    );

    return {
        stdout: response.data.stdout || "",
        stderr: response.data.stderr || "",
        timedOut: response.data.status?.id === 5,
    };
});

exports.processSubmission = onDocumentCreated("submissions/{id}", async (event) => {
    console.log("processSubmission triggered!"); // ← add this as first line
    const data = event.data.data();
    const id = event.params.id;
    console.log("Submission data:", JSON.stringify(data));

    const problemSnap = await db.collection("problems").doc(data.problemId).get();
    const testCases = problemSnap.data().testCases;
    const results = [];

    for (const test of testCases) {
        const response = await axios.post("https://judge0-ce.p.rapidapi.com/submissions?base64_encoded=false&wait=true",  // ← add wait=true
            {
                source_code: data.code,
                language_id: data.languageId,
                stdin: test.input,
                cpu_time_limit: 2,
                wall_time_limit: 5,
            },
            {
                headers: {
                    "Content-Type": "application/json",
                    "X-RapidAPI-Key": process.env.JUDGE0_KEY,
                    "X-RapidAPI-Host": "judge0-ce.p.rapidapi.com",
                },
            }
        );
        console.log("Judge0 full response:", JSON.stringify(response.data));


        const output = (response.data.stdout || "").trim();
        const timedOut = response.data.status?.id === 5;

        console.log("Test input:", test.input);
        console.log("Expected:", test.expected);
        console.log("Got:", output);
        console.log("Status:", response.data.status);

        results.push({
            input: test.input,
            expected: test.output,
            output,
            passed: !timedOut && output === test.output,
            timedOut,
        });
    }

    const timedOut = results.some((r) => r.timedOut);
    const allPassed = results.every((r) => r.passed);

    const status = timedOut ? "Time Limit Exceeded"
        : allPassed ? "Accepted"
        : "Wrong Answer";

    console.log("Results being saved:", JSON.stringify(results));

    await db.collection("submissions").doc(id).update({
        status,
        results,
    });

    if (allPassed) {
        const teamRef = db.collection("teams").doc(data.teamId);

        await db.runTransaction(async (tx) => {
            const doc = await tx.get(teamRef);
            const team = doc.data();
            const solved = team.solvedProblems || [];

            if (!solved.includes(data.problemId)) {
                tx.update(teamRef, {
                    score: admin.firestore.FieldValue.increment(problemSnap.data().points || 100),  // ← use points
                    solvedProblems: [...solved, data.problemId],
                });
            }
        });
    }
});