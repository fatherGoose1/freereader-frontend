"use client";
import { useRef, useState, type ClipboardEvent } from "react";
import { useEdu } from "./EduProvider";
import { eduFetch } from "./client";
import { MAX_STAFF_ROWS, MAX_STAFF_FILE_BYTES, normalizeStaff, parseStaffRecords, staffIssues, safeClipboardCell, type StaffRecord } from "./staffImport";
import styles from "./edu.module.css";
import UiIcon from "./UiIcon";

type Row = StaffRecord & { id: string };
type Created = StaffRecord & { id: string; url: string; expiresAt: string; status: string };
const blank = (): Row => ({ id: crypto.randomUUID(), name: "", email: "" });

export default function InviteStaff({ schoolId, onCreated }: { schoolId: string; onCreated: () => void }) {
  const { userId } = useEdu();
  const [rows, setRows] = useState<Row[]>(() => [{ id: "first", name: "", email: "" }]);
  const [role, setRole] = useState("teacher");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [review, setReview] = useState(false);
  const [created, setCreated] = useState<Created[]>([]);
  const [copied, setCopied] = useState("");
  const fileInput = useRef<HTMLInputElement>(null);
  const request = useRef<{ fingerprint: string; id: string } | null>(null);
  const issues = review ? staffIssues(rows) : [];
  const count = rows.filter((row) => row.name.trim() || row.email.trim()).length;
  function edit(index: number, field: "name" | "email", value: string) {
    setRows((current) => {
      const next = current.map((row, position) => position === index ? { ...row, [field]: value } : row);
      if (next.at(-1)?.name.trim() && next.at(-1)?.email.trim() && next.length < MAX_STAFF_ROWS) next.push(blank());
      return next;
    });
  }
  function insert(records: StaffRecord[], index?: number, field?: "name" | "email") {
    setError(""); setReview(true);
    const next = rows.map((row) => ({ ...row }));
    if (index === undefined) {
      const nonblank = next.filter((row) => row.name.trim() || row.email.trim());
      if (nonblank.length + records.length > MAX_STAFF_ROWS) { setError(`Keep each batch to ${MAX_STAFF_ROWS} people or fewer.`); return; }
      setRows([...nonblank, ...records.map((record) => ({ ...record, id: crypto.randomUUID() }))]);
    } else {
      if (index + records.length > MAX_STAFF_ROWS) { setError(`Keep each batch to ${MAX_STAFF_ROWS} people or fewer.`); return; }
      records.forEach((record, offset) => { const position = index + offset; next[position] ??= blank(); next[position] = field ? { ...next[position], [field]: record[field] } : { ...next[position], ...record }; });
      setRows(next);
    }
  }
  function paste(event: ClipboardEvent<HTMLInputElement>, index: number, field: "name" | "email") {
    const text = event.clipboardData.getData("text").trim();
    if (!/[\r\n\t]/.test(text) && !(text.includes("@") && /[,;|]/.test(text))) return;
    event.preventDefault();
    try {
      if (!/[\t,;|]/.test(text) && !text.split(/\r?\n/).every((line) => /\s+\S+@\S+/.test(line))) {
        const values = text.split(/\r?\n/).filter((line) => line.trim()).map((line) => ({ name: field === "name" ? line.trim() : "", email: field === "email" ? line.trim() : "" }));
        insert(values, index, field);
      } else insert(parseStaffRecords(text), index);
    } catch (error) { setError((error as Error).message); }
  }
  async function copy(text: string, id: string) {
    try { await navigator.clipboard.writeText(text); setCopied(id); }
    catch { setError("Select and copy the invitation links below."); }
  }
  return <section className={styles.card} aria-labelledby="invite-staff-title"><div className={styles.sectionHeading}><div><span className={styles.sectionEyebrow}>Build your team</span><h2 id="invite-staff-title">Invite staff</h2></div></div>
    <p className={styles.muted}>Add people below, paste a spreadsheet, or import a file.</p>
    {error && <p role="alert" className={styles.error}>{error}</p>}
    <form noValidate className={styles.form} onSubmit={async (event) => {
      event.preventDefault(); setReview(true); setError(""); setCopied("");
      if (staffIssues(rows).length || !count) { setError("Complete the highlighted name/email rows before creating invitations."); return; }
      const records = rows.filter((row) => row.name.trim() || row.email.trim()).map(normalizeStaff);
      const fingerprint = JSON.stringify({ schoolId, role, records });
      if (request.current?.fingerprint !== fingerprint) request.current = { fingerprint, id: crypto.randomUUID() };
      setBusy(true);
      try {
        const result = await eduFetch<{ invitations: Created[] }>(`schools/${schoolId}/invitations/bulk`, userId, { method: "POST", body: JSON.stringify({ records, role, requestId: request.current.id }) });
        setCreated(result.invitations); setRows([blank()]); setReview(false); request.current = null; onCreated();
      } catch (error) { setError((error as Error).message); }
      finally { setBusy(false); }
    }}>
      <fieldset disabled={busy} className={styles.staffFieldset}>
        <div className={styles.staffToolbar}><label>Invite as<select aria-label="Staff invitation role" value={role} onChange={(event) => setRole(event.target.value)}><option value="teacher">Teacher</option><option value="admin">Administrator</option></select></label>
          <button type="button" onClick={() => fileInput.current?.click()}><UiIcon name="upload" /> Import CSV / text</button>
          <input ref={fileInput} hidden type="file" accept=".csv,.tsv,.txt,text/csv,text/plain,text/tab-separated-values" aria-label="Import staff file" onChange={async (event) => {
            const file = event.target.files?.[0]; event.target.value = ""; if (!file) return;
            setError("");
            try { if (file.size > MAX_STAFF_FILE_BYTES) throw new Error("Staff files must be 1 MiB or smaller."); insert(parseStaffRecords(await file.text())); }
            catch (error) { setError((error as Error).message); }
          }} />
        </div>
        <div className={styles.staffGrid}><div className={styles.staffHead}><span>Name</span><span>Email</span><span className="sr-only">Actions</span></div>
          {rows.map((row, index) => <div className={styles.staffRow} key={row.id}>
            {(["name", "email"] as const).map((field) => { const issue = issues.find((issue) => issue.index === index && issue.field === field); return <div key={field}>
              <input aria-label={`Staff ${field} ${index + 1}`} type={field === "email" ? "email" : "text"} maxLength={field === "name" ? 200 : 320} placeholder={field === "name" ? "Full name" : "name@school.edu"} value={row[field]} aria-invalid={!!issue}
                onChange={(event) => edit(index, field, event.target.value)} onPaste={(event) => paste(event, index, field)} />
              {issue && <span className={styles.staffIssue}>{issue.message}</span>}</div>; })}
            <button type="button" aria-label={`Remove staff row ${index + 1}`} onClick={() => setRows((current) => current.length === 1 ? [blank()] : current.filter((item) => item.id !== row.id))}>×</button>
          </div>)}
        </div>
        <div className={styles.row}><button type="button" className={styles.subtleButton} disabled={rows.length >= MAX_STAFF_ROWS} onClick={() => setRows((current) => [...current, blank()])}><UiIcon name="plus" /> Add row</button><span className={styles.muted}>{count} {count === 1 ? "person" : "people"} · up to 100 at a time</span></div>
      </fieldset>
      <button className={styles.primary} disabled={busy || count === 0}><UiIcon name="link" />{busy ? "Creating invitations…" : `Create ${count || "staff"} ${count === 1 ? "invitation" : "invitations"}`}</button>
    </form>
    {created.length > 0 && <div className={styles.staffResults}><div className={styles.row}><h3>{created.length} invitations created</h3><button onClick={() => void copy(["Name\tEmail\tInvitation link", ...created.map((row) => [row.name, row.email, row.url].map(safeClipboardCell).join("\t"))].join("\n"), "all")}>{copied === "all" ? "Copied" : "Copy all links"}</button></div>
      <p className={styles.muted}>Send each person their email-bound link. Invitations expire after seven days.</p>
      {created.map((row) => <div className={styles.staffResult} key={row.id}><strong>{row.name}</strong><span className={styles.muted}>{row.email}</span><div className={styles.row}><input readOnly aria-label={`Invitation link for ${row.name}`} value={row.url} /><button onClick={() => void copy(row.url, row.id)}>{copied === row.id ? "Copied" : "Copy link"}</button></div></div>)}
    </div>}
  </section>;
}
