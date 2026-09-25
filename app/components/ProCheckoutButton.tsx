"use client";

import { useState } from "react";
import { startCheckout } from "../reader/billing";
import { supabaseClient } from "../reader/supabase";

export default function ProCheckoutButton() {
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function start() {
    setBusy(true);
    setError("");
    try {
      const supabase = supabaseClient();
      if (!supabase) throw new Error("Google sign-in is unavailable. Please try again later.");
      const { data, error: sessionError } = await supabase.auth.getSession();
      if (sessionError) throw sessionError;
      if (!data.session) {
        let redirectTo = `${window.location.origin}/reader/audiobooks`;
        try { sessionStorage.setItem("freereaderUpgradeToPro", "1"); }
        catch { redirectTo += "?upgrade=pro"; }
        const { error: signInError } = await supabase.auth.signInWithOAuth({
          provider: "google",
          options: { redirectTo },
        });
        if (signInError) throw signInError;
        return;
      }
      window.location.assign(await startCheckout(data.session.access_token));
    } catch {
      try { sessionStorage.removeItem("freereaderUpgradeToPro"); } catch { /* unavailable */ }
      setError("Couldn't start checkout. Please try again.");
      setBusy(false);
    }
  }

  return <>
    <button className="button" type="button" onClick={() => void start()} disabled={busy}>
      {busy ? "Opening checkout…" : "Get Pro"}
    </button>
    {error && <small role="alert">{error}</small>}
  </>;
}
