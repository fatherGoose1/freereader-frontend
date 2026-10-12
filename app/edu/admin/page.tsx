"use client";
import { useEffect, useState } from "react";
import { useEdu } from "../EduProvider";
import { eduFetch } from "../client";
import type { Role } from "../model";
import styles from "../edu.module.css";

type Member = { userId: string; email: string; role: Role; active: boolean };
type Invite = { id: string; email: string; role: Role; expiresAt: string };
export default function Administration() {
  const { school, refresh, userId } = useEdu();
  const [members, setMembers] = useState<Member[]>([]);
  const [invitations, setInvitations] = useState<Invite[]>([]);
  const [error, setError] = useState("");
  const [url, setUrl] = useState("");
  const [busy, setBusy] = useState(false);
  const [revision, setRevision] = useState(0);
  useEffect(() => { setUrl(""); }, [school?.id]);
  useEffect(() => {
    setMembers([]); setInvitations([]); setError("");
    if (!school || school.role !== "admin") return;
    const controller = new AbortController();
    void eduFetch<{ members: Member[]; invitations: Invite[] }>(`schools/${school.id}/members`, userId, { signal: controller.signal })
      .then((data) => { if (!controller.signal.aborted) { setMembers(data.members); setInvitations(data.invitations); } })
      .catch((error) => { if (!controller.signal.aborted) setError(error.message); });
    return () => controller.abort();
  }, [school?.id, revision]);
  if (!school || school.role !== "admin") return <main className={styles.main}><p>School administrator access is required.</p></main>;
  async function remove(route: string) {
    setBusy(true); setError("");
    try { await eduFetch(route, userId, { method: "DELETE" }); setRevision((value) => value + 1); await refresh(); }
    catch (error) { setError((error as Error).message); } finally { setBusy(false); }
  }
  return <main className={styles.main}><h1>School administration</h1>{error && <p className={styles.error} role="alert">{error}</p>}
    <div className={styles.split}><div><section className={styles.card}><h2>Invite staff</h2><p className={styles.muted}>Create an email-bound invitation, then send the link to the recipient. It expires after seven days.</p>
      <form className={styles.form} onSubmit={async (event) => {
        event.preventDefault(); const form = event.currentTarget; const values = new FormData(form); setBusy(true); setError("");
        try { const result = await eduFetch<{ url: string }>(`schools/${school.id}/invitations`, userId, { method: "POST", body: JSON.stringify({ email: values.get("email"), role: values.get("role") }) }); setRevision((value) => value + 1); setUrl(result.url); form.reset(); }
        catch (error) { setError((error as Error).message); } finally { setBusy(false); }
      }}><label>Email<input type="email" name="email" required maxLength={320} /></label><label>Role<select name="role"><option value="teacher">Teacher</option><option value="admin">Administrator</option></select></label><button disabled={busy}>Create invitation</button></form>
      {url && <div className={styles.notice}><label>Invitation link<input readOnly value={url} style={{ width: "100%" }} /></label><button onClick={() => void navigator.clipboard.writeText(url).catch(() => setError("Copy the link from the field above."))}>Copy link</button></div>}
    </section><section className={styles.card}><h2>School settings</h2><form key={school.id + school.name + school.timezone} className={styles.form} onSubmit={async (event) => {
      event.preventDefault(); const values = new FormData(event.currentTarget); setBusy(true); setError("");
      try { await eduFetch(`schools/${school.id}`, userId, { method: "PATCH", body: JSON.stringify({ name: values.get("name"), timezone: values.get("timezone") }) }); await refresh(); }
      catch (error) { setError((error as Error).message); } finally { setBusy(false); }
    }}><label>School name<input name="name" required defaultValue={school.name} maxLength={200} /></label><label>Timezone<input name="timezone" required defaultValue={school.timezone} placeholder="America/New_York" /></label><button disabled={busy}>Save settings</button></form></section></div>
    <section className={styles.card}><h2>School members</h2><ul className={styles.list}>{members.map((member) => <li key={member.userId}><strong>{member.email}</strong><div className={styles.row}><span className={styles.muted}>{member.role} · {member.active ? "Active" : "Removed"}</span>{member.active && <button disabled={busy} onClick={() => { if (window.confirm(`Remove ${member.email}'s school access? Their existing assignments are retained.`)) void remove(`schools/${school.id}/members/${member.userId}`); }}>Remove access</button>}</div></li>)}</ul>
      <h2>Pending invitations</h2><ul className={styles.list}>{invitations.map((item) => <li key={item.id}>{item.email} · {item.role}<button disabled={busy} onClick={() => void remove(`schools/${school.id}/invitations/${item.id}`)}>Revoke</button></li>)}</ul>
    </section></div>
  </main>;
}
