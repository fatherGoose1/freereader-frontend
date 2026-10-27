"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";
import { isEnhancedPlan } from "../reader/enhanced";
import { supabaseClient } from "../reader/supabase";
import { GOLD_OFFER_RETURN_KEY } from "../reader/goldOffer";

// Supabase sends users to the site URL when a requested OAuth redirect is not
// allow-listed. Recover a pending Gold checkout instead of leaving them home.
export default function GoldAuthReturn() {
  const pathname = usePathname();
  useEffect(() => {
    if (pathname !== "/") return;
    let pending: string | null = null;
    let offerPending = false;
    try {
      pending = sessionStorage.getItem("freereaderUpgradePlan");
      offerPending = sessionStorage.getItem(GOLD_OFFER_RETURN_KEY) === "true";
    } catch { /* unavailable */ }
    if (!isEnhancedPlan(pending) && !offerPending) return;
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
