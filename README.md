# CINT Live - Programming Contest Platform

A real-time competitive programming platform built with React + Firebase + self-hosted Judge0. Teams compete to solve algorithmic problems, with live scoring and a leaderboard.

## Architecture

```
Browser (React/Vite)
    |
    v
Firebase Auth (Google SSO)
Firebase Firestore (problems, teams, users, submissions)
    |
    v
Cloud Functions Gen2 (us-central1)
    |-- runCode        --> quick code execution (5s wall time)
    |-- processSubmission --> triggered on new submission doc,
    |                        runs all test cases in parallel
    v
Judge0 v1.13.1 (self-hosted on GCE VM)
    |-- judge0-server  (port 2358)
    |-- judge0-workers (isolate sandboxes)
    |-- PostgreSQL 16.2
    |-- Redis 7.2.4
```

## Infrastructure

| Component | Details |
|-----------|---------|
| **GCP Project** | `cint-live` |
| **Frontend** | React 19 + Vite 8 + Tailwind 4, deployed via GitHub |
| **Backend** | Firebase Cloud Functions Gen2 (Node.js 22) |
| **Database** | Firestore (default database) |
| **Auth** | Firebase Auth with Google provider |
| **Judge VM** | `judge0-vm`, `e2-medium` (2 vCPU, 4GB), `us-central1-a` |
| **Judge VM IP** | External: `34.55.39.152`, Internal: `10.128.0.2` |
| **Judge URL** | `http://34.55.39.152:2358` |
| **Firewall Rule** | `allow-judge0` - TCP 2358 from Cloud Functions |
| **SSH Access** | IAP tunnel only (`gcloud compute ssh --tunnel-through-iap`) |

### Judge0 VM Setup

The VM runs Ubuntu 22.04 with Docker Compose. Key detail: **cgroups v1 is required** because Judge0's isolate sandbox doesn't support cgroups v2. This is configured via GRUB:

```
GRUB_CMDLINE_LINUX="systemd.unified_cgroup_hierarchy=0"
```

Docker Compose runs 4 containers: `judge0-server-1`, `judge0-workers-1`, `judge0-db-1`, `judge0-redis-1`.

### What Changed (from RapidAPI to Self-Hosted)

Previously the Cloud Functions called **Judge0 via RapidAPI** (`judge0-ce.p.rapidapi.com`), which had rate limits, added latency, and cost money per request. Now:

- Judge0 runs on a dedicated GCE VM in the same region as Cloud Functions
- No API key needed (self-hosted, no auth)
- No rate limits
- Test cases run in **parallel** (`Promise.all`) instead of sequential
- Function timeout increased to 540s to handle large test suites
- Eventarc protobuf deserialization bug worked around (extracts submission ID from raw event bytes when `event.data` is undefined)

## Firestore Collections

### `problems`
```
{
  id: "1",                    // document ID
  title: "6 + 7 = 13",
  description: "...",         // problem statement text
  points: 100,                // points awarded for solving
  difficulty: "Easy",         // optional: Easy | Medium | Hard
  examples: [                 // optional: shown on problem page
    { input: "...", output: "...", explanation: "..." }
  ],
  testCases: "[...]"          // JSON string of [{input, output}]
}
```

### `teams`
```
{
  name: "Team Alpha",
  createdBy: "uid",           // user who created the team
  createdAt: Timestamp,
  memberIds: ["uid1", "uid2"],
  joinCode: "ABC123",         // 6-char code for joining
  level: "Beginner",          // Beginner | Advanced
  score: 300,
  solvedProblems: ["1", "3"]  // problem IDs
}
```

### `users`
```
{
  email: "user@example.com",
  displayName: "Name",
  photoURL: "...",
  teamIds: ["teamId"],        // max 1 team
  lastLogin: Timestamp
}
```

### `submissions`
```
{
  code: "print('hello')",
  languageId: 71,             // Judge0 language ID
  problemId: "1",
  teamId: "teamId",
  status: "Pending",          // Pending -> Running -> Accepted | Wrong Answer | Time Limit Exceeded | Error
  createdAt: Timestamp,
  results: [                  // populated by processSubmission
    { input, expected, output, passed, timedOut }
  ]
}
```

### `joinCodes`
```
{
  teamId: "teamId"            // lookup table for team join codes
}
```

## Project Structure

