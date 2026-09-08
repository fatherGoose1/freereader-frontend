import { franc } from "franc-min";
import {
  KOKORO_VOICES,
  isKokoroVoice,
  isSupertonicVoice,
  supertonicVoices,
  type NarratorVoice,
} from "./voices";

export const SPEECH_LANGUAGES = [
  ["en", "English"], ["ko", "Korean"], ["ja", "Japanese"], ["ar", "Arabic"],
  ["bg", "Bulgarian"], ["cs", "Czech"], ["da", "Danish"], ["de", "German"],
  ["el", "Greek"], ["es", "Spanish"], ["et", "Estonian"], ["fi", "Finnish"],
  ["fr", "French"], ["hi", "Hindi"], ["hr", "Croatian"], ["hu", "Hungarian"],
  ["id", "Indonesian"], ["it", "Italian"], ["lt", "Lithuanian"], ["lv", "Latvian"],
  ["nl", "Dutch"], ["pl", "Polish"], ["pt", "Portuguese"], ["ro", "Romanian"],
  ["ru", "Russian"], ["sk", "Slovak"], ["sl", "Slovenian"], ["sv", "Swedish"],
  ["tr", "Turkish"], ["uk", "Ukrainian"], ["vi", "Vietnamese"],
] as const;

export type SpeechLanguage = (typeof SPEECH_LANGUAGES)[number][0];
export type SpeechEngine = "kokoro" | "supertonic";

const languageCodes = new Set<string>(SPEECH_LANGUAGES.map(([code]) => code));
const iso6393: Record<string, SpeechLanguage> = {
  eng: "en", kor: "ko", jpn: "ja", arb: "ar", bul: "bg", ces: "cs", dan: "da", deu: "de",
  ell: "el", spa: "es", est: "et", fin: "fi", fra: "fr", hin: "hi", hrv: "hr", hun: "hu",
  ind: "id", ita: "it", lit: "lt", lav: "lv", nld: "nl", pol: "pl", por: "pt", ron: "ro",
  rus: "ru", slk: "sk", slv: "sl", swe: "sv", tur: "tr", ukr: "uk", vie: "vi",
};

export function normalizeLanguage(value?: string | null): SpeechLanguage | undefined {
  const code = value?.trim().toLowerCase().split(/[-_]/)[0];
  if (!code) return undefined;
  return languageCodes.has(code) ? code as SpeechLanguage : iso6393[code];
}

export function detectSpeechLanguage(text: string): SpeechLanguage | undefined {
  const detected = franc(text.slice(0, 20_000), { minLength: 50, only: Object.keys(iso6393) });
  return iso6393[detected];
}

export function speechEngine(language: SpeechLanguage): SpeechEngine {
  return language === "en" ? "kokoro" : "supertonic";
}

export function voicesForLanguage(language: SpeechLanguage): readonly (readonly [NarratorVoice, string])[] {
  return speechEngine(language) === "kokoro" ? KOKORO_VOICES : supertonicVoices();
}

export function voiceForLanguage(voice: NarratorVoice, language: SpeechLanguage): NarratorVoice {
  if (speechEngine(language) === "kokoro") return isKokoroVoice(voice) ? voice : "af_heart";
  return isSupertonicVoice(voice) ? voice : "M3";
}
