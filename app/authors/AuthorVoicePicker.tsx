"use client";

import { useEffect, useRef, useState } from "react";
import { SPEECH_LANGUAGES, voiceForLanguage, voicesForLanguage, type SpeechLanguage } from "../reader/speech";
import { voicePreviewPath, type NarratorVoice } from "../reader/voices";
import styles from "./authors.module.css";

export default function AuthorVoicePicker({ voice, language, onChange }: {
  voice: NarratorVoice; language?: SpeechLanguage;
  onChange: (voice: NarratorVoice, language?: SpeechLanguage) => void;
}) {
  const [open, setOpen] = useState(false);
  const [previewing, setPreviewing] = useState<NarratorVoice | null>(null);
  const [error, setError] = useState("");
  const audioRef = useRef<HTMLAudioElement>(null);
  const closeButtonRef = useRef<HTMLButtonElement>(null);

  function stopPreview() {
    audioRef.current?.pause();
    setPreviewing(null);
  }

  function close() {
    stopPreview();
    setOpen(false);
  }

  useEffect(() => {
    if (!open) return;
    closeButtonRef.current?.focus();
    const onKeyDown = (event: KeyboardEvent) => { if (event.key === "Escape") close(); };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [open]);

  async function preview(value: NarratorVoice) {
    const player = audioRef.current;
    if (!player) return;
    if (previewing === value) { stopPreview(); return; }
    player.pause();
    player.src = voicePreviewPath(value, language ?? "en");
    player.currentTime = 0;
    setError("");
    try { await player.play(); setPreviewing(value); }
    catch { setPreviewing(null); setError("Could not play this preview. Try another voice."); }
  }

  return <section className={styles.voicePicker} aria-label="Default reading voice">
    <audio ref={audioRef} onEnded={() => setPreviewing(null)} />
    <strong>Default reading voice</strong>
    <p>Readers can change the voice at any time.</p>
    <button type="button" className={styles.secondary} onClick={() => setOpen(true)}>Choose a voice</button>
    {open && <div className={styles.voiceBackdrop} onMouseDown={close}>
      <div className={styles.voiceDialog} role="dialog" aria-modal="true" aria-label="Choose a voice" onMouseDown={(event) => event.stopPropagation()}>
        <div className={styles.voiceDialogHeader}><h2>Choose a voice</h2><button ref={closeButtonRef} type="button" onClick={close} aria-label="Close voice picker">Done</button></div>
        <label>Language
          <select value={language ?? "en"} onChange={(event) => {
            stopPreview();
            const next = event.target.value as SpeechLanguage;
            onChange(voiceForLanguage(voice, next), next);
          }}>
            {SPEECH_LANGUAGES.map(([code, name]) => <option key={code} value={code}>{name}</option>)}
          </select>
        </label>
        <div className={styles.voiceOptions} role="group" aria-label="Available voices">
          {voicesForLanguage(language ?? "en").map(([value, name]) => <div className={styles.voiceOption} key={value}>
            <button type="button" aria-pressed={voice === value} onClick={() => onChange(value, language)}>{name}</button>
            <button type="button" onClick={() => void preview(value)} aria-label={`${previewing === value ? "Stop" : "Preview"} ${name}`}>{previewing === value ? "Stop" : "Play"}</button>
          </div>)}
        </div>
        {error && <p className={styles.error} role="alert">{error}</p>}
      </div>
    </div>}
  </section>;
}
