import { SPEECH_LANGUAGES, voicesForLanguage, type SpeechLanguage } from "./speech";
import type { NarratorVoice } from "./voices";
import type { LibraryBook } from "./types";
import { READING_BACKGROUNDS, type ReadingBackground } from "./readingAppearance";

export const ACCOUNT_PREFERENCES_FIELD = "freereader_reader_preferences";
const STORAGE_PREFIX = "freereader-reader-preferences:v1:";
const OLD_HIGHLIGHT_KEY = "freereader-highlight-spoken-words";
const OLD_DYSLEXIC_KEY = "freereader-open-dyslexic";

export type ReaderPreferences = {
  version: 1;
  updatedAt: string;
  defaultVoices: Partial<Record<SpeechLanguage, NarratorVoice>>;
  speakingSpeed: number;
  highlightSpokenWords: boolean;
  openDyslexic: boolean;
  textSize: number;
  defaultView: "native" | "ereader";
  lineSpacing: number | null;
  wordSpacing: number;
  readingBackground: ReadingBackground;
};

export const DEFAULT_READER_PREFERENCES: ReaderPreferences = {
  version: 1, updatedAt: "", defaultVoices: {}, speakingSpeed: 1,
  highlightSpokenWords: true, openDyslexic: false, textSize: 20, defaultView: "native",
  lineSpacing: null, wordSpacing: 0, readingBackground: "white",
};

export function parseReaderPreferences(value: unknown): ReaderPreferences | null {
  if (!value || typeof value !== "object") return null;
  const record = value as Partial<ReaderPreferences>;
  if (record.version !== 1 || typeof record.updatedAt !== "string" || !Number.isFinite(Date.parse(record.updatedAt))) return null;
  const defaultVoices: ReaderPreferences["defaultVoices"] = {};
  if (record.defaultVoices && typeof record.defaultVoices === "object") {
    for (const [language, voice] of Object.entries(record.defaultVoices)) {
      if (SPEECH_LANGUAGES.some(([code]) => code === language) && typeof voice === "string"
        && voicesForLanguage(language as SpeechLanguage).some(([id]) => id === voice)) {
        defaultVoices[language as SpeechLanguage] = voice as NarratorVoice;
      }
    }
  }
  return {
    version: 1, updatedAt: record.updatedAt, defaultVoices,
    speakingSpeed: typeof record.speakingSpeed === "number" && Number.isFinite(record.speakingSpeed)
      ? Math.round(Math.max(0.5, Math.min(3, record.speakingSpeed)) * 10) / 10 : 1,
    highlightSpokenWords: typeof record.highlightSpokenWords === "boolean" ? record.highlightSpokenWords : true,
    openDyslexic: typeof record.openDyslexic === "boolean" ? record.openDyslexic : false,
    textSize: typeof record.textSize === "number" && Number.isFinite(record.textSize)
      ? Math.max(16, Math.min(28, 2 * Math.round(record.textSize / 2))) : 20,
    defaultView: record.defaultView === "ereader" ? "ereader" : "native",
    lineSpacing: typeof record.lineSpacing === "number" && Number.isFinite(record.lineSpacing)
      ? Math.round(Math.max(1, Math.min(2.5, record.lineSpacing)) * 20) / 20 : null,
    wordSpacing: typeof record.wordSpacing === "number" && Number.isFinite(record.wordSpacing)
      ? Math.round(Math.max(0, Math.min(0.3, record.wordSpacing)) * 100) / 100 : 0,
    readingBackground: typeof record.readingBackground === "string" && Object.hasOwn(READING_BACKGROUNDS, record.readingBackground)
      ? record.readingBackground as ReadingBackground : "white",
  };
}

export function readReaderPreferences(ownerId?: string): ReaderPreferences | null {
  try {
    const stored = localStorage.getItem(`${STORAGE_PREFIX}${ownerId ?? "guest"}`);
    if (stored) return parseReaderPreferences(JSON.parse(stored));
    if (ownerId) return null;
    // Migrate the two previously global browser settings without changing their values.
    const highlight = localStorage.getItem(OLD_HIGHLIGHT_KEY);
    const dyslexic = localStorage.getItem(OLD_DYSLEXIC_KEY);
    if (highlight === null && dyslexic === null) return null;
    return { ...DEFAULT_READER_PREFERENCES, updatedAt: new Date().toISOString(),
      highlightSpokenWords: highlight !== "false", openDyslexic: dyslexic === "true" };
  } catch { return null; }
}

export function saveReaderPreferences(value: ReaderPreferences, ownerId?: string): void {
  try { localStorage.setItem(`${STORAGE_PREFIX}${ownerId ?? "guest"}`, JSON.stringify(value)); }
  catch { /* Preferences continue to work in memory when storage is restricted. */ }
}

export function preferredVoiceForBook(book: LibraryBook, preferences: ReaderPreferences, language: SpeechLanguage): NarratorVoice | undefined {
  return preferences.defaultVoices[language] ?? book.suggestedVoice;
}
