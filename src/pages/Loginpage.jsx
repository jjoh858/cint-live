import { signInWithPopup } from "firebase/auth";
import { auth, googleProvider } from "../firebase/config";
import { useNavigate } from "react-router-dom";
import { doc, setDoc, serverTimestamp } from "firebase/firestore"; // 👈 add this
import { db } from "../firebase/config";                           // 👈 add this

export default function Login() {
  const navigate = useNavigate();

  const handleGoogleLogin = async () => {
    try {
      const result = await signInWithPopup(auth, googleProvider); // 👈 capture result
      const user = result.user;

      // 👈 add this block — creates/updates the user doc on every login
      await setDoc(doc(db, "users", user.uid), {
        email: user.email,
        displayName: user.displayName,
        photoURL: user.photoURL,
        lastLogin: serverTimestamp(),
      }, { merge: true }); // merge:true protects existing fields like teamIds

      navigate("/");
    } catch (err) {
      console.log(err.message);
      alert(err.message);
    }
  };

  return (
    <div className="flex flex-col items-center mt-20 gap-4">
      <h1 className="text-2xl font-bold">Login</h1>
      <button
        onClick={handleGoogleLogin}
        className="bg-red-500 text-white px-6 py-2 rounded"
      >
        Continue with Google
      </button>
    </div>
  );
}