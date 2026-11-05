"use client";

import { useState, type FormEvent } from "react";
import { supabaseClient } from "./supabase";
import styles from "./reader.module.css";

type Mode = "sign-in" | "sign-up" | "confirm" | "forgot" | "recovery";

export default function EmailAuthForm({ recovery }: { recovery: boolean }) {
  const [mode, setMode] = useState<Mode>(recovery ? "recovery" : "sign-in");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const currentMode = recovery ? "recovery" : mode;

  function switchMode(next: Mode) {
    setMode(next);
    setPassword("");
    setCode("");
    setError("");
    setMessage("");
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const client = supabaseClient();
    if (!client || busy) { if (!client) setError("Email sign-in is unavailable right now."); return; }
    setBusy(true);
    setError("");
    setMessage("");
    try {
      if (currentMode === "sign-up") {
        const { data, error: authError } = await client.auth.signUp({
          email: email.trim(), password,
          options: { emailRedirectTo: `${window.location.origin}/reader/audiobooks` },
        });
        if (authError) throw authError;
        if (data.session) setMessage("Account created. You're signed in.");
        else {
          setPassword("");
          setMode("confirm");
          setMessage("Check your email for a confirmation code or link.");
        }
      } else if (currentMode === "confirm") {
        const { error: authError } = await client.auth.verifyOtp({ email: email.trim(), token: code.trim(), type: "signup" });
        if (authError) throw authError;
        setMessage("Email confirmed. You're signed in.");
      } else if (currentMode === "forgot") {
        const { error: authError } = await client.auth.resetPasswordForEmail(email.trim(), {
          redirectTo: `${window.location.origin}/reader/audiobooks`,
        });
        if (authError) throw authError;
        setMessage("If this address has an account, check your email for a password reset link.");
      } else if (currentMode === "recovery") {
        const { error: authError } = await client.auth.updateUser({ password });
        if (authError) throw authError;
        setPassword("");
        setMessage("Password updated. You can close this window and continue reading.");
      } else {
        const { error: authError } = await client.auth.signInWithPassword({ email: email.trim(), password });
        if (authError) throw authError;
      }
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Something went wrong. Please try again.");
    } finally {
      setBusy(false);
    }
  }

  return <div className={styles.emailAuth}>
    <form onSubmit={(event) => void submit(event)}>
      {currentMode !== "recovery" && <label className={styles.fieldLabel}>Email address
        <input type="email" autoComplete="email" required readOnly={currentMode === "confirm"} value={email} onChange={(event) => setEmail(event.target.value)} />
      </label>}
      {currentMode === "confirm" && <label className={styles.fieldLabel}>Confirmation code
        <input type="text" inputMode="numeric" autoComplete="one-time-code" required value={code} onChange={(event) => setCode(event.target.value)} />
      </label>}
      {currentMode !== "forgot" && currentMode !== "confirm" && <label className={styles.fieldLabel}>{currentMode === "recovery" ? "New password" : "Password"}
        <input type="password" autoComplete={currentMode === "sign-in" ? "current-password" : "new-password"}
          required minLength={6} value={password} onChange={(event) => setPassword(event.target.value)} />
      </label>}
      {error && <p role="alert" className={styles.emailAuthError}>{error}</p>}
      {message && <p role="status">{message}</p>}
      <button className={styles.primaryAction} type="submit" disabled={busy}>
        {busy ? "Please wait…" : currentMode === "sign-up" ? "Create account" : currentMode === "confirm" ? "Confirm email" : currentMode === "forgot" ? "Send reset link" : currentMode === "recovery" ? "Save new password" : "Sign in with email"}
      </button>
    </form>
    {!recovery && <div className={styles.emailAuthLinks}>
      {currentMode !== "sign-in" && <button type="button" onClick={() => switchMode("sign-in")}>Sign in</button>}
      {currentMode !== "sign-up" && currentMode !== "confirm" && <button type="button" onClick={() => switchMode("sign-up")}>Create an account</button>}
      {currentMode !== "forgot" && <button type="button" onClick={() => switchMode("forgot")}>Forgot password?</button>}
    </div>}
  </div>;
}
