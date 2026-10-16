"use client";

import { useState } from "react";
import type { Session } from "@supabase/supabase-js";
import { supabaseClient } from "./supabase";
import { startCheckout } from "./billing";
import {
  ENHANCED_FEATURES,
  ENHANCED_PLANS,
  ENHANCED_PRICES,
  ENHANCED_TIER_NAME,
  type EnhancedInterval,
} from "./enhanced";
import ReaderIcon from "./ReaderIcon";
import styles from "./reader.module.css";

function CheckIcon() {
  return (
    <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="m4 10 4 4 8-9" />
    </svg>
  );
}

export default function GoldDialog({ session, onClose, initialInterval = "yearly", initialError = "" }: {
  session: Session | null; onClose: () => void; initialInterval?: EnhancedInterval; initialError?: string;
}) {
  const [interval, setInterval] = useState<EnhancedInterval>(initialInterval);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(initialError);
  const price = ENHANCED_PRICES[interval];

  async function subscribe() {
    setBusy(true);
    setError("");
    try {
      const supabase = supabaseClient();
      if (!supabase) throw new Error("Google sign-in is unavailable right now.");
      const { data } = await supabase.auth.getSession();
      if (session ?? data.session) {
        const token = (session ?? data.session)!.access_token;
        window.location.assign(await startCheckout(token, ENHANCED_PLANS[interval]));
        return;
      }
      // Remember the chosen interval so checkout resumes after the Google round trip.
      let redirectTo = `${window.location.origin}/reader/audiobooks`;
      try { sessionStorage.setItem("freereaderUpgradePlan", ENHANCED_PLANS[interval]); }
      catch { redirectTo += `?upgrade=${ENHANCED_PLANS[interval]}`; }
      const { error: signInError } = await supabase.auth.signInWithOAuth({
        provider: "google",
        options: { redirectTo },
      });
      if (signInError) throw signInError;
    } catch (reason) {
      try { sessionStorage.removeItem("freereaderUpgradePlan"); } catch { /* unavailable */ }
      setError(reason instanceof Error && reason.message === "Google sign-in is unavailable right now."
        ? reason.message : "Couldn't open checkout. Please try again.");
      setBusy(false);
    }
  }

  return (
    <div className={styles.modalBackdrop} onMouseDown={onClose}>
      <div
        className={`${styles.modal} ${styles.goldModal}`}
        role="dialog"
        aria-modal="true"
        aria-label={`Upgrade to ${ENHANCED_TIER_NAME}`}
        onMouseDown={(event) => event.stopPropagation()}
      >
        <button className={styles.goldClose} type="button" aria-label="Close" onClick={onClose}><ReaderIcon name="close" /></button>
        <h2>{ENHANCED_TIER_NAME}</h2>

        <ul className={styles.goldFeatures}>
          {ENHANCED_FEATURES.map((feature) => (
            <li key={feature.title}>
              <span className={styles.goldCheck}><CheckIcon /></span>
              <span><strong>{feature.title}</strong><small>{feature.detail}</small></span>
            </li>
          ))}
        </ul>

        <div className={styles.goldToggle} role="group" aria-label="Billing interval">
          <button type="button" aria-pressed={interval === "yearly"} onClick={() => setInterval("yearly")}>Yearly <small>Save 75%</small></button>
          <button type="button" aria-pressed={interval === "monthly"} onClick={() => setInterval("monthly")}>Monthly</button>
        </div>

        <div className={styles.goldPrice}>
          <strong>${price.perMonth}</strong>
          <span>{price.cadence}</span>
        </div>

        {error && <p className={styles.goldError} role="alert">{error}</p>}

        <button className={`${styles.primaryAction} ${styles.goldCta}`} type="button" disabled={busy} onClick={() => void subscribe()}>
          {busy ? "Opening checkout…" : `Get ${ENHANCED_TIER_NAME}`}
        </button>
        {/* <small className={styles.goldNote}>Cancel anytime.</small> */}
      </div>
    </div>
  );
}
