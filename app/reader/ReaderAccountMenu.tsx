"use client";

import { useEffect, useRef, useState } from "react";
import type { Session } from "@supabase/supabase-js";
import { manageSubscription } from "./billing";
import { ENHANCED_PLANS, ENHANCED_TIER_NAME, isEnhancedPlan } from "./enhanced";
import { formatRemaining, type UsageSummary } from "./usage";
import ReaderIcon from "./ReaderIcon";
import styles from "./reader.module.css";

export default function ReaderAccountMenu({ session, plan, billingSource, usage, onUpgrade, onSignOut }: {
  session: Session; plan: string; billingSource: "stripe" | "apple"; usage: UsageSummary | null; onUpgrade: () => void; onSignOut: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const container = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const gold = isEnhancedPlan(plan);

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (event: PointerEvent) => {
      if (!container.current?.contains(event.target as Node)) setOpen(false);
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") { setOpen(false); trigger.current?.focus(); }
    };
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => { document.removeEventListener("pointerdown", onPointerDown); document.removeEventListener("keydown", onKeyDown); };
  }, [open]);

  async function manage() {
    if (busy) return;
    setBusy(true);
    setError("");
    try {
      window.location.assign(await manageSubscription(session.access_token));
    } catch {
      setError("Couldn't open Stripe billing. Please try again.");
      setBusy(false);
    }
  }

  return <div className={styles.accountMenu} ref={container}>
    <button ref={trigger} type="button" className={`${styles.accountCircle} ${gold ? styles.goldAccountCircle : ""}`}
      aria-label="Account settings" aria-expanded={open} aria-controls="reader-account-popover"
      onClick={() => { setError(""); setOpen((value) => !value); }}><ReaderIcon name="user" /></button>
    {open && <div className={styles.accountPopover} id="reader-account-popover">
      <strong>{gold ? ENHANCED_TIER_NAME : "Free account"}</strong>
      <span className={styles.accountEmail}>{session.user.email ?? "Signed in"}</span>
      {gold ? <>
        <small>{plan === ENHANCED_PLANS.yearly ? "Yearly plan" : "Monthly plan"}</small>
        {billingSource === "apple" ? <small>Purchased through Apple. Manage or cancel your subscription in iPhone Settings → Subscriptions.</small> : <>
          <button type="button" disabled={busy} onClick={() => void manage()}>{busy ? "Opening Stripe…" : "Manage subscription"}</button>
          <small>Change billing, switch plans, or cancel in Stripe.</small>
        </>}
      </> : <>
        {usage && Number.isFinite(usage.daily_used_seconds) &&
          <small>Today: {formatRemaining(usage.daily_used_seconds)} of 1 hr of audio used</small>}
        <button type="button" onClick={() => { setOpen(false); onUpgrade(); }}>Upgrade to {ENHANCED_TIER_NAME}</button>
      </>}
      {error && <p role="alert" className={styles.accountError}>{error}</p>}
      <button type="button" onClick={() => { setOpen(false); onSignOut(); }}>Sign out</button>
    </div>}
  </div>;
}
