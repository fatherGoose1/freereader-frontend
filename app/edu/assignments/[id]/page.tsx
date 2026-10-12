"use client";
import Link from "next/link";
import { use, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useEdu } from "../../EduProvider";
import { eduFetch } from "../../client";
import { dateLabel, type Assignment, type DocumentVersion, type Progress } from "../../model";
import AssignmentReader from "../../AssignmentReader";
import styles from "../../edu.module.css";

export default function AssignmentPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const { schools, path, selectSchool, userId } = useEdu();
  const router = useRouter();
  const [detail, setDetail] = useState<{ assignment: Assignment; available: boolean; documents: DocumentVersion[] } | null>(null);
  const [active, setActive] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [report, setReport] = useState<{ students: { userId: string; email: string }[]; progress: Progress[] } | null>(null);
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    const controller = new AbortController(); setDetail(null); setReport(null); setActive(""); setError("");
    void eduFetch<{ assignment: Assignment; available: boolean; documents: DocumentVersion[] }>(`assignments/${id}`, userId, { signal: controller.signal })
      .then((detail) => { if (!controller.signal.aborted) { setDetail(detail); selectSchool(detail.assignment.schoolId); } })
      .catch((error) => { if (!controller.signal.aborted) setError(error.message); });
    return () => controller.abort();
  }, [id, attempt]);
  const school = schools.find((school) => school.id === detail?.assignment.schoolId);
  return <main className={styles.main}>{error && <p role="alert" className={styles.error}>{error}<button onClick={() => setAttempt((value) => value + 1)}>Retry</button></p>}
    {detail && school ? <><h1>{detail.assignment.title}</h1><p className={styles.muted}>Available {dateLabel(detail.assignment.availableAt, school.timezone)} · Due {dateLabel(detail.assignment.dueAt, school.timezone)}{detail.assignment.closesAt && ` · Closes ${dateLabel(detail.assignment.closesAt, school.timezone)}`}</p>
      {school.role !== "student" && <div className={styles.row} style={{ marginBottom: 20 }}><span className={styles.status}>{detail.assignment.status}</span>
        <button onClick={() => void navigator.clipboard.writeText(`${window.location.origin}${path(`assignments/${id}`)}`).catch(() => setError("Copy the assignment address from your browser."))}>Copy student link</button>
        {detail.assignment.canManage && <><Link href={path(`assignments/${id}/edit`)}>Edit assignment</Link><button disabled={busy} onClick={async () => {
          if (!window.confirm("Archive this assignment and remove student access? Reading records are retained.")) return;
          setBusy(true); try { await eduFetch(`assignments/${id}`, userId, { method: "DELETE" }); router.push(path()); }
          catch (error) { setError((error as Error).message); } finally { setBusy(false); }
        }}>Archive assignment</button><button disabled={busy} onClick={async () => {
          setBusy(true); try { setReport(await eduFetch(`assignments/${id}/progress`, userId)); } catch (error) { setError((error as Error).message); } finally { setBusy(false); }
        }}>View student activity</button></>}
      </div>}
      {detail.assignment.instructions && <section className={styles.card}><h2>Instructions</h2><p style={{ whiteSpace: "pre-wrap" }}>{detail.assignment.instructions}</p></section>}
      {!detail.available ? <p className={styles.notice}>The reading is not available yet, or its access window has closed.</p> : <>
        <div className={styles.row} style={{ marginBottom: 20 }}>{detail.documents.map((doc) => <button key={doc.id} className={active === doc.id ? styles.primary : ""} onClick={() => setActive(doc.id)}>{doc.title}</button>)}</div>
        {active ? <AssignmentReader key={`${id}:${active}`} assignment={detail.assignment} version={detail.documents.find((doc) => doc.id === active)!} /> : <p>Select a document to start reading or listening.</p>}
      </>}
      {report && <section className={styles.card}><h2>Student activity</h2><p className={styles.muted}>Position is a reading checkpoint, not proof of comprehension. Completion is explicitly marked by the student.</p><div className={styles.scroll}><table className={styles.table}><thead><tr><th>Student</th>{detail.documents.map((doc) => <th key={doc.id}>{doc.title}</th>)}</tr></thead><tbody>{report.students.map((student) => <tr key={student.userId}><td>{student.email}</td>{detail.documents.map((doc) => {
        const progress = report.progress.find((row) => row.userId === student.userId && row.versionId === doc.id);
        return <td key={doc.id}>{progress ? progress.completedAt ? "Marked complete" : `Position ${Math.round(100 * progress.blockIndex / Math.max(1, doc.blockCount))}%` : "Not started"}</td>;
      })}</tr>)}</tbody></table></div></section>}
    </> : !error && <p role="status">Loading assignment…</p>}
  </main>;
}
