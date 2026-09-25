"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { Session } from "@supabase/supabase-js";
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
import {
  AccountSyncError,
  deleteCloudAccount,
  deleteCloudDocument,
  synchronizeLibrary,
  uploadCloudDocument,
  uploadCloudFolder,
  uploadCloudProgress,
} from "./accountSync";
import { supabaseClient } from "./supabase";
import { initAuthToken } from "./authToken";
import { fetchUsage, formatRemaining, linkInstallation, type UsageSummary } from "./usage";
import { fetchProPrice, formatProPrice, manageSubscription, startCheckout } from "./billing";
import { TEXT_PIPELINE_REVISION } from "./speechText";
import { narrationRoute, synthesize, synthesizeBatch, type NarrationRoute } from "./narration";
import { SpeechCancelledError, ttsLog } from "./ttsDiagnostics";
import { usesMobileSpeech } from "./mobileSpeech";
import { detectSpeechLanguage, SPEECH_LANGUAGES, voiceForLanguage, voicesForLanguage, type SpeechLanguage } from "./speech";
import { isKokoroVoice, isSupertonicVoice, type NarratorVoice } from "./voices";
import type { GutenbergBook, LibraryBook, LibraryFolder, ParsedBook } from "./types";
import { flushTelemetry, recordTelemetry, type TelemetryProperties } from "./telemetry";
import posthog from "posthog-js";
import styles from "./reader.module.css";
import Link from "next/link";
import ReaderIcon from "./ReaderIcon";

