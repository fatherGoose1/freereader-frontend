"use client";

import { useEffect, useRef, useState } from "react";
import { isLikelyEnglish } from "../reader/languageDetection";

const DEFAULT_TEXT =
  "Alice was beginning to get very tired of sitting by her sister on the bank, and of having nothing to do: once or twice she had peeped into the book her sister was reading, but it had no pictures or conversations in it,";
const MAX_LENGTH = 800;

type Status = { kind: "error" | "info"; message: string } | null;

export default function HeroDemo() {
  const [text, setText] = useState(DEFAULT_TEXT);
  const [status, setStatus] = useState<Status>(null);
  const [loading, setLoading] = useState(false);
  const [playing, setPlaying] = useState(false);
  const [needsManualPlay, setNeedsManualPlay] = useState(false);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const urlRef = useRef<string | null>(null);
  const controllerRef = useRef<AbortController | null>(null);

  function stop() {
    controllerRef.current?.abort();
    controllerRef.current = null;
    const audio = audioRef.current;
    if (audio) {
      audio.pause();
      audio.removeAttribute("src");
      audio.load();
    }
    if (urlRef.current) {
      URL.revokeObjectURL(urlRef.current);
      urlRef.current = null;
    }
    setPlaying(false);
  }

  useEffect(() => stop, []);

  async function play() {
    const trimmed = text.trim().slice(0, MAX_LENGTH);
    if (!trimmed) {
      setStatus({ kind: "error", message: "Type a few words to hear the demo." });
      return;
    }
    if (!isLikelyEnglish(trimmed)) {
      setStatus({ kind: "error", message: "Only English is allowed." });
      return;
    }
    stop();
    setStatus(null);
    setNeedsManualPlay(false);
    setLoading(true);
    const controller = new AbortController();
    controllerRef.current = controller;
    try {
      const response = await fetch("/api/tts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: trimmed, speed: 1 }),
        signal: controller.signal,
      });
      if (!response.ok) {
        setStatus({
          kind: "error",
          message: response.status === 413
            ? "That passage is too long for the demo."
            : "The demo is unavailable right now. Please try again.",
        });
        return;
      }
      const blob = await response.blob();
      if (!blob.size) {
        setStatus({ kind: "error", message: "The demo is unavailable right now. Please try again." });
        return;
      }
      const url = URL.createObjectURL(blob);
      urlRef.current = url;
      const audio = audioRef.current;
      if (!audio) return;
      audio.src = url;
      try {
        await audio.play();
        setPlaying(true);
      } catch {
        setNeedsManualPlay(true);
        setStatus({ kind: "info", message: "Press play on the player below to hear it." });
      }
    } catch (error) {
      if ((error as Error)?.name !== "AbortError") {
        setStatus({ kind: "error", message: "The demo is unavailable right now. Please try again." });
      }
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="hero-demo">
      <div className="hero-demo-head">
        <span className="hero-demo-dot" aria-hidden="true" />
        <strong>Hear it for yourself</strong>
        <span className="hero-demo-tag">English</span>
      </div>
      <label className="sr-only" htmlFor="hero-demo-text">Sample text to narrate</label>
      <textarea
        id="hero-demo-text"
        value={text}
        maxLength={MAX_LENGTH}
        rows={5}
        spellCheck={false}
        onChange={(event) => {
          setText(event.target.value);
          if (status) setStatus(null);
        }}
      />
      <div className="hero-demo-actions">
        <button
          type="button"
          className="hero-demo-play"
          onClick={playing ? stop : play}
          disabled={loading}
          aria-label={playing ? "Stop the sample" : "Play the sample"}
        >
          {playing ? (
            <svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor" aria-hidden="true"><rect x="6" y="5" width="4" height="14" rx="1" /><rect x="14" y="5" width="4" height="14" rx="1" /></svg>
          ) : (
            <svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor" aria-hidden="true"><path d="M8 5.14v13.72a1 1 0 0 0 1.54.84l10.5-6.86a1 1 0 0 0 0-1.68L9.54 4.3A1 1 0 0 0 8 5.14Z" /></svg>
          )}
          <span>{loading ? "Generating…" : playing ? "Stop" : "Play sample"}</span>
        </button>
        <audio
          ref={audioRef}
          controls={needsManualPlay}
          hidden={!needsManualPlay}
          onEnded={() => setPlaying(false)}
        />
      </div>
      {status && (
        <p className={`hero-demo-status ${status.kind === "error" ? "is-error" : ""}`} role={status.kind === "error" ? "alert" : "status"}>
          {status.message}
        </p>
      )}
      <p className="hero-demo-note">Generated by the FreeReader voice engine. English only.</p>
    </div>
  );
}