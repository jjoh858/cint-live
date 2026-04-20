# CINT Live - Programming Contest Platform

A real-time competitive programming platform built with React + Firebase + serverless Cloud Run code executor. Teams compete to solve algorithmic problems, with live scoring and a leaderboard.

## Architecture

### High-Level System Overview

```
┌───────────────���─────────────────────────────────────────────────────────────────┐
│                              USER'S BROWSER                                     │
│                                                                                 │
│  ┌─────────────┐  ┌──────���───────┐  ┌─────────────┐  ┌───────────────────────┐ │
│  │  Homepage    │  │   Profile     │  │ Leaderboard ���  │   Problem View        │ │
│  │  (countdown) │  │ (team mgmt)  │  │ (rankings)  │  │ (editor + submit)     │ │
│  ���─────────────┘  └───���──────────┘  └─────────────┘  └───��───────────────────┘ │
│                                                                                 │
│  React 19 + Vite 8 + Tailwind 4 + React Router                                 │
└────────────┬──────────────────┬────���──────────────────────────┬─────────────────┘
             │                  │                               │
             │ Google SSO       │ Real-time listeners           │ httpsCallable
             │                  │ (onSnapshot)                  │ "Run Code" / Submit
             ▼                  ▼                               ▼
┌───���────────────────────────────────��────────────────────────────────────────────┐
│                         FIREBASE  (GCP: cint-live)                              │
│                                                                                 │
│  ┌──────────────────┐    ┌──────────────────────────────────────────────────┐   │
│  │  Firebase Auth    │    │              Firestore Database                  │   │
│  │                   │    │                                                  │   │
│  │  Google Provider  │    │  ┌──────────┐ ┌────────┐ ┌───��───┐ ┌──���──────┐ │   │
│  │  SSO login flow   │    │  │ problems │ │ teams  │ │ users │ │joinCodes│ │   │
│  └──────────────────┘    │  │ (9 docs) │ │        │ │       │ │         │ │   │
│                           │  └──────────┘ └��───────┘ └───────┘ └─────────┘ │   │
│                           │                                                  │   │
│                           │  ┌───────────────────────────────────────┐       │   │
│                           │  │            submissions                 │       │   │
│                           │  │  (created by frontend on "Submit")     │       │   │
���                           │  │                                        ���       │   │
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
│  │  ��─────────────────────────┐    ┌───���──────────────────────────────────┐ │   │
│  ���  │      runCode            │    │       processSubmission              │ │   │
���  │  │  (httpsCallable)        │    │    (Firestore onCreate trigger)      │ │   ���
│  │  │                         │    │                                      │ │   │
│  │  │  - Receives code +      │    │  1. Extract submission ID            ��� │   │
│  │  │    language from UI      │    │     (protobuf fallback)             │ │   │
│  │  │  - Sends to Cloud Run   │    │  2. Read submission from Firestore   │ │   │
│  │  │  - 10s time limit       │    │  3. Claim: Pending → Running        │ │   │
│  │  │  - Returns stdout/err   │    │  4. Fetch test cases from problem    │ │   │
│  │  │                         │    │  5. Run ALL tests in parallel        │ ��   │
│  │  │  Timeout: 30s           │    │     (Promise.all → Cloud Run)        │ │   │
│  │  └────────────┬────────────┘    │  6. Write results back               │ │   │
│  │               │                 │  7. If all pass: update team score    │ ��   │
│  │               │                 │                                      │ │   │
│  │               │                 │  Timeout: 540s                       │ │   │
│  │               │                 └──────────────┬───────────────────────┘ │   │
│  └───────────────┼─���──────────────────────────────┼──���──────────────────────┘   │
└──────────────────┼────────────────────────────────┼─────────────────────────────┘
                   │                                │
                   │  HTTP POST /run                │  HTTP POST /run (parallel)
                   │                                │  (15 test cases = 15 instances)
                   ▼                                ▼
┌─────────────────────────────────────────────────────────────────────────────────┐
│         Cloud Run: code-runner  (us-central1, serverless)                       │
│         https://code-runner-1074290783330.us-central1.run.app                   ���
│                                                                                 │
│  ┌─────────────────────────────────────────────────────────────────────────┐    │
│  │                        Container (Node.js 20)                           │    │
│  │                                                                         │    │
│  │  Runtimes installed:                                                    ���    │
│  │  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌──────────┐               │    │
│  │  │ Python 3 │  │ Node.js  │  │ g++ (C++)│  │ Java JDK │               │    │
│  │  │ (id: 71) │  │ (id: 63) │  │ (id: 54) │  │ (id: 62) │               │    │
│  │  └──────────┘  └──────────┘  └────���─────┘  └──────────┘               │    │
│  │                                                                         │    │
│  │  POST /run  →  writes code to temp file  →  subprocess.exec            │    │
│  │               with stdin from file          with timeout + ulimit       │    │
│  │               returns { stdout, stderr, status }                        │    │
│  └─────────────────────────────────────────────────────────────────────────┘    │
│                                                                                 │
│  Config: 1 vCPU, 1GB RAM, concurrency=1, min=0, max=50                         │
│  Autoscales: 0 instances when idle, up to 50 for parallel test cases            │
│  Cost: $0/mo (within free tier for typical competition usage)                   │
└──────────��─────────────────────────��─────────────────────────────��──────────────┘
```

