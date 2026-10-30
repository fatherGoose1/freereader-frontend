"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import JSZip from "jszip";
import FreeReaderApp, { type ManagedReader } from "../reader/FreeReaderApp";
import { decodeCloudDocument } from "../reader/accountSync";
import type { LibraryBook } from "../reader/types";
import { requestSpeech } from "../reader/speechRequest";
import { speechEngineForVoice } from "../reader/speech";
import { SpeechCancelledError } from "../reader/ttsDiagnostics";
import { parseWordTimings } from "../reader/spokenWord";
import { useEdu } from "./EduProvider";
import { eduFetch, eduHeaders, errorMessage } from "./client";
import { sharedFetch, guestHeaders } from "./sharedClient";
import { checkedDownload } from "./documents";
import { identity, recordEduEvent } from "./telemetry";
import type { Assignment, DocumentVersion, Progress } from "./model";
import styles from "./edu.module.css";

type ReadingAssignment = Pick<Assignment, "id" | "title"> & { schoolId?: string };
type Loaded = { book: LibraryBook; original: Blob; rate: number };

export default function AssignmentReader({ assignment, version, documents, shareToken }: { assignment: ReadingAssignment; version: DocumentVersion; documents?: DocumentVersion[]; shareToken?: string }) {
  const { userId, path } = useEdu();
  const router = useRouter();
  const [loaded, setLoaded] = useState<Loaded | null>(null);
  const [error, setError] = useState("");
  const [saveError, setSaveError] = useState("");
  const [attempt, setAttempt] = useState(0);
  const current = useRef<{ book: LibraryBook; rate: number } | null>(null);
  const lastTimestamp = useRef(0);
  const base = shareToken ? `shared/${shareToken}/documents/${version.id}` : `assignments/${assignment.id}/documents/${version.id}`;
  const progressKey = `freereader-edu-progress:${shareToken ?? userId}:${assignment.id}:${version.id}`;
  const context = { assignmentId: assignment.id, versionId: version.id };
  useEffect(() => {
    const controller = new AbortController(); setLoaded(null); setError("");
    const load = async () => {
      const metadata = shareToken ? await sharedFetch<{ originalUrl: string; readingUrl: string; originalSha256: string; readingSha256: string; progress: Progress | null }>(base, { signal: controller.signal })
        : await eduFetch<{ originalUrl: string; readingUrl: string; originalSha256: string; readingSha256: string; progress: Progress | null }>(base, userId, { signal: controller.signal });
      const [reading, original] = await Promise.all([
        checkedDownload(metadata.readingUrl, metadata.readingSha256, controller.signal, 10 * 1024 * 1024),
        checkedDownload(metadata.originalUrl, metadata.originalSha256, controller.signal, Number(process.env.NEXT_PUBLIC_EDU_MAX_ORIGINAL_BYTES) || 100_000_000),
      ]);
      const book = await decodeCloudDocument(reading); book.id = version.id;
      let saved: { blockIndex: number; offsetSeconds: number; speed: number; voice?: LibraryBook["preferredVoice"] } | null = null;
      try { saved = JSON.parse(localStorage.getItem(progressKey) ?? "null"); } catch { /* Progress is optional. */ }
      const progress = metadata.progress ?? saved;
      const index = typeof progress?.blockIndex === "number" ? Math.max(0, Math.min(Math.floor(progress.blockIndex), book.blocks.length - 1)) : 0;
      const rate = typeof progress?.speed === "number" ? Math.max(.5, Math.min(progress.speed, 3)) : 1;
      book.position = { blockIndex: index, offsetSeconds: Math.max(0, progress?.offsetSeconds ?? 0), speed: 1 };
      if (saved?.voice) book.preferredVoice = saved.voice;
      if (!controller.signal.aborted) { current.current = { book, rate }; setLoaded({ book, original, rate }); }
    };
    void load().catch((error) => { if (!controller.signal.aborted) setError(error.message); });
    return () => { controller.abort(); };
  }, [base, attempt, userId]);
  const managed = useMemo<ManagedReader | null>(() => loaded ? {
    original: loaded.original, speechRate: loaded.rate, exitLabel: "Back to assignment",
    exit: () => router.push(shareToken ? `${path(`shared/${shareToken}`)}?overview=1` : path(`assignments/${assignment.id}`)),
    header: <>{documents && documents.length > 1 && <select aria-label="Reading document" value={version.id} onChange={(event) => router.push(shareToken ? path(`shared/${shareToken}/reader/${event.target.value}`) : path(`assignments/${assignment.id}/reader/${event.target.value}`))}>{documents.map((doc) => <option key={doc.id} value={doc.id}>{doc.title}</option>)}</select>}</>,
    save: async (book, speed) => {
      current.current = { book, rate: speed };
      const position = { blockIndex: book.position.blockIndex, offsetSeconds: book.position.offsetSeconds, speed, voice: book.preferredVoice };
      try { localStorage.setItem(progressKey, JSON.stringify(position)); } catch { /* Reading works without local persistence. */ }
      if (shareToken) return;
      lastTimestamp.current = Math.max(Date.now(), lastTimestamp.current + 1);
      try {
        await eduFetch(`${base}/progress`, userId, { method: "PUT", body: JSON.stringify({ ...position, updatedAt: new Date(lastTimestamp.current).toISOString() }), keepalive: true });
        setSaveError("");
      } catch (error) { setSaveError((error as Error).message); }
    },
    event: (name, properties) => {
      if (!shareToken && assignment.schoolId) { recordEduEvent(userId, assignment.schoolId, name, properties, context); return; }
      if (shareToken) void sharedFetch(`shared/${shareToken}/telemetry`, { method: "POST", keepalive: true,
        body: JSON.stringify({ events: [{ ...identity(), event_id: crypto.randomUUID(), event_name: name, schema_version: 1,
          occurred_at: new Date().toISOString(), properties, edu: context }] }) }).catch(() => undefined);
    },
    generate: async (_book, index, options, needed) => {
      if (!needed()) throw new SpeechCancelledError("Narration was cancelled");
      const started = performance.timeOrigin + performance.now();
      const response = await requestSpeech(`/api/edu/${base}/speech`, { method: "POST", headers: shareToken ? guestHeaders() : await eduHeaders(userId),
        body: JSON.stringify({ blockIndex: index, speed: options.speed, voice: options.voice, language: options.language,
          engine: speechEngineForVoice(options.voice, options.language), identity: identity() }), redirect: "error", referrerPolicy: "no-referrer" });
      if (!response.ok) throw new Error(errorMessage((await response.json().catch(() => ({}))).error));
      const archive = response.headers.get("Content-Type")?.includes("zip")
        ? await JSZip.loadAsync(await response.arrayBuffer()) : null;
      const entry = archive?.file("0.m4a");
      if (archive && !entry) throw new Error("The speech service returned incomplete audio.");
      const blob = entry ? new Blob([await entry.async("blob")], { type: "audio/mp4" }) : await response.blob();
      if (!blob.type.startsWith("audio/") || !blob.size) throw new Error("The speech service returned invalid audio.");
      if (!needed()) throw new SpeechCancelledError("Narration was cancelled");
      let wordTimings;
      const timingFile = archive?.file("0.json");
      if (timingFile) {
        try { wordTimings = parseWordTimings(JSON.parse(await timingFile.async("text"))); }
        catch { /* Audio remains usable without word timings. */ }
      }
      return { blob, duration: Number(response.headers.get("X-Audio-Duration")), provider: "Server", model: response.headers.get("X-TTS-Model") ?? "edu-standard",
        cached: response.headers.get("X-Speech-Cache") === "hit", generationStartedAt: started, wordTimings };
    },
  } : null, [loaded, base, version.id, shareToken, userId, documents, assignment.id]);
  if (!loaded || !managed) return <main className={styles.main}><h1>{version.title}</h1>{error ? <p role="alert" className={styles.error}>{error}<button onClick={() => setAttempt((value) => value + 1)}>Retry opening</button></p> : <p role="status">Opening your reading…</p>}</main>;
  return <><FreeReaderApp key={version.id} initialBook={loaded.book} managed={managed} />{saveError && <div className={styles.readerSaveError} role="alert">Reading position saved on this device. Cloud save failed: {saveError}</div>}</>;
}
