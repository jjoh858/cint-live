const admin = require("firebase-admin");
const fs = require("fs");

const serviceAccount = require("./serviceAccountKey.json");

admin.initializeApp({
    credential: admin.credential.cert(serviceAccount),
});

const db = admin.firestore();

async function uploadProblems() {
    const problems = JSON.parse(fs.readFileSync("./problems.json", "utf8"));

    for (const problem of problems) {
        await db.collection("problems").doc(String(problem.id)).set(problem);
        console.log(`Uploaded problem ${problem.id}: ${problem.title}`);
    }

    console.log("Done!");
    process.exit(0);
}

uploadProblems().catch(console.error);