### Data Flow — Code Submission Lifecycle

```
 User clicks "Submit"
        │
        ▼
 ┌──────────────────┐     Frontend writes doc to Firestore
 │  Browser (React)  │───────────��────────────────────────────┐
 └──────────────────┘                                         │
                                                              ▼
                                              ┌───────────────────────────┐
                                              │  Firestore: submissions/  ���
                                              │                           │
                                              │  status: "Pending"        │
                                              │  code: "print(...)"       │
                                              │  languageId: 71           │
                                              │  problemId: "1"           │
                                              │  teamId: "abc123"         │
                                              └─────────────┬──��──────────┘
                                                            │
                                         Eventarc onCreate trigger fires
                                                            │
                                                            ▼
                                              ┌─��────────────────────────���┐
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
                                              ┌────────��──────────────────┐
                                              │   Parallel Execution      │
                                              │   (Promise.all)           │
                                              │                           │
                                              │  ┌─────┐ ┌─────┐ ┌─────┐ │
                                              │  │TC #1│ │TC #2│ │TC #N│ │
                                              │  └──���──┘ └──┬──┘ └──┬──�� │
                                              └─────┼───────┼───────┼───���─┘
                                                    │       │       │
                                          HTTP POST to Cloud Run (each test case)
                                          Each gets its OWN Cloud Run instance
                                                    │       │       │
                                                    ▼       ▼       ▼
                                              ┌───────────────────────────┐
                                              │  Cloud Run: code-runner   │
                                              │                           │
                                              │  Runs code via subprocess │
                                              │  with timeout + ulimit    │
                                              │  15s time limit per case  │
                                              │                           │
                                              │  Returns: stdout, stderr, │
                                              │  status (Accepted/TLE/RE) │
                                              └─────────────┬────────���────┘
                                                            │
                                                  Results collected
                                                            │
                                                            ▼
                                              ┌────────────────────────��──┐
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
                              └────���────────────────┘            └─────────────────────┘
                                          │                                    │
                                          └──────────────┬───��─────────────────┘
                                                         │
                                                         ▼
                                              ┌��───────────────────────���──┐
                                              │  Firestore updated        │
                                              │  onSnapshot fires in UI   │
                                              │  → User sees results      │
                                              └───────���───────────────────┘
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
                    ┌──���──────────────────────────────────┐
                    │            App.jsx (Router)          │
                    │   loads problems from Firestore      │
                    │   via useProblems() hook             │
                    └──┬──────┬──────┬──────┬──────┬──────┘
                       │      │      │      │      │
            ┌──────────┘      │      │      │      └───────────┐
            ▼                 ▼      │      ▼                  ▼
  ┌──────────────┐  ┌──���───────┐    │   ┌────────────┐  ┌───────────┐
  │ Homepage.jsx │  │Profile   │    │   │Leaderboard │  │Problems   │
  │              │  │.jsx      │    │   │.jsx        │  │.jsx       │
  │ Countdown    │  │          │    │   │            │  │           │
  │ timer to     │  │ Create/  │    │   │ Live rank  │  │ Problem   │
  │ 2:00 PM      │  │ Join/    │    │   │ Per-prob   │  │ list      │
  │              │  │ Leave/   │    ���   │ solve time │  │ (cards)   │
  │ Shows "GO!"  │  │ Delete   │    │   │ Auto-      │  │           │
  │ when started │  │ team     │    │   │ refresh    │  │           │
  └─���────────────┘  └──────────┘    │   └────��───────┘  └───────────┘
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
                    │  │ P8  [ ]  │  │  └────���──────────┘  ││
                    │  │ P9  [ ]  │  │  ┌───────────────┐  ││
                    │  │          │  │  │LanguageSelect │  ││
                    │  │          │  │  └───────��───────┘  ││
                    │  │          │  │  [Run] [Submit]     ││
                    │  │          │  │  ┌───────────────┐  ││
                    │  │          │  │  │ OutputArea    │  ││
                    │  │          │  │  └──���────────────┘  ││
                    │  └──────────┘  └───────────────────┘ │
                    └───────────────────────────────────��─┘
```

