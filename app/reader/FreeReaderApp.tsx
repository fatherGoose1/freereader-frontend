"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { browseGutenberg, downloadGutenbergBook } from "./gutenberg";
import { parseFile, parseWebLink } from "./importers";
import {
  getAudio,
  listBooks,
  listFolders,
  removeBook,
  requestPersistentStorage,
  saveAudio,
  saveBook,
  saveFolder,
  saveSource,
} from "./storage";
import { TEXT_PIPELINE_REVISION } from "./speechText";
import { synthesize, VOICES, type Voice } from "./tts";
import type { GutenbergBook, LibraryBook, LibraryFolder, ParsedBook } from "./types";
import { flushTelemetry, recordTelemetry, type TelemetryProperties } from "./telemetry";
import styles from "./reader.module.css";

type Panel = "voice" | "url" | "gutenberg" | "folder" | null;

const voiceNames: Record<Voice, string> = {
  M1: "Alex", M2: "James", M3: "Robert", M4: "Sam", M5: "Daniel",
  F1: "Sarah", F2: "Lily", F3: "Jessica", F4: "Olivia", F5: "Emily",
};

const gutenbergCategories = [
  [649, "Classics"], [644, "Adventure"], [640, "Mystery"], [639, "Romance"],
  [638, "Sci-Fi & Fantasy"], [636, "Young Readers"], [643, "Biographies"], [637, "Poetry"],
] as const;

