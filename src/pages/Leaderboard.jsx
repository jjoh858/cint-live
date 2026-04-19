import { useEffect, useState } from "react";
import { collection, onSnapshot, query, orderBy, where, getDocs } from "firebase/firestore";
import { db } from "../firebase/config";
import { getProblems } from "../services/firebaseService";

const medals = {
  1: { bg: "bg-amber-50", border: "border-amber-300", text: "text-amber-700" },
  2: { bg: "bg-slate-50", border: "border-slate-300", text: "text-slate-600" },
  3: { bg: "bg-orange-50", border: "border-orange-300", text: "text-orange-700" },
};

function formatElapsed(timestamp) {
  const solveDate = timestamp?.toDate ? timestamp.toDate() : new Date(timestamp);
  const contestStart = new Date(solveDate);
  contestStart.setHours(14, 0, 0, 0); // 2:00 PM same day
  const diff = solveDate - contestStart;
  if (diff < 0) return "pre";
  const mins = Math.floor(diff / 60000);
  const secs = Math.floor((diff % 60000) / 1000);
  if (mins >= 60) {
    const hrs = Math.floor(mins / 60);
    const m = mins % 60;
    return `${hrs}:${String(m).padStart(2, "0")}:${String(secs).padStart(2, "0")}`;
  }
  return `${mins}:${String(secs).padStart(2, "0")}`;
}

export default function Leaderboard() {
  const [teams, setTeams] = useState([]);
  const [problems, setProblems] = useState([]);
  const [solveTimes, setSolveTimes] = useState({});

  // Load problems
  useEffect(() => {
    getProblems().then((p) => {
      const sorted = [...p].sort((a, b) => Number(a.id) - Number(b.id));
      setProblems(sorted);
    });
  }, []);

  // Live team rankings
  useEffect(() => {
    const q = query(collection(db, "teams"), orderBy("score", "desc"));
    const unsubscribe = onSnapshot(q, (snap) => {
      const data = snap.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
      let rank = 1;
      for (let i = 0; i < data.length; i++) {
        if (i > 0 && data[i].score !== data[i - 1].score) rank = i + 1;
        data[i].rank = rank;
      }
      setTeams(data);
    });
    return () => unsubscribe();
  }, []);

  // Fetch first "Accepted" submission per team+problem for solve times
  useEffect(() => {
    async function fetchSolveTimes() {
      const snap = await getDocs(
        query(collection(db, "submissions"), where("status", "==", "Accepted"))
      );
      const times = {};
      snap.docs.forEach((doc) => {
        const d = doc.data();
        const key = `${d.teamId}_${d.problemId}`;
        const ts = d.createdAt;
        if (!times[key] || (ts && ts < times[key])) {
          times[key] = ts;
        }
      });
      setSolveTimes(times);
    }
    fetchSolveTimes();
    // Refresh solve times every 15s
    const interval = setInterval(fetchSolveTimes, 15000);
    return () => clearInterval(interval);
  }, []);

  return (
    <div className="h-full overflow-auto px-8 py-8" style={{ scrollbarWidth: "thin" }}>
      <div className="mb-8">
        <h1 className="text-2xl font-black text-slate-900 tracking-tight">Leaderboard</h1>
        <p className="font-mono text-xs text-slate-400 tracking-widest uppercase mt-1">Live Rankings</p>
      </div>

      <div className="rounded-2xl border border-slate-100 overflow-x-auto bg-white/50">
        <table className="w-full border-collapse min-w-[700px]">
          <thead>
            <tr className="border-b border-slate-100">
              <th className="text-left px-4 py-3 font-mono text-[10px] font-bold tracking-widest uppercase text-slate-400">#</th>
              <th className="text-left px-4 py-3 font-mono text-[10px] font-bold tracking-widest uppercase text-slate-400">Team</th>
              {problems.map((p) => (
                <th key={p.id} className="text-center px-2 py-3 font-mono text-[10px] font-bold tracking-widest uppercase text-slate-400">
                  P{p.id}
                </th>
              ))}
              <th className="text-center px-4 py-3 font-mono text-[10px] font-bold tracking-widest uppercase text-slate-400">Solved</th>
              <th className="text-right px-4 py-3 font-mono text-[10px] font-bold tracking-widest uppercase text-slate-400">Score</th>
            </tr>
          </thead>
          <tbody>
            {teams.map((team) => {
              const medal = medals[team.rank];
              const isTop3 = team.rank <= 3;
              const solved = team.solvedProblems || [];

              return (
                <tr
                  key={team.id}
                  className={`border-b border-slate-50 transition-colors ${isTop3 ? medal.bg : "hover:bg-slate-50"}`}
                >
                  <td className="px-4 py-3">
                    <span className="font-mono text-sm font-bold text-slate-300">{team.rank}</span>
                  </td>
                  <td className="px-4 py-3">
                    <span className={`font-bold text-sm tracking-tight ${isTop3 ? medal.text : "text-slate-700"}`}>
                      {team.name}
                    </span>
                  </td>
                  {problems.map((p) => {
                    const isSolved = solved.includes(String(p.id));
                    const timeKey = `${team.id}_${p.id}`;
                    const ts = solveTimes[timeKey];
                    return (
                      <td key={p.id} className="text-center px-2 py-3">
                        {isSolved ? (
                          <div className="flex flex-col items-center">
                            <span className="text-emerald-500 text-sm font-bold">&#10003;</span>
                            {ts && (
                              <span className="font-mono text-[10px] text-slate-400">
                                +{formatElapsed(ts)}
                              </span>
                            )}
                          </div>
                        ) : (
                          <span className="text-slate-200">&mdash;</span>
                        )}
                      </td>
                    );
                  })}
                  <td className="text-center px-4 py-3">
                    <span className="font-mono text-xs text-slate-500 font-bold">
                      {solved.length}/{problems.length}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-right">
                    <span className={`font-mono text-sm font-bold ${isTop3 ? medal.text : "text-slate-600"}`}>
                      {team.score || 0}
                    </span>
                  </td>
                </tr>
              );
            })}

            {teams.length === 0 && (
              <tr>
                <td colSpan={problems.length + 4} className="px-5 py-8 text-center font-mono text-xs text-slate-400">
                  no teams yet
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
