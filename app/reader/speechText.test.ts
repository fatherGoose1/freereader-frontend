import assert from "node:assert/strict";
import test from "node:test";
import { normalizeForSpeech } from "./speechText.ts";

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
