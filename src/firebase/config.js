import { initializeApp } from "firebase/app";
import { getAuth, GoogleAuthProvider } from "firebase/auth";
import { getFirestore } from "firebase/firestore";


const firebaseConfig = {
  apiKey: "AIzaSyCRO6h1TAKxoj1RVM9MoYhAuo7kz-apJVo",
  authDomain: "cint-live.firebaseapp.com",
  projectId: "cint-live",
  storageBucket: "cint-live.firebasestorage.app",
  messagingSenderId: "1074290783330",
  appId: "1:1074290783330:web:3c7def48003db1b0bb8d3b"
};

const app = initializeApp(firebaseConfig);
export { app };
export const auth = getAuth(app);
export const googleProvider = new GoogleAuthProvider();
export const db = getFirestore(app);

// Optional: request extra scopes
// provider.addScope("https://www.googleapis.com/auth/contacts.readonly");