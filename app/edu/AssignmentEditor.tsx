"use client";
import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEdu } from "./EduProvider";
import { useDashboard } from "./useDashboard";
import { eduFetch } from "./client";
import { uploadDocument } from "./documents";
import { localDateTime, schoolTimeToUTC, type Assignment, type DocumentVersion } from "./model";
import { IMPORT_ACCEPT } from "../reader/importFormats";
import styles from "./edu.module.css";
import UiIcon from "./UiIcon";

export default function AssignmentEditor({ assignmentId }: { assignmentId?: string }) {
  const { path, userId } = useEdu();
  const { school, data, error: loadError } = useDashboard();
  const router = useRouter();
  const [documents, setDocuments] = useState<DocumentVersion[]>([]);
  const [existing, setExisting] = useState<Assignment | null>(null);
  const [title, setTitle] = useState("");
  const [instructions, setInstructions] = useState("");
  const [classIds, setClassIds] = useState<string[]>([]);
  const [versionIds, setVersionIds] = useState<string[]>([]);
  const [available, setAvailable] = useState("");
  const [due, setDue] = useState("");
  const [closes, setCloses] = useState("");
  const [error, setError] = useState("");
  const [status, setStatus] = useState("");
  const [busy, setBusy] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const currentSchool = useRef(school?.id);
  currentSchool.current = school?.id;
  useEffect(() => {
    if (!school || school.role === "student") return;
    const controller = new AbortController();
    setLoaded(false); setError(""); setTitle(""); setInstructions(""); setClassIds([]); setVersionIds([]); setCloses(""); setExisting(null);
    const load = async () => {
      const result = await eduFetch<{ documents: DocumentVersion[] }>(`schools/${school.id}/documents`, userId, { signal: controller.signal });
      let docs = result.documents;
      if (assignmentId) {
        const result = await eduFetch<{ assignment: Assignment; documents: DocumentVersion[] }>(`assignments/${assignmentId}`, userId, { signal: controller.signal });
        if (result.assignment.schoolId !== school.id) throw new Error("Switch to this assignment's school before editing it.");
        if (controller.signal.aborted) return;
        const item = result.assignment;
        setExisting(item); setTitle(item.title); setInstructions(item.instructions); setClassIds(item.classIds); setVersionIds(item.versionIds);
        setAvailable(localDateTime(item.availableAt, school.timezone)); setDue(localDateTime(item.dueAt, school.timezone));
        setCloses(item.closesAt ? localDateTime(item.closesAt, school.timezone) : "");
        docs = [...docs, ...result.documents.filter((doc) => !docs.some((existing) => existing.id === doc.id))];
      } else {
        setAvailable(localDateTime(new Date().toISOString(), school.timezone));
        setDue(localDateTime(new Date(Date.now() + 7 * 86400_000).toISOString(), school.timezone));
      }
      if (!controller.signal.aborted) { setDocuments(docs); setLoaded(true); }
    };
    void load().catch((error) => { if (!controller.signal.aborted) setError(error.message); });
    return () => controller.abort();
  }, [school?.id, assignmentId]);
  if (!school || school.role === "student") return <main className={styles.main}><p>A teacher or administrator account is required.</p></main>;
  const locked = existing?.status === "published" || existing?.status === "archived";
  function toggle(value: string, values: string[], setter: (values: string[]) => void) { setter(values.includes(value) ? values.filter((id) => id !== value) : [...values, value]); }
  async function save(status: "draft" | "published") {
    if (!school) return;
    setBusy(true); setError("");
    try {
      const payload = { title, instructions, classIds, versionIds, availableAt: schoolTimeToUTC(available, school.timezone),
        dueAt: schoolTimeToUTC(due, school.timezone), closesAt: closes ? schoolTimeToUTC(closes, school.timezone) : null,
        status, revision: existing?.revision };
      const result = await eduFetch<{ assignment: Assignment }>(existing ? `assignments/${existing.id}` : `schools/${school.id}/assignments`, userId, {
        method: existing ? "PATCH" : "POST", body: JSON.stringify(payload),
      });
      router.push(path(status === "published" && result.assignment.versionIds[0]
        ? `assignments/${result.assignment.id}/reader/${result.assignment.versionIds[0]}` : `assignments/${result.assignment.id}`));
    } catch (error) { setError((error as Error).message); } finally { setBusy(false); }
  }
  return <main className={styles.main}>
    <div className={styles.breadcrumbs}><Link href={path()}>Assignments</Link><UiIcon name="chevron" />{existing && <><Link href={path(`assignments/${existing.id}`)}>{existing.title}</Link><UiIcon name="chevron" /></>}<span>{assignmentId ? "Edit" : "New assignment"}</span></div>
    <div className={styles.pageHeading}><div><span className={styles.eyebrow}>{assignmentId ? "Make changes" : "A new reading"}</span><h1>{assignmentId ? "Edit assignment" : "Create reading assignment"}</h1></div></div>
    {(error || loadError) && <p role="alert" className={styles.error}>{error || loadError}</p>}
    {!loaded ? <p role="status" className={styles.muted}>Loading assignment…</p> : <form onSubmit={(event) => { event.preventDefault(); void save("published"); }}>
      <fieldset disabled={busy} className={styles.editorFieldset}><div className={styles.editorLayout}>
        <div className={styles.editorMain}>
          <section className={styles.card}><div className={styles.sectionHeading}><div><span className={styles.sectionEyebrow}>01 · The basics</span><h2>About this reading</h2></div></div><div className={styles.form}>
            <label>Title<input required maxLength={500} autoFocus={!assignmentId} placeholder="What will your class read?" value={title} onChange={(event) => setTitle(event.target.value)} /></label>
            <label>Instructions <span className={styles.optional}>(optional)</span><textarea rows={3} maxLength={10000} placeholder="Anything students should know before they start…" value={instructions} onChange={(event) => setInstructions(event.target.value)} /></label>
          </div></section>
          <section className={styles.card}><div className={styles.sectionHeading}><div><span className={styles.sectionEyebrow}>02 · Who will read</span><h2>Classes</h2></div></div><div className={styles.choiceGrid}>
            {data?.classes.map((cls) => <label className={styles.choiceItem} key={cls.id}><input type="checkbox" checked={classIds.includes(cls.id)} onChange={() => toggle(cls.id, classIds, setClassIds)} /><span><strong>{cls.name}</strong>{cls.term && <small>{cls.term}</small>}</span></label>)}
            {!data?.classes.length && <p className={styles.muted}>No classes yet. <Link href={path()}>Create one on the dashboard</Link> first.</p>}
          </div></section>
          <section className={styles.card}><div className={styles.sectionHeading}><div><span className={styles.sectionEyebrow}>03 · What to read</span><h2>Reading material</h2></div></div>
            {locked && <p className={styles.muted}>Published readings stay attached to this assignment. Create a new assignment to change documents.</p>}
            {documents.length > 0 && <div className={styles.choiceGrid}>{documents.map((doc) => <label className={styles.choiceItem} key={doc.id}><input type="checkbox" disabled={locked} checked={versionIds.includes(doc.id)} onChange={() => toggle(doc.id, versionIds, setVersionIds)} /><span><strong>{doc.title}</strong><small>{doc.format.toUpperCase()}</small></span></label>)}</div>}
            {!locked && <label className={styles.uploadBox}><span><UiIcon name="upload" /> Upload documents</span><small>PDF, EPUB, Word, or text files</small><input type="file" multiple accept={IMPORT_ACCEPT} onChange={async (event) => {
              const files = [...(event.target.files ?? [])]; event.target.value = ""; setBusy(true); setError("");
              try { for (const file of files) { if (currentSchool.current !== school.id) break; const doc = await uploadDocument(school.id, file, setStatus, userId); if (currentSchool.current !== school.id) break; setDocuments((docs) => [doc, ...docs]); setVersionIds((ids) => [...ids, doc.id]); } if (currentSchool.current === school.id) setStatus("Documents uploaded and verified."); }
              catch (error) { setError((error as Error).message); } finally { setBusy(false); }
            }} /></label>}
            {status && <p role="status" className={styles.notice}>{status}</p>}
          </section>
        </div>
        <aside><section className={styles.card}><div className={styles.sectionHeading}><div><span className={styles.sectionEyebrow}>04 · When</span><h2>Schedule</h2></div><UiIcon name="calendar" /></div>
          <div className={styles.form}><label>Available from<input type="datetime-local" required value={available} onChange={(event) => setAvailable(event.target.value)} /></label><label>Due at<input type="datetime-local" required value={due} onChange={(event) => setDue(event.target.value)} /></label><label>Closes at <span className={styles.optional}>(optional)</span><input type="datetime-local" value={closes} onChange={(event) => setCloses(event.target.value)} /></label></div>
          <p className={styles.muted}>All times are in {school.timezone}. Due dates don’t close access.</p>
        </section></aside>
      </div><div className={styles.editorFooter}><span className={styles.muted}>{locked ? "Update the details for this reading." : "Your class can start reading after you publish."}</span><div className={styles.row}>{!locked && <button type="button" disabled={!classIds.length || !versionIds.length || !title.trim()} onClick={() => void save("draft")}>Save draft</button>}<button type="submit" className={styles.primary} disabled={!classIds.length || !versionIds.length || !title.trim()}>{busy ? "Saving…" : locked ? "Save changes" : "Publish assignment"} <UiIcon name="arrow" /></button></div></div></fieldset>
    </form>}
  </main>;
}
