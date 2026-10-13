"use client";
import { useEffect, useState } from "react";
import { useEdu } from "../EduProvider";
import { eduFetch } from "../client";
import type { Role } from "../model";
import styles from "../edu.module.css";
import InviteStaff from "../InviteStaff";
import UiIcon from "../UiIcon";

type Member = { userId: string; name?: string; email: string; role: Role; active: boolean };
type Invite = { id: string; name?: string; email: string; role: Role; expiresAt: string };
export default function Administration() {
  const { school, refresh, userId } = useEdu();
  const [members, setMembers] = useState<Member[]>([]);
  const [invitations, setInvitations] = useState<Invite[]>([]);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [revision, setRevision] = useState(0);
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
  return <main className={styles.main}><div className={styles.pageHeading}><div><span className={styles.eyebrow}>{school.name}</span><h1>School administration</h1><p className={styles.muted}>Manage your team and school settings.</p></div></div>{error && <p className={styles.error} role="alert">{error}</p>}
    <InviteStaff key={`${userId}:${school.id}`} schoolId={school.id} onCreated={() => setRevision((value) => value + 1)} />
    <div className={styles.adminGrid}><section className={styles.card}><div className={styles.sectionHeading}><div><span className={styles.sectionEyebrow}>Your team</span><h2>School members</h2></div><span className={styles.countBadge}>{members.filter((member) => member.active).length}</span></div><ul className={styles.list}>{members.map((member) => <li className={styles.memberRow} key={member.userId}><div className={styles.memberAvatar}><UiIcon name="users" /></div><div className={styles.memberInfo}><strong>{member.name || member.email}</strong>{member.name && <small>{member.email}</small>}<span className={styles.muted}>{member.role} · {member.active ? "Active" : "Removed"}</span></div>{member.active && <button className={styles.subtleButton} disabled={busy} onClick={() => { if (window.confirm(`Remove ${member.email}'s school access? Their existing assignments are retained.`)) void remove(`schools/${school.id}/members/${member.userId}`); }}>Remove access</button>}</li>)}</ul>
      {invitations.length > 0 && <div className={styles.pendingSection}><h3>Pending invitations <span className={styles.countBadge}>{invitations.length}</span></h3><ul className={styles.list}>{invitations.map((item) => <li className={styles.memberRow} key={item.id}><div className={styles.memberAvatar}><UiIcon name="link" /></div><div className={styles.memberInfo}><strong>{item.name || item.email}</strong>{item.name && <small>{item.email}</small>}<span className={styles.muted}>{item.role}</span></div><button className={styles.subtleButton} disabled={busy} onClick={() => void remove(`schools/${school.id}/invitations/${item.id}`)}>Revoke</button></li>)}</ul></div>}
    </section><section className={styles.card}><div className={styles.sectionHeading}><div><span className={styles.sectionEyebrow}>Configuration</span><h2>School settings</h2></div></div><form key={school.id + school.name + school.timezone} className={styles.form} onSubmit={async (event) => {
      event.preventDefault(); const values = new FormData(event.currentTarget); setBusy(true); setError("");
      try { await eduFetch(`schools/${school.id}`, userId, { method: "PATCH", body: JSON.stringify({ name: values.get("name"), timezone: values.get("timezone") }) }); await refresh(); }
      catch (error) { setError((error as Error).message); } finally { setBusy(false); }
    }}><label>School name<input name="name" required defaultValue={school.name} maxLength={200} /></label><label>Timezone<input name="timezone" required defaultValue={school.timezone} placeholder="America/New_York" /></label><button disabled={busy}>Save settings</button></form></section></div>
  </main>;
}
