import { Link } from "react-router-dom";

export default function ProblemPage({ problems = [] }) {
  return (
    <div className="h-full overflow-y-auto px-8 py-8" style={{ scrollbarWidth: "thin" }}>
      <div className="mb-6">
        <h1 className="text-2xl font-black text-slate-900 tracking-tight">Problems</h1>
        <p className="font-mono text-xs text-slate-400 tracking-widest uppercase mt-1">
          {problems.length} problems
        </p>
      </div>

      <div className="space-y-3">
        {problems.map((p) => (
          <Link
            key={p.id}
            to={`/problems/${p.id}`}
            className="block rounded-2xl border border-slate-100 bg-white/50 px-5 py-4 hover:border-violet-200 hover:bg-violet-50/30 transition-all"
          >
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <span className="font-mono text-xs font-bold text-slate-300">#{p.id}</span>
                <span className="font-bold text-sm text-slate-700 tracking-tight">{p.title}</span>
              </div>
              <div className="flex items-center gap-3">
                {p.difficulty && (
                  <span className={`font-mono text-[10px] font-bold tracking-widest uppercase px-2.5 py-0.5 rounded-full border ${
                    p.difficulty === "Hard"
                      ? "text-red-600 bg-red-50 border-red-200"
                      : p.difficulty === "Medium"
                        ? "text-amber-600 bg-amber-50 border-amber-200"
                        : "text-emerald-600 bg-emerald-50 border-emerald-200"
                  }`}>
                    {p.difficulty}
                  </span>
                )}
                <span className="font-mono text-xs font-bold text-violet-600">{p.points} pts</span>
              </div>
            </div>
          </Link>
        ))}

        {problems.length === 0 && (
          <div className="text-center py-12 font-mono text-xs text-slate-400">
            No problems loaded yet
          </div>
        )}
      </div>
    </div>
  );
}