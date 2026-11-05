"use client";

import { useEffect, useRef, useState } from "react";
import type { Session } from "@supabase/supabase-js";
import { currentSessionAccessToken } from "./authToken";
import { speakPhononCatalog, speakPhononVoice, type PhononCatalog, type PhononCatalogVoice } from "./phonon";
import { telemetryContext } from "./telemetry";
import { freeMultilingualChoices, freeVoiceChoices, goldVoiceChoices, type ChoiceGender, type VoiceChoice } from "./voiceFeelings";
import { catalogVoiceRef, phononVoiceRef, voicePreviewPath, type NarratorVoice } from "./voices";
import type { SpeechLanguage } from "./speech";
import styles from "./reader.module.css";

type Props = {
  language: SpeechLanguage;
  selected: NarratorVoice;
  gold: boolean;
  suspended: boolean;
  session: Session | null;
  clones: PhononCatalog | null;
  catalog: PhononCatalogVoice[] | null;
  catalogError: boolean;
  onSelect: (voice: NarratorVoice) => void;
  onClone: () => void;
  onUpgrade: () => void;
  onClose: () => void;
};

const SAMPLE = "The story begins here, on a bright and quiet morning.";

export default function VoiceSelectionDialog({ language, selected, gold, suspended, session, clones, catalog, catalogError,
  onSelect, onClone, onUpgrade, onClose }: Props) {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const sampleUrls = useRef(new Map<string, string>());
  const mounted = useRef(true);
  const suspendedRef = useRef(suspended);
  suspendedRef.current = suspended;
  const [playingId, setPlayingId] = useState<string | null>(null);
  const [previewing, setPreviewing] = useState<string | null>(null);
  const [previewError, setPreviewError] = useState("");

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      audioRef.current?.pause();
      for (const url of sampleUrls.current.values()) URL.revokeObjectURL(url);
      sampleUrls.current.clear();
    };
  }, []);
  useEffect(() => {
    if (suspended) { audioRef.current?.pause(); setPlayingId(null); }
  }, [suspended]);

  function playSample(id: string, url: string) {
    audioRef.current?.pause();
    const audio = new Audio(url);
    audioRef.current = audio;
    audio.onended = () => { if (audioRef.current === audio) setPlayingId(null); };
    audio.onerror = () => { if (audioRef.current === audio) { setPlayingId(null); setPreviewError("That sample is unavailable right now."); } };
    setPlayingId(id);
    void audio.play().catch(() => {
      if (audioRef.current === audio) { setPlayingId(null); setPreviewError("Sample ready. Tap play again to hear it."); }
    });
  }

  async function listen(id: NarratorVoice, kind: "free" | "builtin" | "catalog" | "clone") {
    if (previewing) return;
    setPreviewError("");
    if (playingId === id) { audioRef.current?.pause(); setPlayingId(null); return; }
    if (kind === "builtin") { playSample(id, voicePreviewPath(id, language)); return; }
    if (kind === "catalog") {
      const entry = catalog?.find((item) => catalogVoiceRef(item.id) === id);
      if (entry?.preview_url) { playSample(id, entry.preview_url); return; }
    }
    const cached = sampleUrls.current.get(id);
    if (cached) { playSample(id, cached); return; }
    setPreviewing(id);
    try {
      const token = await currentSessionAccessToken();
      if (!token) throw new Error("Sign in to listen to a voice sample.");
      let response: Response;
      if (kind === "free") {
        response = await fetch("/api/lite-tts-test", { method: "POST",
          headers: { "Content-Type": "application/json", "X-FreeReader-User-Token": token,
            "X-FreeReader-Context": JSON.stringify(telemetryContext("audiobook")) },
          body: JSON.stringify({ text: SAMPLE, speed: 1, voice: id }) });
      } else if (kind === "catalog" && catalog?.some((item) => catalogVoiceRef(item.id) === id && item.kind === "published")) {
        response = await fetch("/api/public-phonon-tts", { method: "POST",
          headers: { "Content-Type": "application/json", "X-FreeReader-User-Token": token,
            "X-FreeReader-Context": JSON.stringify(telemetryContext("audiobook")) },
          body: JSON.stringify({ texts: [SAMPLE], speed: 1, voice_id: id.slice(8) }) });
      } else if (kind === "catalog") {
        response = await speakPhononCatalog(token, id.slice(8), [SAMPLE], 1);
      } else {
        response = await speakPhononVoice(token, id.slice(7), [SAMPLE], 1);
      }
      if (!response.ok) throw new Error("Voice sample is unavailable. Try again shortly.");
      const blob = await response.blob();
      if (!blob.size || !blob.type.startsWith("audio/")) throw new Error("Voice sample is unavailable. Try again shortly.");
      if (!mounted.current) return;
      const url = URL.createObjectURL(blob);
      sampleUrls.current.set(id, url);
      if (!suspendedRef.current) playSample(id, url);
    } catch (error) {
      if (mounted.current) setPreviewError(error instanceof Error ? error.message : "Voice sample is unavailable.");
    } finally { if (mounted.current) setPreviewing(null); }
  }

  const genderClass = (gender: ChoiceGender) => gender === "female" ? styles.voiceChoiceFemale
    : gender === "male" ? styles.voiceChoiceMale : gender === "character" ? styles.voiceChoiceCharacter : styles.voiceChoiceNeutral;
  // Each tone gets its own stable badge colour, derived from the word itself.
  const feelingBadge = (feeling: string) => {
    let hue = 0;
    for (let index = 0; index < feeling.length; index += 1) hue = (hue * 31 + feeling.charCodeAt(index)) % 360;
    return { background: `hsl(${hue} 72% 92%)`, color: `hsl(${hue} 52% 32%)` };
  };

  const choice = (item: VoiceChoice, kind: "free" | "builtin" | "catalog" | "clone", locked = false) => (
    <article key={item.id} title={`${item.name} · ${item.feeling}`}
      className={`${styles.voiceChoice} ${genderClass(item.gender)}${selected === item.id ? ` ${styles.voiceChoiceSelected}` : ""}${locked ? ` ${styles.voiceChoiceLocked}` : ""}`}>
      {(kind !== "clone" || !locked) && <button type="button" className={styles.voiceListen} disabled={previewing !== null}
        aria-label={`${playingId === item.id ? "Pause" : "Play"} ${item.name} sample`} title={`${playingId === item.id ? "Pause" : "Play"} sample`}
        onClick={() => void listen(item.id, kind)}>{previewing === item.id ? "…" : playingId === item.id ? "❚❚" : "▶"}</button>}
      <button type="button" className={styles.voiceChoose} aria-pressed={selected === item.id && !locked}
        aria-label={locked ? `Get Gold to use ${item.name}` : selected === item.id ? `${item.name} selected` : `Choose ${item.name}`}
        onClick={() => locked ? onUpgrade() : onSelect(item.id)}>
        <span className={styles.voiceName}>{item.name}</span>
        <span className={styles.voiceFeeling} style={feelingBadge(item.feeling)}>{item.feeling}</span>
      </button>
    </article>
  );

  const available = language === "en" ? freeVoiceChoices() : freeMultilingualChoices();
  const builtins = goldVoiceChoices(language);
  const published = (catalog ?? []).filter((item) => item.kind === "published");
  const phonon = (catalog ?? []).filter((item) => item.kind === "catalog");
  const myVoices = (clones?.voices ?? []).filter((item) => item.status === "active");

  return <div className={styles.settingsBackdrop} inert={suspended} aria-hidden={suspended} onMouseDown={onClose}>
    <div className={`${styles.voicePopover} ${styles.voiceSelector}`} role="dialog" aria-modal="true" aria-label="Voice selection"
      onMouseDown={(event) => event.stopPropagation()}>
      <div className={styles.voiceSelectorHeader}>
        <h2>Choose a voice</h2>
        <button type="button" onClick={onClose} aria-label="Back to audio settings">✕</button>
      </div>
      {previewError && <p className={styles.voicePreviewError} role="alert">{previewError}</p>}

      {language === "en" && <section className={styles.voiceCloneSpotlight} aria-label="Your custom voices">
        <div><h3>Your custom voices</h3><p>Create custom voices for your audio.</p></div>
        <button type="button" onClick={onClone}>
          {!session ? "Sign in to create" : gold ? "Create custom voice" : "Manage custom voices · Gold"}
        </button>
        {myVoices.length > 0 && <div className={styles.voiceGrid}>
          {myVoices.map((item) => choice({ id: phononVoiceRef(item.id), name: item.name, feeling: "Personal", gender: "neutral" }, "clone", !gold))}
        </div>}
        {clones && !myVoices.length && <small>{gold ? "No custom voices yet." : "Your custom voices are ready when you have Gold."}</small>}
      </section>}

      {!gold && <section className={styles.voiceSection} aria-label="Free voices">
        <div className={styles.voiceSectionTitle}><h3>Free voices</h3></div>
        <div className={styles.voiceGrid}>{available.map((item) => choice(item, language === "en" ? "free" : "builtin"))}</div>
      </section>}

      <section className={styles.voiceSection} aria-label="Gold voices">
        <div className={styles.voiceSectionTitle}><h3>Gold voices</h3></div>
        <div className={styles.voiceGrid}>
          {language === "en" && published.map((item) => choice({ id: catalogVoiceRef(item.id), name: item.name,
            feeling: item.feeling, gender: item.gender }, "catalog", !gold))}
          {builtins.map((item) => choice(item, "builtin", !gold))}
          {language === "en" && phonon.map((item) => choice({ id: catalogVoiceRef(item.id), name: item.name,
            feeling: item.feeling, gender: item.gender }, "catalog", !gold))}
        </div>
        {language === "en" && (catalogError ? <p>Some voices could not load. Close and reopen to retry.</p>
          : !catalog ? <p>Loading voices…</p> : null)}
      </section>

    </div>
  </div>;
}
