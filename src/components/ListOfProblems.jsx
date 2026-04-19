import { useState, useEffect, useRef } from "react";
import { useParams } from "react-router-dom";
import { db, auth } from "../firebase/config";
import { doc, getDoc, addDoc, collection, onSnapshot, query, where, getDocs } from "firebase/firestore";

import CodeEditor from "./CodeEdit";
import LanguageSelector from "./languageSelector";

function Toast({ message, onDone }) {
  const [visible, setVisible] = useState(true);

  useEffect(() => {
    const fade = setTimeout(() => setVisible(false), 2800);
    const done = setTimeout(() => onDone(), 3300);
    return () => { clearTimeout(fade); clearTimeout(done); };
  }, [onDone]);

  const styles = {
    "Accepted":                     "bg-emerald-50 border-emerald-300 text-emerald-800",
    "Wrong Answer":                 "bg-red-50 border-red-300 text-red-800",
    "Time Limit Exceeded":          "bg-amber-50 border-amber-300 text-amber-800",
    "Timed out waiting for result": "bg-orange-50 border-orange-300 text-orange-800",
    "Submission failed":            "bg-red-50 border-red-300 text-red-800",
    "Submitting...":                "bg-violet-50 border-violet-300 text-violet-800",
  };

  const icons = {
    "Accepted": "✓",
    "Wrong Answer": "✗",
    "Time Limit Exceeded": "⏱",
    "Submitting...": "⟳",
  };

  const cls = styles[message] || "bg-slate-50 border-slate-300 text-slate-800";

  return (
    <div className={`fixed top-5 left-1/2 z-50 flex items-center gap-2 px-5 py-2.5 border rounded-full shadow-lg font-mono text-xs font-bold tracking-widest uppercase ${cls} ${visible ? "opacity-100 -translate-x-1/2 translate-y-0" : "opacity-0 -translate-x-1/2 -translate-y-3"}`}>
      {message}
    </div>
  );
}

const difficultyStyle = {
  Easy:   "text-emerald-600 bg-emerald-50 border-emerald-200",
  Medium: "text-amber-600 bg-amber-50 border-amber-200",
  Hard:   "text-red-600 bg-red-50 border-red-200",
};

