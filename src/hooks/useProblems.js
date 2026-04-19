import { useEffect, useState } from "react";
import { getProblems } from "../services/firebaseService";

export const useProblems = () => {
  const [problems, setProblems] = useState([]);

  useEffect(() => {
    getProblems().then(setProblems);
  }, []);

  return problems;
};