### Network Topology

```
┌──────────────────────────────────────────────────────────────────┐
│                        GCP Project: cint-live                    │
│                        Region: us-central1                       │
│                                                                  │
│  ┌────────────────────────────┐                                  │
│  │  Cloud Functions Gen2      │                                  │
│  │  (managed, serverless)     │    HTTPS (authed)                │
│  │                            │──────────────────┐               │
│  │  runCode                   │                  │               │
│  │  processSubmission         │                  │               │
│  └───���────────────────────────┘                  │               │
│                                                  │               │
│  ┌────────────────────────────┐                  │               │
│  │  Firestore                 │                  │               │
│  │  (default database)        │                  │               │
│  └─────���──────────────────────┘                  │               │
│                                                  ▼               │
│  ��────────────────────────────────────────────────────────────┐  │
│  │  Cloud Run: code-runner (serverless)                       │  │
│  │                                                            │  │
│  │  URL: code-runner-1074290783330.us-central1.run.app        │  │
│  │  Image: us-central1-docker.pkg.dev/cint-live/code-runner/  │  │
│  │         code-runner:latest                                 │  ��
│  │                                                            ��  │
│  │  1 vCPU, 1GB RAM, concurrency=1                           │  ��
│  │  min-instances=0 (scales to zero when idle)                │  │
│  │  max-instances=50 (handles 50 parallel test cases)         │  │
│  │                                                            │  │
│  │  Runtimes: Python 3, Node.js 20, g++ (C++), Java JDK      │  │
│  └────���────────────────────────────���──────────────────────────┘  │
│                                                                  │
│  ┌────────────────────────────────────────────────────────────┐  │
��  │  Artifact Registry: code-runner                            │  │
│  │  Docker image repository                                   │  │
│  └─────���──────────────────────────────────────────────────────┘  │
│                                                                  │
└─────────────────────────────────────���────────────────────────────┘
         ▲                              ▲
         │ HTTPS                        │ HTTPS
         │ (Firebase SDK)               │ (Vercel / Firebase Hosting)
         │                              │
┌────────┴──────────────────────────────┴──────────┐
│                  Internet                         │
│                                                   │
│  ┌─────────────────────────────────────────────┐  │
│  │            User Browsers                     │  │
│  │                                              │  │
│  │  www.cintlive.com  → Vercel (auto-deploy)   │  │
│  │  cint-live.web.app → Firebase Hosting        │  │
│  └───��────────────────────────────���────────────┘  │
└───────────────────────────────────────────────────┘
```

