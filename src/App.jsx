import { useEffect, useState } from "react";
import { Routes, Route } from "react-router-dom";
import { onAuthStateChanged, signOut } from "firebase/auth";
import { doc, getDoc, setDoc } from "firebase/firestore";

import { auth, db } from "./firebase/config";
import { useProblems } from "./hooks/useProblems";

import Layout from "./components/layout";

import Home from "./pages/Homepage";
import ProblemPage from "./pages/Problems";
import ProblemView from "./components/ListOfProblems";
import Leaderboard  from "./pages/Leaderboard";
import Login from "./pages/Loginpage";
import Navbar from "./components/NavBar";
import Profile from "./pages/Profile";

// 🔥 wrapper for protected pages — defined inside App so it can access problems
function ProtectedLayout({ user, problems, children }) {
  return <Layout user={user} problems={problems}>{children}</Layout>;
}

export default function App() {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const rawProblems = useProblems();
  const problems = [...rawProblems].sort((a, b) => Number(a.id) - Number(b.id));

  useEffect(() => {
  const unsub = onAuthStateChanged(auth, async (user) => {
    setUser(user);

    if (user) {
      const userRef = doc(db, "users", user.uid);
      const userSnap = await getDoc(userRef);

      // 🔥 ONLY create if doesn't exist
      if (!userSnap.exists()) {
        await setDoc(userRef, {
          name: user.displayName || "Anonymous",
          email: user.email,
          photoURL: user.photoURL || "",
          score: 0,
          createdAt: new Date(),
        });
      }
    }

    setLoading(false);
  });

  return () => unsub();
}, []);

  const logout = async () => {
    await signOut(auth);
  };

  if (loading) return <div>Loading...</div>;

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100vh", overflow: "hidden" }}>
  <Navbar user={user} logout={logout} />
  <div style={{ flex: 1, overflow: "hidden", minHeight: 0, height: "100%" }}>
    <Routes>
   
        <Route path="/login" element={<Login />} />

        <Route
          path="/"
          element={
            user ? (
              <ProtectedLayout user={user} problems={problems}>
                <Home user={user} />
              </ProtectedLayout>
            ) : (
              <Login />
            )
          }
        />

        <Route
          path="/problems"
          element={
            user ? (
              <Layout user={user} showSidebar={true} problems={problems}>
                <ProblemPage />
              </Layout>
            ) : (
              <Login />
            )
          }
        />

        <Route
          path="/problems/:id"
          element={
            user ? (
              <Layout user={user} showSidebar={true} problems={problems}>
                <ProblemView />
              </Layout>
            ) : (
              <Login />
            )
          }
        />

        <Route
          path="/leaderboard"
          element={
            user ? (
              <ProtectedLayout user={user} problems={problems}>
                <Leaderboard />
              </ProtectedLayout>
            ) : (
              <Login />
            )
          }
        />

        <Route
          path="/profile"
          element={
            user ? (
              <Layout user={user} showSidebar={false} problems={problems}>
                <Profile user={user} />
              </Layout>
            ) : (
              <Login />
            )
          }
        />
      </Routes>
      </div>
    </div>
  );
}