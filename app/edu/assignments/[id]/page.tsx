"use client";
import Link from "next/link";
import { use, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useEdu } from "../../EduProvider";
import { eduFetch } from "../../client";
import { dateLabel, type Assignment, type DocumentVersion, type Progress } from "../../model";
import styles from "../../edu.module.css";

export default function AssignmentPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const { schools, path, selectSchool, userId } = useEdu();
  const router = useRouter();
  const [detail, setDetail] = useState<{ assignment: Assignment; available: boolean; documents: DocumentVersion[] } | null>(null);
  const [link, setLink] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [report, setReport] = useState<{ students: { userId: string; email: string }[]; progress: Progress[] } | null>(null);
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    const controller = new AbortController(); setDetail(null); setReport(null); setLink(""); setError("");
    void eduFetch<{ assignment: Assignment; available: boolean; documents: DocumentVersion[] }>(`assignments/${id}`, userId, { signal: controller.signal })
      .then((detail) => { if (!controller.signal.aborted) { setDetail(detail); selectSchool(detail.assignment.schoolId); } })
      .catch((error) => { if (!controller.signal.aborted) setError(error.message); });
    return () => controller.abort();
  }, [id, attempt]);
  const school = schools.find((school) => school.id === detail?.assignment.schoolId);
  return <main className={styles.main}>{error && <p role="alert" className={styles.error}>{error}<button onClick={() => setAttempt((value) => value + 1)}>Retry</button></p>}
    {detail && school ? <><h1>{detail.assignment.title}</h1><p className={styles.muted}>Available {dateLabel(detail.assignment.availableAt, school.timezone)} · Due {dateLabel(detail.assignment.dueAt, school.timezone)}{detail.assignment.closesAt && ` · Closes ${dateLabel(detail.assignment.closesAt, school.timezone)}`}</p>
      {school.role !== "student" && <div className={styles.row} style={{ marginBottom: 20 }}><span className={styles.status}>{detail.assignment.status}</span>
        {detail.assignment.canManage && <><button disabled={busy || detail.assignment.status !== "published"} onClick={async () => {
          setBusy(true); setError("");
          try { const result = await eduFetch<{ share: { url: string } }>(`assignments/${id}/share`, userId, { method: "POST", body: "{}" }); setLink(result.share.url); await navigator.clipboard.writeText(result.share.url); }
          catch (error) { setError((error as Error).message); } finally { setBusy(false); }
        }}>Copy student link · no login</button><button disabled={busy} onClick={async () => {
          if (!window.confirm("Revoke the current student link? Anyone using it will lose access to new requests.")) return;
          setBusy(true); try { await eduFetch(`assignments/${id}/share`, userId, { method: "DELETE" }); setLink(""); }
          catch (error) { setError((error as Error).message); } finally { setBusy(false); }
        }}>Revoke student link</button><button disabled={busy || detail.assignment.status !== "published"} onClick={async () => {
          if (!window.confirm("Replace the student link? The previous link will stop working.")) return;
          setBusy(true); try { const result = await eduFetch<{ share: { url: string } }>(`assignments/${id}/share`, userId, { method: "POST", body: JSON.stringify({ regenerate: true }) }); setLink(result.share.url); }
          catch (error) { setError((error as Error).message); } finally { setBusy(false); }
        }}>Regenerate student link</button></>}
        {detail.assignment.canManage && <><Link href={path(`assignments/${id}/edit`)}>Edit assignment</Link><button disabled={busy} onClick={async () => {
          if (!window.confirm("Archive this assignment and remove student access? Reading records are retained.")) return;
          setBusy(true); try { await eduFetch(`assignments/${id}`, userId, { method: "DELETE" }); router.push(path()); }
          catch (error) { setError((error as Error).message); } finally { setBusy(false); }
        }}>Archive assignment</button><button disabled={busy} onClick={async () => {
          setBusy(true); try { setReport(await eduFetch(`assignments/${id}/progress`, userId)); } catch (error) { setError((error as Error).message); } finally { setBusy(false); }
        }}>View student activity</button></>}
      </div>}
      {link && <div className={styles.notice}><p>Anyone with this link can read this assignment without creating an account.</p><input readOnly aria-label="Student reading link" value={link} style={{ width: "100%" }} /></div>}
      {detail.assignment.instructions && <section className={styles.card}><h2>Instructions</h2><p style={{ whiteSpace: "pre-wrap" }}>{detail.assignment.instructions}</p></section>}
      {!detail.available ? <p className={styles.notice}>The reading is not available yet, or its access window has closed.</p> : <>
        <div className={styles.row} style={{ marginBottom: 20 }}>{detail.documents.map((doc) => <Link key={doc.id} className={styles.primary} href={path(`assignments/${id}/reader/${doc.id}`)}>Read {doc.title}</Link>)}</div>
      </>}
      {report && <section className={styles.card}><h2>Student activity</h2><p className={styles.muted}>Position is a reading checkpoint, not proof of comprehension. Completion is explicitly marked by the student.</p><div className={styles.scroll}><table className={styles.table}><thead><tr><th>Student</th>{detail.documents.map((doc) => <th key={doc.id}>{doc.title}</th>)}</tr></thead><tbody>{report.students.map((student) => <tr key={student.userId}><td>{student.email}</td>{detail.documents.map((doc) => {
        const progress = report.progress.find((row) => row.userId === student.userId && row.versionId === doc.id);
        return <td key={doc.id}>{progress ? progress.completedAt ? "Marked complete" : `Position ${Math.round(100 * progress.blockIndex / Math.max(1, doc.blockCount))}%` : "Not started"}</td>;
      })}</tr>)}</tbody></table></div></section>}
    </> : !error && <p role="status">Loading assignment…</p>}
  </main>;
}
