"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import qrcode from "qrcode-generator";
import { mobileScanOwnerCall, waitForScan, type MobileScanSession, type ScanResult, type ScanSchool } from "./scanClient";
import styles from "./scan.module.css";

export default function MobileScanHandoff({ title, school, onComplete, onBack }: {
  title: string; school?: ScanSchool; onComplete: (result: ScanResult) => Promise<void> | void; onBack: () => void;
}) {
  const [session, setSession] = useState<MobileScanSession>();
  const [message, setMessage] = useState("Creating a secure scan link…");
  const [error, setError] = useState("");
  const [now, setNow] = useState(Date.now());
  const [copied, setCopied] = useState(false);
  const [retry, setRetry] = useState(0);
  const complete = useRef(onComplete);
  complete.current = onComplete;
  const schoolId = school?.id, userId = school?.userId;

  useEffect(() => {
    const school = schoolId && userId ? { id: schoolId, userId } : undefined;
    const controller = new AbortController();
    let current: MobileScanSession | undefined;
    let timer: ReturnType<typeof setTimeout>;
    const revoke = () => { if (current) void mobileScanOwnerCall(`/${current.id}`, school, { method: "DELETE" }).catch(() => {}); };
    setSession(undefined); setError(""); setMessage("Creating a secure scan link…");
    const poll = async () => {
      try {
        const result = await mobileScanOwnerCall(`/${current!.id}`, school, { signal: controller.signal });
        if (controller.signal.aborted) return;
        setSession((previous) => ({ ...previous, ...result }));
        if (result.status === "expired" || result.status === "cancelled") {
          setMessage(result.status === "expired" ? "This scan link has expired. Create a new link to continue." : "This scan session was cancelled.");
          return;
        }
        if (result.status === "submitted" && result.scanId) {
          setError("");
          setMessage("Photos received. Recognizing text…");
          const scan = await waitForScan(result.scanId, setMessage, school, controller.signal);
          if (!controller.signal.aborted) await complete.current(scan);
          return;
        }
        setError("");
        setMessage(result.status === "pending" ? "Scan the QR code with your phone’s camera, or open the link on your phone."
          : result.status === "claimed" ? "Phone connected. Add and review pages on your phone."
          : "Your phone is uploading the pages…");
      } catch (error) {
        if (controller.signal.aborted) return;
        setError((error as Error).message);
      }
      if (!controller.signal.aborted) timer = setTimeout(() => void poll(), 2500);
    };
    void mobileScanOwnerCall("", school, { method: "POST", body: JSON.stringify({ title }) }).then((created) => {
      current = created;
      if (controller.signal.aborted) { revoke(); return; }
      setSession(created);
      void poll();
    }).catch((error) => { if (!controller.signal.aborted) setError((error as Error).message); });
    return () => { controller.abort(); clearTimeout(timer); revoke(); };
  }, [schoolId, userId, title, retry]);

  useEffect(() => { const timer = setInterval(() => setNow(Date.now()), 1000); return () => clearInterval(timer); }, []);
  const url = session?.token ? `${window.location.origin}/scan-mobile#${session.id}.${session.token}` : "";
  const svg = useMemo(() => {
    if (!url) return "";
    const qr = qrcode(0, "M"); qr.addData(url); qr.make();
    return qr.createSvgTag({ cellSize: 5, margin: 4, scalable: true });
  }, [url]);
  const remaining = session ? Math.max(0, Math.ceil((Date.parse(session.expiresAt) - now) / 1000)) : 0;
  const ended = session?.status === "expired" || session?.status === "cancelled" || (!!session && remaining === 0 && session.status !== "submitted");

  return <div className="ph-no-capture ph-mask" data-ph-no-capture>
    <h3>Scan with your phone</h3>
    {session?.status === "pending" && !ended && url && <>
      <div className={styles.qr} role="img" aria-label="QR code for the secure mobile scan link" dangerouslySetInnerHTML={{ __html: svg }} />
      <label className={styles.title}>Secure scan link<input readOnly value={url} onFocus={(event) => event.target.select()} /></label>
      <button type="button" onClick={() => { if (!navigator.clipboard) { setError("Select the link above to copy it."); return; } void navigator.clipboard.writeText(url).then(() => setCopied(true), () => setError("Select the link above to copy it.")); }}>{copied ? "Link copied" : "Copy link"}</button>
      <p>This one-use link expires in {Math.floor(remaining / 60)}:{String(remaining % 60).padStart(2, "0")}. Keep it private.</p>
    </>}
    {session && ["claimed", "uploading"].includes(session.status) && !ended && <p>Upload window: {Math.floor(remaining / 60)}:{String(remaining % 60).padStart(2, "0")}. Keep this window open.</p>}
    <p role="status">{message}</p>
    {error && <p role="alert" className={styles.error}>{error}</p>}
    <div className={styles.actions}>
      {(ended || (error && !session)) && <button type="button" onClick={() => { setCopied(false); setRetry((value) => value + 1); }}>Create a new link</button>}
      <button type="button" onClick={onBack}>Cancel phone scan</button>
    </div>
  </div>;
}
