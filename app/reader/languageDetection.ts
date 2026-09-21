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
