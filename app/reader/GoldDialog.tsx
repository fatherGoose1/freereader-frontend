"use client";

import { useEffect, useState } from "react";
import type { Session } from "@supabase/supabase-js";
import { supabaseClient } from "./supabase";
import { fetchPlanPrice, startCheckout, type PlanPrice } from "./billing";
import {
  enhancedPerMonthLabel,
  enhancedTotalLabel,
  ENHANCED_FEATURES,
  ENHANCED_PLANS,
  ENHANCED_TRIAL_DAYS,
  ENHANCED_TIER_NAME,
  type EnhancedInterval,
} from "./enhanced";
import ReaderIcon from "./ReaderIcon";
import styles from "./reader.module.css";

export default function GoldDialog({ session, onClose, initialInterval = "yearly", initialError = "" }: {
  session: Session | null; onClose: () => void; initialInterval?: EnhancedInterval; initialError?: string;
}) {
  const [interval, setInterval] = useState<EnhancedInterval>(initialInterval);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(initialError);
  const [prices, setPrices] = useState<Partial<Record<EnhancedInterval, PlanPrice>>>({});
  const [priceErrors, setPriceErrors] = useState<Partial<Record<EnhancedInterval, boolean>>>({});
  const price = prices[interval];
  const trial = interval === "yearly";

  useEffect(() => {
    let active = true;
    for (const chosen of ["yearly", "monthly"] as const) {
      void fetchPlanPrice(ENHANCED_PLANS[chosen]).then((result) => {
        if (result.interval !== (chosen === "yearly" ? "year" : "month")) throw new Error("invalid_plan_price");
        if (active) setPrices((previous) => ({ ...previous, [chosen]: result }));
      }).catch(() => {
        if (active) setPriceErrors((previous) => ({ ...previous, [chosen]: true }));
      });
    }
    return () => { active = false; };
  }, []);

  async function subscribe() {
    if (!price) return;
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
        ? reason.message : reason instanceof Error && reason.message === "manage_apple_subscription"
          ? "Your Gold subscription is managed through Apple. Manage it in iPhone Settings → Subscriptions."
          : "Couldn't open checkout. Please try again.");
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
              <span className={styles.goldCrown}><ReaderIcon name="crown" /></span>
              <span><strong>{feature.title}</strong><small>{feature.detail}</small></span>
            </li>
          ))}
        </ul>

        <div className={styles.goldToggle} role="group" aria-label="Billing interval">
          <button type="button" aria-pressed={interval === "yearly"} onClick={() => setInterval("yearly")}>Yearly <small>{ENHANCED_TRIAL_DAYS}-day free trial</small></button>
          <button type="button" aria-pressed={interval === "monthly"} onClick={() => setInterval("monthly")}>Monthly</button>
        </div>

        <div className={styles.goldPrice}>
          <strong>{price ? enhancedPerMonthLabel(price.amount_cents, interval) : "—"}</strong>
          <span>{price ? (trial ? `per month, billed ${enhancedTotalLabel(price.amount_cents)} yearly` : "per month, billed monthly") : "Loading price…"}</span>
        </div>

        {error && <p className={styles.goldError} role="alert">{error}</p>}
        {priceErrors[interval] && <p className={styles.goldError} role="alert">Pricing is unavailable. Please try again later.</p>}

        {price && <small className={styles.goldNote}>
          {trial
            ? `${ENHANCED_TRIAL_DAYS} days free for eligible new subscribers, then ${enhancedTotalLabel(price.amount_cents)}/year (${enhancedPerMonthLabel(price.amount_cents, interval)}/month equivalent). Renews automatically.`
            : `${enhancedTotalLabel(price.amount_cents)}/month, billed monthly. Renews automatically.`}
        </small>}

        <button className={`${styles.primaryAction} ${styles.goldCta}`} type="button" disabled={busy || !price} onClick={() => void subscribe()}>
          {busy ? "Opening checkout…" : trial ? `Start ${ENHANCED_TRIAL_DAYS}-day free trial` : `Get ${ENHANCED_TIER_NAME}`}
        </button>
      </div>
    </div>
  );
}
