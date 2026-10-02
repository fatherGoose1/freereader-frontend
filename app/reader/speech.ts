import {
  englishVoices,
  isClonedVoice,
  isKokoroVoiceForLanguage,
  isQwenVoice,
  kokoroVoicesForLanguage,
  KOKORO_DEFAULT_VOICES,
  QWEN_LANGUAGES,
  isSupertonicVoice,
  supertonicVoices,
  type NarratorVoice,
} from "./voices";
import { SPEECH_LANGUAGES, type SpeechLanguage } from "../languages";
import { ISO6393_TO_LANGUAGE, detectSpeechLanguage } from "./languageDetection";

export { detectSpeechLanguage };
export { SPEECH_LANGUAGES, type SpeechLanguage };
export type SpeechEngine = "kokoro" | "supertonic";

// Mirrors the backend's Supertonic language set. Mandarin is Kokoro-only, so it
// is intentionally absent.
export const SUPERTONIC_SPEECH_LANGUAGES: ReadonlySet<string> = new Set([
  "ar", "bg", "cs", "da", "de", "el", "en", "es", "et", "fi", "fr", "hi", "hr",
  "hu", "id", "it", "ja", "ko", "lt", "lv", "nl", "pl", "pt", "ro", "ru", "sk",
  "sl", "sv", "tr", "uk", "vi",
]);

const languageCodes = new Set<string>(SPEECH_LANGUAGES.map(([code]) => code));
const iso6393 = ISO6393_TO_LANGUAGE;

export function normalizeLanguage(value?: string | null): SpeechLanguage | undefined {
  const code = value?.trim().toLowerCase().split(/[-_]/)[0];
  if (!code) return undefined;
  return languageCodes.has(code) ? code as SpeechLanguage : iso6393[code];
}

export function speechEngine(language: SpeechLanguage): SpeechEngine {
  return language in KOKORO_DEFAULT_VOICES ? "kokoro" : "supertonic";
}

export function speechEngineForVoice(voice: NarratorVoice, language: SpeechLanguage): SpeechEngine {
  return isSupertonicVoice(voice) ? "supertonic" : speechEngine(language);
}

export function voicesForLanguage(language: SpeechLanguage): readonly (readonly [NarratorVoice, string])[] {
  if (language === "en") return englishVoices();
  const kokoro = kokoroVoicesForLanguage(language);
  return SUPERTONIC_SPEECH_LANGUAGES.has(language) ? [...kokoro, ...supertonicVoices()] : kokoro;
}

export function voiceForLanguage(voice: NarratorVoice, language: SpeechLanguage): NarratorVoice {
  // Cloned voices are language-agnostic; never remap them to a built-in default.
  if (isClonedVoice(voice)) return voice;
  if (isQwenVoice(voice) && QWEN_LANGUAGES.has(language)) return voice;
  if (isKokoroVoiceForLanguage(voice, language)) return voice;
  if (isSupertonicVoice(voice) && SUPERTONIC_SPEECH_LANGUAGES.has(language)) return voice;
  return KOKORO_DEFAULT_VOICES[language as keyof typeof KOKORO_DEFAULT_VOICES]
    ?? (SUPERTONIC_SPEECH_LANGUAGES.has(language) ? "M3" : "af_heart");
}
