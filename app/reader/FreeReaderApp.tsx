"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { browseGutenberg, downloadGutenbergBook } from "./gutenberg";
import { parseFile, parsePastedText, parseWebLink, urlFileTypeHint } from "./importers";
import { asImportError, failureCategory, importFailureProperties, type ImportFileType, type ImportStage } from "./importErrors";
import { fileTypeHint, IMPORT_ACCEPT } from "./importFormats";
import { readingPageStarts } from "./pagination";
import {
  getAudio,
  listBooks,
  listFolders,
  removeBook,
  requestPersistentStorage,
  saveAudio,
  saveBook,
  saveFolder,
} from "./storage";
import { TEXT_PIPELINE_REVISION } from "./speechText";
import { narrationRoute, synthesize, type NarrationRoute } from "./narration";
import { SpeechCancelledError, ttsLog } from "./ttsDiagnostics";
import { usesMobileSpeech } from "./mobileSpeech";
import { detectSpeechLanguage, SPEECH_LANGUAGES, voiceForLanguage, voicesForLanguage, type SpeechLanguage } from "./speech";
import { isKokoroVoice, type NarratorVoice } from "./voices";
import type { GutenbergBook, LibraryBook, LibraryFolder, ParsedBook } from "./types";
import { flushTelemetry, recordTelemetry, type TelemetryProperties } from "./telemetry";
import posthog from "posthog-js";
import styles from "./reader.module.css";

type Panel = "voice" | "url" | "gutenberg" | "folder" | "add" | "paste" | null;
type PreparedAudio = {
  blob: Blob; provider: string; model: string; cached: boolean; duration: number;
  generationStartedAt?: number;
};
type PendingAudio = { promise: Promise<PreparedAudio>; request: { isCurrent: () => boolean } };
type ActiveAudio = { bookId: string; index: number; url: string };

const gutenbergCategories = [
  [649, "Classics"], [644, "Adventure"], [640, "Mystery"], [639, "Romance"],
  [638, "Sci-Fi & Fantasy"], [636, "Young Readers"], [643, "Biographies"], [637, "Poetry"],
] as const;

function documentProperties(book: LibraryBook): TelemetryProperties {
  return {
    document_id: book.id,
    file_type: book.format,
    file_size_bytes: book.size,
    block_count: book.blocks.length,
    chapter_count: book.chapters.length,
    language: languageForBook(book),
  };
}

function languageForBook(book: LibraryBook): SpeechLanguage {
  if (book.language) return book.language;
  const sample = book.blocks.map((block) => block.text).join(" ").slice(0, 20_000);
  return detectSpeechLanguage(sample) ?? "en";
}

function wordCount(book: LibraryBook): number {
  return book.blocks.reduce((total, block) => total + block.text.split(/\s+/).length, 0);
}

function formatBytes(bytes: number): string {
  if (bytes < 1_000_000) return `${Math.max(1, Math.round(bytes / 1_000))} KB`;
  return `${(bytes / 1_000_000).toFixed(bytes < 10_000_000 ? 1 : 0)} MB`;
}

function BookCover({ book, index }: { book: LibraryBook; index: number }) {
  const [source, setSource] = useState<string>();
  useEffect(() => {
    if (!book.cover) {
      setSource(undefined);
      return;
    }
    const objectUrl = URL.createObjectURL(book.cover);
    setSource(objectUrl);
    return () => URL.revokeObjectURL(objectUrl);
  }, [book.cover]);
  return source
    ? <img className={styles.coverImage} src={source} alt="" />
    : <span className={`${styles.cover} ${styles[`cover${index % 4}`]}`}><small>{book.format}</small></span>;
}

function GutenbergCover({ book }: { book: GutenbergBook }) {
  const [failed, setFailed] = useState(false);
  if (!book.coverUrl || failed) return <span className={styles.miniCover}>PG</span>;
  return <img src={book.coverUrl} alt="" loading="lazy" decoding="async" onError={() => setFailed(true)} />;
}

function readingProgress(book: LibraryBook, fractionWithinBlock = 0): number {
  const total = wordCount(book);
  if (!total) return 0;
  const completed = book.blocks.reduce((sum, block) => {
    const words = block.text.split(/\s+/).length;
    if (block.index < book.position.blockIndex) return sum + words;
    if (block.index === book.position.blockIndex) return sum + words * fractionWithinBlock;
    return sum;
  }, 0);
  return Math.min(1, completed / total);
}

function makeBook(
  parsed: ParsedBook,
  sourceName: string,
  size: number,
  sourceIdentifier?: string,
  parentId?: string,
): LibraryBook {
  const now = new Date().toISOString();
  return {
    id: crypto.randomUUID(),
    ...parsed,
    sourceName,
    sourceIdentifier,
    parentId,
    size,
    createdAt: now,
    updatedAt: now,
    position: { blockIndex: 0, offsetSeconds: 0, speed: 1 },
  };
}

function orderedFolders(folders: LibraryFolder[], parentId?: string, seen = new Set<string>()): LibraryFolder[] {
  return folders
    .filter((folder) => folder.parentId === parentId && !seen.has(folder.id))
    .sort((a, b) => a.name.localeCompare(b.name))
    .flatMap((folder) => {
      const nextSeen = new Set(seen).add(folder.id);
      return [folder, ...orderedFolders(folders, folder.id, nextSeen)];
    });
}

function folderPath(folder: LibraryFolder, folders: LibraryFolder[]): string {
  const names = [folder.name];
  const seen = new Set([folder.id]);
  let parentId = folder.parentId;
  while (parentId) {
    const parent = folders.find((value) => value.id === parentId);
    if (!parent || seen.has(parent.id)) break;
    names.unshift(parent.name);
    seen.add(parent.id);
    parentId = parent.parentId;
  }
  return names.join(" / ");
}

