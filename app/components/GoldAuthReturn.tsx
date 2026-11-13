"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";
import { isEnhancedPlan } from "../reader/enhanced";
import { supabaseClient } from "../reader/supabase";
import { GOLD_OFFER_RETURN_KEY } from "../reader/goldOffer";
import { pendingLicense } from "../reader/licenses";
import { isAuthCallbackUrl, rememberAuthReturn } from "../reader/authCallback";

// Supabase sends users to the site URL when a requested OAuth redirect is not
// allow-listed. Recover a pending Gold checkout instead of leaving them home.
export default function GoldAuthReturn() {
  const pathname = usePathname();
  useEffect(() => {
    if (pathname !== "/") return;
    // Stale pending state from an earlier visit must not hijack a normal page
    // load; only an actual OAuth or email-confirmation return may resume work.
    if (!isAuthCallbackUrl(new URL(window.location.href))) return;
    let pending: string | null = null;
    let offerPending = false;
    try {
      pending = sessionStorage.getItem("freereaderUpgradePlan");
      offerPending = !!sessionStorage.getItem(GOLD_OFFER_RETURN_KEY);
    } catch { /* unavailable */ }
    const licensePending = !!pendingLicense();
    if (!isEnhancedPlan(pending) && !offerPending && !licensePending) return;
    rememberAuthReturn();
    const supabase = supabaseClient();
    let active = true;
    const goToReader = () => { if (active) window.location.replace("/reader/audiobooks"); };
    // Let Supabase consume the OAuth code/hash on the root before navigating.
    if (supabase) void supabase.auth.getSession().then(goToReader, goToReader);
    else goToReader();
    return () => { active = false; };
  }, [pathname]);
  return null;
}
