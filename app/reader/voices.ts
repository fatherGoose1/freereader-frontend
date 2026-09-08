import { VOICES, type Voice } from "./tts";

export const KOKORO_VOICES = [
  ["af_heart", "Heart"],
  ["af_bella", "Bella"],
  ["af_nicole", "Nicole"],
  ["am_michael", "Michael"],
  ["am_fenrir", "Fenrir"],
  ["bf_emma", "Emma"],
  ["bm_george", "George"],
] as const;

export type KokoroVoice = (typeof KOKORO_VOICES)[number][0];
export type NarratorVoice = KokoroVoice | Voice;

const KOKORO_NAMES = Object.fromEntries(KOKORO_VOICES) as Record<KokoroVoice, string>;
const SUPERTONIC_NAMES: Record<Voice, string> = {
  M1: "Alex", M2: "James", M3: "Robert", M4: "Sam", M5: "Daniel",
  F1: "Sarah", F2: "Lily", F3: "Jessica", F4: "Olivia", F5: "Emily",
};

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