## Infrastructure

| Component | Details |
|-----------|---------|
| **GCP Project** | `cint-live` |
| **Frontend** | React 19 + Vite 8 + Tailwind 4 |
| **Hosting** | www.cintlive.com (Vercel, auto-deploys from GitHub) + cint-live.web.app (Firebase Hosting) |
| **Backend** | Firebase Cloud Functions Gen2 (Node.js 22) |
| **Database** | Firestore (default database) |
| **Auth** | Firebase Auth with Google provider |
| **Code Executor** | Cloud Run `code-runner` (serverless, autoscales 0→50) |
| **Code Runner URL** | `https://code-runner-1074290783330.us-central1.run.app` |
| **Container Image** | `us-central1-docker.pkg.dev/cint-live/code-runner/code-runner:latest` |

### Code Executor (Cloud Run)

The code executor is a lightweight Node.js HTTP server that runs user-submitted code in a subprocess. It supports Python, JavaScript, C++, and Java.

**How it works:**
1. Receives `POST /run` with `{ source_code, language_id, stdin, cpu_time_limit }`
2. Writes code to a temp file
3. Compiles if needed (C++, Java)
4. Runs via `subprocess` with stdin redirected from file
5. Enforces time limit via `timeout`
6. Returns `{ stdout, stderr, status }`

**Why Cloud Run instead of Judge0 VM:**
- **$0/mo** vs ~$8/mo (Judge0 VM with static IP)
- **Zero idle cost** — scales to 0 when no competitions running
- **No timeout errors** — each test case gets its own instance (vs Judge0 choking on 15+ concurrent containers)
- **No ops** — no VM to start/stop, no Docker Compose to manage
- **Autoscales** — handles 50+ concurrent test cases across all teams

### Architecture History

Previously used **Judge0 on RapidAPI** (rate-limited, paid), then migrated to **self-hosted Judge0 on GCE VM** (e2-medium). The VM had concurrency issues with large test suites (15+ parallel test cases on 2 vCPUs). Replaced with **Cloud Run serverless executor** for zero-cost, infinite-scale code execution.

## Firestore Collections

### `problems`
```
{
  id: "1",                    // document ID
  title: "6 + 7 = 13",
  description: "...",         // problem statement text or Google Docs link
  points: 100,                // points awarded for solving
  difficulty: "Easy",         // optional: Easy | Medium | Hard
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
  languageId: 71,             // language ID (71=Python, 63=JS, 54=C++, 62=Java)
  problemId: "1",
  teamId: "teamId",
  status: "Pending",          // Pending → Running → Accepted | Wrong Answer | TLE | Error
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
│
├── src/                          # Frontend (React + Vite)
│   ├── App.jsx                   # Main router, auth, loads problems
│   ├── main.jsx                  # Entry point
│   ├── firebase/
│   │   └── config.js             # Firebase app init, auth, Firestore
│   ├── components/
│   │   ├── layout.jsx            # Page layout wrapper with sidebar
│   ���   ├── sidebar.jsx           # Problem list sidebar
│   │   ├── NavBar.jsx            # Top navigation bar
│   │   ├── ListOfProblems.jsx    # Problem detail view + code submission
│   │   ├── CodeEdit.jsx          # Code editor textarea
│   │   ├── languageSelector.jsx  # Language dropdown
│   │   └── OutputArea.jsx        # Code output display
│   ├── pages/
│   │   ├── Homepage.jsx          # Countdown timer
│   ��   ├── Loginpage.jsx         # Google OAuth login
│   │   ├── Profile.jsx           # Team create/join/leave/delete
│   │   ├── Problems.jsx          # Problems list page
│   │   └── Leaderboard.jsx       # Live rankings
│   ├── hooks/
│   │   └── useProblems.js        # Hook to fetch problems from Firestore
│   └── styles/
│       └── index.css
│
├── code-runner/                  # Cloud Run code executor
│   ├── Dockerfile                # Node.js 20 + Python + g++ + Java
│   └── server.js                 # HTTP server: POST /run endpoint
│
├── functions/                    # Firebase Cloud Functions
│   ├── index.js                  # runCode + processSubmission
│   ├── .env                      # CODE_RUNNER_URL
│   ├── package.json              # Node 22, firebase-functions, axios
│   ├── problems.json             # Problem definitions + test cases (reference)
│   └── uploadProblems.js         # Script to upload problems to Firestore
│
├── vercel.json                   # Vercel SPA rewrites + cache headers
├── firebase.json                 # Firebase config (hosting, functions, rules)
├── firestore.rules               # Firestore security rules
├── .firebaserc                   # Project alias: default → cint-live
├── package.json                  # Frontend deps
├── vite.config.js                # Vite build config
└── index.html                    # HTML entry point
```

