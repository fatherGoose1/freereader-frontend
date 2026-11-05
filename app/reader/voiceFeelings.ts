import { isSupertonicVoice, LIGHT_VOICES, supertonicVoices, type NarratorVoice } from "./voices";
import { voicesForLanguage, type SpeechLanguage } from "./speech";
import type { VoiceGender } from "./phonon";

const FEELINGS: Record<string, string> = {
  af_heart: "Warm", lite_wren: "Natural", lite_everly: "Gentle", lite_hadley: "Calm",
  lite_bryony: "Rich", lite_maeve: "Bright", lite_miles: "Resonant", lite_trevor: "Lively",
  lite_edwin: "Crisp", lite_hugh: "Tender",
  af_alloy: "Steady", af_aoede: "Melodic", af_bella: "Expressive", af_jessica: "Friendly",
  af_kore: "Composed", af_nicole: "Soft", af_nova: "Bright", af_river: "Gentle",
  af_sarah: "Clear", af_sky: "Airy", am_adam: "Grounded", am_echo: "Resonant",
  am_eric: "Confident", am_fenrir: "Bold", am_liam: "Warm", am_michael: "Calm",
  am_onyx: "Deep", am_puck: "Playful", am_santa: "Jolly", bf_alice: "Poised",
  bf_emma: "Soft", bf_isabella: "Elegant", bf_lily: "Cheerful", bm_daniel: "Measured",
  bm_fable: "Storytelling", bm_george: "Rich", bm_lewis: "Thoughtful",
  M1: "Direct", M2: "Easygoing", M3: "Grounded", M4: "Relaxed", M5: "Warm",
  F1: "Bright", F2: "Gentle", F3: "Lively", F4: "Expressive", F5: "Soothing",
  ef_dora: "Warm", em_alex: "Steady", em_santa: "Jolly", ff_siwis: "Gentle",
  hf_alpha: "Bright", hf_beta: "Soothing", hm_omega: "Deep", hm_psi: "Dramatic",
  if_sara: "Lyrical", im_nicola: "Measured", jf_alpha: "Warm", jf_gongitsune: "Storytelling",
  jf_nezumi: "Light", jf_tebukuro: "Soft", jm_kumo: "Calm", pf_dora: "Clear",
  pm_alex: "Friendly", pm_santa: "Jolly", zf_xiaobei: "Gentle", zf_xiaoni: "Playful",
  zf_xiaoxiao: "Bright", zf_xiaoyi: "Soft", zm_yunjian: "Bold", zm_yunxi: "Grounded",
  zm_yunxia: "Resonant", zm_yunyang: "Confident",
};

export type ChoiceGender = VoiceGender | "neutral";
export type VoiceChoice = { id: NarratorVoice; name: string; feeling: string; gender: ChoiceGender };

const LIGHT_GENDER: Record<string, VoiceGender> = {
  af_heart: "female", lite_wren: "female", lite_everly: "female", lite_hadley: "female",
  lite_bryony: "female", lite_maeve: "female", lite_miles: "male", lite_trevor: "male",
  lite_edwin: "male", lite_hugh: "male",
};

// Kokoro and Supertonic voice IDs encode gender: af/bf/ef/ff/hf/if/jf/pf/zf and
// F1-F5 are female; am/bm/em/hm/im/jm/pm/zm and M1-M5 are male.
function builtinGender(id: string): VoiceGender {
  if (/^[MF][1-5]$/.test(id)) return id[0] === "F" ? "female" : "male";
  return id[1] === "f" ? "female" : "male";
}

export function freeVoiceChoices(): VoiceChoice[] {
  return LIGHT_VOICES.map(([id, name]) => ({ id, name, feeling: FEELINGS[id], gender: LIGHT_GENDER[id] ?? "female" }));
}

// Free multilingual narration is the Supertonic voices for the selected language.
export function freeMultilingualChoices(): VoiceChoice[] {
  return supertonicVoices().map(([id, name]) => ({ id, name, feeling: FEELINGS[id] ?? "Clear", gender: builtinGender(id) }));
}

// Gold voices for a language. Supertonic voices are free for non-English, so
// they are excluded from the Gold set there (they stay Gold for English).
export function goldVoiceChoices(language: SpeechLanguage): VoiceChoice[] {
  return voicesForLanguage(language)
    .filter(([id]) => language === "en" || !isSupertonicVoice(id))
    .map(([id, name]) => ({ id, name, feeling: FEELINGS[id] ?? "Clear", gender: builtinGender(id) }));
}
