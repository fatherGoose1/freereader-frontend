"use client";
import Link from "next/link";
import { useState } from "react";
import { useEdu } from "./EduProvider";
import { useDashboard } from "./useDashboard";
import { eduFetch } from "./client";
import { dateLabel } from "./model";
import styles from "./edu.module.css";

export default function Dashboard() {
  const { path, userId } = useEdu();
  const { school, data, error, reload } = useDashboard();
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  if (!school) return <main className={styles.main}><h1>Welcome to FreeReader EDU</h1><p>Open your school's invitation link to join. If you have already joined, wait for your school account to finish loading.</p></main>;
  const staff = school.role !== "student";
  return <main className={styles.main}><div className={styles.row}><h1>{school.name}</h1><span className={styles.status}>{school.role}</span></div>
    <p className={styles.muted}>Reading assignments · {school.timezone}</p>
    {(error || message) && <p role="alert" className={styles.error}>{error || message}<button onClick={reload}>Reload</button></p>}
    <div className={styles.split}><section className={styles.card}><h2>{staff ? "Your classes" : "Enrolled classes"}</h2>
      <ul className={styles.list}>{data?.classes.map((item) => <li key={item.id}>{staff ? <Link href={path(`classes/${item.id}`)}>{item.name}</Link> : item.name}<div className={styles.muted}>{item.term}</div></li>)}</ul>
      {staff && <form className={styles.form} onSubmit={async (event) => {
        event.preventDefault(); const form = event.currentTarget; const values = new FormData(form); setBusy(true); setMessage("");
        try { await eduFetch(`schools/${school.id}/classes`, userId, { method: "POST", body: JSON.stringify({ name: values.get("name"), term: values.get("term") }) }); form.reset(); reload(); }
        catch (error) { setMessage((error as Error).message); } finally { setBusy(false); }
      }}><label>Class name<input name="name" required maxLength={200} placeholder="Grade 7 English" /></label><label>Term<input name="term" maxLength={100} placeholder="Fall 2026" /></label><button disabled={busy}>Create class</button></form>}
    </section><section className={styles.card}><div className={styles.row}><h2>Reading assignments</h2>{staff && <Link className={styles.primary} href={path("assignments/new")}>New assignment</Link>}</div>
      {!data && !error && <p role="status">Loading assignments…</p>}
      {data && !data.assignments.length && <p>No assignments yet.</p>}
      <ul className={styles.list}>{data?.assignments.map((item) => <li key={item.id}><div className={styles.row}><Link href={path(item.versionIds[0] ? `assignments/${item.id}/reader/${item.versionIds[0]}` : `assignments/${item.id}`)}><strong>{item.title}</strong></Link><span className={styles.status}>{item.status}</span></div>
        <div className={styles.muted}>Due {dateLabel(item.dueAt, school.timezone)} · {item.classIds.map((id) => data.classes.find((cls) => cls.id === id)?.name).filter(Boolean).join(", ")}</div>
        {item.canManage && <div className={styles.row}><Link href={path(`assignments/${item.id}`)}>Manage / share</Link><Link href={path(`assignments/${item.id}/edit`)}>Edit assignment</Link></div>}
      </li>)}</ul>
    </section></div>
  </main>;
}
