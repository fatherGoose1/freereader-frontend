"use client";

import { useEffect, useState } from "react";
import type { Session } from "@supabase/supabase-js";
import { supabaseClient } from "../supabase";
import styles from "./page.module.css";

const backend = (process.env.NEXT_PUBLIC_KOKO_BACKEND_URL ?? "https://koko-backend-production-c887.up.railway.app").replace(/\/$/, "");

export default function ChromeConnect() {
  const [session, setSession] = useState<Session | null>(null);
  const [email, setEmail] = useState("");
  const [otp, setOtp] = useState("");
  const [sent, setSent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [connected, setConnected] = useState(false);
  const [pair, setPair] = useState("");

  useEffect(() => {
    setPair(new URLSearchParams(window.location.search).get("pair") ?? "");
    const client = supabaseClient();
    if (!client) { setMessage("FreeReader sign-in is unavailable."); return; }
    void client.auth.getSession().then(({ data }) => setSession(data.session));
    const { data } = client.auth.onAuthStateChange((_event, next) => setSession(next));
    return () => data.subscription.unsubscribe();
  }, []);

  async function connect() {
    if (!session || !pair) { setMessage("This connection link is invalid or expired. Start again from the extension."); return; }
    setBusy(true); setMessage("");
    try {
      const response = await fetch(`${backend}/api/v1/freereader/chrome/connect`, {
        method: "POST", headers: { Authorization: `Bearer ${session.access_token}`, "Content-Type": "application/json" },
        body: JSON.stringify({ code: pair }),
      });
      if (!response.ok) {
        const detail = await response.json() as { error?: string };
        throw Error(detail.error === "existing_subscription" ? "This account already has a subscription. Manage the existing plan before linking another purchase."
          : detail.error === "code_expired" ? "Connection expired. Start again from the extension." : detail.error ?? "Connection failed.");
      }
      const linked = await response.json() as { plan: string };
      setConnected(true);
      window.history.replaceState(null, "", window.location.pathname);
      setMessage(linked.plan.startsWith("gold_")
        ? "Connected! Your Gold access is now shared with FreeReader on the web and mobile. Return to the extension to continue listening."
        : "Connected! Your FreeReader account is ready in the extension. Return to the side panel to continue listening.");
    } catch (error) { setMessage(error instanceof Error ? error.message : "Connection failed."); }
    finally { setBusy(false); }
  }

  async function startGoogle() {
    const client = supabaseClient(); if (!client || !pair) return;
    setBusy(true);
    const { error } = await client.auth.signInWithOAuth({ provider: "google", options: {
      redirectTo: `${window.location.origin}/reader/chrome-connect?pair=${encodeURIComponent(pair)}`,
    } });
    if (error) { setMessage(error.message); setBusy(false); }
  }
  async function sendEmail() {
    const client = supabaseClient(); if (!client || !email.trim()) return;
    setBusy(true);
    const { error } = await client.auth.signInWithOtp({ email: email.trim(), options: { shouldCreateUser: true } });
    setBusy(false); setSent(!error); if (error) setMessage(error.message);
  }
  async function verifyEmail() {
    const client = supabaseClient(); if (!client) return;
    setBusy(true);
    const { error } = await client.auth.verifyOtp({ email: email.trim(), token: otp.trim(), type: "email" });
    setBusy(false); if (error) setMessage(error.message);
  }

  return <main className={styles.page}><section className={styles.card}>
    <span className={styles.brand}>✦ FreeReader</span><h1>Connect your account</h1>
    <p>Sign in with your FreeReader account to use it in this extension. Existing Gold access on the web or mobile will be available here too.</p>
    {!pair && !connected && <p role="alert">Open this page from the extension’s Sign in button.</p>}
    {pair && !session && <><button onClick={() => void startGoogle()} disabled={busy}>Continue with Google</button>
      <div className={styles.divider}>or sign in with email</div>
      <label>Email address<input type="email" value={email} onChange={event => setEmail(event.target.value)} autoComplete="email" /></label>
      {sent ? <><label>Code from email<input value={otp} onChange={event => setOtp(event.target.value)} inputMode="numeric" autoComplete="one-time-code" /></label>
        <button onClick={() => void verifyEmail()} disabled={busy || !otp}>Verify code</button></> :
        <button onClick={() => void sendEmail()} disabled={busy || !email}>Send sign-in code</button>}</>}
    {pair && session && !connected && <><p>Signed in as <strong>{session.user.email}</strong></p>
      <button onClick={() => void connect()} disabled={busy}>Connect this installation</button></>}
  </section></main>;
}
