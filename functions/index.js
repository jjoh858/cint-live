const { onDocumentCreated } = require("firebase-functions/v2/firestore");
const { onCall, HttpsError } = require("firebase-functions/v2/https");
const { setGlobalOptions } = require("firebase-functions/v2");
const admin = require("firebase-admin");
const axios = require("axios");

admin.initializeApp();
const db = admin.firestore();

setGlobalOptions({ region: "us-central1", memory: "512MiB" });

const JUDGE0_URL = "https://judge0-ce.p.rapidapi.com/submissions";

function headers() {
  return {
    "Content-Type": "application/json",
    "X-RapidAPI-Key": process.env.JUDGE0_KEY,
    "X-RapidAPI-Host": "judge0-ce.p.rapidapi.com",
  };
}

async function runOnJudge0({ code, languageId, stdin, wallTimeLimit }) {
  const res = await axios.post(
    `${JUDGE0_URL}?base64_encoded=false&wait=true`,
    {
      source_code: code,
      language_id: languageId,
      stdin: stdin || "",
      cpu_time_limit: 2,
      wall_time_limit: wallTimeLimit,
    },
    { headers: headers(), timeout: (wallTimeLimit + 10) * 1000 }
  );
  return res.data;
}

exports.runCode = onCall({ timeoutSeconds: 30 }, async (request) => {
  const { code, languageId, stdin } = request.data;
  try {
    const r = await runOnJudge0({ code, languageId, stdin, wallTimeLimit: 5 });
    return {
      stdout: r.stdout || "",
      stderr: r.stderr || r.compile_output || "",
      timedOut: r.status?.id === 5,
    };
  } catch (err) {
    const s = err.response?.status;
    if (s === 429) throw new HttpsError("resource-exhausted", "Judge0 rate limit, try again in a bit.");
    if (err.code === "ECONNABORTED") throw new HttpsError("deadline-exceeded", "Judge0 timed out.");
    throw new HttpsError("internal", `Judge0 error: ${err.message}`);
  }
});

exports.processSubmission = onDocumentCreated(
  { document: "submissions/{id}", timeoutSeconds: 300, retry: false },
  async (event) => {
    if (!event.data) {
      console.log("No event data, skipping.");
      return;
    }
    const id = event.params.id;
    const data = event.data.data();
    const subRef = db.collection("submissions").doc(id);

    const claimed = await db.runTransaction(async (tx) => {
      const snap = await tx.get(subRef);
      const cur = snap.data() || {};
      if (cur.status && cur.status !== "Pending") return false;
      tx.update(subRef, { status: "Running" });
      return true;
    });
    if (!claimed) {
      console.log(`Submission ${id} already claimed, skipping.`);
      return;
    }

    try {
      const problemSnap = await db.collection("problems").doc(data.problemId).get();
      const testCases = problemSnap.data().testCases || [];
      const results = [];

      for (const test of testCases) {
        try {
          const r = await runOnJudge0({
            code: data.code,
            languageId: data.languageId,
            stdin: test.input,
            wallTimeLimit: 15,
          });
          const output = (r.stdout || "").trim();
          const timedOut = r.status?.id === 5;
          results.push({
            input: test.input,
            expected: test.output,
            output,
            passed: !timedOut && output === (test.output || "").trim(),
            timedOut,
          });
        } catch (err) {
          console.error(`Test case error for ${id}:`, err.response?.status, err.message);
          results.push({
            input: test.input,
            expected: test.output,
            output: "",
            passed: false,
            timedOut: false,
            error: err.message,
          });
        }
      }

      const timedOut = results.some((r) => r.timedOut);
      const allPassed = results.length > 0 && results.every((r) => r.passed);
      const status = timedOut ? "Time Limit Exceeded"
        : allPassed ? "Accepted"
        : "Wrong Answer";

      await subRef.update({ status, results });

      if (allPassed) {
        const teamRef = db.collection("teams").doc(data.teamId);
        const points = problemSnap.data().points || 100;
        await db.runTransaction(async (tx) => {
          const doc = await tx.get(teamRef);
          const team = doc.data() || {};
          const solved = team.solvedProblems || [];
          if (!solved.includes(data.problemId)) {
            tx.update(teamRef, {
              score: admin.firestore.FieldValue.increment(points),
              solvedProblems: [...solved, data.problemId],
            });
          }
        });
      }
    } catch (err) {
      console.error(`processSubmission failed for ${id}:`, err);
      await subRef.update({ status: "Error", error: err.message }).catch(() => {});
    }
  }
);
