import assert from "node:assert/strict";
import test from "node:test";
import { detectSpeechLanguage } from "./languageDetection";

test("detects short distinctive non-English text for landing-page narration", () => {
  assert.equal(detectSpeechLanguage("dzień dobry!"), "pl");
  assert.equal(detectSpeechLanguage("こんにちは"), "ja");
  assert.equal(detectSpeechLanguage("안녕하세요"), "ko");
});

test("leaves ambiguous short ASCII text undetermined", () => {
  assert.equal(detectSpeechLanguage("hello world"), undefined);
});