export default function ProblemView() {
  const { id } = useParams();
  const [code, setCode] = useState("# write your solution here");
  const [submitting, setSubmitting] = useState(false);
  const [toast, setToast] = useState(null);
  const [language, setLanguage] = useState({ label: "Python", id: 71 });
  const [problem, setProblem] = useState(null);
  const [loading, setLoading] = useState(true);

  // Fetch problem from Firestore
  useEffect(() => {
    const fetchProblem = async () => {
      setLoading(true);
      try {
        const snap = await getDoc(doc(db, "problems", id));
        if (snap.exists()) {
          setProblem(snap.data());
        } else {
          setProblem(null);
        }
      } catch (_err) {
        console.error(_err);
        setProblem(null);
      } finally {
        setLoading(false);
      }
    };
    fetchProblem();
  }, [id]);

  if (loading) return (
    <div className="flex items-center justify-center h-full text-slate-400 font-mono text-sm">
      loading problem...
    </div>
  );

  if (!problem) return (
    <div className="flex items-center justify-center h-full text-slate-400 font-mono text-sm">
      problem not found
    </div>
  );

  const submitCode = async () => {
    if (!auth.currentUser) { setToast("You must be logged in to submit."); return; }

    const teamsQuery = query(
      collection(db, "teams"),
      where("memberIds", "array-contains", auth.currentUser.uid)
    );
    const teamsSnap = await getDocs(teamsQuery);
    if (teamsSnap.empty) { setToast("You must be in a team to submit."); return; }
    const teamId = teamsSnap.docs[0].id;

    try {
      setSubmitting(true);
      setToast("Submitting...");

      const docRef = await addDoc(collection(db, "submissions"), {
        code, languageId: language.id, problemId: id,
        teamId, status: "Pending", createdAt: new Date(),
      });

      const unsubscribe = onSnapshot(docRef, (snap) => {
        const data = snap.data();
        if (["Accepted", "Wrong Answer", "Time Limit Exceeded"].includes(data.status)) {
          setToast(data.status);
          setSubmitting(false);
          clearTimeout(timeout);
          unsubscribe();
        }
      });

      const timeout = setTimeout(() => {
        unsubscribe();
        setToast("Timed out waiting for result");
        setSubmitting(false);
      }, 15000);

    } catch (_err) {
      console.error(_err);
      setToast("Submission failed");
      setSubmitting(false);
    }
  };

  return (
    <div className="flex flex-col lg:flex-row h-full overflow-hidden font-sans">

      {toast && <Toast key={toast + Date.now()} message={toast} onDone={() => setToast(null)} />}

      {/* ── LEFT PANEL ── */}
      <div className="lg:w-[40%] flex flex-col overflow-hidden border-r border-slate-200/60">

        {/* Header */}
        <div className="px-8 pt-7 pb-5 flex-shrink-0 border-b border-slate-100">
          <div className="flex items-center gap-2 mb-3">
            <span className="font-mono text-[10px] font-bold tracking-widest uppercase text-violet-600 bg-violet-50 border border-violet-200 px-2.5 py-0.5 rounded-full">
              #{id}
            </span>
            {problem.difficulty && (
              <span className={`font-mono text-[10px] font-bold tracking-widest uppercase border px-2.5 py-0.5 rounded-full ${difficultyStyle[problem.difficulty] || difficultyStyle.Easy}`}>
                {problem.difficulty}
              </span>
            )}
            {problem.points && (
              <span className="font-mono text-[10px] font-bold tracking-widest uppercase text-slate-400 bg-slate-50 border border-slate-200 px-2.5 py-0.5 rounded-full">
                {problem.points} pts
              </span>
            )}
          </div>
          <h1 className="text-2xl font-black text-slate-900 tracking-tight leading-tight">
            {problem.title}
          </h1>
        </div>

        {/* Scrollable body */}
        <div className="flex-1 overflow-y-auto px-8 py-6" style={{ scrollbarWidth: "thin", scrollbarColor: "#e2e8f0 transparent" }}>

          {/* Description */}
          <div className="font-mono text-[13px] leading-relaxed text-slate-500 mb-6">
            {(problem.description || "").split("\n").map((line, i) => (
              <p key={i} className={line === "" ? "mb-3" : "mb-0"}>{line || "\u00a0"}</p>
            ))}
          </div>

          {/* Examples */}
          {problem.examples?.map((ex, i) => (
            <div key={i} className="mb-4">
              <p className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-2">Example {i + 1}</p>
              <div className="rounded-xl bg-slate-50 border border-slate-100 p-4 font-mono text-[12px] text-slate-600 space-y-1">
                <div><span className="text-slate-400">Input: </span>{ex.input}</div>
                <div><span className="text-slate-400">Output: </span>{ex.output}</div>
                {ex.explanation && <div><span className="text-slate-400">Explanation: </span>{ex.explanation}</div>}
              </div>
            </div>
          ))}
        </div>

        {/* Mobile submit bar */}
        <div className="lg:hidden flex items-center gap-3 px-6 py-3 border-t border-slate-100 flex-shrink-0">
          <LanguageSelector onChange={setLanguage} />
          <button
            onClick={submitCode}
            disabled={submitting}
            className={`ml-auto text-xs font-bold tracking-widest uppercase px-5 py-2 rounded-full font-mono ${submitting ? "bg-slate-200 text-slate-400 cursor-not-allowed" : "bg-violet-700 text-white "}`}
          >
            {submitting ? "Judging..." : "Submit"}
          </button>
        </div>
      </div>

      {/* ── RIGHT PANEL ── */}
      <div className="flex-1 flex flex-col overflow-hidden">

        {/* Toolbar */}
        <div className="flex items-center justify-between px-5 py-2.5 border-b border-slate-200/60 flex-shrink-0 bg-white/40">
          <div className="flex items-center gap-1.5">
            <LanguageSelector onChange={setLanguage} />
          </div>

          <div className="hidden lg:flex items-center gap-3">
            
            <button
              onClick={submitCode}
              disabled={submitting}
              className={`text-xs font-bold tracking-widest uppercase px-6 py-2 rounded-full transition-all font-mono ${submitting ? "bg-slate-200 text-slate-400 cursor-not-allowed" : "bg-violet-700 text-white hover:bg-violet-800 shadow-md shadow-violet-200 hover:-translate-y-px active:translate-y-0"}`}
            >
              {submitting ? "Judging..." : "Submit"}
            </button>
          </div>
        </div>

        {/* Editor */}
        <div className="flex-1 overflow-hidden">
          <CodeEditor code={code} setCode={setCode} />
        </div>
      </div>
    </div>
  );
}