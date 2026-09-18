import assert from "node:assert/strict";
import test from "node:test";
import { normalizeForSpeech, normalizeForSupertonic } from "./speechText.ts";

const polish = "Motyl chciał wybrać sobie piękną żonę, więc naturalnie zwrócił się do kwiatów.";

test("matches the iOS capitalization and punctuation pipeline", () => {
  assert.equal(normalizeForSpeech("HELLO"), "Hello.");
  assert.equal(
    normalizeForSpeech("Alice met iPhone at NASA with aLICE."),
    "Alice met iPhone at Nasa with alice.",
  );
  assert.equal(
    normalizeForSpeech("\"ALICE SAID HELLO\" “DON’T SHOUT AT NASA” «WELCOME HOME»"),
    "'Alice Said Hello' “Don’t Shout At Nasa” «Welcome Home».",
  );
  assert.equal(
    normalizeForSpeech("Wait—this is important – truly - but keep well-known and re-entry."),
    "Wait, this is important, truly, but keep well-known and re-entry.",
  );
});

test("reads heading and prefixed Roman numerals as numbers", () => {
  assert.equal(normalizeForSpeech("CHAPTER II", true), "Chapter 2.");
  assert.equal(normalizeForSpeech("Chapter IV", true), "Chapter 4.");
  assert.equal(normalizeForSpeech("Section IV", true), "Section 4.");
  assert.equal(normalizeForSpeech("IV: THE RETURN", true), "4: The Return.");
  assert.equal(normalizeForSpeech("I", true), "1.");
  assert.equal(normalizeForSpeech("PLAN C", true), "Plan C.");
});

test("reads obvious body Roman numerals without changing the pronoun I", () => {
  assert.equal(normalizeForSpeech("World War II ended."), "World War 2 ended.");
  assert.equal(normalizeForSpeech("Louis XIV ruled France."), "Louis 14 ruled France.");
  assert.equal(normalizeForSpeech("I think I can."), "I think I can.");
  assert.equal(normalizeForSpeech("I"), "I.");
  assert.equal(normalizeForSpeech("THE MIX"), "The Mix.");
});

test("expands abbreviated titles for natural pronunciation", () => {
  assert.equal(normalizeForSpeech("Mr. Smith met Mrs. Jones."), "Mister Smith met Missus Jones.");
  assert.equal(normalizeForSpeech("Dr. Patel and Prof. Williams spoke."), "Doctor Patel and Professor Williams spoke.");
  assert.equal(normalizeForSpeech("Capt. Lewis briefed Sen. Adams."), "Captain Lewis briefed Senator Adams.");
  assert.equal(normalizeForSpeech("El Dr. García habló.", false, "es"), "El Dr. García habló.");
});

test("preserves Unicode text and decomposes accents only for the local Supertonic tokenizer", () => {
  assert.equal(normalizeForSpeech(polish, false, "pl"), polish);

  const modelText = normalizeForSupertonic(polish, false, "pl");
  assert.equal(modelText, polish.normalize("NFKD"));
  assert.equal(modelText.normalize("NFC"), polish);
  assert.match(modelText, /a\u0328/);
  assert.match(modelText, /c\u0301/);
  assert.match(modelText, /z\u0307/);
});

test("retains accented characters across supported languages", () => {
  const samples = [
    ["cs", "Příliš žluťoučký kůň úpěl ďábelské ódy."],
    ["es", "El pingüino pidió información también."],
    ["vi", "Tiếng Việt có đầy đủ dấu thanh."],
  ] as const;

  for (const [language, text] of samples) {
    assert.equal(normalizeForSpeech(text, false, language), text);
    assert.equal(normalizeForSupertonic(text, false, language).normalize("NFC"), text);
  }
});
