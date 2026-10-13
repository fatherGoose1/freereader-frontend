"use client";
import Link from "next/link";
import { useRef, useState } from "react";
import { useEdu } from "./EduProvider";
import { useDashboard } from "./useDashboard";
import { eduFetch } from "./client";
import { dateLabel } from "./model";
import UiIcon from "./UiIcon";
import styles from "./edu.module.css";

export default function Dashboard() {
  const { path, userId } = useEdu();
  const { school, data, error, reload } = useDashboard();
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const classCreator = useRef<HTMLDetailsElement>(null);
  if (!school) return <main className={styles.main}><section className={styles.emptyState}><UiIcon name="book" /><h1>Welcome to FreeReader EDU</h1><p>Open your school invitation to join.</p></section></main>;
  const staff = school.role !== "student";
  return <main className={styles.main}>
    <div className={styles.pageHeading}>
      <div><span className={styles.eyebrow}>{staff ? "Teaching workspace" : "Your reading space"}</span><h1>{school.name}</h1><p className={styles.muted}>{staff ? "Everything your classes are reading, in one place." : "Your assigned readings, ready when you are."}</p></div>
      {staff && <Link className={styles.primary} href={path("assignments/new")}><UiIcon name="plus" />New assignment</Link>}
    </div>
    {(error || message) && <p role="alert" className={styles.error}>{error || message}<button onClick={reload}>Try again</button></p>}
    <div className={styles.dashboardGrid}>
      <section className={`${styles.card} ${styles.readingsCard}`} aria-labelledby="readings-heading">
        <div className={styles.sectionHeading}><div><span className={styles.sectionEyebrow}>Your library</span><h2 id="readings-heading">Assignments</h2></div>{data && <span className={styles.countBadge}>{data.assignments.length}</span>}</div>
        {!data && !error && <p role="status" className={styles.muted}>Loading assignments…</p>}
        {data && !data.assignments.length && <div className={styles.emptyState}><div className={styles.featureIcon}><UiIcon name="book" /></div><h3>Nothing assigned yet</h3><p className={styles.muted}>{staff ? "Add a reading to get started." : "New readings will appear here."}</p>{staff && <Link href={path("assignments/new")} className={styles.textAction}>Create an assignment <UiIcon name="arrow" /></Link>}</div>}
        <ul className={styles.assignmentList}>{data?.assignments.map((item) => {
          const readPath = path(item.versionIds[0] ? `assignments/${item.id}/reader/${item.versionIds[0]}` : `assignments/${item.id}`);
          const classes = item.classIds.map((id) => data.classes.find((cls) => cls.id === id)?.name).filter(Boolean).join(", ");
          return <li className={styles.assignmentItem} key={item.id}>
            <div className={styles.assignmentArtwork} aria-hidden="true"><UiIcon name="book" /></div>
            <div className={styles.assignmentInfo}><div className={styles.assignmentTitleRow}><Link className={styles.assignmentTitle} href={readPath}>{item.title}</Link><span className={`${styles.status} ${item.status === "published" ? styles.published : styles.draft}`}>{item.status === "published" ? "Published" : item.status === "archived" ? "Archived" : "Draft"}</span></div>
              <div className={styles.assignmentMeta}><span><UiIcon name="calendar" />Due {dateLabel(item.dueAt, school.timezone)}</span>{classes && <span><UiIcon name="users" />{classes}</span>}</div>
            </div>
            {item.canManage ? <Link className={styles.manageAction} href={path(`assignments/${item.id}`)}>Manage <UiIcon name="arrow" /></Link> : <Link className={styles.manageAction} href={readPath}>Read <UiIcon name="arrow" /></Link>}
          </li>;
        })}</ul>
      </section>
      <aside className={styles.sideStack}><section className={styles.card} aria-labelledby="classes-heading">
        <div className={styles.sectionHeading}><div><span className={styles.sectionEyebrow}>Community</span><h2 id="classes-heading">{staff ? "Classes" : "My classes"}</h2></div>{data && <span className={styles.countBadge}>{data.classes.length}</span>}</div>
        {!data && !error && <p className={styles.muted}>Loading classes…</p>}
        {data && !data.classes.length && <p className={styles.muted}>No classes yet.</p>}
        <ul className={styles.classList}>{data?.classes.map((item) => <li key={item.id}>{staff ? <Link href={path(`classes/${item.id}`)}><span className={styles.classSymbol}><UiIcon name="users" /></span><span><strong>{item.name}</strong>{item.term && <small>{item.term}</small>}</span><UiIcon name="arrow" /></Link> : <div className={styles.classStatic}><span className={styles.classSymbol}><UiIcon name="users" /></span><span><strong>{item.name}</strong>{item.term && <small>{item.term}</small>}</span></div>}</li>)}</ul>
        {staff && <details ref={classCreator} className={styles.inlineDisclosure}><summary><UiIcon name="plus" /> Create a class</summary><form className={styles.form} onSubmit={async (event) => {
          event.preventDefault(); const form = event.currentTarget; const values = new FormData(form); setBusy(true); setMessage("");
          try { await eduFetch(`schools/${school.id}/classes`, userId, { method: "POST", body: JSON.stringify({ name: values.get("name"), term: values.get("term") }) }); form.reset(); if (classCreator.current) classCreator.current.open = false; reload(); }
          catch (error) { setMessage((error as Error).message); } finally { setBusy(false); }
        }}><label>Class name<input name="name" required maxLength={200} placeholder="Grade 7 English" /></label><label>Term <span className={styles.optional}>(optional)</span><input name="term" maxLength={100} placeholder="Fall 2026" /></label><button type="submit" disabled={busy} className={styles.primary}>Create class</button></form></details>}
      </section></aside>
    </div>
  </main>;
}