```
cint-live-repo/
|
|-- src/                          # Frontend (React + Vite)
|   |-- App.jsx                   # Main router, loads problems from Firestore
|   |-- main.jsx                  # Entry point
|   |-- firebase/
|   |   |-- config.js             # Firebase app init, auth, Firestore exports
|   |-- components/
|   |   |-- layout.jsx            # Page layout wrapper with sidebar
|   |   |-- sidebar.jsx           # Problem list sidebar (checks solved status)
|   |   |-- NavBar.jsx            # Top navigation bar
|   |   |-- ListOfProblems.jsx    # Problem detail view + code submission
|   |   |-- CodeEdit.jsx          # Code editor textarea
|   |   |-- languageSelector.jsx  # Language dropdown (Python, C++, Java, JS)
|   |   |-- OutputArea.jsx        # Code output display
|   |   |-- SignInButton.jsx      # Google sign-in button
|   |-- pages/
|   |   |-- Homepage.jsx          # Countdown timer (targets 2:00 PM)
|   |   |-- Loginpage.jsx         # Google OAuth login
|   |   |-- Profile.jsx           # Team create/join/leave/delete
|   |   |-- Problems.jsx          # Problems list page
|   |   |-- Leaderboard.jsx       # Live rankings + per-problem solve times
|   |-- hooks/
|   |   |-- useProblems.js        # Hook to fetch problems from Firestore
|   |-- services/
|   |   |-- firebaseService.js    # Firestore query helpers
|   |-- styles/
|       |-- App.css, index.css
|
|-- functions/                    # Firebase Cloud Functions
|   |-- index.js                  # runCode + processSubmission functions
|   |-- .env                      # JUDGE0_URL=http://34.55.39.152:2358
|   |-- package.json              # Node 22, firebase-functions, axios
|   |-- problems.json             # Problem definitions + test cases (source of truth)
|   |-- uploadProblems.js         # Script to upload problems.json to Firestore
|   |-- serviceAccountKey.json    # Firebase admin SDK credentials (DO NOT COMMIT)
|   |-- problems/                 # Raw test case files (A0-A15 .in/.out pairs)
|
|-- firebase.json                 # Firebase config (functions only, no hosting)
|-- .firebaserc                   # Project alias: default -> cint-live
|-- package.json                  # Frontend deps: react, firebase, react-router-dom
|-- vite.config.js                # Vite build config
|-- index.html                    # HTML entry point
|-- problems.txt                  # Google Drive link to original problem PDFs
```

## Cloud Functions

### `runCode` (callable)
Quick code execution for the "Run" button. Sends code to Judge0 with a 5s wall time limit and returns stdout/stderr.

### `processSubmission` (Firestore trigger)
Triggered when a new document is created in `submissions/`. Workflow:

1. Extracts submission ID (with fallbacks for Eventarc protobuf bug)
2. Reads submission data directly from Firestore
3. Claims the submission atomically (Pending -> Running)
4. Fetches test cases from the problem document
5. Runs **all test cases in parallel** via `Promise.all`
6. Writes results back to the submission document
7. If all passed: increments team score and adds to `solvedProblems`

Timeout: 540 seconds. Each test case has a 15s wall time limit on Judge0.

## Supported Languages

| Language | Judge0 ID |
|----------|-----------|
| Python 3 | 71 |
| JavaScript (Node) | 63 |
| C++ (GCC) | 54 |
| Java (OpenJDK) | 62 |

## Current Problems (9 total)

| ID | Title | Points | Test Cases |
|----|-------|--------|------------|
| 1 | 6 + 7 = 13 | 100 | 15 |
| 2 | 6 + 7 = 13 | 200 | 1 |
| 3 | Missing Assignments | 200 | 13 |
| 4 | Gold Rush | 200 | 10 |
| 5 | Penelope's Dill-Pickle Predicament | 200 | 17 |
| 6 | Portable Dill-Pickle Product | 200 | 18 |
| 7 | Penelope's Pyrotechnic Dill-Pickles | 200 | 20 |
| 8 | Precarious Dill-Pickle Placement | 200 | 20 |
| 9 | Kevin's Cats | 200 | 6 |

Problems are stored in Firestore and loaded dynamically in the sidebar. Adding a new problem to the `problems` collection automatically shows it in the UI.

## Deployment

### Frontend
```bash
npm install
npm run build          # outputs to dist/
npm run dev            # local dev server
```

### Cloud Functions
```bash
cd functions
npm install
GOOGLE_CLOUD_QUOTA_PROJECT=cint-live firebase deploy --only functions
```

### Upload/Update Problems
Edit `functions/problems.json`, then:
```bash
cd functions
node uploadProblems.js
```
(Requires valid `serviceAccountKey.json` or use the Firestore REST API with `gcloud auth print-access-token`.)

### Judge0 VM Management
```bash
# SSH into the VM (requires IAP tunnel — direct SSH blocked by Zscaler)
gcloud compute ssh judge0-vm --zone=us-central1-a --project=cint-live --tunnel-through-iap

# Check Judge0 health
curl http://34.55.39.152:2358/about

# Check containers
sudo docker ps

# Restart Judge0
cd /opt/judge0 && sudo docker compose restart

# View worker logs
sudo docker logs judge0-workers-1 --tail 50
```

### Check Cloud Function Logs
```bash
gcloud functions logs read processSubmission --region=us-central1 --project=cint-live --limit=20
gcloud functions logs read runCode --region=us-central1 --project=cint-live --limit=20
```

## Known Issues & Workarounds

1. **Eventarc protobuf deserialization**: Firebase Functions Gen2 Firestore triggers sometimes deliver events where `event.data` is undefined. The code extracts the submission ID from `event.params`, `event.subject`, `event.document`, or raw protobuf bytes as fallbacks, then reads the document directly from Firestore.

2. **cgroups v2 incompatibility**: Judge0's isolate sandbox requires cgroups v1. Ubuntu 22.04 defaults to v2. Fixed by setting `systemd.unified_cgroup_hierarchy=0` in GRUB and rebooting.

3. **Firestore undefined values**: When Judge0 returns null fields, writing them to Firestore throws errors. Fixed with `db.settings({ ignoreUndefinedProperties: true })`.

4. **SSH access**: Direct SSH to the Judge0 VM is blocked by Zscaler. Use IAP TCP tunneling: `gcloud compute ssh --tunnel-through-iap`.
