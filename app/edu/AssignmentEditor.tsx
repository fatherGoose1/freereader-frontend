"use client";
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useEdu } from "./EduProvider";
import { useDashboard } from "./useDashboard";
import { eduFetch } from "./client";
import { uploadDocument } from "./documents";
import { localDateTime, schoolTimeToUTC, type Assignment, type DocumentVersion } from "./model";
import { IMPORT_ACCEPT } from "../reader/importFormats";
import styles from "./edu.module.css";

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
  return <main className={styles.main}><h1>{assignmentId ? "Edit assignment" : "Create reading assignment"}</h1>
    {(error || loadError) && <p role="alert" className={styles.error}>{error || loadError}</p>}
    {!loaded ? <p role="status">Loading assignment configuration…</p> : <form className={`${styles.card} ${styles.form}`} onSubmit={(event) => { event.preventDefault(); void save("published"); }}>
      <fieldset disabled={busy} className={styles.form}><label>Title<input required maxLength={500} value={title} onChange={(event) => setTitle(event.target.value)} /></label>
        <label>Instructions<textarea rows={4} maxLength={10000} value={instructions} onChange={(event) => setInstructions(event.target.value)} /></label>
        <fieldset><legend>Assign to classes</legend>{data?.classes.map((cls) => <label className={styles.check} key={cls.id}><input type="checkbox" checked={classIds.includes(cls.id)} onChange={() => toggle(cls.id, classIds, setClassIds)} />{cls.name}</label>)}{!data?.classes.length && <p>Create a class from the dashboard first.</p>}</fieldset>
        <fieldset><legend>Reading documents</legend>{locked && <p className={styles.muted}>Published assignments keep their document versions. Create a new assignment to replace the reading.</p>}
          {documents.map((doc) => <label className={styles.check} key={doc.id}><input type="checkbox" disabled={locked} checked={versionIds.includes(doc.id)} onChange={() => toggle(doc.id, versionIds, setVersionIds)} />{doc.title} ({doc.format.toUpperCase()})</label>)}
          {!locked && <label>Upload documents<input type="file" multiple accept={IMPORT_ACCEPT} onChange={async (event) => {
            const files = [...(event.target.files ?? [])]; event.target.value = ""; setBusy(true); setError("");
            try { for (const file of files) { if (currentSchool.current !== school.id) break; const doc = await uploadDocument(school.id, file, setStatus, userId); if (currentSchool.current !== school.id) break; setDocuments((docs) => [doc, ...docs]); setVersionIds((ids) => [...ids, doc.id]); } if (currentSchool.current === school.id) setStatus("Documents uploaded and verified."); }
            catch (error) { setError((error as Error).message); } finally { setBusy(false); }
          }} /></label>}
          {status && <p role="status">{status}</p>}
        </fieldset>
        <p className={styles.muted}>All times are in {school.timezone}. Due dates do not close access.</p>
        <div className={styles.row}><label>Available from<input type="datetime-local" required value={available} onChange={(event) => setAvailable(event.target.value)} /></label>
          <label>Due at<input type="datetime-local" required value={due} onChange={(event) => setDue(event.target.value)} /></label>
          <label>Closes at (optional)<input type="datetime-local" value={closes} onChange={(event) => setCloses(event.target.value)} /></label></div>
        <div className={styles.row}>{!locked && <button type="button" disabled={!classIds.length || !versionIds.length || !title.trim()} onClick={() => void save("draft")}>Save draft</button>}
          <button className={styles.primary} disabled={!classIds.length || !versionIds.length || !title.trim()}>{busy ? "Saving…" : locked ? "Save changes" : "Publish assignment"}</button></div>
      </fieldset>
    </form>}
  </main>;
}
