import assert from "node:assert/strict";
import test from "node:test";
import { detectSpeechLanguage, normalizeLanguage, speechEngine, speechEngineForVoice, voiceForLanguage, voicesForLanguage } from "./speech";
import { englishVoices } from "./voices";

test("routes English to Kokoro Web and other languages to Supertonic", () => {
  assert.equal(speechEngine("en"), "kokoro");
  assert.equal(speechEngine("fr"), "supertonic");
  assert.equal(speechEngine("ja"), "supertonic");
  assert.equal(speechEngineForVoice("F1", "en"), "supertonic");
  assert.equal(speechEngineForVoice("bf_emma", "en"), "kokoro");
  assert.equal(voiceForLanguage("F1", "en"), "F1");
  assert.equal(voiceForLanguage("bf_emma", "en"), "bf_emma");
  assert.equal(voiceForLanguage("unknown" as never, "en"), "af_heart");
  assert.equal(voiceForLanguage("af_bella", "fr"), "M3");
});

test("English combines Kokoro and Supertonic voices with the favorites first", () => {
  const english = voicesForLanguage("en");
  assert.deepEqual(english.slice(0, 2), [["af_heart", "Heart"], ["F4", "Olivia"]]);
  assert.ok(english.some(([voice]) => voice === "bf_emma"));
  assert.ok(english.some(([voice]) => voice === "M1"));
  assert.equal(english.length, englishVoices().length);
  assert.ok(voicesForLanguage("fr").every(([voice]) => /^[MF][1-5]$/.test(voice)));
});

test("normalizes metadata language tags and detects imported prose", () => {
  assert.equal(normalizeLanguage("pt-BR"), "pt");
  assert.equal(normalizeLanguage("EN_us"), "en");
  assert.equal(normalizeLanguage("deu"), "de");
  assert.equal(normalizeLanguage("eng-US"), "en");
  assert.equal(detectSpeechLanguage("This is a long English passage written to provide enough natural language context for reliable automatic identification in the reader."), "en");
  assert.equal(detectSpeechLanguage("Dies ist ein langer deutscher Text, der genügend sprachlichen Kontext für eine zuverlässige automatische Erkennung im Lesegerät bereitstellt."), "de");
  assert.equal(detectSpeechLanguage("Hola. Esta es una prueba larga de la voz móvil en español para confirmar que el idioma se detecta correctamente."), "es");
  assert.equal(detectSpeechLanguage("Motyl chciał wybrać sobie piękną żonę, więc naturalnie zwrócił się do kwiatów."), "pl");
});
