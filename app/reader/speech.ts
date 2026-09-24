import {
  KOKORO_VOICES,
  isKokoroVoice,
  isSupertonicVoice,
  supertonicVoices,
  type NarratorVoice,
} from "./voices";
import { SPEECH_LANGUAGES, type SpeechLanguage } from "../languages";
import { ISO6393_TO_LANGUAGE, detectSpeechLanguage } from "./languageDetection";

export { detectSpeechLanguage };
export { SPEECH_LANGUAGES, type SpeechLanguage };
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

export function speechEngineForVoice(voice: NarratorVoice, language: SpeechLanguage): SpeechEngine {
  return language === "en" && isSupertonicVoice(voice) ? "supertonic" : speechEngine(language);
}

export function voicesForLanguage(language: SpeechLanguage): readonly (readonly [NarratorVoice, string])[] {
  return speechEngine(language) === "kokoro" ? KOKORO_VOICES : supertonicVoices();
}

export function voiceForLanguage(voice: NarratorVoice, language: SpeechLanguage): NarratorVoice {
  if (speechEngine(language) === "kokoro") return isKokoroVoice(voice) ? voice : "af_heart";
  return isSupertonicVoice(voice) ? voice : "M3";
}
