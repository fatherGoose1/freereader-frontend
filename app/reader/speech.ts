import {
  KOKORO_VOICES,
  isKokoroVoice,
  isSupertonicVoice,
  supertonicVoices,
  type NarratorVoice,
} from "./voices";
import { ISO6393_TO_LANGUAGE, detectSpeechLanguage } from "./languageDetection";

export { detectSpeechLanguage };

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
const iso6393 = ISO6393_TO_LANGUAGE;

export function normalizeLanguage(value?: string | null): SpeechLanguage | undefined {
  const code = value?.trim().toLowerCase().split(/[-_]/)[0];
  if (!code) return undefined;
  return languageCodes.has(code) ? code as SpeechLanguage : iso6393[code];
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
