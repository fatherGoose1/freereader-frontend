"use client";

import { useActionState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { unlockEdu, type EduUnlockState } from "./actions";
import styles from "./edu.module.css";

export default function EduGate() {
  const router = useRouter();
  const [state, action, pending] = useActionState<EduUnlockState | null, FormData>(unlockEdu, null);
  useEffect(() => {
    if (state?.ok) router.refresh();
  }, [state, router]);
  return (
    <div className={styles.app}>
      <main className={styles.main}>
        <section className={styles.card}>
          <h1>FreeReader EDU is private</h1>
          <p className={styles.muted}>This preview is locked while it is being prepared. Enter the access password to continue.</p>
          <form className={styles.form} action={action}>
            <label>
              Access password
              <input name="password" type="password" required autoFocus autoComplete="current-password" />
            </label>
            {state?.message && <p className={styles.error} role="alert">{state.message}</p>}
            <button className={styles.primary} disabled={pending}>{pending ? "Checking…" : "Unlock"}</button>
          </form>
        </section>
      </main>
    </div>
  );
}
