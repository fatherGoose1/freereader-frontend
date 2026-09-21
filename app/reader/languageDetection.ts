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
  const sample = text.trim().slice(0, 20_000);
  const languages = Object.keys(ISO6393_TO_LANGUAGE);
  const detected = franc(sample, { minLength: 50, only: languages });
  if (detected !== "und") return ISO6393_TO_LANGUAGE[detected];

  // franc deliberately rejects short samples. Retry distinctive Unicode text so
  // greetings such as "dzień dobry" and short non-Latin phrases do not default to English.
  const hasDistinctiveLetters = Array.from(sample.normalize("NFD")).some((character) =>
    (character.codePointAt(0) ?? 0) > 0x7f && /[\p{L}\p{M}]/u.test(character));
  if (!hasDistinctiveLetters) return undefined;
  return ISO6393_TO_LANGUAGE[franc(sample, { minLength: 3, only: languages })];
}
