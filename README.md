# CINT Live - Programming Contest Platform

A real-time competitive programming platform built with React + Firebase + self-hosted Judge0. Teams compete to solve algorithmic problems, with live scoring and a leaderboard.

## Architecture

### High-Level System Overview

```
┌─────────────────────────────────────────────────────────────────────────────────┐
│                              USER'S BROWSER                                     │
│                                                                                 │
│  ┌─────────────┐  ┌──────────────┐  ┌─────────────┐  ┌───────────────────────┐ │
│  │  Homepage    │  │   Profile     │  │ Leaderboard │  │   Problem View        │ │
│  │  (countdown) │  │ (team mgmt)  │  │ (rankings)  │  │ (editor + submit)     │ │
│  └─────────────┘  └──────────────┘  └─────────────┘  └───────────────────────┘ │
│                                                                                 │
│  React 19 + Vite 8 + Tailwind 4 + React Router                                 │
└────────────┬──────────────────┬───────────────────────────────┬─────────────────┘
             │                  │                               │
             │ Google SSO       │ Real-time listeners           │ httpsCallable
             │                  │ (onSnapshot)                  │ "Run Code" / Submit
             ▼                  ▼                               ▼
┌─────────────────────────────────────────────────────────────────────────────────┐
│                         FIREBASE  (GCP: cint-live)                              │
│                                                                                 │
│  ┌──────────────────┐    ┌──────────────────────────────────────────────────┐   │
│  │  Firebase Auth    │    │              Firestore Database                  │   │
│  │                   │    │                                                  │   │
│  │  Google Provider  │    │  ┌──────────┐ ┌────────┐ ┌───────┐ ┌─────────┐ │   │
│  │  SSO login flow   │    │  │ problems │ │ teams  │ │ users │ │joinCodes│ │   │
│  └──────────────────┘    │  │ (9 docs) │ │        │ │       │ │         │ │   │
│                           │  └──────────┘ └────────┘ └───────┘ └─────────┘ │   │
│                           │                                                  │   │
│                           │  ┌───────────────────────────────────────┐       │   │
│                           │  │            submissions                 │       │   │
│                           │  │  (created by frontend on "Submit")     │       │   │
│                           │  │                                        │       │   │
│                           │  │  status: Pending → Running → Result    │       │   │
│                           │  └──────────────────┬────────────────────┘       │   │
│                           └─────────────────────┼────────────────────────────┘   │
│                                                 │                                │
│                                                 │ Firestore onCreate trigger     │
│                                                 │ (Eventarc)                     │
│                                                 ▼                                │
│  ┌──────────────────────────────────────────────────────────────────────────┐   │
│  │              Cloud Functions Gen2  (us-central1, Node.js 22)             │   │
│  │                                                                          │   │
│  │  ┌─────────────────────────┐    ┌──────────────────────────────────────┐ │   │
│  │  │      runCode            │    │       processSubmission              │ │   │
│  │  │  (httpsCallable)        │    │    (Firestore onCreate trigger)      │ │   │
│  │  │                         │    │                                      │ │   │
│  │  │  - Receives code +      │    │  1. Extract submission ID            │ │   │
│  │  │    language from UI      │    │     (protobuf fallback)             │ │   │
│  │  │  - Sends to Judge0      │    │  2. Read submission from Firestore   │ │   │
│  │  │  - 5s wall time limit   │    │  3. Claim: Pending → Running        │ │   │
│  │  │  - Returns stdout/err   │    │  4. Fetch test cases from problem    │ │   │
│  │  │                         │    │  5. Run ALL tests in parallel        │ │   │
│  │  │  Timeout: 60s           │    │     (Promise.all → Judge0)           │ │   │
│  │  └────────────┬────────────┘    │  6. Write results back               │ │   │
│  │               │                 │  7. If all pass: update team score    │ │   │
│  │               │                 │                                      │ │   │
│  │               │                 │  Timeout: 540s                       │ │   │
│  │               │                 └──────────────┬───────────────────────┘ │   │
│  └───────────────┼────────────────────────────────┼─────────────────────────┘   │
└──────────────────┼────────────────────────────────┼─────────────────────────────┘
                   │                                │
                   │  HTTP POST                     │  HTTP POST (parallel)
                   │  /submissions                  │  /submissions (batch)
                   │  ?wait=true                    │  ?wait=true
                   ▼                                ▼
┌─────────────────────────────────────────────────────────────────────────────────┐
│             GCE VM: judge0-vm  (us-central1-a)                                  │
│             e2-medium (2 vCPU, 4GB RAM)                                         │
│             Ubuntu 22.04, Docker Compose                                        │
│             External IP: 34.55.39.152                                           │
│             Internal IP: 10.128.0.2                                             │
│                                                                                 │
│  ┌─────────────────────────────────────────────────────────────────────────┐    │
│  │                        Docker Compose Stack                             │    │
│  │                                                                         │    │
│  │  ┌─────────────────────┐         ┌──────────────────────┐              │    │
│  │  │  judge0-server       │ ◄────► │  judge0-workers       │              │    │
│  │  │  (port 2358)         │        │  (isolate sandboxes)  │              │    │
│  │  │                      │        │                        │              │    │
│  │  │  REST API receives   │        │  Executes user code    │              │    │
│  │  │  code + stdin,       │        │  in isolated cgroups   │              │    │
│  │  │  queues execution    │        │  v1 containers         │              │    │
│  │  └──────────┬───────────┘        │                        │              │    │
│  │             │                    │  15s wall time limit    │              │    │
│  │             │                    │  per test case          │              │    │
│  │             ▼                    └──────────────────────────┘              │    │
│  │  ┌─────────────────────┐         ┌──────────────────────┐              │    │
│  │  │  PostgreSQL 16.2     │         │  Redis 7.2.4          │              │    │
│  │  │  (judge0-db)         │         │  (judge0-redis)       │              │    │
│  │  │                      │         │                        │              │    │
│  │  │  Submission records, │         │  Job queue,            │              │    │
│  │  │  language configs    │         │  caching               │              │    │
│  │  └─────────────────────┘         └──────────────────────┘              │    │
│  └─────────────────────────────────────────────────────────────────────────┘    │
│                                                                                 │
│  cgroups v1 (required): GRUB_CMDLINE_LINUX="systemd.unified_cgroup_hierarchy=0" │
│  Firewall: allow-judge0 (TCP 2358 from Cloud Functions)                         │
│  SSH: IAP tunnel only                                                           │
└─────────────────────────────────────────────────────────────────────────────────┘
```

