"use client";

import dynamic from "next/dynamic";
import { useEffect, useMemo, useRef, useState } from "react";
import { decodeCloudDocument } from "../reader/accountSync";
import type { LibraryBook } from "../reader/types";
import { voiceForLanguage, voicesForLanguage, speechEngineForVoice } from "../reader/speech";
import { isClonedVoice, isQwenVoice, type NarratorVoice } from "../reader/voices";
import { requestSpeech } from "../reader/speechRequest";
import { readingPageStarts } from "../reader/pagination";
import { MAX_IMPORT_BYTES } from "../reader/importFormats";
import { useEdu } from "./EduProvider";
import { eduFetch, eduHeaders, errorMessage, assertSessionActor } from "./client";
import { checkedDownload } from "./documents";
import { identity, recordEduEvent, flushEduEvents } from "./telemetry";
import type { Assignment, DocumentVersion, Progress } from "./model";
import styles from "./edu.module.css";

const NativeDocumentReader = dynamic(() => import("../reader/NativeDocumentReader"), { ssr: false });
type AudioPart = { blob: Blob; duration: number; generationStarted: number; cached: boolean };

export default function AssignmentReader({ assignment, version }: { assignment: Assignment; version: DocumentVersion }) {
  const { userId, session } = useEdu();
  const [book, setBook] = useState<LibraryBook | null>(null);
  const [original, setOriginal] = useState<Blob | null>(null);
  const [index, setIndex] = useState(0);
  const [voice, setVoice] = useState<NarratorVoice>("af_heart");
  const [speed, setSpeed] = useState(1);
  const [view, setView] = useState<"native" | "text">("native");
  const [textSize, setTextSize] = useState(20);
  const [error, setError] = useState("");
  const [saveError, setSaveError] = useState("");
  const [status, setStatus] = useState("");
  const [playing, setPlaying] = useState(false);
  const [completed, setCompleted] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const audio = useRef<HTMLAudioElement>(null);
  const text = useRef<HTMLDivElement>(null);
  const sourceUrl = useRef<string | null>(null);
  const controller = useRef(new AbortController());
  const cache = useRef(new Map<string, Promise<AudioPart>>());
  const state = useRef({ index: 0, offset: 0, speed: 1, wants: false, epoch: 0, lastSave: 0, lastTimestamp: 0, pendingComplete: false, firstPlayed: false, firstPlayable: false });
  const token = useRef(session?.access_token ?? "");
  token.current = session?.access_token ?? "";
  const base = `assignments/${assignment.id}/documents/${version.id}`;
  const eventContext = { assignmentId: assignment.id, versionId: version.id };
  const pages = useMemo(() => readingPageStarts(book?.blocks ?? [], 2500), [book]);
  const textPage = pages.reduce((page, start, position) => start <= index ? position : page, 0);
  function event(name: string, properties: Record<string, string | number> = {}) {
    recordEduEvent(userId, assignment.schoolId, name, { document_id: version.documentId, ...properties }, eventContext);
  }
  function checkpoint(markComplete = false) {
    if (!book) return;
    try { assertSessionActor({ user: { id: userId }, access_token: token.current }, userId); }
    catch { setSaveError("Your account changed. Reload before saving reading progress."); return; }
    if (markComplete) state.current.pendingComplete = true;
    state.current.lastTimestamp = Math.max(Date.now(), state.current.lastTimestamp + 1);
    const offset = audio.current?.src && audio.current.readyState ? audio.current.currentTime : state.current.offset;
    const payload = { blockIndex: state.current.index, offsetSeconds: offset, speed: state.current.speed,
      updatedAt: new Date(state.current.lastTimestamp).toISOString(), completed: state.current.pendingComplete };
    state.current.offset = offset;
    state.current.lastSave = Date.now();
    // Synchronous token capture and a small keepalive request also cover pagehide.
    void fetch(`/api/edu/${base}/progress`, { method: "PUT", headers: { Authorization: `Bearer ${token.current}`, "Content-Type": "application/json" },
      body: JSON.stringify(payload), keepalive: true, cache: "no-store" }).then(async (response) => {
      if (!response.ok) throw new Error(errorMessage((await response.json()).error));
      const result = await response.json() as { progress: Progress };
      setSaveError("");
      if (result.progress.completedAt) { setCompleted(true); state.current.pendingComplete = false; }
    }).catch(() => setSaveError("Your latest reading position has not been saved. Retry while connected."));
  }
  function stop(save = true) {
    if (save) checkpoint();
    state.current.wants = false; state.current.epoch += 1;
    audio.current?.pause(); controller.current.abort(); controller.current = new AbortController(); cache.current.clear();
    setPlaying(false); setStatus("");
  }
  useEffect(() => {
    const loadController = new AbortController();
    setBook(null); setOriginal(null); setError(""); setStatus("Opening document…");
    const load = async () => {
      const result = await eduFetch<{ originalUrl: string; readingUrl: string; originalSha256: string; readingSha256: string; progress: Progress | null }>(base, userId, { signal: loadController.signal });
      const [reading, source] = await Promise.all([
        checkedDownload(result.readingUrl, result.readingSha256, loadController.signal, 10 * 1024 * 1024),
        checkedDownload(result.originalUrl, result.originalSha256, loadController.signal, MAX_IMPORT_BYTES),
      ]);
      const ready = await decodeCloudDocument(reading);
      const position = result.progress;
      ready.id = version.id;
      ready.position = { blockIndex: Math.min(position?.blockIndex ?? 0, ready.blocks.length - 1), offsetSeconds: position?.offsetSeconds ?? 0, speed: position?.speed ?? 1 };
      if (loadController.signal.aborted) return;
      state.current.index = ready.position.blockIndex; state.current.offset = ready.position.offsetSeconds; state.current.speed = ready.position.speed;
      setIndex(ready.position.blockIndex); setSpeed(ready.position.speed); setCompleted(!!position?.completedAt);
      setVoice(voiceForLanguage("af_heart", ready.language ?? "en"));
      setBook(ready); setOriginal(source); setStatus("");
      event("document_opened", { file_type: version.format, block_count: ready.blocks.length, chapter_count: ready.chapters.length });
    };
    void load().catch((error) => { if (!loadController.signal.aborted) { setError(error.message); setStatus(""); } });
    return () => { loadController.abort(); stop(false); if (sourceUrl.current) URL.revokeObjectURL(sourceUrl.current); };
  }, [base, attempt]);
  useEffect(() => {
    if (!book) return;
    const background = () => { if (document.visibilityState === "hidden") { checkpoint(); void flushEduEvents(userId, assignment.schoolId); } };
    const hide = () => checkpoint();
    document.addEventListener("visibilitychange", background); window.addEventListener("pagehide", hide);
    return () => { checkpoint(); document.removeEventListener("visibilitychange", background); window.removeEventListener("pagehide", hide); };
  }, [book]);
  useEffect(() => { text.current?.querySelector('[aria-current="true"]')?.scrollIntoView({ block: "nearest" }); }, [index, view]);

  function getPart(position: number): Promise<AudioPart> {
    const key = `${position}:${voice}:${speed}`;
    const existing = cache.current.get(key);
    if (existing) return existing;
    const signal = controller.current.signal;
    const generationStarted = performance.now();
    const task = (async () => {
      const response = await requestSpeech(`/api/edu/${base}/speech`, { method: "POST", headers: await eduHeaders(userId), redirect: "error", referrerPolicy: "no-referrer",
        body: JSON.stringify({ blockIndex: position, speed, voice, engine: speechEngineForVoice(voice, book?.language ?? "en"), identity: identity() }), signal }, (message) => { if (!signal.aborted) setStatus(message); });
      if (!response.ok) throw new Error(errorMessage((await response.json().catch(() => ({}))).error));
      const blob = await response.blob();
      if (!blob.type.startsWith("audio/") || !blob.size) throw new Error("The speech service returned invalid audio.");
      return { blob, duration: Number(response.headers.get("X-Audio-Duration")), generationStarted, cached: response.headers.get("X-Speech-Cache") === "hit" };
    })();
    cache.current.set(key, task);
    task.catch(() => { if (cache.current.get(key) === task) cache.current.delete(key); });
    // Keep the active passage and a bounded look-ahead window in memory.
    if (cache.current.size > 8) cache.current.delete(cache.current.keys().next().value!);
    return task;
  }
  async function play(position = state.current.index, offset = state.current.offset) {
    if (!book || !audio.current) return;
    const epoch = state.current.epoch;
    state.current.wants = true; setError(""); setStatus("Generating speech…");
    try {
      const part = await getPart(position);
      if (!state.current.wants || state.current.epoch !== epoch || !audio.current) return;
      if (sourceUrl.current) URL.revokeObjectURL(sourceUrl.current);
      sourceUrl.current = URL.createObjectURL(part.blob);
      audio.current.src = sourceUrl.current;
      audio.current.onloadedmetadata = () => { if (audio.current && state.current.epoch === epoch) audio.current.currentTime = Math.min(offset, Math.max(0, audio.current.duration - .1)); };
      state.current.index = position; state.current.offset = offset; setIndex(position);
      await audio.current.play();
      if (state.current.epoch !== epoch) return;
      setPlaying(true); setStatus("");
      if (!state.current.firstPlayed) { state.current.firstPlayed = true; event("playback_first_started", { block_index: position, speed }); }
      if (!state.current.firstPlayable) { state.current.firstPlayable = true; event("first_playable_audio", { time_to_first_playable_seconds: (performance.now() - part.generationStarted) / 1000, audio_source: part.cached ? "cache" : "generated" }); }
      // Generate ahead only after playback starts. Sequential requests cap the
      // window at 30 seconds/four passages, keeping inference concurrency bounded.
      void (async () => {
        let seconds = 0;
        for (let next = position + 1; next < book.blocks.length && next <= position + 4 && seconds < 30; next += 1) {
          if (!state.current.wants || state.current.epoch !== epoch) return;
          const part = await getPart(next); seconds += part.duration || 10;
        }
      })().catch(() => { /* Play will surface/retry the error if this passage is needed. */ });
    } catch (error) {
      if (state.current.epoch !== epoch) return;
      state.current.wants = false; setPlaying(false); setStatus(""); setError((error as Error).message);
    }
  }
  function navigate(position: number) {
    const wasPlaying = state.current.wants;
    stop(); state.current.index = position; state.current.offset = 0; setIndex(position);
    if (audio.current) { audio.current.removeAttribute("src"); audio.current.load(); }
    event("playback_seek", { block_index: position, direction: "direct" });
    checkpoint(); if (wasPlaying) void play(position, 0);
  }
  if (!book || !original) return <section className={styles.card}>{error ? <p role="alert">{error}<button onClick={() => setAttempt((value) => value + 1)}>Retry document</button></p> : <p role="status">{status || "Loading document…"}</p>}</section>;
  const native = version.format === "pdf" || version.format === "epub";
  const positioned = { ...book, position: { ...book.position, blockIndex: index } };
  return <section className={styles.reader} aria-label={`Read ${version.title}`}>
    <div className={styles.row}><button className={styles.primary} onClick={() => playing || state.current.wants ? stop() : void play()}>{playing || state.current.wants ? "Pause" : "Play audio"}</button>
      <button disabled={index === 0} onClick={() => navigate(Math.max(0, index - 1))}>Previous passage</button><button disabled={index >= book.blocks.length - 1} onClick={() => navigate(Math.min(book.blocks.length - 1, index + 1))}>Next passage</button>
      <label>Voice <select value={voice} onChange={(event) => { stop(); setVoice(event.target.value as NarratorVoice); state.current.offset = 0; if (audio.current) { audio.current.removeAttribute("src"); audio.current.load(); } }}>{voicesForLanguage(book.language ?? "en").filter(([id]) => !isClonedVoice(id) && !isQwenVoice(id)).map(([id, name]) => <option key={id} value={id}>{name}</option>)}</select></label>
      <label>Speed <select value={speed} onChange={(event) => { stop(); const speed = Number(event.target.value); state.current.speed = speed; state.current.offset = 0; setSpeed(speed); if (audio.current) { audio.current.removeAttribute("src"); audio.current.load(); } checkpoint(); }}>{[.5, .75, 1, 1.25, 1.5, 2, 2.5, 3].map((speed) => <option key={speed} value={speed}>{speed}×</option>)}</select></label>
      {native && <button onClick={() => setView(view === "native" ? "text" : "native")}>{view === "native" ? "E-reader view" : "Original view"}</button>}
      <label>Text size <input type="range" min={14} max={32} value={textSize} onChange={(event) => setTextSize(Number(event.target.value))} /></label>
      <button onClick={() => { const url = URL.createObjectURL(original); const link = document.createElement("a"); link.href = url; link.download = version.filename; link.click(); setTimeout(() => URL.revokeObjectURL(url), 60_000); }}>Download original</button>
    </div>
    <audio ref={audio} controls onTimeUpdate={() => { state.current.offset = audio.current?.currentTime ?? 0; if (Date.now() - state.current.lastSave > 30_000) checkpoint(); }}
      onPlay={() => { state.current.wants = true; setPlaying(true); }} onPause={() => { if (!audio.current?.ended) { checkpoint(); state.current.wants = false; setPlaying(false); } }}
      onEnded={() => { state.current.offset = 0; if (state.current.wants && index < book.blocks.length - 1) void play(index + 1, 0); else { state.current.wants = false; setPlaying(false); checkpoint(); } }} />
    {status && <p role="status" className={styles.notice}>{status}</p>}{error && <p role="alert" className={styles.error}>{error}</p>}
    {saveError && <p role="alert" className={styles.error}>{saveError}<button onClick={() => checkpoint()}>Retry saving</button></p>}
    <div className={styles.row}><span className={styles.muted}>Passage {index + 1} of {book.blocks.length}</span><label>Chapter <select value={book.blocks[index]?.chapterIndex ?? 0} onChange={(event) => navigate(book.chapters[Number(event.target.value)].startBlockIndex)}>{book.chapters.map((chapter, index) => <option value={index} key={index}>{chapter.title}</option>)}</select></label>
      <button disabled={completed} onClick={() => checkpoint(true)}>{completed ? "Marked complete" : "Mark reading complete"}</button></div>
    {native && view === "native" ? <div className={styles.native}><NativeDocumentReader key={version.id} book={positioned} source={original} textSize={textSize} onNavigate={navigate} /></div> : <><div className={styles.row}><button disabled={textPage === 0} onClick={() => navigate(pages[textPage - 1])}>Previous reading page</button><span>Reading page {textPage + 1} of {pages.length}</span><button disabled={textPage === pages.length - 1} onClick={() => navigate(pages[textPage + 1])}>Next reading page</button></div><div ref={text} className={styles.text} style={{ fontSize: textSize }}>{book.blocks.slice(pages[textPage], pages[textPage + 1] ?? book.blocks.length).map((block) => <button key={block.index} aria-current={index === block.index ? "true" : undefined} onClick={() => navigate(block.index)} style={{ fontSize: "inherit", fontWeight: block.isHeading ? 700 : 400 }}>{block.text}</button>)}</div></>}
  </section>;
}
