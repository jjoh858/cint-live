import { getFirestore, doc, setDoc, getDoc } from "firebase/firestore";
import { updateDoc, increment } from 'firebase/firestore';
import { app } from "./firebase/config";

export const db = getFirestore(app);

// Save or update a user after they sign in
export async function saveUser(user) {
  await setDoc(doc(db, "users", user.uid), {
    name: user.displayName,
    email: user.email,
    photo: user.photoURL,
    lastLogin: new Date(),
  }, { merge: true }); // merge: true won't overwrite existing fields
}

// Get a user's data
export async function getUser(uid) {
  const snap = await getDoc(doc(db, "users", uid));
  return snap.exists() ? snap.data() : null;
}

// Increment button click counter
export async function incrementButtonCount(uid) {
  const userRef = doc(db, "users", uid);
  await updateDoc(userRef, {
    buttonClicks: increment(1),
  });
}