type Panel = "voice" | "url" | "gutenberg" | "folder" | "add" | "paste" | "account" | null;
// Backend English synthesis is batched: several short passages share one round trip.
const BATCH_MAX_BLOCKS = 2;
const BATCH_MAX_CHARS = 1200;
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
    position: { blockIndex: 0, offsetSeconds: 0, speed: 1, updatedAt: now },
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
  const [librarySearch, setLibrarySearch] = useState("");
  const [librarySort, setLibrarySort] = useState("recent");
  const [textSize, setTextSize] = useState(20);
  const [organizingBook, setOrganizingBook] = useState<LibraryBook | null>(null);
  const [importingBookId, setImportingBookId] = useState<string | null>(null);
  const [selected, setSelected] = useState<LibraryBook | null>(null);
  // Async media events must use the latest cursor, including changes before React renders.
  const selectedRef = useRef<LibraryBook | null>(null);
  const [panel, setPanel] = useState<Panel>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("Your books and generated audio stay in this browser.");
  const [libraryLoaded, setLibraryLoaded] = useState(false);
  const [session, setSession] = useState<Session | null>(null);
  const [authReady, setAuthReady] = useState(false);
  const [usage, setUsage] = useState<UsageSummary | null>(null);
  const [proPrice, setProPrice] = useState("$6");
  const [syncing, setSyncing] = useState(false);
  const sessionRef = useRef<Session | null>(null);
  const syncedUser = useRef<string | undefined>(undefined);
  const lastCloudPositionSave = useRef(new Map<string, number>());
  const [importErrorMessage, setImportErrorMessage] = useState("");
  const [url, setUrl] = useState("");
  const [pastedTitle, setPastedTitle] = useState("");
  const [pastedText, setPastedText] = useState("");
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
  const dialogTrigger = useRef<HTMLElement | null>(null);
  const audioRef = useRef<HTMLAudioElement>(null);
  const activeAudio = useRef<ActiveAudio | null>(null);
  const audioUrl = useRef<string | null>(null);
  const pendingAudio = useRef(new Map<string, PendingAudio>());
  const playbackEpoch = useRef(0);
  const wantsPlayback = useRef(false);
  const generationEpoch = useRef(0);
  // Cold start: the very first passage is requested alone so audio can begin playing
  // quickly; later look-ahead requests batch several passages per backend call.
  const audioPrimed = useRef(false);
  const playedBooks = useRef(new Set<string>());
  const playableBooks = useRef(new Set<string>());
  const PAGE_CHAR_LIMIT = 900;
  const [page, setPage] = useState({ bookId: "", start: 0 });
  useEffect(() => { setImportErrorMessage(""); }, [panel]);
  const narrationLanguage = selected ? languageForBook(selected) : "en";
  const narrationVoice = voiceForLanguage(voice, narrationLanguage);
  // English spans both engines; other languages use Supertonic only.
  const usesSupertonic = narrationLanguage !== "en" || isSupertonicVoice(narrationVoice);
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
        setLibraryLoaded(true);
      })
      .catch(() => {
        setMessage("Local library storage is unavailable.");
        setLibraryLoaded(true);
      });
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
    const supabase = supabaseClient();
    if (!supabase) {
      setAuthReady(true);
      return;
    }
    void supabase.auth.getSession().then(({ data }) => {
      sessionRef.current = data.session;
      setSession(data.session);
      setAuthReady(true);
    });
    const { data } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      sessionRef.current = nextSession;
      setSession(nextSession);
      setAuthReady(true);
      if (!nextSession) syncedUser.current = undefined;
    });
    return () => data.subscription.unsubscribe();
  }, []);

  useEffect(() => {
    initAuthToken();
    const token = sessionRef.current?.access_token ?? null;
    (token ? linkInstallation(token) : fetchUsage(null)).then(setUsage).catch(() => undefined);
  }, [session?.user.id]);

  useEffect(() => {
    void fetchProPrice().then((price) => setProPrice(formatProPrice(price))).catch(() => undefined);
  }, []);

  useEffect(() => {
    const checkout = new URLSearchParams(window.location.search).get("checkout");
    if (!checkout) return;
    window.history.replaceState({}, "", window.location.pathname);
    if (checkout === "cancelled") {
      setMessage("Checkout cancelled. Your plan has not changed.");
      return;
    }
    if (checkout !== "success") return;
    setMessage("Checkout complete. Confirming your Pro plan…");
    let attempts = 0;
    const timer = setInterval(() => {
      const token = sessionRef.current?.access_token;
      if (token) void fetchUsage(token).then((summary) => {
        setUsage(summary);
        if (summary.plan === "pro") {
          clearInterval(timer);
          setMessage("Pro is ready. You now have 20 hours of narration per month.");
        }
      }).catch(() => undefined);
      if (++attempts >= 12) {
        clearInterval(timer);
        setMessage("Your payment is still processing. Your Pro plan will appear shortly.");
      }
    }, 2500);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    if (!session?.access_token) return;
    const requested = new URLSearchParams(window.location.search).get("upgrade") === "pro";
    let queued = false;
    try { queued = sessionStorage.getItem("freereaderUpgradeToPro") === "1"; } catch { /* unavailable */ }
    if (!requested && !queued) return;
    try { sessionStorage.removeItem("freereaderUpgradeToPro"); } catch { /* unavailable */ }
    window.history.replaceState({}, "", window.location.pathname);
    void startCheckout(session.access_token)
      .then((url) => window.location.assign(url))
      .catch(() => setMessage("Couldn't start checkout. Please try again from your account menu."));
  }, [session?.access_token]);

  useEffect(() => {
    const userId = session?.user.id;
    if (!libraryLoaded || !userId || syncedUser.current === userId) return;
    syncedUser.current = userId;
    void syncNow();
  }, [libraryLoaded, session?.user.id]);

  useEffect(() => {
    const saveBeforeBackground = () => {
      if (document.visibilityState !== "hidden") return;
      const current = currentAudio();
      if (!current) return;
      const positioned = positionBook(current.book, current.source.index, current.audio.currentTime);
      saveBook(positioned).catch(() => undefined);
      void syncProgress(positioned, true);
    };
    document.addEventListener("visibilitychange", saveBeforeBackground);
    return () => document.removeEventListener("visibilitychange", saveBeforeBackground);
  }, []);

  useEffect(() => {
    if (!panel && !organizingBook) return;
    const previous = dialogTrigger.current ?? document.activeElement as HTMLElement | null;
    const dialog = document.querySelector<HTMLElement>(`.${styles.modal}, .${styles.voicePopover}`);
    if (!dialog) return;
    const controls = () => Array.from(dialog.querySelectorAll<HTMLElement>('button:not(:disabled), input:not(:disabled), select:not(:disabled), textarea:not(:disabled), [tabindex="0"]'));
    if (!dialog.contains(document.activeElement)) controls()[0]?.focus();
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !busy && !syncing) {
        setPanel(null);
        setOrganizingBook(null);
      }
      if (event.key === "Tab") {
        const items = controls();
        const first = items[0];
        const last = items.at(-1);
        if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
        else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
      }
    };
    document.addEventListener("keydown", onKeyDown);
    return () => { document.removeEventListener("keydown", onKeyDown); if (previous?.isConnected) previous.focus(); };
  }, [panel, organizingBook, busy, syncing]);

  function syncFailureMessage(error: unknown): string {
    if (error instanceof AccountSyncError) {
      if (error.code === "document_limit_reached") return "Your cloud library is full. This book remains on this device.";
      if (error.code === "document_too_large") return "This book is larger than the 10 MB cloud limit and remains on this device.";
      if (error.code === "document_belongs_to_another_account") return "This book is linked to another account and remains only on this device.";
      if (error.code === "compression_unavailable") return "This browser cannot prepare cloud documents. Your local library is unchanged.";
      if (error.status === 401) return "Your session expired. Sign in again to resume syncing.";
    }
    return "Cloud sync is temporarily unavailable. Your local library is unchanged.";
  }

  async function syncNow() {
    const activeSession = sessionRef.current;
    if (!activeSession || syncing) return;
    setSyncing(true);
    setMessage("Syncing your library...");
    try {
      const [localBooks, localFolders] = await Promise.all([listBooks(), listFolders()]);
      const result = await synchronizeLibrary(
        activeSession.access_token,
        activeSession.user.id,
        localBooks,
        localFolders,
      );
      setBooks(result.books);
      setFolders(result.folders);
      const changes = result.uploaded + result.downloaded;
      setMessage(result.localOnly
        ? `${result.localOnly} ${result.localOnly === 1 ? "book stays" : "books stay"} only on this device because of cloud limits.`
        : changes
          ? `Library synced: ${result.uploaded} uploaded, ${result.downloaded} downloaded.`
          : "Your library is synced across devices.");
    } catch (error) {
      setMessage(syncFailureMessage(error));
    } finally {
      setSyncing(false);
    }
  }

  async function signIn() {
    const supabase = supabaseClient();
    if (!supabase) {
      setMessage("Google sign-in has not been configured for this deployment.");
      return;
    }
    const { error } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: { redirectTo: `${window.location.origin}${window.location.pathname}` },
    });
    if (error) setMessage("Google sign-in could not be started.");
  }

  function refreshUsage() {
    const token = sessionRef.current?.access_token ?? null;
    fetchUsage(token).then(setUsage).catch(() => undefined);
  }

  async function upgradeToPro() {
    const token = sessionRef.current?.access_token;
    if (!token) {
      void signIn();
      return;
    }
    try {
      window.location.href = await startCheckout(token);
    } catch {
      setMessage("Could not start checkout. Please try again.");
    }
  }

  async function openBillingPortal() {
    const token = sessionRef.current?.access_token;
    if (!token) return;
    try {
      window.location.assign(await manageSubscription(token));
    } catch {
      setMessage("Couldn't open subscription management. Please try again.");
    }
  }

  async function signOut() {
    const supabase = supabaseClient();
    if (!supabase) return;
    const { error } = await supabase.auth.signOut();
    if (error) setMessage("Sign out failed. Please try again.");
    else {
      setPanel(null);
      setMessage("Signed out. Downloaded books remain on this device.");
    }
  }

  async function deleteAccountAndCloudData() {
    const activeSession = sessionRef.current;
    const supabase = supabaseClient();
    if (!activeSession || !supabase || !window.confirm("Delete your FreeReader account, every synced document, and every reading position? Downloaded books will remain on this device.")) return;
    setSyncing(true);
    try {
      await deleteCloudAccount(activeSession.access_token, activeSession.user.id);
      await supabase.auth.signOut();
      setPanel(null);
      setMessage("Your account and cloud copies were deleted. Downloaded books remain on this device.");
    } catch (error) {
      setMessage(syncFailureMessage(error));
    } finally {
      setSyncing(false);
    }
  }

  async function syncDocument(book: LibraryBook) {
    const activeSession = sessionRef.current;
    if (!activeSession) return;
    try {
      await uploadCloudDocument(activeSession.access_token, activeSession.user.id, book);
      setMessage(`${book.title} is available on your signed-in devices.`);
    } catch (error) {
      setMessage(syncFailureMessage(error));
    }
  }

  async function syncFolder(folder: LibraryFolder) {
    const activeSession = sessionRef.current;
    if (!activeSession) return;
    try {
      await uploadCloudFolder(activeSession.access_token, activeSession.user.id, folder);
    } catch (error) {
      setMessage(syncFailureMessage(error));
    }
  }

  async function syncProgress(book: LibraryBook, force = false) {
    const activeSession = sessionRef.current;
    if (!activeSession) return;
    const lastSave = lastCloudPositionSave.current.get(book.id) ?? 0;
    if (!force && Date.now() - lastSave < 30_000) return;
    lastCloudPositionSave.current.set(book.id, Date.now());
    try {
      await uploadCloudProgress(activeSession.access_token, book);
    } catch {
      // The local checkpoint remains authoritative until the next successful sync.
    }
  }

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
      setLibrarySearch("");
      setPanel(null);
      setMessage(sessionRef.current ? `${book.title} was added and will sync shortly.` : `${book.title} was added to your private library.`);
      void syncDocument(book);
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
      setLibrarySearch("");
      setPanel(null);
      setUrl("");
      setMessage(sessionRef.current ? `${book.title} was saved and will sync shortly.` : `${book.title} was saved for offline reading.`);
      void syncDocument(book);
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
      setLibrarySearch("");
      setPanel(null);
      setPastedText("");
      setPastedTitle("");
      setMessage(sessionRef.current ? `${book.title} was added and will sync shortly.` : `${book.title} was added to your private library.`);
      void syncDocument(book);
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
    const now = new Date().toISOString();
    return {
      ...book,
      position: { ...book.position, blockIndex, offsetSeconds, updatedAt: now },
    };
  }

  function audioCacheKey(book: LibraryBook, index: number, route: NarrationRoute): string {
    const language = languageForBook(book);
    const quality = route.model.startsWith("supertonic") ? `${steps}-` : "";
    const model = `${TEXT_PIPELINE_REVISION}-${route.model}-${language}-${route.voice}-${quality}${speechRate}`;
    return `${book.id}/${model}/${index}.${route.provider === "Server" ? "m4a" : "wav"}`;
  }

  async function ensureAudio(book: LibraryBook, index: number, isCurrent: () => boolean): Promise<PreparedAudio> {
    const checkRequest = () => {
      if (!isCurrent()) throw new SpeechCancelledError("Playback position changed");
    };
    checkRequest();
    const language = languageForBook(book);
    const route = await narrationRoute(voice, language);
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
    const selectedVoice = voiceForLanguage(voice, language);
    const request = { isCurrent };
    const onStatus = (status: string, progress?: number) => {
      if (!request.isCurrent()) return;
      // Only surface real model downloads; generation statuses made the UI flash.
      if (status.startsWith("Downloading voice model")) {
        setMessage(status);
        setTtsProgress(progress !== undefined && progress < 1 ? progress : undefined);
      }
    };

    if (route.provider === "Server") {
      // Batch consecutive passages so runs of short chunks share one backend round trip.
      // Until audio exists, request a single passage so playback can start sooner.
      const maxBlocks = audioPrimed.current ? BATCH_MAX_BLOCKS : 1;
      const batch: Array<{ index: number; key: string; text: string; isHeading: boolean }> = [];
      let characters = 0;
      for (let cursor = index; cursor < book.blocks.length && batch.length < maxBlocks; cursor += 1) {
        const candidate = book.blocks[cursor];
        if (batch.length && characters + candidate.text.length > BATCH_MAX_CHARS) break;
        const cursorKey = cursor === index ? key : audioCacheKey(book, cursor, route);
        if (cursor !== index && pendingAudio.current.has(cursorKey)) break;
        batch.push({ index: cursor, key: cursorKey, text: candidate.text, isHeading: candidate.isHeading });
        characters += candidate.text.length;
      }
      const master = synthesizeBatch(
        batch.map((item) => item.text),
        batch.map((item) => item.isHeading),
        selectedVoice, steps, onStatus, speechRate, language, () => request.isCurrent(),
      ).then(async ({ parts, route: actualRoute }) => {
        if (parts.length !== batch.length) throw new Error("Speech batch size did not match the request.");
        audioPrimed.current = true;
        return Promise.all(batch.map(async (item, position) => {
          const part = parts[position];
          // A failed remote request may have completed with a local variant. Cache its real route.
          await saveAudio(audioCacheKey(book, item.index, actualRoute), part.blob);
          return { blob: part.blob, provider: part.provider, model: actualRoute.model, cached: false,
            duration: part.duration, generationStartedAt: part.generationStartedAt };
        }));
      }).finally(() => {
        if (request.isCurrent()) setTtsProgress(undefined);
        for (const item of batch) pendingAudio.current.delete(item.key);
      });
      batch.forEach((item, position) => {
        const derived = master.then((results) => results[position]);
        derived.catch(() => undefined); // Unawaited look-ahead entries must not be unhandled rejections.
        pendingAudio.current.set(item.key, { promise: derived, request });
      });
      return pendingAudio.current.get(key)!.promise;
    }

    const promise = synthesize(block.text, selectedVoice, steps, onStatus, block.isHeading, speechRate, language,
      () => request.isCurrent()).then(async ({ blob, duration, provider, generationStartedAt, route: actualRoute }) => {
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
        const { blob, duration } = await ensureAudio(book, index, isCurrent);
        if (!isCurrent()) return;
        if (duration > 0) bufferedSeconds += duration / book.position.speed;
        else if (blob.type === "audio/wav") {
          const wav = new DataView(await blob.slice(0, 44).arrayBuffer());
          bufferedSeconds += (blob.size - 44) / wav.getUint32(28, true) / book.position.speed;
        } else {
          bufferedSeconds += book.blocks[index].text.split(/\s+/).length / 2.5 / book.position.speed;
        }
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
    const positioned = positionBook(book, index, offsetFromEnd ? 0 : offset);
    updateBook(positioned);
    void syncProgress(positioned);
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
          ...(info.provider && { engine: info.provider === "Server" ? "server" : `onnxruntime_${info.provider.toLowerCase()}` }),
          language,
          ...(!isKokoroVoice(selectedVoice) && { inference_steps: steps }),
          audio_source: info.cached ? "cache" : "generated",
          time_to_first_playable_seconds: timeToFirstPlayableSeconds,
          spoken_seconds: Number.isFinite(audio.duration) && audio.duration > 0 ? audio.duration : info.duration,
          cache_bytes: blob.size,
        });
        posthog.capture("first_playable_audio", {
          model,
          ...(info.provider && { engine: info.provider === "Server" ? "server" : `onnxruntime_${info.provider.toLowerCase()}` }),
          language,
          ...(!isKokoroVoice(selectedVoice) && { inference_steps: steps }),
          audio_source: info.cached ? "cache" : "generated",
          time_to_first_playable_seconds: timeToFirstPlayableSeconds,
        });
      }
    } catch (error) {
      if (!isCurrent()) return;
      pausePlayback();
      setMessage(error instanceof Error ? error.message : "Speech generation failed.");
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
      if (current) {
        const positioned = positionBook(book, current.source.index, current.audio.currentTime);
        updateBook(positioned);
        void syncProgress(positioned, true);
      }
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
    const updated = {
      ...selected,
      position: { ...selected.position, speed, updatedAt: new Date().toISOString() },
    };
    updateBook(updated);
    void syncProgress(updated, true);
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
      const positioned = positionBook(book, source.index, audio.currentTime);
      updateBook(positioned);
      void syncProgress(positioned);
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
      const positioned = positionBook(selected, blockIndex);
      updateBook(positioned);
      void syncProgress(positioned, true);
    }
  }

  async function deleteBook(book: LibraryBook) {
    if (!window.confirm(`Remove "${book.title}" from this browser?`)) return;
    await removeBook(book.id);
    const activeSession = sessionRef.current;
    if (activeSession) void deleteCloudDocument(activeSession.access_token, book.id).catch(() => undefined);
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
    setPanel(null);
    setMessage("Press Listen to hear this passage. Your place is saved automatically.");
    audioPrimed.current = false;
    const language = languageForBook(book);
    const ready = book.language ? book : { ...book, language, updatedAt: new Date().toISOString() };
    selectedRef.current = ready;
    setSelected(ready);
    setVoice((current) => voiceForLanguage(current, language));
    if (!book.language) {
      setBooks((current) => current.map((value) => value.id === book.id ? ready : value));
      saveBook(ready).catch(() => undefined);
      void syncDocument(ready);
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
    audioPrimed.current = false;
    setVoice((current) => voiceForLanguage(current, language));
    const updated = { ...selected, language, updatedAt: new Date().toISOString() };
    updateBook(updated);
    void syncDocument(updated);
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
      setMessage(sessionRef.current ? `${folder.name} was created and synced.` : `${folder.name} was created on this device.`);
      void syncFolder(folder);
    } catch {
      setMessage("The folder could not be saved.");
    }
  }

  async function moveBookToFolder(book: LibraryBook, parentId?: string) {
    const updated = { ...book, parentId, updatedAt: new Date().toISOString() };
    try {
      await saveBook(updated);
      setBooks((current) => current.map((value) => value.id === book.id ? updated : value));
      void syncDocument(updated);
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
    const pageIndex = Math.max(0, pageStarts.indexOf(page.start));
    return (
      <main className={`${styles.appShell} ${styles.readingShell}`} onClickCapture={(event) => { if (!panel) dialogTrigger.current = (event.target as Element).closest("button"); }}>
        <audio ref={audioRef} onTimeUpdate={onTimeUpdate} onEnded={onEnded} onError={() => {
          if (!currentAudio() || !audioRef.current?.error) return;
          setMessage(audioRef.current.error.message || "Audio playback failed. Tap Listen to retry.");
          resetPlayback();
        }} />
        <div className={styles.readerTop} inert={panel === "voice"}>
          <button className={styles.textButton} onClick={() => { resetPlayback(); selectedRef.current = null; setSelected(null); setPanel(null); setMessage("Your reading position has been saved."); }}><ReaderIcon name="back" /> Library</button>
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
            <button className={styles.textButton} aria-expanded={panel === "voice"} onClick={() => setPanel(panel ? null : "voice")}><ReaderIcon name="settings" /> Voice</button>
          </div>
        </div>
        <div className={styles.readerGrid} inert={panel === "voice"}>
          <aside className={styles.chapterRail}>
            <div className={styles.chapterBook}><BookCover book={selected} index={0} /><strong>{selected.title}</strong>{selected.author && <small>{selected.author}</small>}</div>
            <span className={styles.kicker}>Contents</span>
            {selected.chapters.map((item, index) => (
              <button
                key={`${item.startBlockIndex}-${item.title}`}
                className={index === block?.chapterIndex ? styles.activeChapter : ""}
                aria-current={index === block?.chapterIndex ? "location" : undefined}
                onClick={() => goToBlock(item.startBlockIndex)}
              >{item.title}</button>
            ))}
          </aside>
          <article className={styles.readingPane}>
            <div className={styles.readingToolbar}><span>Tap a passage to listen from there</span><div className={styles.textSizing} role="group" aria-label="Text size"><button aria-label="Decrease text size" disabled={textSize <= 16} onClick={() => setTextSize((size) => size - 2)}>A−</button><button aria-label="Increase text size" disabled={textSize >= 28} onClick={() => setTextSize((size) => size + 2)}>A+</button></div></div>
            <div className={styles.readingText} style={{ fontSize: textSize }}>
              {selected.blocks.slice(page.start, pageStarts.find((candidate) => candidate > page.start) ?? selected.blocks.length).map((item) => (
                item.isHeading
                  ? <h2 key={item.index} aria-current={item.index === selected.position.blockIndex ? "true" : undefined} className={item.index === selected.position.blockIndex ? styles.currentBlock : ""} onClick={() => goToBlock(item.index)}>{item.text}</h2>
                  : <p key={item.index} aria-current={item.index === selected.position.blockIndex ? "true" : undefined} className={item.index === selected.position.blockIndex ? styles.currentBlock : ""} onClick={() => goToBlock(item.index)}>{item.text}</p>
              ))}
            </div>
            <nav className={styles.pageNavigation} aria-label="Reading pages">
              <button disabled={pageIndex === 0} onClick={() => goToBlock(pageStarts[pageIndex - 1])}><ReaderIcon name="back" /> Previous</button>
              <span>Page {pageIndex + 1} of {pageStarts.length}</span>
              <button disabled={pageIndex >= pageStarts.length - 1} onClick={() => goToBlock(pageStarts[pageIndex + 1])}>Next <ReaderIcon name="arrow" /></button>
            </nav>
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
        <div className={styles.player} inert={panel === "voice"}>
          <div className={styles.progressMeta}><span>{chapter?.title ?? selected.title}</span><strong>{Math.round(bookProgress * 100)}% of book</strong></div>
          <input className={styles.progressSlider} type="range" min="0" max="1" step="0.001" value={bookProgress} onChange={(event) => seekOverall(Number(event.target.value))} aria-label="Book playback progress" />
          <div className={styles.playerRow}>
            <div className={styles.playerLabel}><ReaderIcon name="headphones" /><span>Listen along<small>{SPEECH_LANGUAGES.find(([code]) => code === narrationLanguage)?.[1]}</small></span></div>
            <div className={styles.transport}>
              <button className={styles.chapterSkip} onClick={() => moveChapter(-1)} disabled={!selected.chapters.some((item) => item.startBlockIndex < selected.position.blockIndex)} title="Previous chapter" aria-label="Previous chapter"><ReaderIcon name="previous" /></button>
              <button onClick={() => seek(-10)} title="Back 10 seconds"><strong>-10</strong><span>seconds</span></button>
              <button className={styles.playButton} onClick={togglePlayback}><ReaderIcon name={playing ? "pause" : "play"} />{playing ? "Pause" : "Listen"}</button>
              <button onClick={() => seek(10)} title="Forward 10 seconds"><strong>+10</strong><span>seconds</span></button>
              <button className={styles.chapterSkip} onClick={() => moveChapter(1)} disabled={!selected.chapters.some((item) => item.startBlockIndex > selected.position.blockIndex)} title="Next chapter" aria-label="Next chapter"><ReaderIcon name="next" /></button>
            </div>
            <label className={styles.speed}>Speed
              <select value={selected.position.speed} onChange={(event) => changeSpeed(Number(event.target.value))}>
                {[0.75, 1, 1.25, 1.5, 1.75, 2].map((value) => <option key={value} value={value}>{value}x</option>)}
              </select>
            </label>
          </div>
          <p className={styles.statusLine} role="status">{message}</p>
        </div>
        {panel === "voice" && (
          <div className={styles.settingsBackdrop} onMouseDown={() => setPanel(null)}>
          <div className={styles.voicePopover} role="dialog" aria-modal="true" aria-label="Voice settings" onMouseDown={(event) => event.stopPropagation()}>
            <div className={styles.settingsTitle}><strong>Voice Settings</strong><button onClick={() => setPanel(null)}>Done</button></div>
            <label className={styles.settingsRow}><span>Language</span>
              <select value={narrationLanguage} onChange={(event) => changeNarrationLanguage(event.target.value as SpeechLanguage)}>
                {SPEECH_LANGUAGES.map(([value, name]) => <option key={value} value={value}>{name}</option>)}
              </select>
            </label>
            <label className={styles.settingsRow}><span><i className={styles.waveIcon}>~~~</i> Voice</span>
              <select value={narrationVoice} onChange={(event) => { resetPlayback(); audioPrimed.current = false; setVoice(event.target.value as NarratorVoice); posthog.capture("voice_settings_changed", { setting: "voice", value: event.target.value }); }}>
                {voicesForLanguage(narrationLanguage).map(([value, name]) => <option key={value} value={value}>{name}</option>)}
              </select>
            </label>
            <div className={styles.qualitySetting}><span>Speaking Rate</span><div>
              {[[0.8, "0.8x"], [0.9, "0.9x"], [1, "1x"], [1.1, "1.1x"], [1.2, "1.2x"]].map(([value, label]) => (
                <button key={value} className={speechRate === value ? styles.qualityActive : ""} onClick={() => { resetPlayback(); audioPrimed.current = false; setSpeechRate(Number(value)); posthog.capture("voice_settings_changed", { setting: "speaking_rate", value: Number(value) }); }}>{label}</button>
              ))}
            </div></div>
            {usesSupertonic && (
              <div className={styles.qualitySetting}><span>Quality</span><div>
                {[[5, "Low"], [8, "Medium"], [12, "High"]].map(([value, label]) => (
                  <button key={value} className={steps === value ? styles.qualityActive : ""} onClick={() => { resetPlayback(); setSteps(Number(value)); posthog.capture("voice_settings_changed", { setting: "quality_steps", value: Number(value) }); }}>{label}</button>
                ))}
              </div></div>
            )}
            <small>{narrationLanguage === "en"
              ? "English narration offers Kokoro and Supertonic voices. Speaking Rate changes how the server generates the audio."
              : "Higher quality takes longer to generate. Changes apply to new passages."}</small>
          </div>
          </div>
        )}
      </main>
    );
  }

  const activeFolder = activeFolderId
    ? folders.find((folder) => folder.id === activeFolderId)
    : undefined;
  const folderBooks = activeFolderId
    ? books.filter((book) => book.parentId === activeFolderId)
    : books.filter((book) => !book.parentId);
  const search = librarySearch.trim().toLocaleLowerCase();
  const visibleBooks = (search && !activeFolderId ? books : folderBooks)
    .filter((book) => `${book.title} ${book.author ?? ""}`.toLocaleLowerCase().includes(search))
    .sort((a, b) => librarySort === "title"
      ? a.title.localeCompare(b.title)
      : librarySort === "added"
        ? b.createdAt.localeCompare(a.createdAt)
        : (b.position.updatedAt ?? b.updatedAt).localeCompare(a.position.updatedAt ?? a.updatedAt));
  const continueBook = [...books]
    .filter((book) => book.position.blockIndex > 0 || book.position.offsetSeconds > 0)
    .sort((a, b) => (b.position.updatedAt ?? b.updatedAt).localeCompare(a.position.updatedAt ?? a.updatedAt))[0];
  const childFolders = folders.filter((folder) => folder.parentId === (activeFolderId ?? undefined));
  const folderList = orderedFolders(folders);
  const parentFolder = activeFolder?.parentId
    ? folders.find((folder) => folder.id === activeFolder.parentId)
    : undefined;
  const accountName = session?.user.user_metadata.full_name
    ?? session?.user.user_metadata.name
    ?? session?.user.email
    ?? "Google account";

  return (
    <main className={styles.appShell} onClickCapture={(event) => { if (!panel && !organizingBook) dialogTrigger.current = (event.target as Element).closest("button"); }}>
      <header className={styles.libraryHero} inert={!!panel || !!organizingBook}>
        <Link href="/reader" className={styles.libraryBrand} aria-label="FreeReader workspaces">
          <span className={styles.appMark} aria-hidden="true"><i /><i /><i /><i /></span>
          <span>FreeReader<span className={styles.brandSubtitle}>Your reading workspace</span></span>
        </Link>
        <div className={styles.actions}>
          <button
            className={styles.accountButton}
            disabled={!authReady || syncing}
            onClick={() => session ? (refreshUsage(), setPanel("account")) : void signIn()}
            aria-label={session ? `Account: ${accountName}` : "Sign in with Google"}
          ><ReaderIcon name="user" /><span>{session ? accountName : "Sign in"}</span></button>
          <button className={styles.primaryAction} onClick={() => setPanel("add")}><ReaderIcon name="plus" /> Add content</button>
          <input ref={fileInputRef} hidden type="file" accept={IMPORT_ACCEPT} onChange={(event) => {
            const file = event.currentTarget.files?.[0];
            event.currentTarget.value = "";
            if (file) void importDocument(file);
          }} />
        </div>
      </header>
      <div className={styles.libraryLayout} inert={!!panel || !!organizingBook}>
        <section className={styles.shelf}>
          <div className={styles.workspaceHeading}>
            <div>
              <h1>Your library</h1>
            </div>
            <span className={styles.storageBadge}><span className={styles.localDot} />{session ? "Account sync on" : "No account needed"}</span>
            {usage && <span className={styles.storageBadge}><span className={styles.localDot} />{formatRemaining(usage.remaining_seconds)} left this month</span>}
          </div>
          {!activeFolderId && !search && continueBook && (
            <section className={styles.continueCard} aria-label="Continue reading">
              <BookCover book={continueBook} index={0} />
              <div className={styles.continueInfo}>
                <span className={styles.kicker}>Continue reading</span>
                <h2>{continueBook.title}</h2>
                <p>{continueBook.chapters[continueBook.blocks[continueBook.position.blockIndex]?.chapterIndex]?.title ?? "Your last position"} · {Math.round(readingProgress(continueBook) * 100)}% complete</p>
                <span className={styles.bookProgress}><i style={{ width: `${readingProgress(continueBook) * 100}%` }} /></span>
              </div>
              <button className={styles.primaryAction} onClick={() => openBook(continueBook)}>Continue reading <ReaderIcon name="arrow" /></button>
            </section>
          )}
          <div className={styles.importGrid} aria-label="Add to your library">
            <button disabled={busy} onClick={() => fileInputRef.current?.click()}><span className={styles.importIcon}><ReaderIcon name="upload" /></span><span><strong>Upload File</strong><small>EPUB, PDF, DOCX & more</small></span><ReaderIcon name="plus" /></button>
            <button onClick={() => setPanel("url")}><span className={styles.importIcon}><ReaderIcon name="link" /></span><span><strong>Web Link</strong><small>Turn an article into audio</small></span><ReaderIcon name="plus" /></button>
            <button onClick={() => setPanel("paste")}><span className={styles.importIcon}><ReaderIcon name="text" /></span><span><strong>Insert Text</strong><small>Notes, scripts, or a passage</small></span><ReaderIcon name="plus" /></button>
            <button onClick={openGutenbergBrowser}><span className={styles.importIcon}><ReaderIcon name="book" /></span><span><strong>Free Books</strong><small>Explore Project Gutenberg</small></span><ReaderIcon name="arrow" /></button>
          </div>
          <div className={styles.libraryToolbar}>
            <div className={styles.shelfHeading}>
              <div>
                {activeFolder && <button className={styles.backFolder} onClick={() => { setActiveFolderId(parentFolder?.id ?? null); setLibrarySearch(""); }}><ReaderIcon name="back" />{parentFolder?.name ?? "Library"}</button>}
                <h2>{search ? "Search results" : activeFolder?.name ?? "Saved reading"} <span>{visibleBooks.length}</span></h2>
              </div>
              <button className={styles.newFolderButton} onClick={() => { setFolderName(""); setPanel("folder"); }}><ReaderIcon name="folder" /> New folder</button>
            </div>
            <div className={styles.filterRow}>
              <label className={styles.librarySearch}><ReaderIcon name="search" /><input type="search" aria-label="Search library" placeholder={activeFolder ? "Search this folder…" : "Search titles or authors…"} value={librarySearch} onChange={(event) => setLibrarySearch(event.target.value)} /></label>
              <label className={styles.sortLabel}>Sort by<select aria-label="Sort library" value={librarySort} onChange={(event) => setLibrarySort(event.target.value)}><option value="recent">Recently read</option><option value="added">Recently added</option><option value="title">Title A–Z</option></select></label>
            </div>
          </div>
          {!search && childFolders.length > 0 && (
            <div className={styles.folderGrid} aria-label="Folders">
              {childFolders.map((folder) => (
                <button key={folder.id} className={styles.folderCard} onClick={() => { setActiveFolderId(folder.id); setLibrarySearch(""); }}>
                  <ReaderIcon name="folder" />
                  <span><strong>{folder.name}</strong><small>{books.filter((book) => book.parentId === folder.id).length + folders.filter((child) => child.parentId === folder.id).length} items</small></span>
                  <ReaderIcon name="arrow" />
                </button>
              ))}
            </div>
          )}
          {!libraryLoaded ? <p role="status" className={styles.emptyLibrary}>Loading your library…</p> : visibleBooks.length ? (
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
                        <span className={styles.bookReadingState}>{progress > 0 ? `${Math.round(progress * 100)}% read · Continue reading` : "Ready to read"}</span>
                        <span className={styles.bookProgress}><i style={{ width: `${progress * 100}%` }} /></span>
                      </span>
                    </button>
                    <button className={styles.moreButton} onClick={() => setOrganizingBook(book)} aria-label={`Organize ${book.title}`}><ReaderIcon name="more" /></button>
                  </article>
                );
              })}
            </div>
          ) : search ? (
            <div className={styles.emptyLibrary}><ReaderIcon name="search" /><h2>No matching reading</h2><p>Try another title or author.</p><button onClick={() => setLibrarySearch("")}>Clear search</button></div>
          ) : childFolders.length === 0 ? (
            <div className={styles.emptyLibrary}>
              <div className={styles.emptyIllustration} aria-hidden="true"><ReaderIcon name="book" /><span><ReaderIcon name="headphones" /></span></div>
              <h2>{activeFolder ? "Make room for a new chapter" : "Your next great read belongs here"}</h2>
              <p>Add a book, article, or your own text.<br />Read along on screen or press play and listen.</p>
              <button className={styles.primaryAction} disabled={busy} onClick={() => fileInputRef.current?.click()}><ReaderIcon name="upload" /> Add your first file</button>
              <small>EPUB · PDF · TXT · DOCX · HTML · Markdown</small>
            </div>
          ) : null}
          <div className={styles.libraryFootnote} role="status">{busy && <span className={styles.addSpinner} />} {message}</div>
        </section>
      </div>
      {panel === "account" && session && (
        <div className={styles.modalBackdrop} onMouseDown={() => !syncing && setPanel(null)}>
          <div className={`${styles.modal} ${styles.accountModal}`} role="dialog" aria-modal="true" aria-label="Account" onMouseDown={(event) => event.stopPropagation()}>
            <span className={styles.kicker}>Google Account</span>
            <h2>{accountName}</h2>
            <p>{session.user.email}</p>
            {usage && (
              <div className={styles.accountSummary}>
                <strong>{formatRemaining(usage.remaining_seconds)} of narration left</strong>
                <span>{usage.plan === "pro" ? "Pro" : "Free"} plan · {formatRemaining(usage.used_seconds)} used of {formatRemaining(usage.budget_seconds)} this month</span>
                <span className={styles.bookProgress}><i style={{ width: `${usage.budget_seconds ? Math.min(100, usage.used_seconds / usage.budget_seconds * 100) : 0}%` }} /></span>
              </div>
            )}
            <div className={styles.accountSummary}>
              <strong>{books.length} documents on this device; up to 100 sync</strong>
              <span>Documents are compressed before upload. Generated audio and voice models never sync.</span>
            </div>
            <div className={styles.accountActions}>
              {usage?.plan !== "pro" && <button className={styles.upgradeButton} disabled={syncing} onClick={() => void upgradeToPro()}>Upgrade to Pro — {proPrice}/month</button>}
              {usage?.plan === "pro" && <button onClick={() => void openBillingPortal()}>Manage subscription</button>}
              <button disabled={syncing} onClick={() => void syncNow()}>{syncing ? "Syncing..." : "Sync now"}</button>
              <button disabled={syncing} onClick={() => void signOut()}>Sign out</button>
              <button className={styles.destructiveButton} disabled={syncing} onClick={() => void deleteAccountAndCloudData()}>Delete account and cloud copies</button>
            </div>
            <small>Signing out keeps downloaded books on this device. Deleting your account also removes cloud copies and signs you out.</small>
            <div className={styles.modalActions}><button onClick={() => setPanel(null)}>Done</button></div>
          </div>
        </div>
      )}
      {panel === "add" && (
        <div className={styles.modalBackdrop} onMouseDown={() => setPanel(null)}>
          <div className={`${styles.modal} ${styles.addModal}`} role="dialog" aria-modal="true" aria-label="Add reading" onMouseDown={(event) => event.stopPropagation()}>
            <span className={styles.kicker}>Add Reading</span>
            <h2>What would you like to add?</h2>
            <div className={`${styles.folderChoices} ${styles.addChoices}`}>
              <button onClick={() => { setPanel(null); fileInputRef.current?.click(); }}>
                <span className={styles.addChoiceIcon}><ReaderIcon name="upload" /></span>
                <span><strong>Upload File</strong><small>EPUB, PDF, TXT, DOCX, HTML, or Markdown</small></span>
                <i>&gt;</i>
              </button>
              <button onClick={() => openGutenbergBrowser()}>
                <span className={`${styles.addChoiceIcon} ${styles.gutenbergChoiceIcon}`}><ReaderIcon name="book" /></span>
                <span><strong>Free Books</strong><small>Browse Project Gutenberg</small></span>
                <i>&gt;</i>
              </button>
              <button onClick={() => setPanel("url")}>
                <span className={`${styles.addChoiceIcon} ${styles.webChoiceIcon}`}><ReaderIcon name="link" /></span>
                <span><strong>Web Link</strong><small>Import an article from the web</small></span>
                <i>&gt;</i>
              </button>
              <button onClick={() => setPanel("paste")}>
                <span className={`${styles.addChoiceIcon} ${styles.pasteChoiceIcon}`}><ReaderIcon name="text" /></span>
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
          <form className={styles.modal} role="dialog" aria-modal="true" aria-label="Paste your reading" onMouseDown={(event) => event.stopPropagation()} onSubmit={(event) => { event.preventDefault(); void importPastedText(); }}>
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
            <div className={styles.modalPrivacy}>{session ? "Pasted text is parsed locally, then the compressed document syncs to your account." : "Pasted text is parsed and stored only on this device."}</div>
          </form>
        </div>
      )}
      {panel === "folder" && (
        <div className={styles.modalBackdrop} onMouseDown={() => setPanel(null)}>
          <form className={`${styles.modal} ${styles.folderModal}`} role="dialog" aria-modal="true" aria-label="New folder" onMouseDown={(event) => event.stopPropagation()} onSubmit={(event) => { event.preventDefault(); void createFolder(); }}>
            <span className={styles.kicker}>{activeFolder ? `Inside ${activeFolder.name}` : "On this device"}</span>
            <h2>New Folder</h2>
            <label className={styles.fieldLabel}>Folder name<input autoFocus maxLength={80} value={folderName} onChange={(event) => setFolderName(event.target.value)} /></label>
            <div className={styles.modalActions}><button type="button" onClick={() => setPanel(null)}>Cancel</button><button className={styles.primaryAction} disabled={!folderName.trim()}>Create</button></div>
          </form>
        </div>
      )}
      {organizingBook && (
        <div className={styles.modalBackdrop} onMouseDown={() => setOrganizingBook(null)}>
          <div className={`${styles.modal} ${styles.organizeModal}`} role="dialog" aria-modal="true" aria-label="Organize book" onMouseDown={(event) => event.stopPropagation()}>
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
          <form className={styles.modal} role="dialog" aria-modal="true" aria-label="Import reading from the web" onMouseDown={(event) => event.stopPropagation()} onSubmit={(event) => { event.preventDefault(); void importUrl(); }}>
            <span className={styles.kicker}>Import from Web</span><h2>Import reading from the web</h2>
            <p>Paste an article or document URL. FreeReader downloads supported documents directly and uses the article service when a web page cannot be read in your browser.</p>
            <label className={styles.fieldLabel}>Article or document URL<input autoFocus type="url" placeholder="https://example.com/article" value={url} onChange={(event) => setUrl(event.target.value)} /></label>
            {importErrorMessage && <p role="alert">{importErrorMessage}</p>}
            <div className={styles.modalActions}><button type="button" onClick={() => setPanel(null)}>Cancel</button><button className={styles.primaryAction} disabled={busy}>{busy && <span className={styles.addSpinner} aria-label="Importing" />}{busy ? "Importing" : "Import link"}</button></div>
            <div className={styles.modalPrivacy}>{session ? "Imported content is processed locally, then the compressed document syncs to your account." : "Imported content is processed and stored only on this device."}</div>
          </form>
        </div>
      )}
      {panel === "gutenberg" && (
        <div className={styles.modalBackdrop} onMouseDown={() => !busy && setPanel(null)}>
          <div className={`${styles.modal} ${styles.catalog}`} role="dialog" aria-modal="true" aria-label="Free Books" onMouseDown={(event) => event.stopPropagation()}>
            <div className={styles.catalogHeader}><span>PG</span><div><strong>PROJECT GUTENBERG</strong><p>Choose a public-domain EPUB and FreeReader will keep it on this device{session ? " and sync it to your account" : ""} for reading and narration.</p></div></div>
            <h2>Free Books</h2>
            <form className={styles.catalogSearch} onSubmit={(event) => { event.preventDefault(); void searchGutenberg(); }}>
              <input aria-label="Search free books" placeholder="Title or author" value={query} onChange={(event) => setQuery(event.target.value)} />
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
