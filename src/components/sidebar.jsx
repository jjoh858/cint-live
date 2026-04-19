import { Link, useLocation } from "react-router-dom";
import { useEffect, useState } from "react";
import { db, auth } from "../firebase/config";
import { collection, query, where, getDocs } from "firebase/firestore";

export default function Sidebar({ problems = [] }) {
  const location = useLocation();
  const [solvedProblems, setSolvedProblems] = useState([]);

  useEffect(() => {
    const fetchSolved = async () => {
      if (!auth.currentUser) return;
      const teamsQuery = query(
        collection(db, "teams"),
        where("memberIds", "array-contains", auth.currentUser.uid)
      );
      const teamsSnap = await getDocs(teamsQuery);
      if (!teamsSnap.empty) {
        const team = teamsSnap.docs[0].data();
        setSolvedProblems(team.solvedProblems || []);
      }
    };
    fetchSolved();
  }, []);

  return (
    <div className="flex flex-col h-full border-r border-purple-100/60 bg-white/40 backdrop-blur-md" style={{ width: "220px", flexShrink: 0 }}>


      <div className="flex-1 overflow-y-auto px-3 py-3" style={{ scrollbarWidth: "thin" }}>
        {Array.isArray(problems) && problems.length > 0 ? (
          problems.map((p) => {
            const solved = solvedProblems.includes(String(p.id));
            const active = location.pathname === `/problems/${p.id}`;

            return (
              <Link
                key={p.id}
                to={`/problems/${p.id}`}
                className={`
                  flex items-center justify-between
                  px-3 py-2.5 mb-1 rounded-xl
                  font-mono text-[12px] font-bold tracking-wide no-underline
                  ${active
                    ? "bg-violet-700 text-white shadow-md shadow-violet-200"
                    : solved
                    ? "bg-emerald-50 text-emerald-700 border border-emerald-200 hover:bg-emerald-100"
                    : "text-slate-600 hover:bg-slate-100 hover:text-slate-900"
                  }
                `}
              >
                <span>{p.title}</span>
                {solved && (
                  <svg className="w-3.5 h-3.5 flex-shrink-0 text-emerald-500" viewBox="0 0 12 12" fill="none">
                    <path d="M2 6l3 3 5-5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                )}
              </Link>
            );
          })
        ) : (
          <p className="font-mono text-[12px] text-slate-400 px-3 py-2">No problems available</p>
        )}
      </div>
    </div>
  );
}