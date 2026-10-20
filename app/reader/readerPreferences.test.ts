import assert from "node:assert/strict";
import { afterEach, test } from "node:test";
import { DEFAULT_READER_PREFERENCES, parseReaderPreferences, preferredVoiceForBook,
  readReaderPreferences, saveReaderPreferences } from "./readerPreferences";
import type { LibraryBook } from "./types";

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
