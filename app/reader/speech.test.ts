import assert from "node:assert/strict";
import test from "node:test";
import { detectSpeechLanguage, normalizeLanguage, speechEngine, voiceForLanguage } from "./speech";

test("routes English to Kokoro Web and other languages to Supertonic", () => {
  assert.equal(speechEngine("en"), "kokoro");
  assert.equal(speechEngine("fr"), "supertonic");
  assert.equal(speechEngine("ja"), "supertonic");
  assert.equal(voiceForLanguage("M3", "en"), "af_heart");
  assert.equal(voiceForLanguage("af_bella", "fr"), "M3");
});

test("normalizes metadata language tags and detects imported prose", () => {
  assert.equal(normalizeLanguage("pt-BR"), "pt");
  assert.equal(normalizeLanguage("EN_us"), "en");
  assert.equal(normalizeLanguage("deu"), "de");
  assert.equal(normalizeLanguage("eng-US"), "en");
  assert.equal(detectSpeechLanguage("This is a long English passage written to provide enough natural language context for reliable automatic identification in the reader."), "en");
  assert.equal(detectSpeechLanguage("Dies ist ein langer deutscher Text, der genügend sprachlichen Kontext für eine zuverlässige automatische Erkennung im Lesegerät bereitstellt."), "de");
  assert.equal(detectSpeechLanguage("Hola. Esta es una prueba larga de la voz móvil en español para confirmar que el idioma se detecta correctamente."), "es");
});
