"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import type { Session } from "@supabase/supabase-js";
import { listLicenses, type LicenseList } from "../licenses";
import { supabaseClient } from "../supabase";
import styles from "./licenses.module.css";

const redeemUrl = (code: string) => `https://www.freereader.io/reader/audiobooks?redeem=${code}`;
const expiryFormat = new Intl.DateTimeFormat("en-US", { dateStyle: "medium", timeZone: "UTC" });

export default function ReaderAdminPage() {
  const [session, setSession] = useState<Session | null>(null);
  const [ready, setReady] = useState(false);
  const [data, setData] = useState<LicenseList | null>(null);
  const [error, setError] = useState("");
  const [copied, setCopied] = useState("");

  useEffect(() => {
    const client = supabaseClient();
    if (!client) { setReady(true); return; }
    const { data: listener } = client.auth.onAuthStateChange((_event, next) => {
      setSession(next);
      setReady(true);
    });
    return () => listener.subscription.unsubscribe();
  }, []);

  useEffect(() => {
    if (!session) return;
    let active = true;
    void listLicenses(session.access_token)
      .then((licenses) => { if (active) { setData(licenses); setError(""); } })
      .catch(() => { if (active) { setData(null); setError("Licenses are unavailable for this account."); } });
    return () => { active = false; };
  }, [session?.access_token]);

  async function copy(code: string) {
    try {
      await navigator.clipboard.writeText(redeemUrl(code));
      setCopied(code);
    } catch { setError("Could not copy the link."); }
  }

  return <main className={styles.page}>
    <Link href="/reader/audiobooks" className={styles.back}>← Back to reader</Link>
    <header className={styles.header}>
      <div><span className={styles.eyebrow}>ACCOUNT / ADMIN</span><h1>Gold licenses</h1></div>
      {data && <div className={styles.summary}>Available licenses: <strong>{data.available}</strong> out of {data.total}</div>}
    </header>
    {!ready ? <p className={styles.message}>Loading…</p> : !session
      ? <p className={styles.message}>Sign in to view your licenses. <Link href="/reader/audiobooks">Open reader</Link></p>
      : <>
        {error && <p className={styles.error} role="alert">{error}</p>}
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
      </>}
  </main>;
}