function failureCategory(error: unknown): string {
  const text = error instanceof Error ? error.message.toLowerCase() : "";
  if (/login|subscription|private|restricted/.test(text)) return "restricted";
  if (/timeout/.test(text)) return "timeout";
  if (/larger|limit|too large/.test(text)) return "file_too_large";
  if (/storage/.test(text)) return "storage";
  if (/no readable|not contain enough|empty/.test(text)) return "insufficient_content";
  if (/choose an|enter a valid|unsupported|could not be imported|could not be reached/.test(text)) return "unsupported";
  if (/fetch|network|unavailable|failed \(/.test(text)) return "network";
  if (/parse|readable text|invalid/.test(text)) return "conversion";
  return "unknown";
}

function fileTypeOf(name: string): string {
  const extension = name.split(".").pop()?.toLowerCase() ?? "";
  return ["epub", "pdf", "txt", "docx", "html", "md"].includes(extension) ? extension : "txt";
}

function documentProperties(book: LibraryBook): TelemetryProperties {
  return {
    document_id: book.id,
    file_type: book.format,
    file_size_bytes: book.size,
    block_count: book.blocks.length,
    chapter_count: book.chapters.length,
  };
}

function wordCount(book: LibraryBook): number {
  return book.blocks.reduce((total, block) => total + block.text.split(/\s+/).length, 0);
}

function formatBytes(bytes: number): string {
  if (bytes < 1_000_000) return `${Math.max(1, Math.round(bytes / 1_000))} KB`;
  return `${(bytes / 1_000_000).toFixed(bytes < 10_000_000 ? 1 : 0)} MB`;
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
  const [panel, setPanel] = useState<Panel>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("Your books and generated audio stay in this browser.");
  const [url, setUrl] = useState("");
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState<number | undefined>();
  const [gutenberg, setGutenberg] = useState<GutenbergBook[]>([]);
  const [voice, setVoice] = useState<Voice>("M3");
  const [steps, setSteps] = useState(12);
  const [speechRate, setSpeechRate] = useState(0.9);
  const [playing, setPlaying] = useState(false);
  const [audioProgress, setAudioProgress] = useState(0);
  const [ttsProgress, setTtsProgress] = useState<number | undefined>();
  const audioRef = useRef<HTMLAudioElement>(null);
  const audioBlock = useRef<number | null>(null);
  const audioUrl = useRef<string | null>(null);
  const pendingAudio = useRef(new Map<string, Promise<Blob>>());
  const generationEpoch = useRef(0);
  const audioTelemetry = useRef<{ provider: string; cached: boolean; duration: number } | null>(null);
  const playedBooks = useRef(new Set<string>());
  const playableBooks = useRef(new Set<string>());
  const audioProvider = useRef("");
  const PAGE_CHAR_LIMIT = 900;
  const [page, setPage] = useState({ bookId: "", start: 0 });
  const pageStarts = useMemo(() => {
    const starts: number[] = [];
    let count = 0;
    let characters = 0;
    for (const block of selected?.blocks ?? []) {
      const overflow = count > 0 && characters + block.text.length > PAGE_CHAR_LIMIT;
      if (block.isHeading && count > 0) {
        starts.push(block.index);
        count = 0;
        characters = 0;
      } else if (overflow) {
        starts.push(block.index);
        count = 0;
        characters = 0;
      }
      if (count === 0) starts.push(block.index);
      count += 1;
      characters += block.text.length;
    }
    return starts;
  }, [selected?.id]);

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
    Promise.all([listBooks(), listFolders()])
      .then(([storedBooks, storedFolders]) => {
        setBooks(storedBooks);
        setFolders(storedFolders);
      })
      .catch(() => setMessage("Local library storage is unavailable."));
    requestPersistentStorage().catch(() => false);
    if ("serviceWorker" in navigator) navigator.serviceWorker.register("/sw.js").catch(() => undefined);
    return () => { if (audioUrl.current) URL.revokeObjectURL(audioUrl.current); };
  }, []);

  async function importDocument(file: File, sourceIdentifier?: string, gutenbergId?: string) {
    setBusy(true);
    setMessage(`Reading ${file.name} locally...`);
    const started = Date.now();
    try {
      const parsed = await parseFile(file);
      const book = makeBook(parsed, file.name, file.size, sourceIdentifier, activeFolderId ?? undefined);
      await Promise.all([saveBook(book), saveSource(book.id, file)]);
      setBooks((current) => [book, ...current]);
      setPanel(null);
      setMessage(`${book.title} was added to your private library.`);
      recordTelemetry("import_completed", {
        ...documentProperties(book),
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
      setMessage(error instanceof Error ? error.message : "The document could not be imported.");
      recordTelemetry("import_failed", {
        file_type: fileTypeOf(file.name),
        file_size_bytes: file.size,
        error_category: failureCategory(error),
        duration_seconds: (Date.now() - started) / 1000,
      });
    } finally {
      setBusy(false);
    }
  }

  async function importUrl() {
    if (!url.trim()) return;
    setBusy(true);
    setMessage("Trying the page directly in your browser...");
    const started = Date.now();
    try {
      const { parsed, sourceUrl } = await parseWebLink(url);
      const snapshot = new Blob([parsed.blocks.map((block) => block.text).join("\n\n")], { type: "text/plain" });
      const book = makeBook(
        parsed,
        new URL(sourceUrl).hostname,
        snapshot.size,
        sourceUrl,
        activeFolderId ?? undefined,
      );
      await Promise.all([saveBook(book), saveSource(book.id, snapshot)]);
      setBooks((current) => [book, ...current]);
      setPanel(null);
      setUrl("");
      setMessage(`${book.title} was saved for offline reading.`);
      recordTelemetry("import_completed", {
        ...documentProperties(book),
        duration_seconds: (Date.now() - started) / 1000,
      });
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "The link could not be imported.");
      recordTelemetry("import_failed", {
        file_type: "html",
        error_category: failureCategory(error),
        duration_seconds: (Date.now() - started) / 1000,
      });
    } finally {
      setBusy(false);
    }
  }

  async function searchGutenberg(search = query, bookshelfId = category) {
    setBusy(true);
    setMessage("Loading Project Gutenberg directly...");
    if (search.trim()) recordTelemetry("gutenberg_search", { query_length: search.trim().length });
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
      await importDocument(file, `gutenberg:${book.id}`, book.id);
    } catch (error) {
      recordTelemetry("gutenberg_download_failed", {
        gutenberg_id: book.id,
        error_category: failureCategory(error),
        duration_seconds: (Date.now() - started) / 1000,
      });
      setMessage(error instanceof Error ? error.message : "The Gutenberg book could not be imported.");
      setBusy(false);
    } finally {
      setImportingBookId(null);
    }
  }

  function updateBook(book: LibraryBook) {
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

  function audioCacheKey(book: LibraryBook, index: number): string {
    return `${book.id}/${TEXT_PIPELINE_REVISION}-${voice}-${steps}-${speechRate}/${index}.wav`;
  }

  async function ensureAudio(book: LibraryBook, index: number): Promise<Blob> {
    const key = audioCacheKey(book, index);
    const cached = await getAudio(key);
    if (cached) {
      audioTelemetry.current = { provider: audioProvider.current, cached: true, duration: 0 };
      return cached;
    }
    const existing = pendingAudio.current.get(key);
    if (existing) return existing;
    const block = book.blocks[index];
    const promise = synthesize(block.text, voice, steps, (status, progress) => {
      if (status.startsWith("Downloading voice model") || status.startsWith("Preparing voice model")) {
        setMessage(status);
        setTtsProgress(progress);
      } else if (status.startsWith("Voice model ready")) {
        setMessage(status);
        setTtsProgress(undefined);
      }
    }, block.isHeading, speechRate).then(async ({ blob, duration, provider }) => {
      audioProvider.current = provider;
      audioTelemetry.current = { provider, cached: false, duration };
      await saveAudio(key, blob);
      return blob;
    }).finally(() => pendingAudio.current.delete(key));
    pendingAudio.current.set(key, promise);
    return promise;
  }

  async function pregenerate(book: LibraryBook, fromIndex: number) {
    const epoch = ++generationEpoch.current;
    for (let index = fromIndex; index < book.blocks.length; index += 1) {
      if (generationEpoch.current !== epoch) return;
      try { await ensureAudio(book, index); } catch { return; }
    }
  }

  useEffect(() => {
    if (selected) void pregenerate(selected, selected.position.blockIndex);
  }, [selected?.id, selected?.position.blockIndex, voice, steps, speechRate]);

  async function playBlock(book: LibraryBook, index: number, offset = 0, offsetFromEnd = false) {
    const audio = audioRef.current;
    if (!audio || !book.blocks[index]) return;
    setBusy(true);
    setPlaying(true);
    const playStarted = Date.now();
    try {
      const blob = await ensureAudio(book, index);
      if (audioUrl.current) URL.revokeObjectURL(audioUrl.current);
      audioUrl.current = URL.createObjectURL(blob);
      audio.src = audioUrl.current;
      audio.playbackRate = book.position.speed;
      audioBlock.current = index;
      audio.onloadedmetadata = () => {
        audio.currentTime = offsetFromEnd
          ? Math.max(0, audio.duration - offset)
          : Math.min(offset, Math.max(0, audio.duration - 0.05));
      };
      const positioned = positionBook(book, index, offset);
      updateBook(positioned);
      await audio.play();
      if (!playedBooks.current.has(book.id)) {
        playedBooks.current.add(book.id);
        recordTelemetry("playback_first_started", {
          document_id: book.id,
          block_index: index,
          offset_seconds: offset,
          speed: book.position.speed,
        });
      }
      const info = audioTelemetry.current;
      if (info && !playableBooks.current.has(book.id)) {
        playableBooks.current.add(book.id);
        recordTelemetry("first_playable_audio", {
          document_id: book.id,
          model: "supertonic_3",
          ...(info.provider && { engine: `onnxruntime_${info.provider.toLowerCase()}` }),
          language: "en",
          inference_steps: steps,
          audio_source: info.cached ? "cache" : "generated",
          time_to_first_playable_seconds: (Date.now() - playStarted) / 1000,
          spoken_seconds: Number.isFinite(audio.duration) && audio.duration > 0 ? audio.duration : info.duration,
          cache_bytes: blob.size,
        });
      }
    } catch (error) {
      setPlaying(false);
      setMessage(error instanceof Error ? error.message : "Local speech generation failed.");
    } finally {
      setBusy(false);
    }
  }

  async function togglePlayback() {
    if (!selected) return;
    const audio = audioRef.current;
    if (audio && audioBlock.current === selected.position.blockIndex && audio.src) {
      if (audio.paused) {
        await audio.play();
        setPlaying(true);
      } else {
        audio.pause();
        setPlaying(false);
        updateBook(positionBook(selected, selected.position.blockIndex, audio.currentTime));
      }
      return;
    }
    await playBlock(selected, selected.position.blockIndex, selected.position.offsetSeconds);
  }

  function seek(seconds: number) {
    const audio = audioRef.current;
    if (!audio || !selected || !Number.isFinite(audio.duration)) return;
    const target = audio.currentTime + seconds;
    if (target > audio.duration && selected.position.blockIndex + 1 < selected.blocks.length) {
      void playBlock(selected, selected.position.blockIndex + 1, target - audio.duration);
    } else if (target < 0 && selected.position.blockIndex > 0) {
      void playBlock(selected, selected.position.blockIndex - 1, Math.abs(target), true);
    } else audio.currentTime = Math.max(0, Math.min(audio.duration, target));
  }

  function changeSpeed(speed: number) {
    if (!selected) return;
    if (audioRef.current) audioRef.current.playbackRate = speed;
    updateBook({ ...selected, position: { ...selected.position, speed } });
  }

  function seekOverall(progress: number) {
    if (!selected) return;
    const shouldResume = playing || Boolean(audioRef.current && !audioRef.current.paused);
    const target = Math.max(0, Math.min(1, progress)) * wordCount(selected);
    let wordsBefore = 0;
    const targetBlock = selected.blocks.find((item) => {
      const words = item.text.split(/\s+/).length;
      if (wordsBefore + words >= target) return true;
      wordsBefore += words;
      return false;
    }) ?? selected.blocks.at(-1);
    if (!targetBlock) return;
    audioRef.current?.pause();
    setPlaying(false);
    setAudioProgress(0);
    audioBlock.current = null;
    if (shouldResume) void playBlock(selected, targetBlock.index);
    else updateBook(positionBook(selected, targetBlock.index));
  }

  function onTimeUpdate() {
    const audio = audioRef.current;
    if (!audio || !selected) return;
    setAudioProgress(audio.duration ? audio.currentTime / audio.duration : 0);
    if (Date.now() - lastPositionSave.current > 5_000) {
      lastPositionSave.current = Date.now();
      updateBook(positionBook(selected, selected.position.blockIndex, audio.currentTime));
    }
  }

  async function onEnded() {
    if (!selected) return;
    const next = selected.position.blockIndex + 1;
    if (next < selected.blocks.length) await playBlock(selected, next);
    else {
      setPlaying(false);
      setMessage("You reached the end of this book.");
    }
  }

  function moveChapter(direction: -1 | 1) {
    if (!selected) return;
    const shouldResume = playing || Boolean(audioRef.current && !audioRef.current.paused);
    const chapter = direction > 0
      ? selected.chapters.find((item) => item.startBlockIndex > selected.position.blockIndex)
      : selected.chapters.findLast((item) => item.startBlockIndex < selected.position.blockIndex);
    if (!chapter) return;
    audioRef.current?.pause();
    setPlaying(false);
    audioBlock.current = null;
    if (shouldResume) void playBlock(selected, chapter.startBlockIndex);
    else updateBook(positionBook(selected, chapter.startBlockIndex));
  }

  function goToBlock(blockIndex: number) {
    if (!selected) return;
    const shouldResume = playing || Boolean(audioRef.current && !audioRef.current.paused);
    audioRef.current?.pause();
    setPlaying(false);
    setAudioProgress(0);
    audioBlock.current = null;
    if (shouldResume) void playBlock(selected, blockIndex);
    else updateBook(positionBook(selected, blockIndex));
  }

  async function deleteBook(book: LibraryBook) {
    if (!window.confirm(`Remove "${book.title}" from this browser?`)) return;
    await removeBook(book.id);
    setBooks((current) => current.filter((value) => value.id !== book.id));
    setOrganizingBook(null);
    setMessage(`${book.title} was removed from this browser.`);
    recordTelemetry("document_deleted", { document_id: book.id });
  }

  function openBook(book: LibraryBook) {
    setSelected(book);
    recordTelemetry("document_opened", documentProperties(book));
  }

  function openGutenbergBrowser() {
    recordTelemetry("gutenberg_browse_opened");
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
        <audio ref={audioRef} onTimeUpdate={onTimeUpdate} onEnded={onEnded} onError={() => setPlaying(false)} />
        <div className={styles.readerTop}>
          <button className={styles.textButton} onClick={() => { audioRef.current?.pause(); setSelected(null); }}>Library</button>
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
                  ? <h2 key={item.index} className={item.index === selected.position.blockIndex ? styles.currentBlock : ""}>{item.text}</h2>
                  : <p key={item.index} className={item.index === selected.position.blockIndex ? styles.currentBlock : ""} onClick={() => goToBlock(item.index)}>{item.text}</p>
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
            {isModelDownload && <small>This model only needs to be downloaded once and will then be cached for later sessions.</small>}
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
            <label className={styles.settingsRow}><span><i className={styles.waveIcon}>~~~</i> Voice</span>
              <select value={voice} onChange={(event) => { audioRef.current?.pause(); setPlaying(false); setVoice(event.target.value as Voice); audioBlock.current = null; }}>
                {VOICES.map((value) => <option key={value} value={value}>{voiceNames[value]}</option>)}
              </select>
            </label>
            <div className={styles.qualitySetting}><span>Speaking Rate</span><div>
              {[[0.8, "0.8x"], [0.9, "0.9x"], [1, "1x"], [1.1, "1.1x"], [1.2, "1.2x"]].map(([value, label]) => (
                <button key={value} className={speechRate === value ? styles.qualityActive : ""} onClick={() => { audioRef.current?.pause(); setPlaying(false); setSpeechRate(Number(value)); audioBlock.current = null; }}>{label}</button>
              ))}
            </div></div>
            <div className={styles.qualitySetting}><span>Quality</span><div>
              {[[5, "Low"], [8, "Medium"], [12, "High"]].map(([value, label]) => (
                <button key={value} className={steps === value ? styles.qualityActive : ""} onClick={() => { audioRef.current?.pause(); setPlaying(false); setSteps(Number(value)); audioBlock.current = null; }}>{label}</button>
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
          <button onClick={() => openGutenbergBrowser()}>Browse Free Books</button>
          <button onClick={() => setPanel("url")}>Web Link</button>
          <label className={styles.primaryAction}>+ Add Book
            <input type="file" accept=".epub,.pdf,.txt,.text,.docx,.html,.htm,.md,.markdown" onChange={(event) => event.target.files?.[0] && importDocument(event.target.files[0])} />
          </label>
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
          <label><span className={styles.sidebarIcon}>+</span> Upload File<input type="file" accept=".epub,.pdf,.txt,.text,.docx,.html,.htm,.md,.markdown" onChange={(event) => event.target.files?.[0] && importDocument(event.target.files[0])} /></label>
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
                      <span className={`${styles.cover} ${styles[`cover${index % 4}`]}`}><small>{book.format}</small></span>
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
              <span className={styles.emptyBooks}>|||</span><h2>{activeFolder ? "This folder is empty" : "Your shelf is empty"}</h2><p>Browse free books or import a web link, EPUB, PDF, or TXT file. Everything stays on this device.</p>
            </div>
          ) : null}
        </section>
      </div>
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
            <p>Paste an article URL. FreeReader tries the page directly first and uses the configured article fallback only if browser access is blocked.</p>
            <label className={styles.fieldLabel}>Article URL<input autoFocus type="url" placeholder="https://example.com/article" value={url} onChange={(event) => setUrl(event.target.value)} /></label>
            <div className={styles.modalActions}><button type="button" onClick={() => setPanel(null)}>Cancel</button><button className={styles.primaryAction} disabled={busy}>Import link</button></div>
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
                  {book.coverUrl ? <img src={book.coverUrl} alt="" /> : <span className={styles.miniCover}>PG</span>}
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
