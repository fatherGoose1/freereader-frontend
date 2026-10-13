"use client";
import { use, useState } from "react";
import Link from "next/link";
import { useEdu } from "../../EduProvider";
import { eduFetch } from "../../client";
import styles from "../../edu.module.css";

export default function Invitation({ params }: { params: Promise<{ token: string }> }) {
  const { token } = use(params);
  const { refresh, selectSchool, path, session, userId } = useEdu();
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [accepted, setAccepted] = useState(false);
  return <main className={styles.main}><section className={styles.card}><h1>Join your school</h1><p>Signed in as {session?.user.email}. This invitation must match your account email.</p>
    {error && <p role="alert" className={styles.error}>{error}</p>}
    {accepted ? <Link className={styles.primary} href={path()}>Open school dashboard</Link> : <button className={styles.primary} disabled={busy} onClick={async () => {
      setBusy(true); setError("");
      try { const result = await eduFetch<{ schoolId: string }>("invitations/accept", userId, { method: "POST", body: JSON.stringify({ token }) }); await refresh(); selectSchool(result.schoolId); setAccepted(true); }
      catch (error) { setError((error as Error).message); }
      finally { setBusy(false); }
    }}>{busy ? "Joining…" : "Accept invitation"}</button>}
  </section></main>;
}
