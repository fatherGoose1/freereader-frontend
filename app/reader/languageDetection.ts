import { franc } from "franc-min";
import type { SpeechLanguage } from "./speech";

// Kept separate from speech.ts so lightweight surfaces (the landing page demo) can
// detect a language without pulling in the on-device model stack.
export const ISO6393_TO_LANGUAGE: Record<string, SpeechLanguage> = {
  eng: "en", kor: "ko", jpn: "ja", arb: "ar", bul: "bg", ces: "cs", dan: "da", deu: "de",
  ell: "el", spa: "es", est: "et", fin: "fi", fra: "fr", hin: "hi", hrv: "hr", hun: "hu",
  ind: "id", ita: "it", lit: "lt", lav: "lv", nld: "nl", pol: "pl", por: "pt", ron: "ro",
  rus: "ru", slk: "sk", slv: "sl", swe: "sv", tur: "tr", ukr: "uk", vie: "vi",
};

export function detectSpeechLanguage(text: string): SpeechLanguage | undefined {
  const detected = franc(text.slice(0, 20_000), { minLength: 50, only: Object.keys(ISO6393_TO_LANGUAGE) });
  return ISO6393_TO_LANGUAGE[detected];
}

// Any character that is not Latin script (Cyrillic, Arabic, CJK, Greek, ...).
const NON_LATIN_SCRIPT = /[^\p{Script=Latin}\p{N}\p{P}\p{Z}\p{S}\p{M}\s]/u;
// Accented Latin letters, which English words rarely use.
const EXTENDED_LATIN = /[\u00c0-\u024f\u1e00-\u1eff]/;
// Around this many letters, franc is reliable enough to distrust its answer.
const RELIABLE_LENGTH = 12;

/**
 * Demo/entry gate, not a general classifier. franc is unreliable on short text
 * ("hi" -> undetermined, "hello world" -> Dutch), so short Latin input is accepted
 * and only clearly non-English input is rejected.
 */
export function isLikelyEnglish(text: string): boolean {
  const sample = text.trim();
  if (!sample) return false;
  if (NON_LATIN_SCRIPT.test(sample) || EXTENDED_LATIN.test(sample)) return false;
  const letters = sample.replace(/[^A-Za-z]/g, "");
  if (letters.length < RELIABLE_LENGTH) return true;
  return detectSpeechLanguage(sample) === "en";
}
