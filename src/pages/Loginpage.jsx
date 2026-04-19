import { useState } from "react";
import { signInWithPopup } from "firebase/auth";
import { auth, googleProvider } from "../firebase/config";
import { useNavigate } from "react-router-dom";
import { doc, setDoc, serverTimestamp } from "firebase/firestore";
import { db } from "../firebase/config";

export default function Login() {
  const navigate = useNavigate();
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const handleGoogleLogin = async () => {
    setError("");
    setLoading(true);
    try {
      const result = await signInWithPopup(auth, googleProvider);
      const user = result.user;

      await setDoc(doc(db, "users", user.uid), {
        email: user.email,
        displayName: user.displayName,
        photoURL: user.photoURL,
        lastLogin: serverTimestamp(),
      }, { merge: true });

      navigate("/");
    } catch (err) {
      console.error("Login error:", err.code, err.message);
      if (err.code === "auth/unauthorized-domain") {
        setError("This domain is not authorized for sign-in. Contact the admin.");
      } else if (err.code === "auth/popup-blocked") {
        setError("Popup was blocked by your browser. Please allow popups for this site.");
      } else if (err.code === "auth/popup-closed-by-user") {
        setError("");
      } else if (err.code === "auth/internal-error" || err.message?.includes("access_denied")) {
        setError("Access denied — the app may not be published yet. Contact the admin.");
      } else {
        setError(err.message || "Sign-in failed. Please try again.");
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex flex-col items-center justify-center h-full gap-6">
      <div className="text-center">
        <h1 className="text-3xl font-black text-slate-900 tracking-tight">CInT Live</h1>
        <p className="font-mono text-xs text-slate-400 mt-1 tracking-widest uppercase">Programming Contest</p>
      </div>

      <button
        onClick={handleGoogleLogin}
        disabled={loading}
        className="flex items-center gap-3 px-6 py-3 rounded-xl bg-white border border-slate-200 hover:border-slate-300 hover:shadow-sm transition-all disabled:opacity-50 disabled:cursor-not-allowed"
      >
        <svg width="18" height="18" viewBox="0 0 48 48"><path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"/><path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"/><path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"/><path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"/></svg>
        <span className="font-mono text-sm font-bold text-slate-700">
          {loading ? "Signing in..." : "Continue with Google"}
        </span>
      </button>

      {error && (
        <div className="max-w-sm rounded-xl bg-red-50 border border-red-200 px-4 py-3 text-center">
          <p className="font-mono text-xs text-red-700">{error}</p>
        </div>
      )}
    </div>
  );
}