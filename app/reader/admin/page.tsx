"use client";

import { useCallback, useEffect, useRef, useState, type FormEvent } from "react";
import type { Session } from "@supabase/supabase-js";
import { listLicenses, purchaseLicenses, quoteLicenses, registerAdmin, type LicenseList, type LicenseQuote } from "../licenses";
import { supabaseClient } from "../supabase";
import styles from "./licenses.module.css";

const redeemUrl = (code: string) => `https://www.freereader.io/reader/audiobooks?redeem=${code}`;
const expiryFormat = new Intl.DateTimeFormat("en-US", { dateStyle: "medium", timeZone: "UTC" });
const dollars = (cents: number) => new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(cents / 100);

export default function ReaderAdminPage() {
  const [session, setSession] = useState<Session | null>(null);
  const [ready, setReady] = useState(false);
  const [data, setData] = useState<LicenseList | null>(null);
  const [error, setError] = useState("");
  const [copied, setCopied] = useState("");
  const [enroll, setEnroll] = useState(false);
  const [notAdmin, setNotAdmin] = useState(false);
  const [mode, setMode] = useState<"signup" | "signin" | "confirm">("signup");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [code, setCode] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [quantity, setQuantity] = useState(1);
  const [quote, setQuote] = useState<LicenseQuote | null>(null);
  const [quoteError, setQuoteError] = useState("");
  const [awaitingPurchase, setAwaitingPurchase] = useState(false);
  const currentUser = useRef<string | null>(null);

  const refresh = useCallback(async (token: string, ownerId: string) => {
    try {
      const licenses = await listLicenses(token);
      if (currentUser.current !== ownerId) return;
      setData(licenses); setNotAdmin(false); setError("");
    } catch (cause) {
      if (currentUser.current !== ownerId) return;
      setData(null);
      if (cause instanceof Error && cause.message === "forbidden") setNotAdmin(true);
      else setError("Could not load your licenses. Please try again.");
    }
  }, []);

  useEffect(() => {
    setEnroll(new URLSearchParams(window.location.search).get("signup") === "1");
    setAwaitingPurchase(new URLSearchParams(window.location.search).get("checkout") === "success");
    const client = supabaseClient();
    if (!client) { setReady(true); return; }
    const { data: listener } = client.auth.onAuthStateChange((_event, next) => {
      if (currentUser.current !== next?.user.id) {
        setData(null); setNotAdmin(false); setQuote(null);
      }
      currentUser.current = next?.user.id ?? null;
      setSession(next);
      setReady(true);
    });
    return () => listener.subscription.unsubscribe();
  }, []);

  useEffect(() => {
    if (!session) return;
    let active = true;
    const wantsAdmin = enroll || new URLSearchParams(window.location.search).get("signup") === "1";
    void (async () => {
      try {
        if (wantsAdmin) await registerAdmin(session.access_token);
        if (active) await refresh(session.access_token, session.user.id);
        if (active && wantsAdmin) {
          setEnroll(false);
          window.history.replaceState(null, "", "/reader/admin");
        }
      } catch (cause) { if (active) setError(cause instanceof Error ? cause.message : "Could not set up your admin account. Please try again."); }
    })();
    return () => { active = false; };
  }, [session?.access_token, enroll, refresh]);

  useEffect(() => {
    if (!session || !data || !Number.isInteger(quantity) || quantity < 1 || quantity > 1000) { setQuote(null); return; }
    let active = true;
    setQuote(null);
    setQuoteError("");
    const timer = setTimeout(() => {
      void quoteLicenses(session.access_token, quantity)
        .then((result) => { if (active) setQuote(result); })
        .catch((cause) => { if (active) setQuoteError(cause instanceof Error ? cause.message : "Could not load a quote."); });
    }, 300);
    return () => { active = false; clearTimeout(timer); };
  }, [session?.access_token, data?.pool?.quantity, data?.pool?.renews_at, quantity]);

  useEffect(() => {
    if (!session || !data) return;
    const onFocus = () => void refresh(session.access_token, session.user.id);
    window.addEventListener("focus", onFocus);
    return () => window.removeEventListener("focus", onFocus);
  }, [session?.access_token, data !== null, refresh]);

  useEffect(() => {
    if (!session || !awaitingPurchase) return;
    setMessage("Payment received. Your licenses will appear after Stripe confirms it.");
    const timer = window.setInterval(() => void refresh(session.access_token, session.user.id), 2000);
    const timeout = window.setTimeout(() => { window.clearInterval(timer); setAwaitingPurchase(false); }, 30_000);
    return () => { window.clearInterval(timer); window.clearTimeout(timeout); };
  }, [session?.access_token, awaitingPurchase, refresh]);

  async function authenticate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const client = supabaseClient();
    if (!client) { setError("Sign-in is unavailable right now."); return; }
    setBusy(true); setError(""); setMessage("");
    try {
      if (mode === "signup") {
        const { data: result, error: cause } = await client.auth.signUp({ email: email.trim(), password,
          options: { emailRedirectTo: `${window.location.origin}/reader/admin?signup=1` } });
        if (cause) throw cause;
        setEnroll(true);
        if (!result.session) { setMode("confirm"); setMessage("Check your email for a confirmation code or link."); }
      } else if (mode === "confirm") {
        const { error: cause } = await client.auth.verifyOtp({ email: email.trim(), token: code.trim(), type: "signup" });
        if (cause) throw cause;
      } else {
        const { error: cause } = await client.auth.signInWithPassword({ email: email.trim(), password });
        if (cause) throw cause;
      }
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Could not sign in."); }
    finally { setBusy(false); }
  }

  async function oauth() {
    const client = supabaseClient();
    if (!client) { setError("Sign-in is unavailable right now."); return; }
    setError("");
    const { error: cause } = await client.auth.signInWithOAuth({ provider: "google",
      options: { redirectTo: `${window.location.origin}/reader/admin?signup=1` } });
    if (cause) setError(cause.message);
  }

  async function checkout() {
    if (!session || !quote || busy) return;
    setBusy(true); setError("");
    try {
      const result = await purchaseLicenses(session.access_token, quote.quantity);
      if (result.url) window.location.assign(result.url);
      else { setMessage("Your purchase is processing. New licenses will appear once payment succeeds."); setAwaitingPurchase(true); await refresh(session.access_token, session.user.id); }
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Could not start checkout."); }
    finally { setBusy(false); }
  }

  async function copy(code: string) {
    try {
      await navigator.clipboard.writeText(redeemUrl(code));
      setCopied(code);
    } catch { setError("Could not copy the link."); }
  }

  return <main className={styles.page}>
    <header className={styles.header}>
      <div><span className={styles.eyebrow}>FREEREADER / ADMIN</span><h1>Gold licenses</h1><p>Manage Gold access for your students or group.</p></div>
      {data && <div className={styles.summary}>Available licenses: <strong>{data.available}</strong> out of {data.total}</div>}
    </header>
    {!ready ? <p className={styles.message}>Loading…</p> : !session
      ? <section className={`${styles.panel} ${styles.loginPanel}`} aria-label="Admin account"><div className={styles.formPanel}>
        <h2>{mode === "signup" ? "Create an admin account" : mode === "confirm" ? "Confirm your email" : "Sign in to your admin account"}</h2>
        <p>Purchase and distribute licenses.</p>
        {mode !== "confirm" && <>
          <button className={styles.googleButton} type="button" onClick={() => void oauth()}>
            <svg viewBox="0 0 24 24" width="24" height="24" aria-hidden="true">
              <path fill="#4285F4" d="M21.35 12.22c0-.7-.06-1.36-.18-2H12v3.78h5.24a4.48 4.48 0 0 1-1.95 2.94v2.45h3.16c1.85-1.7 2.9-4.22 2.9-7.17Z" />
              <path fill="#34A853" d="M12 21.5c2.64 0 4.86-.87 6.48-2.36l-3.16-2.45c-.88.59-2 .94-3.32.94-2.55 0-4.72-1.72-5.49-4.03H3.26v2.53A9.8 9.8 0 0 0 12 21.5Z" />
              <path fill="#FBBC05" d="M6.51 13.6a5.9 5.9 0 0 1 0-3.2V7.87H3.26a9.8 9.8 0 0 0 0 8.26l3.25-2.53Z" />
              <path fill="#EA4335" d="M12 6.38c1.44 0 2.73.49 3.74 1.46l2.8-2.8A9.34 9.34 0 0 0 12 2.5a9.8 9.8 0 0 0-8.74 5.37l3.25 2.53C7.28 8.1 9.45 6.38 12 6.38Z" />
            </svg>
            <span>Sign in with Google</span>
          </button>
          <div className={styles.divider}>or use email</div>
        </>}
        <form onSubmit={(event) => void authenticate(event)} className={styles.form}>
          <label>Email address<input type="email" autoComplete="email" required value={email} readOnly={mode === "confirm"} onChange={(event) => setEmail(event.target.value)} /></label>
          {mode === "confirm" ? <label>Confirmation code<input required value={code} autoComplete="one-time-code" onChange={(event) => setCode(event.target.value)} /></label>
            : <label>Password<input type="password" required minLength={6} autoComplete={mode === "signup" ? "new-password" : "current-password"} value={password} onChange={(event) => setPassword(event.target.value)} /></label>}
          {error && <p role="alert" className={styles.error}>{error}</p>}{message && <p role="status">{message}</p>}
          <button className={styles.primary} disabled={busy}>{busy ? "Please wait…" : mode === "signup" ? "Create admin account" : mode === "confirm" ? "Confirm email" : "Sign in"}</button>
        </form>
        <button className={styles.textButton} type="button" onClick={() => { setMode(mode === "signin" ? "signup" : "signin"); setError(""); }}>
          {mode === "signin" ? "New here? Create an admin account" : "Already have an account? Sign in"}</button>
      </div></section>
      : <>
        {error && <p className={styles.error} role="alert">{error}</p>}
        {notAdmin && <section className={styles.panel}><div className={styles.formPanel}><h2>Admin access</h2>
          <p>This account is not set up as an administrator yet.</p>
          <button className={styles.primary} type="button" onClick={() => { setEnroll(true); setNotAdmin(false); }}>Create an admin portal</button>
        </div></section>}
        {data && <section className={styles.panel} aria-label="Purchase Gold licenses"><div className={styles.formPanel}>
          <h2>Add Gold licenses</h2><p>$10 per license per year. Share a redemption link with each student.</p>
          {data.pool?.status === "checkout" && <p>A checkout is in progress. You can return to it or change the quantity below.</p>}
          {data.pool?.status === "active" && <p>All licenses renew together on {expiryFormat.format(new Date(data.pool.renews_at))}. Additional licenses are prorated until that date.</p>}
          <label className={styles.quantity}>Number of new licenses<input type="number" min="1" max="1000" step="1" value={quantity}
            onChange={(event) => setQuantity(event.target.valueAsNumber)} /></label>
          {quote ? <div className={styles.estimate}><span>{quote.prorated ? "Estimated due now (prorated)" : "Due today"}</span><strong>{dollars(quote.amount_cents)}</strong>
            <span>{dollars(quote.renewal_total_cents)} total per year at renewal{quote.renews_at ? ` on ${expiryFormat.format(new Date(quote.renews_at))}` : ""}.</span></div>
            : <p>{quoteError || "Enter a valid quantity to see your total."}</p>}
          {message && <p role="status">{message}</p>}
          <button type="button" className={styles.primary} disabled={!quote || busy} onClick={() => void checkout()}>{busy ? "Processing…" : "Purchase licenses"}</button>
          <p>Final prorated amount is calculated by Stripe at checkout. Licenses appear after payment.</p>
        </div></section>}
        {data && <section className={styles.panel} aria-label="Gold licenses">
          <div className={styles.panelHeader}><h2>Licenses</h2><span>{data.total} total</span></div>
          <div className={styles.tableScroll}>
            <table className={styles.table}>
              <thead><tr><th scope="col">Code</th><th scope="col">Status</th><th scope="col">Valid until</th><th scope="col">Redemption link</th><th scope="col"><span className={styles.srOnly}>Actions</span></th></tr></thead>
              <tbody>{data.licenses.length ? data.licenses.map((license) => <tr key={license.code}>
                <th scope="row"><code>{license.code}</code></th>
                <td><span className={`${styles.status} ${license.expired ? styles.expired : license.redeemed ? styles.used : styles.available}`}>
                  <i aria-hidden="true" />{license.expired ? "Expired" : license.redeemed ? "Used" : "Available"}</span></td>
                <td className={styles.expiry}>{expiryFormat.format(new Date(license.expires_at))}</td>
                <td><a href={redeemUrl(license.code)} title={redeemUrl(license.code)}>{redeemUrl(license.code)}</a></td>
                <td><button type="button" className={styles.copy} onClick={() => void copy(license.code)}
                  aria-label={`Copy redemption link for ${license.code}`}>
                  {copied === license.code ? "Copied ✓" : "Copy link"}</button></td>
              </tr>) : <tr><td colSpan={5} className={styles.empty}>No licenses assigned yet.</td></tr>}</tbody>
            </table>
          </div>
        </section>}
        <button className={styles.textButton} type="button" onClick={() => void supabaseClient()?.auth.signOut()}>Sign out</button>
      </>}
  </main>;
}
