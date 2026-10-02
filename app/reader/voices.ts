import { VOICES, type Voice } from "./tts";

export const KOKORO_VOICES = [
  ["af_heart", "Heart"],
  ["af_alloy", "Alloy"],
  ["af_aoede", "Aoede"],
  ["af_bella", "Bella"],
  ["af_jessica", "Jessica"],
  ["af_kore", "Kore"],
  ["af_nicole", "Nicole"],
  ["af_nova", "Nova"],
  ["af_river", "River"],
  ["af_sarah", "Sarah"],
  ["af_sky", "Sky"],
  ["am_adam", "Adam"],
  ["am_echo", "Echo"],
  ["am_eric", "Eric"],
  ["am_fenrir", "Fenrir"],
  ["am_liam", "Liam"],
  ["am_michael", "Michael"],
  ["am_onyx", "Onyx"],
  ["am_puck", "Puck"],
  ["am_santa", "Santa"],
  ["bf_alice", "Alice"],
  ["bf_emma", "Emma"],
  ["bf_isabella", "Isabella"],
  ["bf_lily", "Lily"],
  ["bm_daniel", "Daniel"],
  ["bm_fable", "Fable"],
  ["bm_george", "George"],
  ["bm_lewis", "Lewis"],
  ["ef_dora", "Dora"], ["em_alex", "Alex"], ["em_santa", "Santa"],
  ["ff_siwis", "Siwis"],
  ["hf_alpha", "Alpha"], ["hf_beta", "Beta"], ["hm_omega", "Omega"], ["hm_psi", "Psi"],
  ["if_sara", "Sara"], ["im_nicola", "Nicola"],
  ["jf_alpha", "Alpha"], ["jf_gongitsune", "Gongitsune"], ["jf_nezumi", "Nezumi"],
  ["jf_tebukuro", "Tebukuro"], ["jm_kumo", "Kumo"],
  ["pf_dora", "Dora"], ["pm_alex", "Alex"], ["pm_santa", "Santa"],
  ["zf_xiaobei", "Xiaobei"], ["zf_xiaoni", "Xiaoni"], ["zf_xiaoxiao", "Xiaoxiao"],
  ["zf_xiaoyi", "Xiaoyi"], ["zm_yunjian", "Yunjian"], ["zm_yunxi", "Yunxi"],
  ["zm_yunxia", "Yunxia"], ["zm_yunyang", "Yunyang"],
] as const;

export type KokoroVoice = (typeof KOKORO_VOICES)[number][0];
const KOKORO_LANGUAGE_PREFIXES: Record<string, readonly string[]> = {
  en: ["a", "b"], es: ["e"], fr: ["f"], hi: ["h"], it: ["i"],
  ja: ["j"], pt: ["p"], zh: ["z"],
};
export const KOKORO_DEFAULT_VOICES = {
  en: "af_heart", es: "ef_dora", fr: "ff_siwis", hi: "hf_alpha",
  it: "if_sara", ja: "jf_alpha", pt: "pf_dora", zh: "zf_xiaobei",
} as const;

export function kokoroVoicesForLanguage(language: string): Array<[KokoroVoice, string]> {
  const prefixes = KOKORO_LANGUAGE_PREFIXES[language] ?? [];
  return KOKORO_VOICES.filter(([voice]) => prefixes.includes(voice[0])).map(([voice, name]) => [voice, name]);
}

export function isKokoroVoiceForLanguage(voice: string, language: string): voice is KokoroVoice {
  return kokoroVoicesForLanguage(language).some(([id]) => id === voice);
}
// User-created clones are addressed with a "clone:" prefix so they stay distinct
// from the finite built-in voice sets while still flowing through NarratorVoice.
export type ClonedVoice = `clone:${string}`;
export const QWEN_VOICES = [
  ["qwen_ryan", "Ryan"], ["qwen_aiden", "Aiden"], ["qwen_vivian", "Vivian"],
  ["qwen_serena", "Serena"], ["qwen_ono_anna", "Ono Anna"], ["qwen_sohee", "Sohee"],
  ["qwen_eric", "Eric"], ["qwen_dylan", "Dylan"], ["qwen_uncle_fu", "Uncle Fu"],
] as const;
export type QwenVoice = (typeof QWEN_VOICES)[number][0];
export type NarratorVoice = KokoroVoice | Voice | ClonedVoice | QwenVoice;
export const QWEN_LANGUAGES = new Set(["en", "zh", "ja", "ko", "de", "fr", "ru", "pt", "es", "it"]);
export function isQwenVoice(voice: string): voice is QwenVoice {
  return QWEN_VOICES.some(([id]) => id === voice);
}

