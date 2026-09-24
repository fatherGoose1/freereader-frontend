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
] as const;

export type KokoroVoice = (typeof KOKORO_VOICES)[number][0];
export type NarratorVoice = KokoroVoice | Voice;

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
  const leadKokoro = KOKORO_VOICES.filter(([voice]) => voice === "af_heart")
    .map(([voice, name]) => [voice, name] as [NarratorVoice, string]);
  const restKokoro = KOKORO_VOICES.filter(([voice]) => voice !== "af_heart")
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
