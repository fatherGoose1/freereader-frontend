"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { currentSessionAccessToken } from "../authToken";
import { telemetryContext } from "../telemetry";
import { LIGHT_VOICES, type LightVoice } from "../voices";

export default function LiteTest() {
  const [text, setText] = useState("The morning sun lit up the quiet street. Today is a good day to begin a new story.");
  const [speed, setSpeed] = useState(1);
  const [voice, setVoice] = useState<LightVoice>("af_heart");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [result, setResult] = useState<{ url: string; duration: number; generation: number; roundTrip: number } | null>(null);
  useEffect(() => () => { if (result) URL.revokeObjectURL(result.url); }, [result]);

  async function generate() {
    setBusy(true);
    setError("");
    try {
      const token = await currentSessionAccessToken();
      if (!token) throw new Error("Sign in to the reader first to test this voice.");
      const started = performance.now();
      const response = await fetch("/api/lite-tts-test", { method: "POST",
        headers: { "Content-Type": "application/json", "X-FreeReader-User-Token": token,
          "X-FreeReader-Context": JSON.stringify(telemetryContext("audiobook")) },
        body: JSON.stringify({ text, speed, voice }) });
      if (!response.ok) {
        const details = await response.json().catch(() => ({})) as { error?: string };
        throw new Error(details.error ?? "Lite speech is unavailable.");
      }
      const audio = await response.blob();
      if (!audio.size) throw new Error("Empty audio response.");
      setResult({ url: URL.createObjectURL(audio), duration: Number(response.headers.get("X-Audio-Duration")),
        generation: Number(response.headers.get("X-Generation-Seconds")), roundTrip: (performance.now() - started) / 1000 });
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Lite speech is unavailable.");
    } finally {
      setBusy(false);
    }
  }

  return <main style={{ maxWidth: 680, margin: "4rem auto", padding: "0 1.25rem", lineHeight: 1.6 }}>
    <Link href="/reader/audiobooks">← Back to reader</Link>
    <h1>Light voice test</h1>
    <p>Ten distilled English voices. Choose one and compare synthesis time to its audio length.</p>
    <label htmlFor="lite-voice">Voice</label>
    <select id="lite-voice" value={voice} onChange={(event) => setVoice(event.target.value as LightVoice)}
      style={{ display: "block", marginBottom: "1rem" }}>
      {LIGHT_VOICES.map(([id, name]) => <option key={id} value={id}>{name}</option>)}
    </select>
    <label htmlFor="lite-text">Text (up to 500 characters)</label>
    <textarea id="lite-text" value={text} onChange={(event) => setText(event.target.value)} maxLength={500}
      rows={6} style={{ display: "block", width: "100%", marginBottom: "1rem" }} />
    <label htmlFor="lite-speed">Speed: {speed.toFixed(1)}×</label>
    <input id="lite-speed" type="range" min="0.5" max="3" step="0.1" value={speed}
      onChange={(event) => setSpeed(Number(event.target.value))} style={{ display: "block", width: "100%" }} />
    <button type="button" onClick={() => void generate()} disabled={busy || !text.trim()} style={{ margin: "1rem 0" }}>
      {busy ? "Generating…" : "Generate sample"}
    </button>
    {error && <p role="alert">{error}</p>}
    {result && <section aria-label="Lite synthesis results">
      <audio controls src={result.url} style={{ width: "100%" }} />
      <p>Audio: {result.duration.toFixed(2)} s · Synthesis: {result.generation.toFixed(3)} s ·
        Real-time factor: {(result.generation / result.duration).toFixed(3)} (lower is faster) ·
        End-to-end: {result.roundTrip.toFixed(3)} s</p>
    </section>}
  </main>;
}
