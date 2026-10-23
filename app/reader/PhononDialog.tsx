"use client";

import { useEffect, useRef, useState } from "react";
import type { Session } from "@supabase/supabase-js";
import { currentSessionAccessToken } from "./authToken";
import { VoiceRecorder } from "./voiceCloneAudio";
import { decodePhononRecording, phononWaveform, preparePhononClip, PHONON_CLIP_SECONDS } from "./phononAudio";
import { createPhononVoice, deletePhononVoice, listPhononVoices, phononVoiceStatus, speakPhononVoice, type PhononCatalog } from "./phonon";
import { phononVoiceRef } from "./voices";
import styles from "./reader.module.css";

export default function PhononDialog({ session, onClose, onUpgrade, onSignIn, onSelect, onDelete }: {
  session: Session | null;
  onClose: () => void;
  onUpgrade: () => void;
  onSignIn: () => void;
  onSelect: (voice: ReturnType<typeof phononVoiceRef>) => void;
  onDelete: (id: string) => void;
}) {
  const [catalog, setCatalog] = useState<PhononCatalog | null>(null);
  const [recording, setRecording] = useState(false);
  const [audio, setAudio] = useState<AudioBuffer | null>(null);
  const [peaks, setPeaks] = useState<number[]>([]);
  const [start, setStart] = useState(0);
  const [name, setName] = useState("");
  const [preview, setPreview] = useState("");
  const [voicePreview, setVoicePreview] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [pollRetry, setPollRetry] = useState(0);
  const recorder = useRef<VoiceRecorder | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);

  async function refresh() {
    const token = await currentSessionAccessToken();
    if (!token) throw new Error("Sign in to access your voices.");
    setCatalog(await listPhononVoices(token));
  }

  useEffect(() => {
    if (!session) { setCatalog(null); return; }
    let active = true;
    setCatalog(null);
    setError("");
    void currentSessionAccessToken().then((token) => {
      if (!token) throw new Error("Sign in to access your voices.");
      return listPhononVoices(token);
    }).then((result) => { if (active) setCatalog(result); })
      .catch(() => { if (active) setError("Couldn't load your voices. Please try again."); });
    return () => { active = false; };
  }, [session?.user.id]);

  useEffect(() => {
    if (!session || !catalog?.voices.some((voice) => voice.status === "pending")) return;
    let active = true;
    const timeout = setTimeout(() => {
      void currentSessionAccessToken().then(async (token) => {
        if (!token) return;
        await Promise.all(catalog.voices.filter((voice) => voice.status === "pending")
          .map((voice) => phononVoiceStatus(token, voice.id)));
        const updated = await listPhononVoices(token);
        if (active) setCatalog(updated);
      }).catch(() => { if (active) {
        setError("Couldn't check voice progress. Retrying…");
        setPollRetry((retry) => retry + 1);
      } });
    }, 2000);
    return () => { active = false; clearTimeout(timeout); };
  }, [catalog, session?.user.id, pollRetry]);

  useEffect(() => {
    if (!audio) return;
    let active = true;
    void preparePhononClip(audio, start).then((blob) => {
      if (!active) return;
      setPreview(URL.createObjectURL(blob));
    }).catch(() => { if (active) setError("Couldn't prepare this sample."); });
    return () => { active = false; };
  }, [audio, start]);
  useEffect(() => () => { if (preview) URL.revokeObjectURL(preview); }, [preview]);
  useEffect(() => () => { if (voicePreview) URL.revokeObjectURL(voicePreview); }, [voicePreview]);
  useEffect(() => () => { recorder.current?.cancel(); }, []);

  async function load(file: Blob) {
    setBusy(true);
    setError("");
    try {
      const decoded = await decodePhononRecording(file);
      setAudio(decoded);
      setPeaks(phononWaveform(decoded));
      setStart(0);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Couldn't read the recording.");
    } finally { setBusy(false); }
  }

  async function toggleRecording() {
    setError("");
    try {
      if (recording) {
        setRecording(false);
        await load(await recorder.current!.stop());
      } else {
        const next = new VoiceRecorder();
        recorder.current = next;
        await next.start();
        setRecording(true);
      }
    } catch (reason) {
      setRecording(false);
      recorder.current?.cancel();
      setError(reason instanceof Error ? reason.message : "Couldn't record audio.");
    }
  }

  async function create() {
    if (!audio || !catalog?.can_clone || !catalog.monthly_remaining || !catalog.stored_remaining || !name.trim()) return;
    setBusy(true);
    setError("");
    try {
      const token = await currentSessionAccessToken();
      if (!token) throw new Error("Sign in to clone a voice.");
      await createPhononVoice(token, name.trim(), await preparePhononClip(audio, start));
      setName("");
      await refresh();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Couldn't create the voice.");
      try { await refresh(); } catch { /* Keep the current catalog for retry. */ }
    } finally { setBusy(false); }
  }

  async function remove(id: string, voiceName: string) {
    if (!window.confirm(`Delete ${voiceName}? Successful clones still count toward this month's three voices.`)) return;
    setBusy(true);
    setError("");
    try {
      const token = await currentSessionAccessToken();
      if (!token) throw new Error("Sign in to delete a voice.");
      await deletePhononVoice(token, id);
      onDelete(id);
      await refresh();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Couldn't delete the voice.");
    } finally { setBusy(false); }
  }

  async function previewSaved(id: string) {
    setBusy(true);
    setError("");
    try {
      const token = await currentSessionAccessToken();
      if (!token) throw new Error("Sign in to preview your voice.");
      const response = await speakPhononVoice(token, id, ["Once upon a time, every story had a voice of its own."], 1);
      const blob = await response.blob();
      if (!blob.size || !blob.type.startsWith("audio/")) throw new Error("Voice preview is unavailable.");
      setVoicePreview(URL.createObjectURL(blob));
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Voice preview is unavailable.");
    } finally { setBusy(false); }
  }

  return <div className={styles.settingsBackdrop} onMouseDown={onClose}>
    <div className={`${styles.voicePopover} ${styles.phononDialog}`} role="dialog" aria-modal="true" aria-label="Clone a voice" onMouseDown={(event) => event.stopPropagation()}>
      <div className={styles.settingsTitle}><strong>Clone a voice</strong><button type="button" onClick={onClose}>Done</button></div>
      <p>Record or import a familiar voice for your English books. Your voices and monthly allowance are shared with the iPhone app.</p>
      {!session ? <div className={styles.phononSection}><p>Sign in to save your voices to your account.</p>
        <button type="button" onClick={onSignIn}>Sign in</button></div>
        : !catalog ? <div className={styles.phononSection}>
          <p>{error || "Loading your voices…"}</p>
          {error && <button type="button" onClick={() => { setError(""); void refresh().catch(() => setError("Couldn't load your voices. Please try again.")); }}>Try again</button>}
        </div> : <>
          {!catalog.can_clone ? <div className={styles.phononSection}>
            <p>A linked FreeReader Gold subscription is required to create and use a voice. You can still delete saved voices.</p>
            <button type="button" onClick={onUpgrade}>Explore Gold</button>
          </div> : <div className={styles.phononSection}>
            <strong>{catalog.monthly_remaining} of 3 clones left this month · {catalog.stored_remaining} storage slots open</strong>
            <p>Successful clones count for the UTC month, even if deleted. Failed attempts release their credit and slot.</p>
            <div className={styles.phononActions}>
              <button type="button" onClick={() => void toggleRecording()} disabled={busy}>{recording ? "Stop recording" : "Record"}</button>
              <button type="button" onClick={() => fileInput.current?.click()} disabled={busy || recording}>Import audio</button>
              <input ref={fileInput} type="file" accept="audio/*" hidden onChange={(event) => {
                const file = event.target.files?.[0];
                if (file) void load(file);
                event.target.value = "";
              }} />
            </div>
            {recording && <p role="status">Recording… Speak naturally for at least ten seconds.</p>}
            {audio && !recording && <>
              <label htmlFor="phonon-name">Voice name</label>
              <input id="phonon-name" type="text" maxLength={80} value={name} placeholder="e.g. Grandma's stories" onChange={(event) => setName(event.target.value)} />
              <div className={styles.phononWaveform} aria-hidden="true">{peaks.map((peak, index) =>
                <i key={index} style={{ height: `${Math.max(8, peak * 100)}%` }} />)}</div>
              <label htmlFor="phonon-start">Select ten seconds: {start.toFixed(1)}s – {(start + PHONON_CLIP_SECONDS).toFixed(1)}s</label>
              <input id="phonon-start" type="range" min="0" max={Math.max(0, audio.duration - PHONON_CLIP_SECONDS)} step="0.1"
                value={start} onChange={(event) => setStart(Number(event.target.value))} />
              {preview && <audio controls src={preview} aria-label="Preview selected ten seconds" />}
              <small>Only the selected ten seconds are uploaded. Use a speaker's voice with their consent.</small>
              <button className={styles.primaryAction} type="button" onClick={() => void create()}
                disabled={busy || !name.trim() || !catalog.monthly_remaining || !catalog.stored_remaining}>
                {busy ? "Creating your voice…" : "Clone this voice"}
              </button>
              {!catalog.monthly_remaining && <small>Your monthly voices refresh next month.</small>}
              {!catalog.stored_remaining && <small>Delete a voice to make room.</small>}
            </>}
          </div>}
          <div className={styles.phononSection}>
            <strong>Your voices</strong>
            {!catalog.voices.length && <p>Your first voice will appear here.</p>}
            {catalog.voices.map((voice) => <div className={styles.phononVoice} key={voice.id}>
              <span><b>{voice.name}</b><small>{voice.status === "active" ? "Ready for your books" : voice.status === "pending"
                ? "Making your voice…" : "Couldn't finish · this attempt didn't count"}</small></span>
              {voice.status === "active" && catalog.can_clone && <button type="button" onClick={() => { onSelect(phononVoiceRef(voice.id)); onClose(); }}>Use for books</button>}
              {voice.status === "active" && catalog.can_clone && <button type="button" disabled={busy} onClick={() => void previewSaved(voice.id)}>Preview</button>}
              <button type="button" disabled={busy} onClick={() => void remove(voice.id, voice.name)}>Delete</button>
            </div>)}
            {voicePreview && <audio controls autoPlay src={voicePreview} aria-label="Cloned voice preview" />}
          </div>
          {error && <p role="alert" className={styles.goldError}>{error}</p>}
        </>}
    </div>
  </div>;
}
