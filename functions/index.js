const { onDocumentCreated } = require("firebase-functions/v2/firestore");
const { onCall, HttpsError } = require("firebase-functions/v2/https");
const { setGlobalOptions } = require("firebase-functions/v2");
const admin = require("firebase-admin");
const axios = require("axios");
admin.initializeApp();
const db = admin.firestore();
db.settings({ ignoreUndefinedProperties: true });

setGlobalOptions({ region: "us-central1", memory: "512MiB" });

// Cloud Run code executor (serverless, autoscales)
const CODE_RUNNER_URL = process.env.CODE_RUNNER_URL || "https://code-runner-1074290783330.us-central1.run.app";

async function runCode({ code, languageId, stdin, timeoutSec }) {
  const res = await axios.post(
    `${CODE_RUNNER_URL}/run`,
    {
      source_code: code,
      language_id: languageId,
      stdin: stdin || "",
      cpu_time_limit: timeoutSec || 10,
    },
    {
      headers: { "Content-Type": "application/json" },
      timeout: (timeoutSec + 15) * 1000,
    }
  );
  return res.data;
}

exports.runCode = onCall({ timeoutSeconds: 30 }, async (request) => {
  const { code, languageId, stdin } = request.data;
  try {
    const r = await runCode({ code, languageId, stdin, timeoutSec: 10 });
    return {
      stdout: r.stdout || "",
      stderr: r.stderr || r.compile_output || "",
      timedOut: r.status?.id === 5,
    };
  } catch (err) {
    if (err.code === "ECONNABORTED") throw new HttpsError("deadline-exceeded", "Judge timed out.");
    throw new HttpsError("internal", `Judge error: ${err.message}`);
  }
});

exports.processSubmission = onDocumentCreated(
  { document: "submissions/{id}", timeoutSeconds: 540, retry: false },
  async (event) => {
    // Try to get submission ID from standard event.params first
    let id = event.params?.id;

    // Fallback: extract from CloudEvent subject or document path
    if (!id && event.subject) {
      const parts = event.subject.split("/");
      id = parts[parts.length - 1];
    }
    if (!id && event.document) {
      const parts = event.document.split("/");
      id = parts[parts.length - 1];
    }

    // Last resort: extract from raw protobuf bytes (Eventarc workaround)
    if (!id) {
      try {
        const raw = Buffer.from(Object.values(event));
        const str = raw.toString("utf8");
        const match = str.match(/submissions\/([a-zA-Z0-9]+)/);
        if (match) id = match[1];
      } catch (e) {
        console.log("Could not parse event:", e.message);
      }
    }

    if (!id) {
      console.log("Could not extract submission ID, skipping.");
      return;
    }

    console.log("Processing submission:", id);

    // Always read from Firestore directly (bypasses broken event.data)
    const snap = await db.collection("submissions").doc(id).get();
    if (!snap.exists) {
      console.log(`Submission ${id} not found.`);
      return;
    }
    const data = snap.data();
    const subRef = db.collection("submissions").doc(id);

    // Claim the submission atomically
    const claimed = await db.runTransaction(async (tx) => {
      const fresh = await tx.get(subRef);
      const cur = fresh.data() || {};
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
      const testCasesRaw = problemSnap.data().testCases;
      const testCases = typeof testCasesRaw === "string" ? JSON.parse(testCasesRaw) : testCasesRaw || [];

      // Run all test cases in parallel — Cloud Run autoscales, no bottleneck
      const results = await Promise.all(testCases.map(async (test) => {
        try {
          const r = await runCode({
            code: data.code,
            languageId: data.languageId,
            stdin: test.input,
            timeoutSec: 15,
          });
          const output = (r.stdout || "").trim();
          const timedOut = r.status?.id === 5;
          return {
            input: test.input,
            expected: test.output,
            output,
            passed: !timedOut && output === (test.output || "").trim(),
            timedOut,
          };
        } catch (err) {
          console.error(`Test case error for ${id}:`, err.response?.status, err.message);
          return {
            input: test.input,
            expected: test.output,
            output: "",
            passed: false,
            timedOut: false,
            error: err.message,
          };
        }
      }));

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