export default function FreeReaderApp() {
  const [books, setBooks] = useState<LibraryBook[]>([]);
  const [folders, setFolders] = useState<LibraryFolder[]>([]);
  const [activeFolderId, setActiveFolderId] = useState<string | null>(null);
  const [folderName, setFolderName] = useState("");
  const [organizingBook, setOrganizingBook] = useState<LibraryBook | null>(null);
  const [importingBookId, setImportingBookId] = useState<string | null>(null);
  const [selected, setSelected] = useState<LibraryBook | null>(null);
  // Async media events must use the latest cursor, including changes before React renders.
  const selectedRef = useRef<LibraryBook | null>(null);
  const [panel, setPanel] = useState<Panel>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("Your books and generated audio stay in this browser.");
  const [importErrorMessage, setImportErrorMessage] = useState("");
  const [url, setUrl] = useState("");
  const [pastedTitle, setPastedTitle] = useState("");
  const [pastedText, setPastedText] = useState("");
  const [addMenuOpen, setAddMenuOpen] = useState(false);
  const addMenuRef = useRef<HTMLDivElement>(null);
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState<number | undefined>();
  const [gutenberg, setGutenberg] = useState<GutenbergBook[]>([]);
  const [voice, setVoice] = useState<NarratorVoice>("af_heart");
  const [steps, setSteps] = useState(12);
  const [speechRate, setSpeechRate] = useState(0.9);
  const [playing, setPlaying] = useState(false);
  const [audioProgress, setAudioProgress] = useState(0);
  const [ttsProgress, setTtsProgress] = useState<number | undefined>();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const audioRef = useRef<HTMLAudioElement>(null);
  const activeAudio = useRef<ActiveAudio | null>(null);
  const audioUrl = useRef<string | null>(null);
  const pendingAudio = useRef(new Map<string, PendingAudio>());
  const playbackEpoch = useRef(0);
  const wantsPlayback = useRef(false);
  const generationEpoch = useRef(0);
  const playedBooks = useRef(new Set<string>());
  const playableBooks = useRef(new Set<string>());
  const PAGE_CHAR_LIMIT = 900;
  const [page, setPage] = useState({ bookId: "", start: 0 });
  useEffect(() => { setImportErrorMessage(""); }, [panel]);
  const narrationLanguage = selected ? languageForBook(selected) : "en";
  const narrationVoice = voiceForLanguage(voice, narrationLanguage);
  const pageStarts = useMemo(() => readingPageStarts(selected?.blocks ?? [], PAGE_CHAR_LIMIT), [selected?.id]);

  useEffect(() => {
    if (!selected) return;
    let start = 0;
    for (const candidate of pageStarts) {
      if (candidate <= selected.position.blockIndex) start = candidate;
      else break;
    }
    setPage((current) => current.bookId === selected.id && current.start === start
      ? current
      : { bookId: selected.id, start });
  }, [selected?.id, selected?.position.blockIndex, pageStarts]);
  const lastPositionSave = useRef(0);

  useEffect(() => {
    recordTelemetry("app_launch");
    posthog.capture("app_launched");
    Promise.all([listBooks(), listFolders()])
      .then(([storedBooks, storedFolders]) => {
        setBooks(storedBooks);
        setFolders(storedFolders);
      })
      .catch(() => setMessage("Local library storage is unavailable."));
    requestPersistentStorage().catch(() => false);
    if ("serviceWorker" in navigator) navigator.serviceWorker.register("/sw.js").catch(() => undefined);
    return () => {
      playbackEpoch.current += 1;
      generationEpoch.current += 1;
      wantsPlayback.current = false;
      if (audioUrl.current) URL.revokeObjectURL(audioUrl.current);
    };
  }, []);

  useEffect(() => {
    if (!addMenuOpen) return;
    const close = (event: MouseEvent) => {
      if (!addMenuRef.current?.contains(event.target as Node)) setAddMenuOpen(false);
    };
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setAddMenuOpen(false);
    };
    document.addEventListener("mousedown", close);
    document.addEventListener("keydown", closeOnEscape);
    return () => {
      document.removeEventListener("mousedown", close);
      document.removeEventListener("keydown", closeOnEscape);
    };
  }, [addMenuOpen]);

  async function importDocument(file: File, sourceIdentifier?: string, gutenbergId?: string) {
    setBusy(true);
    setImportErrorMessage("");
    setMessage(`Reading ${file.name} locally...`);
    const started = Date.now();
    const source = gutenbergId ? "project_gutenberg" : "file";
    let fileType: ImportFileType = fileTypeHint(file.name, file.type);
    let stage: ImportStage = "conversion";
    try {
      const parsed = await parseFile(file);
      fileType = parsed.format;
      const book = makeBook(parsed, file.name, file.size, sourceIdentifier, activeFolderId ?? undefined);
      stage = "storage";
      await saveBook(book);
      setBooks((current) => [book, ...current]);
      setPanel(null);
      setMessage(`${book.title} was added to your private library.`);
      recordTelemetry("import_completed", {
        ...documentProperties(book),
        source,
        duration_seconds: (Date.now() - started) / 1000,
      });
      posthog.capture("import_completed", {
        source,
        file_type: book.format,
        file_size_bytes: book.size,
        block_count: book.blocks.length,
        chapter_count: book.chapters.length,
        duration_seconds: (Date.now() - started) / 1000,
      });
      if (gutenbergId) {
        recordTelemetry("gutenberg_import_completed", {
          ...documentProperties(book),
          gutenberg_id: gutenbergId,
          source: "project_gutenberg",
          import_success: 1,
          duration_seconds: (Date.now() - started) / 1000,
        });
      }
    } catch (error) {
      const failure = asImportError(error, stage, fileType);
      setMessage(failure.message);
      const properties = {
        ...importFailureProperties(failure, { source, fileType, stage }),
        file_size_bytes: file.size,
        duration_seconds: (Date.now() - started) / 1000,
      };
      recordTelemetry("import_failed", properties);
      posthog.capture("import_failed", properties);
      posthog.captureException(error instanceof Error ? error : failure, properties);
    } finally {
      setBusy(false);
    }
  }

  async function importUrl() {
    if (!url.trim()) return;
    setBusy(true);
    setImportErrorMessage("");
    setMessage("Trying the page directly in your browser...");
    await new Promise((resolve) => setTimeout(resolve, 50));
    const started = Date.now();
    let fileType: ImportFileType = urlFileTypeHint(url);
    let stage: ImportStage = "direct_fetch";
    try {
      const { parsed, sourceUrl } = await parseWebLink(url);
      fileType = parsed.format;
      const snapshot = new Blob([parsed.blocks.map((block) => block.text).join("\n\n")], { type: "text/plain" });
      const book = makeBook(
        parsed,
        new URL(sourceUrl).hostname,
        snapshot.size,
        sourceUrl,
        activeFolderId ?? undefined,
      );
      stage = "storage";
      await saveBook(book);
      setBooks((current) => [book, ...current]);
      setPanel(null);
      setUrl("");
      setMessage(`${book.title} was saved for offline reading.`);
      recordTelemetry("import_completed", {
        ...documentProperties(book),
        source: "url",
        duration_seconds: (Date.now() - started) / 1000,
      });
      posthog.capture("import_completed", {
        file_type: book.format,
        file_size_bytes: book.size,
        block_count: book.blocks.length,
        chapter_count: book.chapters.length,
        source: "url",
        duration_seconds: (Date.now() - started) / 1000,
      });
    } catch (error) {
      const failure = asImportError(error, stage, fileType);
      setMessage(failure.message);
      const properties = {
        ...importFailureProperties(failure, { source: "url", fileType, stage }),
        duration_seconds: (Date.now() - started) / 1000,
      };
      setImportErrorMessage(failure.message);
      recordTelemetry("import_failed", properties);
      posthog.capture("import_failed", properties);
      posthog.captureException(error instanceof Error ? error : failure, properties);
    } finally {
      setBusy(false);
    }
  }

  function firstLineTitle(text: string): string {
    const line = text.split("\n").map((value) => value.trim()).find(Boolean) ?? "";
    const stripped = line.replace(/^#{1,6}\s+/, "").replace(/^[*-]\s+/, "");
    return stripped.length > 0 && stripped.length <= 80 ? stripped : "";
  }

  async function importPastedText() {
    const text = pastedText.trim();
    if (!text) return;
    setBusy(true);
    setImportErrorMessage("");
    setMessage("Preparing your text...");
    await new Promise((resolve) => setTimeout(resolve, 50));
    const started = Date.now();
    const size = new Blob([text]).size;
    let fileType: ImportFileType = "unknown";
    let stage: ImportStage = "conversion";
    try {
      const givenTitle = pastedTitle.trim();
      const parsed = parsePastedText(text, givenTitle || firstLineTitle(text) || "Pasted Text");
      fileType = parsed.format;
      const title = givenTitle || parsed.title || "Pasted Text";
      const book = makeBook({ ...parsed, title }, title, size, undefined, activeFolderId ?? undefined);
      stage = "storage";
      await saveBook(book);
      setBooks((current) => [book, ...current]);
      setPanel(null);
      setPastedText("");
      setPastedTitle("");
      setMessage(`${book.title} was added to your private library.`);
      recordTelemetry("import_completed", {
        ...documentProperties(book),
        source: "paste",
        duration_seconds: (Date.now() - started) / 1000,
      });
      posthog.capture("import_completed", {
        file_type: book.format,
        file_size_bytes: book.size,
        block_count: book.blocks.length,
        chapter_count: book.chapters.length,
        source: "paste",
        duration_seconds: (Date.now() - started) / 1000,
      });
    } catch (error) {
      const failure = asImportError(error, stage, fileType);
      setMessage(failure.message);
      const properties = {
        ...importFailureProperties(failure, { source: "paste", fileType, stage }),
        file_size_bytes: size,
        duration_seconds: (Date.now() - started) / 1000,
      };
      setImportErrorMessage(failure.message);
      recordTelemetry("import_failed", properties);
      posthog.capture("import_failed", properties);
      posthog.captureException(error instanceof Error ? error : failure, properties);
    } finally {
      setBusy(false);
    }
  }

  async function searchGutenberg(search = query, bookshelfId = category) {
    setBusy(true);
    setMessage("Loading Project Gutenberg directly...");
    if (search.trim()) {
      recordTelemetry("gutenberg_search", { query_length: search.trim().length });
      posthog.capture("gutenberg_search", { query_length: search.trim().length });
    }
    try {
      setGutenberg(await browseGutenberg(search, search.trim() ? undefined : bookshelfId));
      setMessage("Project Gutenberg results are fetched directly and are not stored until imported.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Project Gutenberg could not be reached.");
    } finally {
      setBusy(false);
    }
  }

  async function importGutenberg(book: GutenbergBook) {
    recordTelemetry("gutenberg_book_selected", { gutenberg_id: book.id });
    setBusy(true);
    setImportingBookId(book.id);
    setMessage(`Downloading ${book.title} directly from Project Gutenberg...`);
    const started = Date.now();
    recordTelemetry("gutenberg_download_started", { gutenberg_id: book.id });
    try {
      const file = await downloadGutenbergBook(book);
      recordTelemetry("gutenberg_download_completed", {
        gutenberg_id: book.id,
        file_size_bytes: file.size,
        duration_seconds: (Date.now() - started) / 1000,
      });
      posthog.capture("gutenberg_book_imported", {
        gutenberg_id: book.id,
        file_size_bytes: file.size,
        duration_seconds: (Date.now() - started) / 1000,
      });
      await importDocument(file, `gutenberg:${book.id}`, book.id);
    } catch (error) {
      recordTelemetry("gutenberg_download_failed", {
        gutenberg_id: book.id,
        error_category: failureCategory(error),
        duration_seconds: (Date.now() - started) / 1000,
      });
      posthog.captureException(error instanceof Error ? error : new Error(String(error)));
      setMessage(error instanceof Error ? error.message : "The Gutenberg book could not be imported.");
      setBusy(false);
    } finally {
      setImportingBookId(null);
    }
  }

  function updateBook(book: LibraryBook) {
    selectedRef.current = book;
    setSelected(book);
    setBooks((current) => current.map((value) => value.id === book.id ? book : value));
    saveBook(book).catch(() => setMessage("Reading position could not be saved."));
  }

  function positionBook(book: LibraryBook, blockIndex: number, offsetSeconds = 0): LibraryBook {
    return {
      ...book,
      updatedAt: new Date().toISOString(),
      position: { ...book.position, blockIndex, offsetSeconds },
    };
  }

  function audioCacheKey(book: LibraryBook, index: number, route: NarrationRoute): string {
    const language = languageForBook(book);
    const quality = route.provider === "WASM" ? `${steps}-` : "";
    const model = `${TEXT_PIPELINE_REVISION}-${route.model}-${language}-${route.voice}-${quality}${speechRate}`;
    return `${book.id}/${model}/${index}.wav`;
  }

  async function ensureAudio(book: LibraryBook, index: number, isCurrent: () => boolean): Promise<PreparedAudio> {
    const checkRequest = () => {
      if (!isCurrent()) throw new SpeechCancelledError("Playback position changed");
    };
    checkRequest();
    const route = await narrationRoute(voice, languageForBook(book));
    checkRequest();
    const key = audioCacheKey(book, index, route);
    const cached = await getAudio(key);
    checkRequest();
    if (cached) {
      return { blob: cached, provider: route.provider, model: route.model, cached: true, duration: 0 };
    }
    const existing = pendingAudio.current.get(key);
    if (existing) {
      // A seek can adopt the chunk currently being prepared by the old look-ahead.
      existing.request.isCurrent = isCurrent;
      try { return await existing.promise; }
      catch (error) {
        // A queued request may have been cancelled just before this caller adopted it.
        if (error instanceof SpeechCancelledError && isCurrent()) return ensureAudio(book, index, isCurrent);
        throw error;
      }
    }
    const block = book.blocks[index];
    const language = languageForBook(book);
    const selectedVoice = voiceForLanguage(voice, language);
    const request = { isCurrent };
    const promise = synthesize(block.text, selectedVoice, steps, (status, progress) => {
      if (!request.isCurrent()) return;
      if (isKokoroVoice(selectedVoice) || usesMobileSpeech()) {
        setMessage(status);
        setTtsProgress(progress !== undefined && progress < 1 ? progress : undefined);
      } else if (status.startsWith("Downloading voice model")) {
        setMessage(status);
        setTtsProgress(progress !== undefined && progress < 1 ? progress : undefined);
      } else if (status.startsWith("Preparing voice model")) {
        setMessage(status);
        setTtsProgress(undefined);
      } else if (status.startsWith("Voice model ready")) {
        setMessage(status);
        setTtsProgress(undefined);
      }
    }, block.isHeading, speechRate, language, () => request.isCurrent()).then(async ({ blob, duration, provider, generationStartedAt, route: actualRoute }) => {
      // A failed Kokoro request may have completed with Supertonic. Cache its real variant.
      await saveAudio(audioCacheKey(book, index, actualRoute), blob);
      // Keep timing attached to this chunk so background generation cannot overwrite it.
      return { blob, provider, model: actualRoute.model, cached: false, duration, generationStartedAt };
    }).finally(() => {
      if (request.isCurrent()) setTtsProgress(undefined);
      pendingAudio.current.delete(key);
    });
    pendingAudio.current.set(key, { promise, request });
    return promise;
  }

  async function pregenerate(book: LibraryBook, fromIndex: number) {
    const epoch = ++generationEpoch.current;
    const isCurrent = () => generationEpoch.current === epoch && wantsPlayback.current;
    let bufferedSeconds = 0;
    for (let index = fromIndex; index < Math.min(book.blocks.length, fromIndex + 4); index += 1) {
      if (!isCurrent()) return;
      try {
        const { blob } = await ensureAudio(book, index, isCurrent);
        if (!isCurrent()) return;
        const wav = new DataView(await blob.slice(0, 44).arrayBuffer());
        bufferedSeconds += (blob.size - 44) / wav.getUint32(28, true) / book.position.speed;
        if (bufferedSeconds >= 30) return;
      } catch { return; }
    }
  }

  function pausePlayback() {
    playbackEpoch.current += 1;
    generationEpoch.current += 1;
    wantsPlayback.current = false;
    audioRef.current?.pause();
    setPlaying(false);
    setBusy(false);
    setTtsProgress(undefined);
  }

  function resetPlayback() {
    pausePlayback();
    activeAudio.current = null;
    const audio = audioRef.current;
    if (audio) {
      audio.onloadedmetadata = null;
      if (audio.hasAttribute("src")) {
        audio.removeAttribute("src");
        audio.load();
      }
    }
    if (audioUrl.current) URL.revokeObjectURL(audioUrl.current);
    audioUrl.current = null;
    setAudioProgress(0);
  }

  function currentAudio() {
    const audio = audioRef.current;
    const source = activeAudio.current;
    const book = selectedRef.current;
    if (!audio || !source || !book || source.bookId !== book.id || source.index !== book.position.blockIndex
      || audio.currentSrc !== source.url) return;
    return { audio, source, book };
  }

  async function playBlock(book: LibraryBook, index: number, offset = 0, offsetFromEnd = false) {
    const audio = audioRef.current;
    if (!audio || !book.blocks[index]) return;
    const requestedAt = performance.now();
    resetPlayback();
    const epoch = playbackEpoch.current;
    const isCurrent = () => playbackEpoch.current === epoch && wantsPlayback.current && audioRef.current === audio;
    wantsPlayback.current = true;
    setPlaying(true);
    // Selection/highlighting and the next playback position change synchronously, before generation.
    updateBook(positionBook(book, index, offsetFromEnd ? 0 : offset));
    setBusy(true);
    try {
      const { blob, ...info } = await ensureAudio(book, index, isCurrent);
      if (!isCurrent()) return;
      audioUrl.current = URL.createObjectURL(blob);
      const source = { bookId: book.id, index, url: audioUrl.current };
      activeAudio.current = source;
      audio.onloadedmetadata = () => {
        if (activeAudio.current !== source || !currentAudio() || audio.readyState < 1) return;
        audio.onloadedmetadata = null;
        audio.currentTime = offsetFromEnd
          ? Math.max(0, audio.duration - offset)
          : Math.min(offset, Math.max(0, audio.duration - 0.05));
      };
      audio.src = source.url;
      audio.playbackRate = selectedRef.current!.position.speed;
      await audio.play();
      if (!isCurrent()) return;
      const playbackStartedAt = performance.timeOrigin + performance.now();
      // Generated audio: actual synthesis start through playback, excluding setup.
      // Cached audio has no synthesis start; retain its request-to-playback latency.
      const timeToFirstPlayableSeconds = Math.max(0,
        (playbackStartedAt - (info.generationStartedAt ?? performance.timeOrigin + requestedAt)) / 1000);
      setPlaying(true);
      // Start/refill from this cursor only after its audio actually starts, even if
      // React has already rendered `playing` while generation was pending.
      void pregenerate(selectedRef.current!, index + 1);
      ttsLog("playback started", { timeToFirstAudioSeconds: (playbackStartedAt - performance.timeOrigin - requestedAt) / 1000,
        generationToPlaybackSeconds: info.cached ? undefined : timeToFirstPlayableSeconds,
        model: info.model, provider: info.provider, cached: info.cached });
      if (!playedBooks.current.has(book.id)) {
        playedBooks.current.add(book.id);
        recordTelemetry("playback_first_started", {
          document_id: book.id,
          block_index: index,
          offset_seconds: offset,
          speed: book.position.speed,
        });
        posthog.capture("playback_started", {
          file_type: book.format,
          block_count: book.blocks.length,
          chapter_count: book.chapters.length,
          speed: book.position.speed,
        });
      }
      if (!playableBooks.current.has(book.id)) {
        playableBooks.current.add(book.id);
        const language = languageForBook(book);
        const selectedVoice = voiceForLanguage(voice, language);
        const model = info.model;
        recordTelemetry("first_playable_audio", {
          document_id: book.id,
          model,
          ...(info.provider && { engine: `onnxruntime_${info.provider.toLowerCase()}` }),
          language,
          ...(!isKokoroVoice(selectedVoice) && { inference_steps: steps }),
          audio_source: info.cached ? "cache" : "generated",
          time_to_first_playable_seconds: timeToFirstPlayableSeconds,
          spoken_seconds: Number.isFinite(audio.duration) && audio.duration > 0 ? audio.duration : info.duration,
          cache_bytes: blob.size,
        });
        posthog.capture("first_playable_audio", {
          model,
          ...(info.provider && { engine: `onnxruntime_${info.provider.toLowerCase()}` }),
          language,
          ...(!isKokoroVoice(selectedVoice) && { inference_steps: steps }),
          audio_source: info.cached ? "cache" : "generated",
          time_to_first_playable_seconds: timeToFirstPlayableSeconds,
        });
      }
    } catch (error) {
      if (!isCurrent()) return;
      pausePlayback();
      setMessage(error instanceof Error ? error.message : "Local speech generation failed.");
    } finally {
      if (isCurrent()) setBusy(false);
    }
  }

  async function togglePlayback() {
    const book = selectedRef.current;
    if (!book) return;
    if (usesMobileSpeech()) void requestPersistentStorage().catch(() => false);
    const current = currentAudio();
    if (wantsPlayback.current) {
      pausePlayback();
      if (current) updateBook(positionBook(book, current.source.index, current.audio.currentTime));
      return;
    }
    if (current && !current.audio.ended) {
      const { audio, source } = current;
      const epoch = ++playbackEpoch.current;
      wantsPlayback.current = true;
      setPlaying(true);
      try {
        await audio.play();
        if (playbackEpoch.current !== epoch || !wantsPlayback.current) return;
        void pregenerate(selectedRef.current!, source.index + 1);
      } catch (error) {
        if (playbackEpoch.current !== epoch) return;
        pausePlayback();
        setMessage(error instanceof Error ? error.message : "Audio playback failed.");
      }
      return;
    }
    await playBlock(book, book.position.blockIndex, book.position.offsetSeconds);
  }

  function seek(seconds: number) {
    const current = currentAudio();
    if (!current || !Number.isFinite(current.audio.duration)) return;
    const { audio, book } = current;
    const target = audio.currentTime + seconds;
    if (target > audio.duration && book.position.blockIndex + 1 < book.blocks.length) {
      void playBlock(book, book.position.blockIndex + 1, target - audio.duration);
    } else if (target < 0 && book.position.blockIndex > 0) {
      void playBlock(book, book.position.blockIndex - 1, Math.abs(target), true);
    } else audio.currentTime = Math.max(0, Math.min(audio.duration, target));
  }

  function changeSpeed(speed: number) {
    const selected = selectedRef.current;
    if (!selected) return;
    if (audioRef.current) audioRef.current.playbackRate = speed;
    updateBook({ ...selected, position: { ...selected.position, speed } });
    if (wantsPlayback.current && currentAudio() && !audioRef.current?.paused) {
      void pregenerate(selectedRef.current!, selected.position.blockIndex + 1);
    }
  }

  function seekOverall(progress: number) {
    const selected = selectedRef.current;
    if (!selected) return;
    const target = Math.max(0, Math.min(1, progress)) * wordCount(selected);
    let wordsBefore = 0;
    const targetBlock = selected.blocks.find((item) => {
      const words = item.text.split(/\s+/).length;
      if (wordsBefore + words >= target) return true;
      wordsBefore += words;
      return false;
    }) ?? selected.blocks.at(-1);
    if (!targetBlock) return;
    goToBlock(targetBlock.index);
  }

  function onTimeUpdate() {
    const current = currentAudio();
    if (!current) return;
    const { audio, book, source } = current;
    setAudioProgress(audio.duration ? audio.currentTime / audio.duration : 0);
    if (Date.now() - lastPositionSave.current > 5_000) {
      lastPositionSave.current = Date.now();
      updateBook(positionBook(book, source.index, audio.currentTime));
    }
  }

  async function onEnded() {
    const current = currentAudio();
    // Browsers can deliver an old ended event after a seek or source replacement.
    if (!current || !wantsPlayback.current || !current.audio.ended) return;
    const next = current.source.index + 1;
    if (next < current.book.blocks.length) await playBlock(current.book, next);
    else {
      pausePlayback();
      setMessage("You reached the end of this book.");
    }
  }

  function moveChapter(direction: -1 | 1) {
    const selected = selectedRef.current;
    if (!selected) return;
    const chapter = direction > 0
      ? selected.chapters.find((item) => item.startBlockIndex > selected.position.blockIndex)
      : selected.chapters.findLast((item) => item.startBlockIndex < selected.position.blockIndex);
    if (!chapter) return;
    goToBlock(chapter.startBlockIndex);
  }

  function goToBlock(blockIndex: number) {
    const selected = selectedRef.current;
    if (!selected || !selected.blocks[blockIndex]) return;
    if (wantsPlayback.current) void playBlock(selected, blockIndex);
    else {
      resetPlayback();
      updateBook(positionBook(selected, blockIndex));
    }
  }

  async function deleteBook(book: LibraryBook) {
    if (!window.confirm(`Remove "${book.title}" from this browser?`)) return;
    await removeBook(book.id);
    setBooks((current) => current.filter((value) => value.id !== book.id));
    setOrganizingBook(null);
    setMessage(`${book.title} was removed from this browser.`);
    recordTelemetry("document_deleted", { document_id: book.id });
    posthog.capture("document_deleted", {
      file_type: book.format,
      file_size_bytes: book.size,
    });
  }

  function openBook(book: LibraryBook) {
    resetPlayback();
    const language = languageForBook(book);
    const ready = book.language ? book : { ...book, language };
    selectedRef.current = ready;
    setSelected(ready);
    setVoice((current) => voiceForLanguage(current, language));
    if (!book.language) {
      setBooks((current) => current.map((value) => value.id === book.id ? ready : value));
      saveBook(ready).catch(() => undefined);
    }
    recordTelemetry("document_opened", documentProperties(ready));
    posthog.capture("document_opened", {
      file_type: book.format,
      file_size_bytes: book.size,
      block_count: book.blocks.length,
      chapter_count: book.chapters.length,
    });
  }

  function changeNarrationLanguage(language: SpeechLanguage) {
    const selected = selectedRef.current;
    if (!selected) return;
    resetPlayback();
    setVoice((current) => voiceForLanguage(current, language));
    updateBook({ ...selected, language, updatedAt: new Date().toISOString() });
    posthog.capture("voice_settings_changed", { setting: "language", value: language });
  }

  function openGutenbergBrowser() {
    recordTelemetry("gutenberg_browse_opened");
    posthog.capture("gutenberg_browse_opened");
    setPanel("gutenberg");
    if (!gutenberg.length) void searchGutenberg("");
  }

  async function createFolder() {
    const name = folderName.trim();
    if (!name) return;
    const now = new Date().toISOString();
    const folder: LibraryFolder = {
      id: crypto.randomUUID(),
      name,
      parentId: activeFolderId ?? undefined,
      createdAt: now,
      updatedAt: now,
    };
    try {
      await saveFolder(folder);
      setFolders((current) => [...current, folder]);
      setFolderName("");
      setPanel(null);
      setMessage(`${folder.name} was created on this device.`);
    } catch {
      setMessage("The folder could not be saved.");
    }
  }

  async function moveBookToFolder(book: LibraryBook, parentId?: string) {
    const updated = { ...book, parentId, updatedAt: new Date().toISOString() };
    try {
      await saveBook(updated);
      setBooks((current) => current.map((value) => value.id === book.id ? updated : value));
      setOrganizingBook(null);
      const destination = parentId ? folders.find((folder) => folder.id === parentId)?.name : undefined;
      setMessage(destination
        ? `${book.title} was moved to ${destination}.`
        : `${book.title} was removed from its folder.`);
    } catch {
      setMessage("The book could not be moved.");
    }
  }

  if (selected) {
    const block = selected.blocks[selected.position.blockIndex];
    const chapter = selected.chapters[block?.chapterIndex] ?? selected.chapters[0];
    const bookProgress = readingProgress(selected, audioProgress);
    const isModelDownload = message.startsWith("Downloading voice model");
    const modelDownloadSize = isModelDownload ? message.match(/\(([^)]+ MB)\)$/)?.[1] : undefined;
    return (
      <main className={styles.appShell}>
        <audio ref={audioRef} onTimeUpdate={onTimeUpdate} onEnded={onEnded} onError={() => {
          if (!currentAudio() || !audioRef.current?.error) return;
          setMessage(audioRef.current.error.message || "Audio playback failed. Tap Listen to retry.");
          resetPlayback();
        }} />
        <div className={styles.readerTop}>
          <button className={styles.textButton} onClick={() => { resetPlayback(); selectedRef.current = null; setSelected(null); }}>Library</button>
          <div className={styles.readerTitle}><strong>{selected.title}</strong><span>{chapter?.title ?? "Beginning"}</span></div>
          <div className={styles.readerTools}>
            {selected.chapters.length > 0 && (
              <label className={styles.chapterPicker}>Chapters
                <select
                  aria-label="Choose chapter"
                  value={chapter?.startBlockIndex ?? selected.chapters[0].startBlockIndex}
                  onChange={(event) => goToBlock(Number(event.target.value))}
                >
                  {selected.chapters.map((item) => <option key={item.startBlockIndex} value={item.startBlockIndex}>{item.title}</option>)}
                </select>
              </label>
            )}
            <button className={styles.textButton} onClick={() => setPanel(panel ? null : "voice")}>Voice</button>
          </div>
        </div>
        <div className={styles.readerGrid}>
          <aside className={styles.chapterRail}>
            <span className={styles.kicker}>Contents</span>
            {selected.chapters.map((item, index) => (
              <button
                key={`${item.startBlockIndex}-${item.title}`}
                className={index === block?.chapterIndex ? styles.activeChapter : ""}
                onClick={() => goToBlock(item.startBlockIndex)}
              >{item.title}</button>
            ))}
          </aside>
          <article className={styles.readingPane}>
            <div className={styles.readingText}>
              {selected.blocks.slice(page.start, pageStarts.find((candidate) => candidate > page.start) ?? selected.blocks.length).map((item) => (
                item.isHeading
                  ? <h2 key={item.index} aria-current={item.index === selected.position.blockIndex ? "true" : undefined} className={item.index === selected.position.blockIndex ? styles.currentBlock : ""} onClick={() => goToBlock(item.index)}>{item.text}</h2>
                  : <p key={item.index} aria-current={item.index === selected.position.blockIndex ? "true" : undefined} className={item.index === selected.position.blockIndex ? styles.currentBlock : ""} onClick={() => goToBlock(item.index)}>{item.text}</p>
              ))}
            </div>
            <div className={styles.pageMarker}>{selected.position.blockIndex + 1} / {selected.blocks.length}</div>
          </article>
        </div>
        {ttsProgress !== undefined && (
          <section className={styles.modelProgress} role="status" aria-live="polite">
            <div>
              <span>{isModelDownload ? `Downloading voice model${modelDownloadSize ? ` (${modelDownloadSize})` : ""}` : "Preparing local speech"}</span>
              <strong>{Math.round(ttsProgress * 100)}%</strong>
            </div>
            <progress value={ttsProgress} max={1} aria-label={message} />
            {!isModelDownload && <p>{message}</p>}
            {isModelDownload && <small>The model and voice are cached in browser storage when available and reused after refresh.</small>}
          </section>
        )}
        <div className={styles.player}>
          <div className={styles.progressMeta}><span>Book progress</span><strong>{Math.round(bookProgress * 100)}%</strong></div>
          <input className={styles.progressSlider} type="range" min="0" max="1" step="0.001" value={bookProgress} onChange={(event) => seekOverall(Number(event.target.value))} aria-label="Book playback progress" />
          <div className={styles.playerRow}>
            <div className={styles.transport}>
              <button className={styles.chapterSkip} onClick={() => moveChapter(-1)} disabled={!selected.chapters.some((item) => item.startBlockIndex < selected.position.blockIndex)} title="Previous chapter">|&lt;</button>
              <button onClick={() => seek(-10)} title="Back 10 seconds"><strong>-10</strong><span>seconds</span></button>
              <button className={styles.playButton} onClick={togglePlayback}>{playing ? "Pause" : "Listen"}</button>
              <button onClick={() => seek(10)} title="Forward 10 seconds"><strong>+10</strong><span>seconds</span></button>
              <button className={styles.chapterSkip} onClick={() => moveChapter(1)} disabled={!selected.chapters.some((item) => item.startBlockIndex > selected.position.blockIndex)} title="Next chapter">&gt;|</button>
            </div>
            <label className={styles.speed}>Speed
              <select value={selected.position.speed} onChange={(event) => changeSpeed(Number(event.target.value))}>
                {[0.75, 1, 1.25, 1.5, 1.75, 2].map((value) => <option key={value} value={value}>{value}x</option>)}
              </select>
            </label>
          </div>
          <div className={styles.statusLine}>
            {!isModelDownload && <span>{message}</span>}
            {ttsProgress !== undefined && <progress value={ttsProgress} max={1} />}
          </div>
        </div>
        {panel === "voice" && (
          <div className={styles.voicePopover}>
            <div className={styles.settingsTitle}><strong>Voice Settings</strong><button onClick={() => setPanel(null)}>Done</button></div>
            <label className={styles.settingsRow}><span>Language</span>
              <select value={narrationLanguage} onChange={(event) => changeNarrationLanguage(event.target.value as SpeechLanguage)}>
                {SPEECH_LANGUAGES.map(([value, name]) => <option key={value} value={value}>{name}</option>)}
              </select>
            </label>
            <label className={styles.settingsRow}><span><i className={styles.waveIcon}>~~~</i> Voice</span>
              <select value={narrationVoice} onChange={(event) => { resetPlayback(); setVoice(event.target.value as NarratorVoice); posthog.capture("voice_settings_changed", { setting: "voice", value: event.target.value }); }}>
                {voicesForLanguage(narrationLanguage).map(([value, name]) => <option key={value} value={value}>{name}</option>)}
              </select>
            </label>
            <div className={styles.qualitySetting}><span>Speaking Rate</span><div>
              {[[0.8, "0.8x"], [0.9, "0.9x"], [1, "1x"], [1.1, "1.1x"], [1.2, "1.2x"]].map(([value, label]) => (
                <button key={value} className={speechRate === value ? styles.qualityActive : ""} onClick={() => { resetPlayback(); setSpeechRate(Number(value)); posthog.capture("voice_settings_changed", { setting: "speaking_rate", value: Number(value) }); }}>{label}</button>
              ))}
            </div></div>
            <div className={styles.qualitySetting}><span>Quality</span><div>
              {[[5, "Low"], [8, "Medium"], [12, "High"]].map(([value, label]) => (
                <button key={value} className={steps === value ? styles.qualityActive : ""} onClick={() => { resetPlayback(); setSteps(Number(value)); posthog.capture("voice_settings_changed", { setting: "quality_steps", value: Number(value) }); }}>{label}</button>
              ))}
            </div></div>
            <small>Higher quality takes longer to generate. Changes apply to new passages.</small>
          </div>
        )}
      </main>
    );
  }

  const activeFolder = activeFolderId
    ? folders.find((folder) => folder.id === activeFolderId)
    : undefined;
  const visibleBooks = activeFolderId
    ? books.filter((book) => book.parentId === activeFolderId)
    : books.filter((book) => !book.parentId);
  const childFolders = folders.filter((folder) => folder.parentId === (activeFolderId ?? undefined));
  const folderList = orderedFolders(folders);
  const parentFolder = activeFolder?.parentId
    ? folders.find((folder) => folder.id === activeFolder.parentId)
    : undefined;

  return (
    <main className={styles.appShell}>
      <header className={styles.libraryHero}>
        <div><span className={styles.kicker}>On this device</span><h1>FreeReader</h1></div>
        <div className={styles.actions}>
          <div className={styles.addMenuWrap} ref={addMenuRef}>
            <button
              className={`${styles.primaryAction} ${styles.addMenuButton}`}
              aria-haspopup="menu"
              aria-expanded={addMenuOpen}
              title="Add reading to your library"
              onClick={() => setAddMenuOpen((open) => !open)}
            >+ Add<span className={styles.addCaret} aria-hidden="true">{addMenuOpen ? "▴" : "▾"}</span></button>
            {addMenuOpen && (
              <div className={styles.addMenu} role="menu" aria-label="Add reading">
                <button role="menuitem" onClick={() => { setAddMenuOpen(false); fileInputRef.current?.click(); }}>
                  <span className={styles.addChoiceIcon}>+</span>
                  <span><strong>Upload File</strong><small>EPUB, PDF, TXT, DOCX, HTML, or MD</small></span>
                </button>
                <button role="menuitem" onClick={() => { setAddMenuOpen(false); openGutenbergBrowser(); }}>
                  <span className={`${styles.addChoiceIcon} ${styles.gutenbergChoiceIcon}`}>G</span>
                  <span><strong>Free Books</strong><small>Browse Project Gutenberg</small></span>
                </button>
                <button role="menuitem" onClick={() => { setAddMenuOpen(false); setPanel("url"); }}>
                  <span className={`${styles.addChoiceIcon} ${styles.webChoiceIcon}`}>W</span>
                  <span><strong>Web Link</strong><small>Import an article from the web</small></span>
                </button>
                <button role="menuitem" onClick={() => { setAddMenuOpen(false); setPanel("paste"); }}>
                  <span className={`${styles.addChoiceIcon} ${styles.pasteChoiceIcon}`}>T</span>
                  <span><strong>Insert Text</strong><small>Paste or type content directly</small></span>
                </button>
              </div>
            )}
          </div>
          <button className={styles.mobileAddButton} aria-label="Add reading" onClick={() => setPanel("add")}>+</button>
          <input ref={fileInputRef} hidden type="file" accept={IMPORT_ACCEPT} onChange={(event) => {
            const file = event.currentTarget.files?.[0];
            event.currentTarget.value = "";
            if (file) void importDocument(file);
          }} />
        </div>
      </header>
      <div className={styles.libraryLayout}>
        <aside className={styles.librarySidebar}>
          <span className={styles.sidebarLabel}>Library</span>
          <button className={!activeFolderId ? styles.sidebarActive : ""} onClick={() => setActiveFolderId(null)}><span className={styles.sidebarIcon}>B</span> Library <strong>{books.filter((book) => !book.parentId).length}</strong></button>
          <div className={styles.sidebarSectionHeader}><span className={styles.sidebarLabel}>Folders</span><button aria-label="Create folder" onClick={() => { setFolderName(""); setPanel("folder"); }}>+</button></div>
          {folderList.map((folder) => {
            const depth = folderPath(folder, folders).split(" / ").length - 1;
            return (
              <button
                key={folder.id}
                className={activeFolderId === folder.id ? styles.sidebarActive : ""}
                style={{ paddingLeft: `${10 + depth * 13}px` }}
                onClick={() => setActiveFolderId(folder.id)}
              ><span className={`${styles.sidebarIcon} ${styles.folderSidebarIcon}`} /> <span className={styles.sidebarName}>{folder.name}</span><strong>{books.filter((book) => book.parentId === folder.id).length}</strong></button>
            );
          })}
          <span className={styles.sidebarLabel}>Add reading</span>
          <button onClick={() => openGutenbergBrowser()}><span className={styles.sidebarIcon}>G</span> Free Books</button>
          <button onClick={() => setPanel("url")}><span className={styles.sidebarIcon}>W</span> Web Link</button>
          <button onClick={() => setPanel("paste")}><span className={`${styles.sidebarIcon} ${styles.pasteSidebarIcon}`}>T</span> Insert Text</button>
          <label title="Import EPUB, PDF, TXT, DOCX, HTML, or Markdown files (.epub, .pdf, .txt, .docx, .html, .md)"><span className={styles.sidebarIcon}>+</span> Upload File<input type="file" accept={IMPORT_ACCEPT} onChange={(event) => {
            const file = event.target.files?.[0];
            event.target.value = "";
            if (file) void importDocument(file);
          }} /></label>
          <div className={styles.privacyNote}><strong>Private by design</strong><span>Books, reading positions, and audio stay in this browser.</span></div>
        </aside>
        <section className={styles.shelf}>
          <div className={styles.shelfHeading}>
            <div>
              {activeFolder && <button className={styles.backFolder} onClick={() => setActiveFolderId(parentFolder?.id ?? null)}>&lt; {parentFolder?.name ?? "Library"}</button>}
              <h2>{activeFolder?.name ?? "Library"}</h2>
              <span>{visibleBooks.length} {visibleBooks.length === 1 ? "book" : "books"}</span>
            </div>
            <div className={styles.shelfStatus}>
              <button className={styles.newFolderButton} onClick={() => { setFolderName(""); setPanel("folder"); }}>+ New Folder</button>
              <div className={styles.localNote}><span className={styles.localDot} /> {message}</div>
            </div>
          </div>
          {childFolders.length > 0 && (
            <div className={styles.folderGrid} aria-label="Folders">
              {childFolders.map((folder) => (
                <button key={folder.id} className={styles.folderCard} onClick={() => setActiveFolderId(folder.id)}>
                  <span className={styles.folderGlyph} />
                  <span><strong>{folder.name}</strong><small>{books.filter((book) => book.parentId === folder.id).length + folders.filter((child) => child.parentId === folder.id).length} items</small></span>
                  <i>&gt;</i>
                </button>
              ))}
            </div>
          )}
          {visibleBooks.length ? (
            <div className={styles.libraryGrid} aria-label="Local library">
              {visibleBooks.map((book, index) => {
                const progress = readingProgress(book);
                return (
                  <article key={book.id} className={styles.bookCard}>
                    <button className={styles.bookOpen} onClick={() => openBook(book)}>
                      <BookCover book={book} index={index} />
                      <span className={styles.bookInfo}>
                        <strong>{book.title}</strong>
                        {book.author && <span>{book.author}</span>}
                        <span>{wordCount(book).toLocaleString()} words · {formatBytes(book.size)}</span>
                        {progress > 0 && <span className={styles.bookProgress}><i style={{ width: `${progress * 100}%` }} /></span>}
                      </span>
                    </button>
                    <button className={styles.moreButton} onClick={() => setOrganizingBook(book)} aria-label={`Organize ${book.title}`}>...</button>
                  </article>
                );
              })}
            </div>
          ) : childFolders.length === 0 ? (
            <div className={styles.emptyLibrary}>
              <span className={styles.emptyBooks}>|||</span><h2>{activeFolder ? "This folder is empty" : "Your shelf is empty"}</h2><p>Browse free books, import a web link, paste some text, or add an EPUB, PDF, or TXT file. Everything stays on this device.</p>
            </div>
          ) : null}
        </section>
      </div>
      {panel === "add" && (
        <div className={styles.modalBackdrop} onMouseDown={() => setPanel(null)}>
          <div className={`${styles.modal} ${styles.addModal}`} onMouseDown={(event) => event.stopPropagation()}>
            <span className={styles.kicker}>Add Reading</span>
            <h2>What would you like to add?</h2>
            <div className={`${styles.folderChoices} ${styles.addChoices}`}>
              <button onClick={() => { setPanel(null); fileInputRef.current?.click(); }}>
                <span className={styles.addChoiceIcon}>+</span>
                <span><strong>Upload File</strong><small>EPUB, PDF, TXT, DOCX, HTML, or Markdown</small></span>
                <i>&gt;</i>
              </button>
              <button onClick={() => openGutenbergBrowser()}>
                <span className={`${styles.addChoiceIcon} ${styles.gutenbergChoiceIcon}`}>G</span>
                <span><strong>Free Books</strong><small>Browse Project Gutenberg</small></span>
                <i>&gt;</i>
              </button>
              <button onClick={() => setPanel("url")}>
                <span className={`${styles.addChoiceIcon} ${styles.webChoiceIcon}`}>W</span>
                <span><strong>Web Link</strong><small>Import an article from the web</small></span>
                <i>&gt;</i>
              </button>
              <button onClick={() => setPanel("paste")}>
                <span className={`${styles.addChoiceIcon} ${styles.pasteChoiceIcon}`}>T</span>
                <span><strong>Insert Text</strong><small>Paste or type content directly</small></span>
                <i>&gt;</i>
              </button>
            </div>
            <div className={styles.modalActions}><button onClick={() => setPanel(null)}>Cancel</button></div>
          </div>
        </div>
      )}
      {panel === "paste" && (
        <div className={styles.modalBackdrop} onMouseDown={() => !busy && setPanel(null)}>
          <form className={styles.modal} onMouseDown={(event) => event.stopPropagation()} onSubmit={(event) => { event.preventDefault(); void importPastedText(); }}>
            <span className={styles.kicker}>Insert Text</span><h2>Paste your reading</h2>
            <p>Copy anything into the box below — an article, notes, or a chapter. FreeReader turns it into a readable, narratable document.</p>
            <label className={styles.fieldLabel}>Title (optional)<input maxLength={120} placeholder="Defaults to the first line" value={pastedTitle} onChange={(event) => setPastedTitle(event.target.value)} /></label>
            <label className={styles.fieldLabel}>Text
              <textarea
                autoFocus
                className={styles.pasteArea}
                placeholder="Paste or type your text here..."
                value={pastedText}
                disabled={busy}
                onChange={(event) => setPastedText(event.target.value)}
              />
            </label>
            <div className={styles.pasteMeta}>{pastedText.trim() ? `${pastedText.trim().split(/\s+/).length.toLocaleString()} words` : ""}</div>
            {importErrorMessage && <p role="alert">{importErrorMessage}</p>}
            <div className={styles.modalActions}>
              <button type="button" onClick={() => setPanel(null)}>Cancel</button>
              <button className={styles.primaryAction} disabled={busy || !pastedText.trim()}>
                {busy && <span className={styles.addSpinner} aria-label="Adding" />}
                {busy ? "Adding" : "Add to Library"}
              </button>
            </div>
            <div className={styles.modalPrivacy}>Pasted text is parsed and stored only on this device.</div>
          </form>
        </div>
      )}
      {panel === "folder" && (
        <div className={styles.modalBackdrop} onMouseDown={() => setPanel(null)}>
          <form className={`${styles.modal} ${styles.folderModal}`} onMouseDown={(event) => event.stopPropagation()} onSubmit={(event) => { event.preventDefault(); void createFolder(); }}>
            <span className={styles.kicker}>{activeFolder ? `Inside ${activeFolder.name}` : "On this device"}</span>
            <h2>New Folder</h2>
            <label className={styles.fieldLabel}>Folder name<input autoFocus maxLength={80} value={folderName} onChange={(event) => setFolderName(event.target.value)} /></label>
            <div className={styles.modalActions}><button type="button" onClick={() => setPanel(null)}>Cancel</button><button className={styles.primaryAction} disabled={!folderName.trim()}>Create</button></div>
          </form>
        </div>
      )}
      {organizingBook && (
        <div className={styles.modalBackdrop} onMouseDown={() => setOrganizingBook(null)}>
          <div className={`${styles.modal} ${styles.organizeModal}`} onMouseDown={(event) => event.stopPropagation()}>
            <span className={styles.kicker}>Organize Book</span>
            <h2>{organizingBook.title}</h2>
            <p>Move this book to a folder, or return it to the main library.</p>
            <div className={styles.folderChoices}>
              <button disabled={!organizingBook.parentId} onClick={() => void moveBookToFolder(organizingBook)}>
                <span className={styles.libraryGlyph}>B</span>
                <span><strong>{organizingBook.parentId ? "Remove from Folder" : "Library Root"}</strong><small>Keep the book without a folder</small></span>
                {!organizingBook.parentId && <i>Current</i>}
              </button>
              {folderList.map((folder) => (
                <button key={folder.id} disabled={organizingBook.parentId === folder.id} onClick={() => void moveBookToFolder(organizingBook, folder.id)}>
                  <span className={styles.folderGlyph} />
                  <span><strong>{folder.name}</strong><small>{folderPath(folder, folders)}</small></span>
                  {organizingBook.parentId === folder.id && <i>Current</i>}
                </button>
              ))}
            </div>
            <div className={styles.organizeActions}>
              <button onClick={() => setOrganizingBook(null)}>Done</button>
              <button className={styles.destructiveButton} onClick={() => void deleteBook(organizingBook)}>Delete Book</button>
            </div>
          </div>
        </div>
      )}
      {panel === "url" && (
        <div className={styles.modalBackdrop} onMouseDown={() => !busy && setPanel(null)}>
          <form className={styles.modal} onMouseDown={(event) => event.stopPropagation()} onSubmit={(event) => { event.preventDefault(); void importUrl(); }}>
            <span className={styles.kicker}>Import from Web</span><h2>Import reading from the web</h2>
            <p>Paste an article or document URL. FreeReader downloads supported documents directly and uses the article service when a web page cannot be read in your browser.</p>
            <label className={styles.fieldLabel}>Article or document URL<input autoFocus type="url" placeholder="https://example.com/article" value={url} onChange={(event) => setUrl(event.target.value)} /></label>
            {importErrorMessage && <p role="alert">{importErrorMessage}</p>}
            <div className={styles.modalActions}><button type="button" onClick={() => setPanel(null)}>Cancel</button><button className={styles.primaryAction} disabled={busy}>{busy && <span className={styles.addSpinner} aria-label="Importing" />}{busy ? "Importing" : "Import link"}</button></div>
            <div className={styles.modalPrivacy}>Imported content is processed and stored only on this device.</div>
          </form>
        </div>
      )}
      {panel === "gutenberg" && (
        <div className={styles.modalBackdrop} onMouseDown={() => !busy && setPanel(null)}>
          <div className={`${styles.modal} ${styles.catalog}`} onMouseDown={(event) => event.stopPropagation()}>
            <div className={styles.catalogHeader}><span>PG</span><div><strong>PROJECT GUTENBERG</strong><p>Choose a public-domain EPUB and FreeReader will keep it on this device for reading and narration.</p></div></div>
            <h2>Free Books</h2>
            <form className={styles.catalogSearch} onSubmit={(event) => { event.preventDefault(); void searchGutenberg(); }}>
              <input placeholder="Title or author" value={query} onChange={(event) => setQuery(event.target.value)} />
              <button disabled={busy}>Search</button>
            </form>
            <div className={styles.categoryChips}>
              <button className={category === undefined && !query ? styles.categoryActive : ""} onClick={() => { setQuery(""); setCategory(undefined); void searchGutenberg("", undefined); }}>Popular</button>
              {gutenbergCategories.map(([id, name]) => <button key={id} className={category === id && !query ? styles.categoryActive : ""} onClick={() => { setQuery(""); setCategory(id); void searchGutenberg("", id); }}>{name}</button>)}
            </div>
            <div className={styles.catalogList}>
              {gutenberg.map((book) => (
                <article key={book.id}>
                  <GutenbergCover book={book} />
                  <div><strong>{book.title}</strong><small>{book.author || "Project Gutenberg"}</small></div>
                  <button disabled={busy} onClick={() => importGutenberg(book)}>
                    {importingBookId === book.id && <span className={styles.addSpinner} aria-label="Adding book" />}
                    {importingBookId === book.id ? "Adding" : "Add"}
                  </button>
                </article>
              ))}
            </div>
            <button onClick={() => setPanel(null)}>Close</button>
          </div>
        </div>
      )}
    </main>
  );
}
