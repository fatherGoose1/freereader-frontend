import { voicesForLanguage, type SpeechLanguage } from "../reader/speech";
import { isKokoroVoice, type KokoroVoice, type NarratorVoice } from "../reader/voices";
import type { Voice } from "../reader/tts";

export type VoiceProfile = {
  id: NarratorVoice;
  name: string;
  engine: string;
  tags: readonly string[];
};

const VOICE_TAGS: Record<KokoroVoice | Voice, readonly string[]> = {
  af_heart: ["warm", "natural", "expressive"],
  af_alloy: ["composed", "clear", "balanced"],
  af_aoede: ["airy", "lyrical", "gentle"],
  af_bella: ["bright", "friendly", "expressive"],
  af_jessica: ["clear", "upbeat", "conversational"],
  af_kore: ["smooth", "poised", "confident"],
  af_nicole: ["calm", "asmr", "quiet", "soft-spoken"],
  af_nova: ["energetic", "youthful", "bright"],
  af_river: ["grounded", "calm", "thoughtful"],
  af_sarah: ["warm", "reassuring", "gentle"],
  af_sky: ["soft", "light", "airy"],
  am_adam: ["deep", "steady", "authoritative"],
  am_echo: ["resonant", "smooth", "mellow"],
  am_eric: ["friendly", "relaxed", "conversational"],
  am_fenrir: ["dramatic", "bold", "intense"],
  am_liam: ["lively", "approachable", "youthful"],
  am_michael: ["deep", "calm", "polished"],
  am_onyx: ["rich", "low", "cinematic"],
  am_puck: ["playful", "animated", "quirky"],
  am_santa: ["warm", "jolly", "storytelling"],
  bf_alice: ["elegant", "clear", "soothing"],
  bf_emma: ["warm", "refined", "gentle"],
  bf_isabella: ["expressive", "graceful", "storytelling"],
  bf_lily: ["soft", "quiet", "tender"],
  bm_daniel: ["measured", "warm", "articulate"],
  bm_fable: ["storytelling", "whimsical", "expressive"],
  bm_george: ["classic", "resonant", "assured"],
  bm_lewis: ["thoughtful", "gentle", "literary"],
  M1: ["crisp", "direct", "versatile"],
  M2: ["warm", "confident", "conversational"],
  M3: ["deep", "steady", "narration"],
  M4: ["casual", "bright", "energetic"],
  M5: ["rich", "relaxed", "reassuring"],
  F1: ["soft", "calm", "friendly"],
  F2: ["light", "playful", "gentle"],
  F3: ["clear", "lively", "upbeat"],
  F4: ["warm", "polished", "expressive"],
  F5: ["soft", "intimate", "soothing"],
};

export const POPULAR_VOICE_IDS = ["af_heart", "F4", "af_bella"] as const;

export function builtInVoiceProfiles(language: SpeechLanguage): VoiceProfile[] {
  return voicesForLanguage(language).map(([id, name]) => ({
    id,
    name,
    engine: isKokoroVoice(id) ? "Kokoro" : "Supertonic",
    tags: VOICE_TAGS[id as KokoroVoice | Voice],
  }));
}

export function searchVoiceProfiles(profiles: VoiceProfile[], query: string): VoiceProfile[] {
  const terms = query.toLocaleLowerCase().trim().split(/[\s,]+/).filter(Boolean);
  if (!terms.length) return profiles;
  return profiles.map((profile, index) => {
    const name = profile.name.toLocaleLowerCase();
    const tags = profile.tags.map((tag) => tag.toLocaleLowerCase());
    const engine = profile.engine.toLocaleLowerCase();
    const matches = terms.map((term) => name === term ? 8 : name.includes(term) ? 5
      : tags.includes(term) ? 4 : tags.some((tag) => tag.includes(term)) ? 2 : engine.includes(term) ? 1 : 0);
    return { profile, index, score: matches.reduce<number>((sum, match) => sum + match, 0), matches: matches.every(Boolean) };
  }).filter((result) => result.matches)
    .sort((a, b) => b.score - a.score || a.index - b.index)
    .map(({ profile }) => profile);
}
