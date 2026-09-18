import assert from "node:assert/strict";
import test from "node:test";
import { isLikelyEnglish } from "./languageDetection";

test("accepts short English that franc cannot classify", () => {
  for (const text of ["hi", "hey there", "hello", "hello world", "How are you?", "It's a test."]) {
    assert.equal(isLikelyEnglish(text), true, text);
  }
});

test("accepts ordinary English prose", () => {
  assert.equal(isLikelyEnglish("This is a long English passage about reading books and listening to stories."), true);
});

test("accepts English quotes with an attribution", () => {
  assert.equal(
    isLikelyEnglish(
      "It is impossible to live in the past, difficult to live in the present and a waste to live in the future.\n\n- Frank Herbert, Dune",
    ),
    true,
  );
});

test("rejects long Latin text in another language", () => {
  assert.equal(isLikelyEnglish("Hola amigo, cómo estás hoy? Espero que todo vaya muy bien."), false);
  assert.equal(isLikelyEnglish("Bonjour, comment allez-vous aujourd'hui mon cher ami?"), false);
  assert.equal(isLikelyEnglish("Guten Tag, wie geht es Ihnen heute?"), false);
});

test("rejects non-Latin scripts", () => {
  assert.equal(isLikelyEnglish("こんにちは"), false);
  assert.equal(isLikelyEnglish("Привет, как дела"), false);
  assert.equal(isLikelyEnglish("مرحبا كيف حالك"), false);
});

test("rejects empty input", () => {
  assert.equal(isLikelyEnglish("   "), false);
});
