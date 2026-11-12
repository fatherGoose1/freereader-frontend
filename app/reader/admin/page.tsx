"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import type { Session } from "@supabase/supabase-js";
import { listLicenses, type LicenseList } from "../licenses";
import { supabaseClient } from "../supabase";
import styles from "./licenses.module.css";

const redeemUrl = (code: string) => `https://www.freereader.io/reader/audiobooks?redeem=${code}`;

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
    <h1>Admin</h1>
    {!ready ? <p>Loading…</p> : !session ? <p>Sign in to view your licenses. <Link href="/reader/audiobooks">Open reader</Link></p> : <>
      {error && <p role="alert">{error}</p>}
      {data && <>
        <p className={styles.summary}>Available licenses: {data.available} out of {data.total}</p>
        <div className={styles.list}>{data.licenses.map((license) => <div key={license.code} className={styles.row}>
          <code>{license.code}</code>
          <span>{license.redeemed ? "Used" : "Available"}</span>
          <a href={redeemUrl(license.code)}>{redeemUrl(license.code)}</a>
          <button type="button" onClick={() => void copy(license.code)}>Copy redemption link</button>
          {copied === license.code && <small>Copied</small>}
        </div>)}</div>
      </>}
    </>}
  </main>;
}
