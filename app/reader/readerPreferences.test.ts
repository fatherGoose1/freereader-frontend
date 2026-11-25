import assert from "node:assert/strict";
import { afterEach, test } from "node:test";
import { DEFAULT_READER_PREFERENCES, parseReaderPreferences, preferredVoiceForBook,
  readReaderPreferences, saveReaderPreferences, defaultWordHighlighting, withWordHighlighting,
  wordHighlightingEnabled } from "./readerPreferences";
import type { LibraryBook } from "./types";
import { supportsWordTimings } from "./speech";

afterEach(() => { delete (globalThis as { localStorage?: Storage }).localStorage; });

test("migrates existing global font and highlighting preferences without including a book", () => {
  const items = new Map([["freereader-highlight-spoken-words", "false"], ["freereader-open-dyslexic", "true"]]);
  (globalThis as { localStorage?: Storage }).localStorage = {
    getItem: (key: string) => items.get(key) ?? null,
    setItem: (key: string, value: string) => { items.set(key, value); },
  } as Storage;
  const migrated = readReaderPreferences();
  assert.equal(migrated?.highlightSpokenWords, false);
  assert.equal(migrated?.openDyslexic, true);
  assert.equal(readReaderPreferences("account-a"), null);
  saveReaderPreferences(migrated!, "account-a");
  assert.equal(readReaderPreferences("account-a")?.openDyslexic, true);
  assert.equal(readReaderPreferences("account-b"), null);
});

test("validates remote settings and respects a book voice override", () => {
  const preferences = parseReaderPreferences({ ...DEFAULT_READER_PREFERENCES, updatedAt: new Date().toISOString(),
    speakingSpeed: 80, textSize: -1, defaultVoices: { en: "af_river", fr: "af_river", bogus: "F4" } });
  assert.equal(preferences?.speakingSpeed, 3);
  assert.equal(preferences?.textSize, 16);
  assert.deepEqual(preferences?.defaultVoices, { en: "af_river" });
  const book = { suggestedVoice: "af_heart" } as LibraryBook;
  assert.equal(preferredVoiceForBook(book, preferences!, "en"), "af_river");
  book.preferredVoice = "F4";
  assert.equal(preferredVoiceForBook(book, preferences!, "en"), "af_river");
  assert.equal(parseReaderPreferences({ version: 2, updatedAt: new Date().toISOString() }), null);
});

test("older account settings retain original spacing and white background; malformed values are bounded", () => {
  const old = parseReaderPreferences({ ...DEFAULT_READER_PREFERENCES, updatedAt: new Date().toISOString(),
    lineSpacing: undefined, wordSpacing: undefined, readingBackground: undefined });
  assert.equal(old?.lineSpacing, null);
  assert.equal(old?.wordSpacing, 0);
  assert.equal(old?.readingBackground, "white");
  const invalid = parseReaderPreferences({ ...old, lineSpacing: 5, wordSpacing: -2, readingBackground: "red" });
  assert.equal(invalid?.lineSpacing, 2.5);
  assert.equal(invalid?.wordSpacing, 0);
  assert.equal(invalid?.readingBackground, "white");
  const selected = parseReaderPreferences({ ...old, lineSpacing: 1.5, wordSpacing: 0.3, readingBackground: "dark" });
  assert.equal(selected?.lineSpacing, 1.5);
  assert.equal(selected?.wordSpacing, 0.3);
  assert.equal(selected?.readingBackground, "dark");
});

test("account preferences preserve an English Phonon voice shared with iOS", () => {
  const id = "4d16a52c-40d6-462e-a015-5665798732af";
  const preferences = parseReaderPreferences({ ...DEFAULT_READER_PREFERENCES, updatedAt: new Date().toISOString(),
    defaultVoices: { en: `phonon:${id}`, fr: `phonon:${id}`, es: "phonon:invalid" } });
  assert.deepEqual(preferences?.defaultVoices, { en: `phonon:${id}` });
});

test("English light voice selection survives account preference reload", () => {
  const preferences = parseReaderPreferences({ ...DEFAULT_READER_PREFERENCES, updatedAt: new Date().toISOString(),
    defaultVoices: { en: "lite_hadley", fr: "lite_hadley", es: "lite_unknown" } });
  assert.deepEqual(preferences?.defaultVoices, { en: "lite_hadley" });
});

test("highlighting defaults on for English and off when the effective route has no word timings", () => {
  assert.equal(defaultWordHighlighting("en"), true);
  for (const language of ["fr", "es", "ja", "ko"] as const) {
    assert.equal(defaultWordHighlighting(language), false);
    assert.equal(wordHighlightingEnabled(DEFAULT_READER_PREFERENCES, language), false);
  }
  assert.equal(wordHighlightingEnabled(DEFAULT_READER_PREFERENCES, "en"), true);
  const legacy = { ...DEFAULT_READER_PREFERENCES, highlightSpokenWords: false };
  assert.equal(wordHighlightingEnabled(legacy, "en"), false);
});

test("Kokoro languages with duration cues default on when the effective engine supports timings", () => {
  for (const language of ["en", "es", "fr", "hi", "it", "pt"] as const) {
    assert.equal(wordHighlightingEnabled(DEFAULT_READER_PREFERENCES, language,
      supportsWordTimings(language, true)), true, language);
  }
  for (const language of ["ja", "zh", "ko", "de"] as const) {
    assert.equal(wordHighlightingEnabled(DEFAULT_READER_PREFERENCES, language,
      supportsWordTimings(language, true)), false, language);
  }
});

test("language-specific choices do not change another language's default or explicit preference", () => {
  const french = withWordHighlighting(DEFAULT_READER_PREFERENCES, "fr", true);
  assert.equal(wordHighlightingEnabled(french, "fr"), true);
  assert.equal(wordHighlightingEnabled(french, "en"), true);
  assert.equal(wordHighlightingEnabled(french, "ko"), false);
  const englishOff = withWordHighlighting(french, "en", false);
  assert.equal(englishOff.highlightSpokenWords, false);
  assert.equal(wordHighlightingEnabled(englishOff, "en"), false);
  assert.equal(wordHighlightingEnabled(englishOff, "fr"), true);
  const restored = parseReaderPreferences({ ...englishOff, updatedAt: new Date().toISOString() })!;
  assert.equal(wordHighlightingEnabled(restored, "en"), false);
  assert.equal(wordHighlightingEnabled(restored, "fr"), true);
});

test("shared iOS language overrides accept only supported language codes and booleans", () => {
  const preferences = parseReaderPreferences({ ...DEFAULT_READER_PREFERENCES, updatedAt: new Date().toISOString(),
    wordHighlightingByLanguage: { en: false, fr: true, ko: "yes", unknown: true } })!;
  assert.deepEqual(preferences.wordHighlightingByLanguage, { en: false, fr: true });
  assert.equal(wordHighlightingEnabled(preferences, "en"), false);
  assert.equal(wordHighlightingEnabled(preferences, "ko"), false);
});