## Supported Languages

| Language | ID | Runtime |
|----------|----|---------|
| Python 3 | 71 | python3 |
| JavaScript (Node) | 63 | node |
| C++ (GCC) | 54 | g++ -O2 |
| Java (OpenJDK) | 62 | javac + java |

## Deployment

### Frontend (auto-deploys on push)
```bash
git push origin main     # Vercel auto-deploys www.cintlive.com
```

### Frontend (manual Firebase Hosting)
```bash
npm run build
firebase deploy --only hosting
```

### Cloud Functions
```bash
cd functions && npm install
GOOGLE_CLOUD_QUOTA_PROJECT=cint-live firebase deploy --only functions
```

### Code Runner (Cloud Run)
```bash
cd code-runner

# Build image via Cloud Build
gcloud builds submit --tag us-central1-docker.pkg.dev/cint-live/code-runner/code-runner:latest --project=cint-live

# Deploy to Cloud Run
gcloud run deploy code-runner \
  --image=us-central1-docker.pkg.dev/cint-live/code-runner/code-runner:latest \
  --region=us-central1 --project=cint-live \
  --memory=1Gi --cpu=1 --timeout=60 \
  --concurrency=1 --min-instances=0 --max-instances=50
```

### Firestore Rules
```bash
firebase deploy --only firestore:rules
```

### Check Logs
```bash
# Cloud Functions
gcloud functions logs read processSubmission --region=us-central1 --project=cint-live --limit=20
gcloud functions logs read runCode --region=us-central1 --project=cint-live --limit=20

# Cloud Run code executor
gcloud run services logs read code-runner --region=us-central1 --project=cint-live --limit=20
```

## Firestore Security Rules

- `problems` — public read (loads before auth)
- `teams` — public read, authenticated create, members-only update/delete
- `users` — owner-only read/write, max 1 team
- `submissions` — authenticated create/read/update
- `joinCodes` — authenticated read/create/delete, no update

## Known Issues & Workarounds

1. **Eventarc protobuf deserialization**: Firebase Functions Gen2 Firestore triggers sometimes deliver events where `event.data` is undefined. The code extracts the submission ID from `event.params`, `event.subject`, `event.document`, or raw protobuf bytes as fallbacks, then reads the document directly from Firestore.

2. **Firestore undefined values**: When the code runner returns null fields, writing them to Firestore throws errors. Fixed with `db.settings({ ignoreUndefinedProperties: true })`.

3. **Auth loading hang**: If Firestore `getDoc` fails during auth initialization, the app could hang on "Loading...". Fixed with try/catch and a 5-second safety timeout in `App.jsx`.

4. **Vercel SPA routing**: Without `vercel.json` rewrites, refreshing on any route returns 404. Fixed with `vercel.json` SPA fallback and no-cache headers on `index.html`.
