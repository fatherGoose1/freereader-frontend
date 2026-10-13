"use client";
import { useEffect } from "react";
import { useEdu } from "../../EduProvider";
import { safeEduReturn } from "../../security";

export default function Callback() {
  const { session, path } = useEdu();
  useEffect(() => {
    if (!session) return;
    const returnTo = sessionStorage.getItem("freereader-edu-return");
    sessionStorage.removeItem("freereader-edu-return");
    window.location.replace(safeEduReturn(returnTo, window.location.origin, path()));
  }, [session]);
  return <p role="status">Returning to your school…</p>;
}
