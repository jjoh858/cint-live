import { useEffect, useState, useCallback } from "react";
import { doc, onSnapshot, collection, writeBatch,
         getDoc, updateDoc, setDoc, arrayUnion, arrayRemove, deleteDoc, serverTimestamp } from "firebase/firestore";
import { db } from "../firebase/config";

function generateCode() {
  return Math.random().toString(36).substring(2, 8).toUpperCase();
}

function TeamCard({ teamId, userId, onDelete, onLeave, onStale }) {
  const [team, setTeam] = useState(undefined); // undefined = loading, null = not found
  const [confirming, setConfirming] = useState(false);

  useEffect(() => {
    const unsub = onSnapshot(doc(db, "teams", teamId), (snap) => {
      if (snap.exists()) {
        setTeam(snap.data());
      } else {
        setTeam(null);
        // Team was deleted externally — clean up stale reference
        if (onStale) onStale(teamId);
      }
    });
    return () => unsub();
  }, [teamId, onStale]);

  if (team === undefined) return null; // loading
  if (team === null) return null; // deleted

  const isCreator = team.createdBy === userId;
  const isSoleMember = (team.memberIds?.length || 0) <= 1;

  return (
    <div className="rounded-2xl border border-purple-100 bg-purple-50/50 px-5 py-4">
      <div className="flex items-center justify-between mb-2">
        <span className="font-black text-slate-800 text-base">{team.name}</span>
        {team.level && (
          <span className={`font-mono text-[10px] font-bold tracking-widest uppercase px-2.5 py-0.5 rounded-full border ${
            team.level === "Advanced"
              ? "text-violet-700 bg-violet-50 border-violet-200"
              : "text-emerald-700 bg-emerald-50 border-emerald-200"
          }`}>
            {team.level}
          </span>
        )}
      </div>
      <div className="flex items-center gap-4 font-mono text-xs text-slate-400">
        <span>{team.memberIds?.length || 1} member{team.memberIds?.length !== 1 ? "s" : ""}</span>
        <span className="text-slate-300">&bull;</span>
        <span>Code: <span className="font-bold text-slate-600 tracking-widest">{team.joinCode}</span></span>
      </div>
      {team.score > 0 && (
        <div className="mt-2 font-mono text-xs text-violet-600 font-bold">{team.score} pts</div>
      )}

      <div className="mt-4 pt-4 border-t border-purple-100">
        {!confirming ? (
          <button
            onClick={() => setConfirming(true)}
            className="font-mono text-[11px] font-bold tracking-widest uppercase text-red-400 hover:text-red-600 transition-colors"
          >
            {isSoleMember ? "Delete Team" : isCreator ? "Delete Team" : "Leave Team"}
          </button>
        ) : (
          <div className="flex items-center gap-3">
            <span className="font-mono text-[11px] text-slate-500">Are you sure?</span>
            <button
              onClick={() => {
                if (isSoleMember || isCreator) onDelete(teamId, team.joinCode);
                else onLeave(teamId);
              }}
              className="font-mono text-[11px] font-bold tracking-widest uppercase text-white bg-red-500 hover:bg-red-600 px-3 py-1 rounded-lg transition-colors"
            >
              {isSoleMember ? "Yes, delete" : isCreator ? "Yes, delete" : "Yes, leave"}
            </button>
            <button
              onClick={() => setConfirming(false)}
              className="font-mono text-[11px] font-bold tracking-widest uppercase text-slate-400 hover:text-slate-600 transition-colors"
            >
              Cancel
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

export default function Profile({ user }) {
  const [data, setData] = useState(undefined);
  const [loading, setLoading] = useState(true);
  const [teamName, setTeamName] = useState("");
  const [joinCode, setJoinCode] = useState("");
  const [newCode, setNewCode] = useState(null);
  const [msg, setMsg] = useState("");
  const [msgType, setMsgType] = useState("error");
  const [level, setLevel] = useState("Beginner");

  useEffect(() => {
    if (!user?.uid) return;
    const unsub = onSnapshot(
      doc(db, "users", user.uid),
      (snap) => {
        setData(snap.exists() ? snap.data() : null);
        setLoading(false);
      },
      (err) => {
        console.error("Firestore error:", err);
        setLoading(false);
      }
    );
    return () => unsub();
  }, [user]);

  const showMsg = (text, type = "error") => {
    setMsg(text);
    setMsgType(type);
    setTimeout(() => setMsg(""), 4000);
  };

  async function handleCreateTeam() {
    if (!teamName.trim()) return;
    if (data?.teamIds?.length >= 1) { showMsg("You can only be in one team."); return; }

    try {
      const code = generateCode();
      const teamRef = doc(collection(db, "teams"));
      const batch = writeBatch(db);

      batch.set(teamRef, {
        name: teamName.trim(),
        createdBy: user.uid,
        createdAt: serverTimestamp(),
        memberIds: [user.uid],
        joinCode: code,
        level,
        score: 0,
        solvedProblems: [],
      });
      batch.set(doc(db, "joinCodes", code), { teamId: teamRef.id });
      batch.set(doc(db, "users", user.uid), { teamIds: [teamRef.id] }, { merge: true });

      await batch.commit();
      setNewCode(code);
      setTeamName("");
      showMsg("Team created!", "success");
    } catch (err) {
      console.error("Create team error:", err);
      showMsg("Failed to create team: " + err.message);
    }
  }

  async function handleJoinTeam() {
    const code = joinCode.trim().toUpperCase();
    if (data?.teamIds?.length >= 1) { showMsg("You can only be in one team."); return; }

    try {
      const codeSnap = await getDoc(doc(db, "joinCodes", code));
      if (!codeSnap.exists()) { showMsg("Invalid code — double check and try again."); return; }

      const { teamId } = codeSnap.data();
      const teamSnap = await getDoc(doc(db, "teams", teamId));
      if (!teamSnap.exists()) { showMsg("Team not found."); return; }
      if (teamSnap.data().memberIds.includes(user.uid)) { showMsg("You're already in this team."); return; }

      await Promise.all([
        updateDoc(doc(db, "teams", teamId), { memberIds: arrayUnion(user.uid) }),
        setDoc(doc(db, "users", user.uid), { teamIds: [teamId] }, { merge: true }),
      ]);

      setJoinCode("");
      showMsg("Joined successfully!", "success");
    } catch (err) {
      console.error("Join team error:", err);
      showMsg("Failed to join team: " + err.message);
    }
  }

  async function handleDeleteTeam(teamId, joinCode) {
    try {
      // Nuclear: wipe teamIds entirely for current user so they're definitely freed
      await updateDoc(doc(db, "users", user.uid), { teamIds: [] });

      // Now clean up the team doc and join code
      const teamSnap = await getDoc(doc(db, "teams", teamId));
      const memberIds = teamSnap.exists()
        ? (teamSnap.data().memberIds || []).filter(uid => uid !== user.uid)
        : [];

      const batch = writeBatch(db);
      batch.delete(doc(db, "teams", teamId));
      if (joinCode) batch.delete(doc(db, "joinCodes", joinCode));
      for (const uid of memberIds) {
        batch.update(doc(db, "users", uid), { teamIds: arrayRemove(teamId) });
      }
      await batch.commit();
    } catch (err) {
      console.error("Delete team error:", err);
    }
    setNewCode(null);
    showMsg("Team deleted.", "success");
  }

  const handleStaleTeam = useCallback(async (teamId) => {
    // Team no longer exists — wipe stale reference
    try {
      await updateDoc(doc(db, "users", user.uid), { teamIds: [] });
    } catch (_) {}
  }, [user.uid]);

  async function handleLeaveTeam(teamId) {
    try {
      // Wipe user's teamIds first
      await updateDoc(doc(db, "users", user.uid), { teamIds: [] });

      const teamSnap = await getDoc(doc(db, "teams", teamId));
      if (!teamSnap.exists()) return;
      const team = teamSnap.data();
      const members = team.memberIds || [];

      if (members.length <= 1) {
        // Last member — delete the team
        const batch = writeBatch(db);
        batch.delete(doc(db, "teams", teamId));
        if (team.joinCode) batch.delete(doc(db, "joinCodes", team.joinCode));
        await batch.commit();
        showMsg("Team deleted.", "success");
      } else {
        await updateDoc(doc(db, "teams", teamId), { memberIds: arrayRemove(user.uid) });
        showMsg("Left team.", "success");
      }
    } catch (err) {
      console.error("Leave team error:", err);
      showMsg("Left team.", "success");
    }
  }

  if (!user) return <div className="p-8 text-slate-400 font-mono text-sm">No user logged in</div>;
  if (loading) return <div className="p-8 text-slate-400 font-mono text-sm animate-pulse">Loading profile...</div>;

  const hasTeam = data?.teamIds?.length >= 1;

  return (
    <div className="h-full overflow-y-auto" style={{ scrollbarWidth: "thin" }}>
      <div className="max-w-2xl mx-auto px-8 py-8 space-y-8">

        {/* Profile header */}
        <div className="flex items-center gap-5">

          <div>
            <h1 className="text-2xl font-black text-slate-900 tracking-tight">{user.displayName || "Anonymous"}</h1>
            <p className="font-mono text-xs text-slate-400 mt-0.5">{user.email}</p>
          </div>
        </div>

        {/* My team */}
        {hasTeam && (
          <div>
            <h2 className="font-mono text-[10px] font-bold tracking-widest uppercase text-slate-400 mb-3">My Team</h2>
            <div className="space-y-3">
              {data.teamIds.map(id => (
                <TeamCard key={id} teamId={id} userId={user.uid} onDelete={handleDeleteTeam} onLeave={handleLeaveTeam} onStale={handleStaleTeam} />
              ))}
            </div>
          </div>
        )}

        {/* Create / Join */}
        {!hasTeam && (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">

            {/* Create team */}
            <div className="rounded-2xl border border-slate-100 bg-white/50 px-5 py-5 space-y-4">
              <h2 className="font-mono text-[10px] font-bold tracking-widest uppercase text-slate-400">Create Team</h2>

              <input
                value={teamName}
                onChange={e => setTeamName(e.target.value)}
                placeholder="Team name"
                className="w-full px-3 py-2 rounded-xl border border-slate-200 bg-white font-mono text-sm text-slate-700 outline-none focus:border-violet-400 transition-colors placeholder:text-slate-300"
              />

              <div>
                <p className="font-mono text-[10px] font-bold tracking-widest uppercase text-slate-400 mb-2">Level</p>
                <div className="flex gap-2">
                  {["Beginner", "Advanced"].map(l => (
                    <button
                      key={l}
                      onClick={() => setLevel(l)}
                      className={`flex-1 py-2 rounded-xl font-mono text-xs font-bold tracking-widest uppercase transition-all border ${
                        level === l
                          ? l === "Advanced"
                            ? "bg-violet-700 text-white border-violet-700"
                            : "bg-emerald-600 text-white border-emerald-600"
                          : "bg-white text-slate-400 border-slate-200 hover:border-slate-300"
                      }`}
                    >
                      {l}
                    </button>
                  ))}
                </div>
              </div>

              <button
                onClick={handleCreateTeam}
                disabled={!teamName.trim()}
                className="w-full py-2 rounded-xl font-mono text-xs font-bold tracking-widest uppercase bg-violet-700 text-white hover:bg-violet-800 disabled:bg-slate-200 disabled:text-slate-400 disabled:cursor-not-allowed transition-all"
              >
                Create Team
              </button>

              {newCode && (
                <div className="rounded-xl bg-violet-50 border border-violet-200 px-4 py-3">
                  <p className="font-mono text-[10px] text-violet-500 uppercase tracking-widest mb-1">Share this code</p>
                  <p className="font-black text-2xl text-violet-700 tracking-widest">{newCode}</p>
                </div>
              )}
            </div>

            {/* Join team */}
            <div className="rounded-2xl border border-slate-100 bg-white/50 px-5 py-5 space-y-4">
              <h2 className="font-mono text-[10px] font-bold tracking-widest uppercase text-slate-400">Join Team</h2>

              <input
                value={joinCode}
                onChange={e => setJoinCode(e.target.value.toUpperCase())}
                placeholder="6-CHARACTER CODE"
                maxLength={6}
                className="w-full px-3 py-2 rounded-xl border border-slate-200 bg-white font-mono text-sm text-slate-700 outline-none focus:border-violet-400 transition-colors placeholder:text-slate-300 tracking-widest uppercase"
              />

              <button
                onClick={handleJoinTeam}
                disabled={joinCode.length !== 6}
                className="w-full py-2 rounded-xl font-mono text-xs font-bold tracking-widest uppercase bg-slate-800 text-white hover:bg-slate-900 disabled:bg-slate-200 disabled:text-slate-400 disabled:cursor-not-allowed transition-all"
              >
                Join Team
              </button>
            </div>
          </div>
        )}

        {/* Status message */}
        {msg && (
          <div className={`rounded-xl px-4 py-3 font-mono text-xs font-bold tracking-wide border ${
            msgType === "success"
              ? "bg-emerald-50 border-emerald-200 text-emerald-700"
              : "bg-red-50 border-red-200 text-red-700"
          }`}>
            {msg}
          </div>
        )}

      </div>
    </div>
  );
}