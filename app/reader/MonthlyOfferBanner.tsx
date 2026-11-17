"use client";

import { useEffect, useState } from "react";
import { ENHANCED_FEATURES } from "./enhanced";
import { MONTHLY_OFFER_END, offerCountdown } from "./monthlyOffer";
import styles from "./reader.module.css";

export default function MonthlyOfferBanner({ onClaim }: { onClaim: () => void }) {
  const [now, setNow] = useState<number | null>(null);
  const [featuresOpen, setFeaturesOpen] = useState(false);

  useEffect(() => {
    const refresh = () => setNow(Date.now());
    refresh();
    const timer = window.setInterval(refresh, 1_000);
    return () => window.clearInterval(timer);
  }, []);

  if (now === null || now >= MONTHLY_OFFER_END) return null;
  return <section className={styles.monthlyOfferBanner} aria-label="$1 first month of FreeReader Gold">
    <div className={styles.monthlyOfferCopy}>
      <h2 className={styles.monthlyOfferHeadline}>Get <span className={styles.monthlyOfferGold} data-open={featuresOpen} onBlur={() => setFeaturesOpen(false)}>
        <button type="button" className={styles.monthlyOfferGoldTrigger} aria-describedby="monthly-offer-features" onClick={() => setFeaturesOpen((open) => !open)}>
          FreeReader Gold
        </button>
        <span id="monthly-offer-features" className={styles.monthlyOfferTooltip} role="tooltip">
          <span className={styles.monthlyOfferTooltipTitle}>Everything included</span>
          <span className={styles.monthlyOfferFeatureList}>
            {ENHANCED_FEATURES.map((feature) => <span key={feature.title}><span aria-hidden="true">✦</span>{feature.title}</span>)}
          </span>
        </span>
      </span> for $1 your first month</h2>
    </div>
    <div className={styles.monthlyOfferActions}>
      <span className={styles.monthlyOfferTimer} role="timer" aria-label="Time remaining for the $1 offer">{offerCountdown(now)}</span>
      <button type="button" onClick={onClaim}>Claim $1/month</button>
    </div>
  </section>;
}