const CLONED_VOICE_PREFIX = "clone:";

export function isClonedVoice(voice: NarratorVoice | string): voice is ClonedVoice {
  return typeof voice === "string" && voice.startsWith(CLONED_VOICE_PREFIX);
}

export function clonedVoiceId(voice: ClonedVoice | string): string {
  return isClonedVoice(voice) ? voice.slice(CLONED_VOICE_PREFIX.length) : voice;
}

export function clonedVoiceRef(id: string): ClonedVoice {
  return `${CLONED_VOICE_PREFIX}${id}`;
}

const KOKORO_NAMES = Object.fromEntries(KOKORO_VOICES) as Record<KokoroVoice, string>;
const SUPERTONIC_NAMES: Record<Voice, string> = {
  M1: "Alex", M2: "James", M3: "Robert", M4: "Sam", M5: "Daniel",
  F1: "Sarah", F2: "Lily", F3: "Jessica", F4: "Olivia", F5: "Emily",
};

// English spans both engines. Heart and Olivia lead, then the remaining
// Kokoro voices, then the remaining Supertonic voices.
const FAVORITE_SUPERTONIC: Voice = "F4";

export function englishVoices(): Array<[NarratorVoice, string]> {
  const supertonic = supertonicVoices();
  const lead = supertonic.filter(([voice]) => voice === FAVORITE_SUPERTONIC);
  const restSupertonic = supertonic.filter(([voice]) => voice !== FAVORITE_SUPERTONIC);
  const leadKokoro = kokoroVoicesForLanguage("en").filter(([voice]) => voice === "af_heart")
    .map(([voice, name]) => [voice, name] as [NarratorVoice, string]);
  const restKokoro = kokoroVoicesForLanguage("en").filter(([voice]) => voice !== "af_heart")
    .map(([voice, name]) => [voice, name] as [NarratorVoice, string]);
  return [...leadKokoro, ...lead, ...restKokoro, ...restSupertonic];
}

export function supertonicVoices(): Array<[Voice, string]> {
  return VOICES.map((voice) => [voice, SUPERTONIC_NAMES[voice]]);
}

export function isKokoroVoice(voice: NarratorVoice): voice is KokoroVoice {
  return voice in KOKORO_NAMES;
}

export function isSupertonicVoice(voice: NarratorVoice): voice is Voice {
  return (VOICES as readonly string[]).includes(voice);
}

export function narratorVoices(): Array<[NarratorVoice, string]> {
  return [
    ...KOKORO_VOICES.map(([voice, name]) => [voice, name] as [NarratorVoice, string]),
    ...supertonicVoices(),
  ];
}

export function voiceDisplayName(voice: NarratorVoice | string): string | undefined {
  if (isClonedVoice(voice)) return undefined;
  if (isQwenVoice(voice)) return QWEN_VOICES.find(([id]) => id === voice)?.[1];
  return narratorVoices().find(([value]) => value === voice)?.[1];
}

// Premium Qwen voices are cached as a single bundled sample per voice, so the
// picker can play them instantly without calling the narration endpoint.
export function voicePreviewPath(voice: NarratorVoice | string, language: string): string {
  if (isKokoroVoice(voice as NarratorVoice) && language !== "en") {
    return `/api/voice-preview?language=${encodeURIComponent(language)}&voice=${encodeURIComponent(voice)}`;
  }
  if (isQwenVoice(voice) || language === "en") return `/voice-previews/${voice}.m4a`;
  return `/voice-previews/${language}/${voice}.m4a`;
}
