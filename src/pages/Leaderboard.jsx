import { useEffect, useState } from "react";
import { collection, onSnapshot, query, orderBy } from "firebase/firestore";
import { db } from "../firebase/config";

const medals = {
  1: { emoji: "🥇", label: "1ST", bg: "bg-amber-50", border: "border-amber-300", text: "text-amber-700", rank: "text-amber-500" },
  2: { emoji: "🥈", label: "2ND", bg: "bg-slate-50", border: "border-slate-300", text: "text-slate-600", rank: "text-slate-400" },
  3: { emoji: "🥉", label: "3RD", bg: "bg-orange-50", border: "border-orange-300", text: "text-orange-700", rank: "text-orange-400" },
};

export default function Leaderboard() {
  const [teams, setTeams] = useState([]);

  useEffect(() => {
    const q = query(collection(db, "teams"), orderBy("score", "desc"));
    const unsubscribe = onSnapshot(q, (snap) => {
      const data = snap.docs.map((doc) => ({ id: doc.id, ...doc.data() }));

      // Assign dense ranks (ties get same rank)
      let rank = 1;
      for (let i = 0; i < data.length; i++) {
        if (i > 0 && data[i].score !== data[i - 1].score) {
          rank = i + 1;
        }
        data[i].rank = rank;
      }

      setTeams(data);
    });
    return () => unsubscribe();
  }, []);

  return (
    <div className="h-full overflow-y-auto px-8 py-8" style={{ scrollbarWidth: "thin" }}>

      {/* Header */}
      <div className="mb-8">
        <h1 className="text-2xl font-black text-slate-900 tracking-tight">Leaderboard</h1>
        <p className="font-mono text-xs text-slate-400 tracking-widest uppercase mt-1">Live Rankings</p>
      </div>

      {/* Full table */}
      <div className="rounded-2xl border border-slate-100 overflow-hidden bg-white/50">
        <table className="w-full border-collapse">
          <thead>
            <tr className="border-b border-slate-100">
              <th className="text-left px-5 py-3 font-mono text-[10px] font-bold tracking-widest uppercase text-slate-400">#</th>
              <th className="text-left px-5 py-3 font-mono text-[10px] font-bold tracking-widest uppercase text-slate-400">Team</th>
              <th className="text-left px-5 py-3 font-mono text-[10px] font-bold tracking-widest uppercase text-slate-400">Solved</th>
              <th className="text-right px-5 py-3 font-mono text-[10px] font-bold tracking-widest uppercase text-slate-400">Score</th>
            </tr>
          </thead>
          <tbody>
            {teams.map((team) => {
              const medal = medals[team.rank];
              const isTop3 = team.rank <= 3;

              return (
                <tr
                  key={team.id}
                  className={`border-b border-slate-50 transition-colors ${isTop3 ? medal.bg : "hover:bg-slate-50"}`}
                >
                  <td className="px-5 py-3.5">
                    <span className="font-mono text-sm font-bold text-slate-300">{team.rank}</span>
                    
                  </td>
                  <td className="px-5 py-3.5">
                    <span className={`font-bold text-sm tracking-tight ${isTop3 ? medal.text : "text-slate-700"}`}>
                      {team.name}
                    </span>
                  </td>
                  <td className="px-5 py-3.5">
                    <span className="font-mono text-xs text-slate-400">
                      {team.solvedProblems?.length || 0}
                    </span>
                  </td>
                  <td className="px-5 py-3.5 text-right">
                    <span className={`font-mono text-sm font-bold ${isTop3 ? medal.text : "text-slate-600"}`}>
                      {team.score || 0}
                    </span>
                  </td>
                </tr>
              );
            })}

            {teams.length === 0 && (
              <tr>
                <td colSpan={4} className="px-5 py-8 text-center font-mono text-xs text-slate-400">
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