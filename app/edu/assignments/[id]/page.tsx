"use client";
import Link from "next/link";
import { use, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useEdu } from "../../EduProvider";
import { eduFetch } from "../../client";
import { dateLabel, type Assignment, type DocumentVersion, type Progress } from "../../model";
import UiIcon from "../../UiIcon";
import styles from "../../edu.module.css";

type Detail = { assignment: Assignment; available: boolean; documents: DocumentVersion[] };
type Share = { enabled: boolean; url: string | null };
type Report = { students: { userId: string; email: string }[]; progress: Progress[] };

export default function AssignmentPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const { schools, path, selectSchool, userId } = useEdu();
  const router = useRouter();
  const [detail, setDetail] = useState<Detail | null>(null);
  const [share, setShare] = useState<Share | null>(null);
  const [shareLoaded, setShareLoaded] = useState(false);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [report, setReport] = useState<Report | null>(null);
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    const controller = new AbortController(); setDetail(null); setReport(null); setShare(null); setShareLoaded(false); setError("");
    void eduFetch<Detail>(`assignments/${id}`, userId, { signal: controller.signal })
      .then((result) => { if (!controller.signal.aborted) { setDetail(result); selectSchool(result.assignment.schoolId); } })
      .catch((error) => { if (!controller.signal.aborted) setError(error.message); });
    return () => controller.abort();
  }, [id, attempt, userId]);
  useEffect(() => {
    if (!detail?.assignment.canManage || detail.assignment.status !== "published") return;
    const controller = new AbortController();
    void eduFetch<{ share: Share }>(`assignments/${id}/share`, userId, { signal: controller.signal })
      .then((result) => { if (!controller.signal.aborted) { setShare(result.share); setShareLoaded(true); } })
      .catch((error) => { if (!controller.signal.aborted) { setShareLoaded(true); setError(error.message); } });
    return () => controller.abort();
  }, [id, detail?.assignment.canManage, detail?.assignment.status, userId]);

  async function copy(url: string) {
    try { await navigator.clipboard.writeText(url); setCopied(true); }
    catch { setCopied(false); /* The visible link is still selectable. */ }
  }
  async function createShare(regenerate = false) {
    setBusy(true); setError(""); setCopied(false);
    try {
      const result = await eduFetch<{ share: Share }>(`assignments/${id}/share`, userId, { method: "POST", body: JSON.stringify(regenerate ? { regenerate: true } : {}) });
      setShare(result.share); if (!regenerate && result.share.url) await copy(result.share.url);
    } catch (error) { setError((error as Error).message); } finally { setBusy(false); }
  }
  async function revoke() {
    if (!window.confirm("Turn off this link? Anyone using it will lose access. You can create a new one later.")) return;
    setBusy(true); setError("");
    try { await eduFetch(`assignments/${id}/share`, userId, { method: "DELETE" }); setShare({ enabled: false, url: null }); setCopied(false); }
    catch (error) { setError((error as Error).message); } finally { setBusy(false); }
  }
  async function archive() {
    if (!window.confirm("Archive this assignment and remove student access? Reading records will be kept.")) return;
    setBusy(true); setError("");
    try { await eduFetch(`assignments/${id}`, userId, { method: "DELETE" }); router.push(path()); }
    catch (error) { setError((error as Error).message); } finally { setBusy(false); }
  }
  const school = schools.find((school) => school.id === detail?.assignment.schoolId);
  return <main className={styles.main}>
    <div className={styles.breadcrumbs}><Link href={path()}>Assignments</Link><UiIcon name="chevron" /><span>{detail?.assignment.title ?? "Loading"}</span></div>
    {error && <p role="alert" className={styles.error}>{error}<button onClick={() => { setAttempt((value) => value + 1); setError(""); }}>Retry</button></p>}
    {detail && school ? <>
      <div className={styles.pageHeading}>
        <div><span className={styles.eyebrow}>{school.name}</span><div className={styles.titleWithStatus}><h1>{detail.assignment.title}</h1><span className={`${styles.status} ${detail.assignment.status === "published" ? styles.published : styles.draft}`}>{detail.assignment.status}</span></div><p className={styles.muted}>Due {dateLabel(detail.assignment.dueAt, school.timezone)}</p></div>
        {detail.assignment.canManage && <div className={styles.pageActions}><Link className={styles.secondary} href={path(`assignments/${id}/edit`)}><UiIcon name="edit" /> Edit assignment</Link><details className={styles.detailsMenu}><summary aria-label="More assignment actions"><UiIcon name="more" /></summary><div className={styles.detailsPanel}><button disabled={busy} onClick={() => void archive()}>Archive assignment</button></div></details></div>}
      </div>
      <div className={styles.manageLayout}>
        <div className={styles.manageMain}>
          <section className={styles.card}><div className={styles.sectionHeading}><div><span className={styles.sectionEyebrow}>Start reading</span><h2>Reading material</h2></div><span className={styles.countBadge}>{detail.documents.length}</span></div>
            {!detail.available ? <p className={styles.muted}>This reading isn’t available yet, or its access window has closed.</p> : <ul className={styles.readingList}>{detail.documents.map((doc) => <li key={doc.id}><span className={styles.readingFile}><UiIcon name="book" /></span><span className={styles.readingFileInfo}><strong>{doc.title}</strong><small>{doc.format.toUpperCase()} · Read or listen</small></span><Link className={styles.secondary} href={path(`assignments/${id}/reader/${doc.id}`)}>Open reader <UiIcon name="arrow" /></Link></li>)}</ul>}
            {detail.assignment.instructions && <div className={styles.instructions}><h3>Instructions</h3><p>{detail.assignment.instructions}</p></div>}
          </section>
          {detail.assignment.canManage && <section className={styles.card}><div className={styles.sectionHeading}><div><span className={styles.sectionEyebrow}>Your class</span><h2>Student activity</h2></div><button className={styles.subtleButton} disabled={busy} onClick={async () => {
            if (report) { setReport(null); return; }
            setBusy(true); setError("");
            try { setReport(await eduFetch<Report>(`assignments/${id}/progress`, userId)); }
            catch (error) { setError((error as Error).message); } finally { setBusy(false); }
          }}>{report ? "Hide activity" : "View activity"} <UiIcon name="arrow" /></button></div>
            {report ? <div className={styles.scroll}><table className={styles.table}><thead><tr><th>Student</th>{detail.documents.map((doc) => <th key={doc.id}>{doc.title}</th>)}</tr></thead><tbody>{report.students.map((student) => <tr key={student.userId}><td>{student.email}</td>{detail.documents.map((doc) => {
              const progress = report.progress.find((row) => row.userId === student.userId && row.versionId === doc.id);
              return <td key={doc.id}>{progress ? progress.completedAt ? "Marked complete" : `Position ${Math.round(100 * progress.blockIndex / Math.max(1, doc.blockCount))}%` : "Not started"}</td>;
            })}</tr>)}</tbody></table>{!report.students.length && <p className={styles.muted}>No enrolled students yet. Students using a shared link can read without signing in.</p>}<p className={styles.muted}>Progress is a reading checkpoint, not a comprehension score.</p></div> : <p className={styles.muted}>See where enrolled students left off.</p>}
          </section>}
        </div>
        <aside className={styles.manageAside}>
          {detail.assignment.canManage && <section className={`${styles.card} ${styles.sharePanel}`}><div className={styles.featureIcon}><UiIcon name="link" /></div><h2>Share with students</h2><p className={styles.muted}>Anyone with the link can read without an account.</p>
            {detail.assignment.status !== "published" ? <p className={styles.notice}>Publish this assignment to enable sharing.</p> : !shareLoaded ? <p role="status" className={styles.muted}>Checking link…</p> : share?.enabled && share.url ? <>
              <div className={styles.linkLabel}><span className={styles.publishedDot} /> Link is active</div>
              <div className={styles.shareLinkField}><input readOnly aria-label="Student reading link" value={share.url} onFocus={(event) => event.target.select()} /><button type="button" className={styles.primary} disabled={busy} onClick={() => void copy(share.url!)}><UiIcon name={copied ? "check" : "copy"} />{copied ? "Copied" : "Copy link"}</button></div>
              <details className={styles.inlineDisclosure}><summary><UiIcon name="settings" /> Link settings</summary><div className={styles.linkSettings}><button disabled={busy} onClick={() => { if (window.confirm("Replace this link? The old one will stop working.")) void createShare(true); }}>Generate a new link</button><button className={styles.dangerButton} disabled={busy} onClick={() => void revoke()}>Turn off link</button></div></details>
            </> : <button className={styles.primary} disabled={busy} onClick={() => void createShare()}><UiIcon name="link" />Create student link</button>}
          </section>}
          <section className={styles.card}><div className={styles.sectionHeading}><h2>Details</h2></div><dl className={styles.detailList}><div><dt><UiIcon name="calendar" />Available</dt><dd>{dateLabel(detail.assignment.availableAt, school.timezone)}</dd></div><div><dt><UiIcon name="clock" />Due</dt><dd>{dateLabel(detail.assignment.dueAt, school.timezone)}</dd></div>{detail.assignment.closesAt && <div><dt><UiIcon name="clock" />Closes</dt><dd>{dateLabel(detail.assignment.closesAt, school.timezone)}</dd></div>}</dl><p className={styles.muted}>Due dates don’t close access.</p></section>
        </aside>
      </div>
    </> : !error && <p role="status" className={styles.muted}>Loading assignment…</p>}
  </main>;
}
