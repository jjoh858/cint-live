import { db } from "../firebase/config";
import { collection, getDocs } from "firebase/firestore";

export const getProblems = async () => {
  const snapshot = await getDocs(collection(db, "problems"));
  return snapshot.docs.map(doc => ({
    id: doc.id,
    ...doc.data()
  }));
};