### Data Flow — Code Submission Lifecycle

```
 User clicks "Submit"
        │
        ▼
 ┌──────────────────┐     Frontend writes doc to Firestore
 │  Browser (React)  │────────────────────────────────────────┐
 └──────────────────┘                                         │
                                                              ▼
                                              ┌───────────────────────────┐
                                              │  Firestore: submissions/  │
                                              │                           │
                                              │  status: "Pending"        │
                                              │  code: "print(...)"       │
                                              │  languageId: 71           │
                                              │  problemId: "1"           │
                                              │  teamId: "abc123"         │
                                              └─────────────┬─────────────┘
                                                            │
                                         Eventarc onCreate trigger fires
                                                            │
                                                            ▼
                                              ┌───────────────────────────┐
                                              │   processSubmission()     │
                                              │   Cloud Function Gen2     │
                                              │                           │
                                              │   1. Parse submission ID  │
                                              │   2. Read doc directly    │
                                              │   3. Set → "Running"      │
                                              └─────────────┬─────────────┘
                                                            │
                                          Fetch test cases from problems/{id}
                                                            │
                                                            ▼
                                              ┌───────────────────────────┐
                                              │   Parallel Execution      │
                                              │   (Promise.all)           │
                                              │                           │
                                              │  ┌─────┐ ┌─────┐ ┌─────┐ │
                                              │  │TC #1│ │TC #2│ │TC #N│ │
                                              │  └──┬──┘ └──┬──┘ └──┬──┘ │
                                              └─────┼───────┼───────┼─────┘
                                                    │       │       │
                                          HTTP POST to Judge0 (each test case)
                                                    │       │       │
                                                    ▼       ▼       ▼
                                              ┌───────────────────────────┐
                                              │  Judge0 VM (:2358)        │
                                              │                           │
                                              │  Compiles/runs code       │
                                              │  in isolate sandbox       │
                                              │  15s wall time per case   │
                                              │                           │
                                              │  Returns: stdout, stderr, │
                                              │  status, time, memory     │
                                              └─────────────┬─────────────┘
                                                            │
                                                  Results collected
                                                            │
                                                            ▼
                                              ┌───────────────────────────┐
                                              │  Compare outputs          │
                                              │                           │
                                              │  For each test case:      │
                                              │    actual vs expected     │
                                              │    → passed: true/false   │
                                              └─────────────┬─────────────┘
                                                            │
                                          ┌─────────────────┴──────────────────┐
                                          │                                    │
                                    All passed?                          Any failed?
                                          │                                    │
                                          ▼                                    ▼
                              ┌─────────────────────┐            ┌─────────────────────┐
                              │ status: "Accepted"   │            │ status: "Wrong       │
                              │                      │            │  Answer" / "TLE" /   │
                              │ + Update team:       │            │  "Error"             │
                              │   score += points    │            │                      │
                              │   solvedProblems +=  │            │ results[] written    │
                              │     problemId        │            │ to submission doc    │
                              └─────────────────────┘            └─────────────────────┘
                                          │                                    │
                                          └──────────────┬─────────────────────┘
                                                         │
                                                         ▼
                                              ┌───────────────────────────┐
                                              │  Firestore updated        │
                                              │  onSnapshot fires in UI   │
                                              │  → User sees results      │
                                              └───────────────────────────┘
```

### Frontend Page Flow

