"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import styles from "./supportWidget.module.css";

export default function SupportWidget() {
  const [open, setOpen] = useState(false);
  const [email, setEmail] = useState("");
  const [message, setMessage] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState("");
  const launcher = useRef<HTMLButtonElement>(null);
  const dialog = useRef<HTMLElement>(null);
  const emailInput = useRef<HTMLInputElement>(null);
  const closeButton = useRef<HTMLButtonElement>(null);

  function close() {
    setOpen(false);
    setError("");
    if (submitted) { setSubmitted(false); setEmail(""); setMessage(""); }
    requestAnimationFrame(() => launcher.current?.focus());
  }

  useEffect(() => {
    if (!open) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    (submitted ? closeButton.current : emailInput.current)?.focus();
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") { close(); return; }
      if (event.key !== "Tab") return;
      const controls = Array.from(dialog.current?.querySelectorAll<HTMLElement>("button:not(:disabled), input:not(:disabled), textarea:not(:disabled)") ?? []);
      const first = controls[0];
      const last = controls.at(-1);
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
    };
    document.addEventListener("keydown", onKeyDown);
    return () => { document.body.style.overflow = previousOverflow; document.removeEventListener("keydown", onKeyDown); };
  }, [open, submitted]);

  async function send(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (submitting) return;
    setSubmitting(true);
    setError("");
    try {
      const response = await fetch("/api/support-requests", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: email.trim(), message: message.trim() }),
      });
      if (!response.ok) throw new Error(response.status === 400 ? "Check your email and message, then try again." : "Could not send your request. Please try again.");
      setSubmitted(true);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Could not send your request. Please try again.");
    } finally { setSubmitting(false); }
  }

  return <>
    <button ref={launcher} type="button" className={styles.launcher} aria-label="Contact support" aria-expanded={open} aria-controls="support-dialog" onClick={() => setOpen(true)}>?</button>
    {open && <div className={styles.backdrop} onMouseDown={close}>
      <section ref={dialog} id="support-dialog" role="dialog" aria-modal="true" aria-labelledby="support-title" className={styles.dialog} onMouseDown={(event) => event.stopPropagation()}>
        <header className={styles.header}><h2 id="support-title">Contact support</h2><button ref={closeButton} type="button" aria-label="Close support" onClick={close}>×</button></header>
        {submitted ? <div className={styles.success} role="status"><strong>Request received.</strong><p>We’ll reply to your email.</p></div> :
          <form onSubmit={(event) => void send(event)}>
            <label htmlFor="support-email">Email address</label>
            <input ref={emailInput} id="support-email" type="email" autoComplete="email" required maxLength={254} value={email} onChange={(event) => setEmail(event.target.value)} placeholder="you@example.com" />
            <label htmlFor="support-message">How can we help?</label>
            <textarea id="support-message" required minLength={10} maxLength={5000} rows={5} value={message} onChange={(event) => setMessage(event.target.value)} placeholder="Tell us what happened or what you need help with." />
            {error && <p className={styles.error} role="alert">{error}</p>}
            <button type="submit" className={styles.submit} disabled={submitting}>{submitting ? "Sending…" : "Send request"}</button>
          </form>}
      </section>
    </div>}
  </>;
}
