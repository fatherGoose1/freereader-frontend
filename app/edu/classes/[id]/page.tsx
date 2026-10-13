"use client";
import { use, useEffect, useState } from "react";
import Link from "next/link";
import { useEdu } from "../../EduProvider";
import { eduFetch } from "../../client";
import type { Role } from "../../model";
import styles from "../../edu.module.css";
import UiIcon from "../../UiIcon";

type Person = { userId: string; email: string };
type ClassDetail = { id: string; schoolId: string; name: string; term: string; students: Person[]; teachers: Person[]; role: Role };
export default function ClassPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const { school, userId, path } = useEdu();
  const [detail, setDetail] = useState<ClassDetail | null>(null);
  const [teachers, setTeachers] = useState<Person[]>([]);
  const [error, setError] = useState("");
  const [url, setUrl] = useState("");
  const [busy, setBusy] = useState(false);
  const [revision, setRevision] = useState(0);
  useEffect(() => {
    const controller = new AbortController(); setDetail(null); setTeachers([]); setError(""); setUrl("");
    if (!school) return;
    void eduFetch<ClassDetail>(`classes/${id}`, userId, { signal: controller.signal }).then((detail) => { if (detail.schoolId !== school.id) throw new Error("Switch to this class's school to manage it."); if (!controller.signal.aborted) setDetail(detail); })
      .catch((error) => { if (!controller.signal.aborted) setError(error.message); });
    if (school.role === "admin") void eduFetch<{ members: (Person & { active: boolean; role: Role })[] }>(`schools/${school.id}/members`, userId, { signal: controller.signal })
      .then((data) => { if (!controller.signal.aborted) setTeachers(data.members.filter((member) => member.active && member.role !== "student")); })
      .catch((error) => { if (!controller.signal.aborted) setError(error.message); });
    return () => controller.abort();
  }, [id, school?.id, revision]);
  async function action(route: string, method: string, payload?: object) {
    setBusy(true); setError("");
    try { await eduFetch(route, userId, { method, body: payload ? JSON.stringify(payload) : undefined }); setRevision((value) => value + 1); }
    catch (error) { setError((error as Error).message); } finally { setBusy(false); }
  }
  return <main className={styles.main}><div className={styles.breadcrumbs}><Link href={path()}>Classes</Link><UiIcon name="chevron" /><span>{detail?.name ?? "Loading"}</span></div>{error && <p role="alert" className={styles.error}>{error}</p>}{detail && school ? <><div className={styles.pageHeading}><div><span className={styles.eyebrow}>{school.name}</span><h1>{detail.name}</h1>{detail.term && <p className={styles.muted}>{detail.term}</p>}</div></div><div className={styles.manageLayout}>
    <section className={styles.card}><div className={styles.sectionHeading}><div><span className={styles.sectionEyebrow}>People</span><h2>Class roster</h2></div><span className={styles.countBadge}>{detail.students.length}</span></div>
      <p className={styles.muted}>Shared reading links work for everyone, even without an account.</p>
      <ul className={styles.list}>{detail.students.map((student) => <li className={styles.memberRow} key={student.userId}><span className={styles.memberAvatar}><UiIcon name="users" /></span><strong className={styles.memberInfo}>{student.email}</strong><button className={styles.subtleButton} disabled={busy} onClick={() => { if (window.confirm(`Remove ${student.email} from this class?`)) void action(`classes/${id}/students/${student.userId}`, "DELETE"); }}>Remove</button></li>)}</ul>
      {!detail.students.length && <div className={styles.emptyState}><div className={styles.featureIcon}><UiIcon name="users" /></div><h3>No enrolled students</h3><p className={styles.muted}>Students can still read assignments from a shared link.</p></div>}
      <details className={styles.inlineDisclosure}><summary><UiIcon name="plus" /> Invite for account access</summary><p className={styles.muted}>Optional: invite a student if you want their progress tied to a school account.</p><form className={styles.form} onSubmit={async (event) => {
        event.preventDefault(); const form = event.currentTarget; const values = new FormData(form); setBusy(true); setError("");
        try { const result = await eduFetch<{ url: string }>(`schools/${school.id}/invitations`, userId, { method: "POST", body: JSON.stringify({ email: values.get("email"), role: "student", classId: id }) }); setUrl(result.url); form.reset(); }
        catch (error) { setError((error as Error).message); } finally { setBusy(false); }
      }}><label>School email<input type="email" name="email" required maxLength={320} /></label><button className={styles.secondary} disabled={busy}>Create student invitation</button></form>
      {url && <div className={styles.notice}><input readOnly value={url} aria-label="Student invitation link" /><button onClick={() => void navigator.clipboard.writeText(url).catch(() => setError("Copy the link from the field above."))}><UiIcon name="copy" /> Copy invitation</button></div>}
      </details>
    </section><section className={styles.card}><div className={styles.sectionHeading}><div><span className={styles.sectionEyebrow}>Manage</span><h2>Class details</h2></div></div><form key={revision} className={styles.form} onSubmit={(event) => {
      event.preventDefault(); const values = new FormData(event.currentTarget);
      void action(`classes/${id}`, "PATCH", { name: values.get("name"), term: values.get("term"), ...(detail.role === "admin" ? { teacherIds: values.getAll("teachers") } : {}) });
    }}><label>Name<input name="name" required maxLength={200} defaultValue={detail.name} /></label><label>Term<input name="term" maxLength={100} defaultValue={detail.term} /></label>
      {detail.role === "admin" && <fieldset><legend>Teachers</legend>{teachers.map((teacher) => <label className={styles.check} key={teacher.userId}><input name="teachers" type="checkbox" value={teacher.userId} defaultChecked={detail.teachers.some((item) => item.userId === teacher.userId)} />{teacher.email}</label>)}</fieldset>}<button disabled={busy}>Save changes</button></form></section>
    </div></> : !error && <p role="status">Loading class…</p>}</main>;
}
