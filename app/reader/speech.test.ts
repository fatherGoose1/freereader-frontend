import assert from "node:assert/strict";
import test from "node:test";
import { detectSpeechLanguage, normalizeLanguage, speechEngine, speechEngineForVoice, voiceForLanguage, voicesForLanguage } from "./speech";
import { englishVoices } from "./voices";

test("routes trained Kokoro languages to Kokoro and the rest to Supertonic", () => {
  assert.equal(speechEngine("en"), "kokoro");
  assert.equal(speechEngine("fr"), "kokoro");
  assert.equal(speechEngine("ja"), "kokoro");
  assert.equal(speechEngine("zh"), "kokoro");
  assert.equal(speechEngine("ko"), "supertonic");
  assert.equal(speechEngine("pl"), "supertonic");
  assert.equal(speechEngineForVoice("F1", "en"), "supertonic");
  assert.equal(speechEngineForVoice("F1", "fr"), "supertonic");
  assert.equal(speechEngineForVoice("bf_emma", "en"), "kokoro");
  assert.equal(speechEngineForVoice("ff_siwis", "fr"), "kokoro");
  assert.equal(voiceForLanguage("F1", "en"), "F1");
  assert.equal(voiceForLanguage("bf_emma", "en"), "bf_emma");
  assert.equal(voiceForLanguage("unknown" as never, "en"), "af_heart");
  assert.equal(voiceForLanguage("af_bella", "fr"), "ff_siwis");
  assert.equal(voiceForLanguage("af_heart", "zh"), "zf_xiaobei");
  assert.equal(voiceForLanguage("af_heart", "ko"), "M3");
});

test("each language combines its Kokoro and Supertonic voices with favorites first", () => {
  const english = voicesForLanguage("en");
  assert.deepEqual(english.slice(0, 2), [["af_heart", "Heart"], ["F4", "Olivia"]]);
  assert.ok(english.some(([voice]) => voice === "bf_emma"));
  assert.ok(english.some(([voice]) => voice === "M1"));
  assert.equal(english.length, englishVoices().length);
  const french = voicesForLanguage("fr");
  assert.ok(french.some(([voice]) => voice === "ff_siwis"));
  assert.ok(french.some(([voice]) => voice === "M3"));
  const korean = voicesForLanguage("ko");
  assert.ok(korean.every(([voice]) => /^[MF][1-5]$/.test(voice)));
  assert.ok(!korean.some(([voice]) => voice.startsWith("jf_")));
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
