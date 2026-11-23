"use client";

import { useEffect, useRef, useState } from "react";
import ScanDialog from "../reader/ScanDialog";
import { mobileScanDeviceCall, uploadMobileScan, type MobileScanSession } from "../reader/scanClient";
import styles from "../reader/scan.module.css";

type Device = { id: string; token: string; linkToken?: string };
const STORAGE_KEY = "freereader-mobile-scan";

export default function MobileScanner() {
  const [session, setSession] = useState<MobileScanSession>();
  const [device, setDevice] = useState<Device>();
  const [error, setError] = useState("");
  const [done, setDone] = useState(false);
  const [closed, setClosed] = useState(false);
  const [expired, setExpired] = useState(false);
  const startup = useRef<Promise<{ device: Device; session: MobileScanSession }>>(undefined);

  useEffect(() => {
    let active = true;
    // Keep the capability out of requests, referrers, analytics, and the visible URL.
    // A per-tab key allows a lost claim response or a page reload to resume safely.
    startup.current ??= (async () => {
      const fragment = window.location.hash.slice(1);
      window.history.replaceState(null, "", window.location.pathname);
      let saved: Device | undefined;
      try { saved = JSON.parse(sessionStorage.getItem(STORAGE_KEY) ?? "null") ?? undefined; } catch { /* new session */ }
      const match = /^([0-9a-f-]{36})\.([A-Za-z0-9_-]{43})$/.exec(fragment);
      if (fragment && !match) throw new Error("This scan link is invalid. Create a new link on your computer.");
      let current = saved;
      if (match) {
        const [, id, linkToken] = match;
        if (current?.id !== id || !current.token) {
          const bytes = crypto.getRandomValues(new Uint8Array(32));
          current = { id, token: Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("") };
        }
        current.linkToken = linkToken;
      }
      if (!current?.id || !current.token) throw new Error("Open a new scan link or QR code from FreeReader on your computer.");
      const remember = () => { try { sessionStorage.setItem(STORAGE_KEY, JSON.stringify(current)); } catch { /* current tab still works */ } };
      remember();
      if (current.linkToken) {
        await mobileScanDeviceCall(current.id, current.linkToken, "/claim", {
          method: "POST", body: JSON.stringify({ deviceToken: current.token }),
        });
        delete current.linkToken;
        remember();
      }
      const session = await mobileScanDeviceCall<MobileScanSession>(current.id, current.token);
      return { device: current, session };
    })();
    void startup.current.then(({ device, session }) => {
      if (!active) return;
      setDevice(device); setSession(session);
      if (session.status === "submitted") setDone(true);
      if (session.status === "uploading") setError("The previous upload was interrupted. Create a new scan link on your computer and select your photos again.");
    }).catch((error) => { if (active) setError((error as Error).message); });
    return () => { active = false; };
  }, []);

  useEffect(() => {
    if (!session || done || closed) return;
    const check = () => setExpired(Date.now() >= Date.parse(session.expiresAt));
    check(); const timer = setInterval(check, 1000);
    return () => clearInterval(timer);
  }, [session, done, closed]);

  async function close() {
    if (device && !done) await mobileScanDeviceCall(device.id, device.token, "", { method: "DELETE" }).catch(() => {});
    setClosed(true);
  }

  return <main className={`${styles.mobilePage} ph-no-capture ph-mask`}>
    <section className={styles.mobileCard}>
      <strong>FreeReader</strong>
      <h1>{done ? "Pages sent to your computer" : closed ? "Scan cancelled" : expired ? "Scan session expired" : "Scan with your phone"}</h1>
      {done ? <p>You can close this tab. Your computer will finish recognizing the text and add the document to your library.</p>
        : closed ? <p>Create a new scan link on your computer whenever you’re ready.</p>
        : expired ? <p>For your security, this upload window has ended. Create a new link on your computer.</p>
        : error ? <p role="alert" className={styles.error}>{error}</p>
        : <p role="status">{session ? "Your secure scanner is ready." : "Connecting securely…"}</p>}
    </section>
    {session && device && !error && !done && !closed && !expired && <ScanDialog
      onClose={() => { void close(); }} onComplete={() => {}}
      mobile={{ title: session.title, expiresAt: session.expiresAt, onSubmit: async (pages, title, status) => {
        await uploadMobileScan(device.id, device.token, pages, title, status);
        setDone(true);
      } }} />}
  </main>;
}
