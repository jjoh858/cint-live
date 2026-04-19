import { signInWithPopup } from "firebase/auth";
import { auth, googleProvider } from "../firebase/config";

export default function LoginButton() {
  const login = async () => {
    await signInWithPopup(auth, googleProvider);
  };

  return (
    <button onClick={login} style={{ padding: 10 }}>
      Login with Google
    </button>
  );
}