```
                              ┌─────────────────┐
                              │   Loginpage.jsx  │
                              │  Google OAuth    │
                              └────────┬────────┘
                                       │
                              Firebase Auth success
                                       │
                                       ▼
                    ┌─────────────────────────────────────┐
                    │            App.jsx (Router)          │
                    │   loads problems from Firestore      │
                    │   via useProblems() hook             │
                    └──┬──────┬──────┬──────┬──────┬──────┘
                       │      │      │      │      │
            ┌──────────┘      │      │      │      └───────────┐
            ▼                 ▼      │      ▼                  ▼
  ┌──────────────┐  ┌──────────┐    │   ┌────────────┐  ┌───────────┐
  │ Homepage.jsx │  │Profile   │    │   │Leaderboard │  │Problems   │
  │              │  │.jsx      │    │   │.jsx        │  │.jsx       │
  │ Countdown    │  │          │    │   │            │  │           │
  │ timer to     │  │ Create/  │    │   │ Live rank  │  │ Problem   │
  │ 2:00 PM      │  │ Join/    │    │   │ Per-prob   │  │ list      │
  │              │  │ Leave/   │    │   │ solve time │  │ (cards)   │
  │ Shows "GO!"  │  │ Delete   │    │   │ Auto-      │  │           │
  │ when started │  │ team     │    │   │ refresh    │  │           │
  └──────────────┘  └──────────┘    │   └────────────┘  └───────────┘
                                    │
                                    ▼
                    ┌─────────────────────────────────────┐
                    │        layout.jsx (wrapper)          │
                    │  ┌──────────┐  ┌───────────────────┐│
                    │  │ sidebar  │  │ ListOfProblems.jsx ││
                    │  │          │  │                     ││
                    │  │ P1  [✓]  │  │  Problem title      ││
                    │  │ P2  [✓]  │  │  Description         ││
                    │  │ P3  [ ]  │  │  Examples            ││
                    │  │ P4  [ ]  │  │                     ││
                    │  │ P5  [ ]  │  │  ┌───────────────┐  ││
                    │  │ P6  [ ]  │  │  │ CodeEdit.jsx  │  ││
                    │  │ P7  [ ]  │  │  │ (textarea)    │  ││
                    │  │ P8  [ ]  │  │  └───────────────┘  ││
                    │  │ P9  [ ]  │  │  ┌───────────────┐  ││
                    │  │          │  │  │LanguageSelect │  ││
                    │  │          │  │  └───────────────┘  ││
                    │  │          │  │  [Run] [Submit]     ││
                    │  │          │  │  ┌───────────────┐  ││
                    │  │          │  │  │ OutputArea    │  ││
                    │  │          │  │  └───────────────┘  ││
                    │  └──────────┘  └───────────────────┘ │
                    └─────────────────────────────────────┘
```

### Network Topology

```
┌──────────────────────────────────────────────────────────────────┐
│                        GCP Project: cint-live                    │
│                        Region: us-central1                       │
│                                                                  │
│  ┌────────────────────────────┐                                  │
│  │  Cloud Functions Gen2      │                                  │
│  │  (managed, serverless)     │                                  │
│  │                            │    HTTP :2358                    │
│  │  runCode                   │──────────────────┐               │
│  │  processSubmission         │                  │               │
│  └────────────────────────────┘                  │               │
│                                                  │               │
│  ┌────────────────────────────┐                  │               │
│  │  Firestore                 │                  │               │
│  │  (default database)        │                  │               │
│  └────────────────────────────┘                  │               │
│                                                  ▼               │
│  ┌────────────────────────────────────────────────────────────┐  │
│  │  VPC: default                                              │  │
│  │                                                            │  │
│  │  ┌──────────────────────────────────────────────────────┐  │  │
│  │  │  judge0-vm (e2-medium, us-central1-a)                │  │  │
│  │  │  Internal: 10.128.0.2                                │  │  │
│  │  │  External: 34.55.39.152                              │  │  │
│  │  │                                                      │  │  │
│  │  │  Docker: judge0-server :2358                         │  │  │
│  │  │          judge0-workers                              │  │  │
│  │  │          judge0-db (PostgreSQL)                      │  │  │
│  │  │          judge0-redis (Redis)                        │  │  │
│  │  └──────────────────────────────────────────────────────┘  │  │
│  │                                                            │  │
│  │  Firewall: allow-judge0 (TCP 2358, source: Cloud Fns)     │  │
│  │  SSH: IAP tunnel only (no open SSH port)                   │  │
│  └────────────────────────────────────────────────────────────┘  │
│                                                                  │
└──────────────────────────────────────────────────────────────────┘
         ▲                              ▲
         │ HTTPS                        │ HTTPS
         │ (Firebase SDK)               │ (Firebase Hosting / GitHub Pages)
         │                              │
┌────────┴──────────────────────────────┴──────────┐
│                  Internet                         │
│                                                   │
│  ┌─────────────────────────────────────────────┐  │
│  │            User Browsers                     │  │
│  │  React SPA served from GitHub / Vite dev     │  │
│  └─────────────────────────────────────────────┘  │
└───────────────────────────────────────────────────┘
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
# SSH into the VM (uses IAP tunnel)
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

4. **SSH access**: Use IAP TCP tunneling to reach the Judge0 VM: `gcloud compute ssh --tunnel-through-iap`.
