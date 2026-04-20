const http = require("http");
const { execFile } = require("child_process");
const fs = require("fs");
const path = require("path");
const os = require("os");
const crypto = require("crypto");

const PORT = process.env.PORT || 8080;
const DEFAULT_TIMEOUT = parseInt(process.env.TIMEOUT_SEC || "10", 10);
const MAX_OUTPUT = 1024 * 64; // 64KB max output

// Language configs: command to compile (optional) and run
const LANGUAGES = {
  71: { name: "python", ext: ".py", run: (f) => ["python3", [f]] },
  63: { name: "javascript", ext: ".js", run: (f) => ["node", [f]] },
  54: {
    name: "cpp",
    ext: ".cpp",
    compile: (f, out) => ["g++", ["-O2", "-o", out, f]],
    run: (_f, out) => [out, []],
  },
  62: {
    name: "java",
    ext: ".java",
    // Java needs class name = filename; we use Main.java
    compile: (f, _out, dir) => ["javac", [f]],
    run: (_f, _out, dir) => ["java", ["-cp", dir, "Main"]],
  },
};

function runCode(code, languageId, stdin, timeoutSec) {
  return new Promise((resolve) => {
    const lang = LANGUAGES[languageId];
    if (!lang) {
      return resolve({ stdout: "", stderr: `Unsupported language: ${languageId}`, timedOut: false, exitCode: 1 });
    }

    // Create temp directory for this execution
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "run-"));
    const filename = languageId === 62 ? "Main" + lang.ext : "code" + lang.ext;
    const srcFile = path.join(tmpDir, filename);
    const binFile = path.join(tmpDir, "code.out");

    fs.writeFileSync(srcFile, code);

    // Write stdin to a file so languages can read it via /dev/stdin or redirection
    const stdinFile = path.join(tmpDir, "stdin.txt");
    fs.writeFileSync(stdinFile, stdin || "");

    const cleanup = () => {
      try { fs.rmSync(tmpDir, { recursive: true, force: true }); } catch (_) {}
    };

    const execute = (cmd, args) => {
      // Use shell to redirect stdin from file (works around gVisor /dev/stdin issues)
      const shellCmd = `${cmd} ${args.map(a => `'${a}'`).join(" ")} < '${stdinFile}'`;
      const proc = execFile("/bin/sh", ["-c", shellCmd], {
        timeout: timeoutSec * 1000,
        maxBuffer: MAX_OUTPUT,
        cwd: tmpDir,
        env: { PATH: process.env.PATH, HOME: tmpDir },
      }, (err, stdout, stderr) => {
        const timedOut = err && err.killed;
        cleanup();
        resolve({
          stdout: stdout || "",
          stderr: stderr || (err && !timedOut ? err.message : "") || "",
          timedOut,
          exitCode: err ? (err.code || 1) : 0,
        });
      });
      // stdin is redirected from file via shell, no need to pipe
    };

    // Compile if needed, then run
    if (lang.compile) {
      const [compCmd, compArgs] = lang.compile(srcFile, binFile, tmpDir);
      execFile(compCmd, compArgs, {
        timeout: 15000,
        maxBuffer: MAX_OUTPUT,
        cwd: tmpDir,
      }, (err, _stdout, stderr) => {
        if (err) {
          cleanup();
          return resolve({
            stdout: "",
            stderr: stderr || err.message || "Compilation failed",
            timedOut: false,
            exitCode: 1,
            compilationError: true,
          });
        }
        const [runCmd, runArgs] = lang.run(srcFile, binFile, tmpDir);
        execute(runCmd, runArgs);
      });
    } else {
      const [runCmd, runArgs] = lang.run(srcFile);
      execute(runCmd, runArgs);
    }
  });
}

const server = http.createServer(async (req, res) => {
  // Health check
  if (req.method === "GET" && req.url === "/health") {
    res.writeHead(200, { "Content-Type": "application/json" });
    return res.end(JSON.stringify({ status: "ok" }));
  }

  // Languages endpoint (compatibility)
  if (req.method === "GET" && req.url === "/languages") {
    const langs = Object.entries(LANGUAGES).map(([id, l]) => ({ id: Number(id), name: l.name }));
    res.writeHead(200, { "Content-Type": "application/json" });
    return res.end(JSON.stringify(langs));
  }

  // Main endpoint: run code
  if (req.method === "POST" && req.url === "/run") {
    let body = "";
    req.on("data", (chunk) => (body += chunk));
    req.on("end", async () => {
      try {
        const { source_code, language_id, stdin, cpu_time_limit } = JSON.parse(body);
        const timeout = cpu_time_limit || DEFAULT_TIMEOUT;
        const result = await runCode(source_code, language_id, stdin || "", timeout);

        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify({
          stdout: result.stdout,
          stderr: result.stderr,
          compile_output: result.compilationError ? result.stderr : "",
          status: {
            id: result.timedOut ? 5
              : result.compilationError ? 6
              : result.exitCode !== 0 ? 11
              : 3,
            description: result.timedOut ? "Time Limit Exceeded"
              : result.compilationError ? "Compilation Error"
              : result.exitCode !== 0 ? "Runtime Error"
              : "Accepted",
          },
        }));
      } catch (err) {
        res.writeHead(400, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ error: err.message }));
      }
    });
    return;
  }

  res.writeHead(404);
  res.end("Not found");
});

server.listen(PORT, () => console.log(`Code runner listening on port ${PORT}`));
