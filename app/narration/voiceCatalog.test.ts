import assert from "node:assert/strict";
import test from "node:test";
import { builtInVoiceProfiles, POPULAR_VOICE_IDS, searchVoiceProfiles } from "./voiceCatalog";
import { voiceForLanguage } from "../reader/speech";
import { voicePreviewPath } from "../reader/voices";

test("English lists three popular voices with sound tags", () => {
  const profiles = builtInVoiceProfiles("en");
  assert.deepEqual(POPULAR_VOICE_IDS.map((id) => profiles.find((profile) => profile.id === id)?.name), ["Heart", "Olivia", "Bella"]);
  assert.ok(profiles.every((profile) => profile.tags.length >= 3));
  assert.ok(profiles.some((profile) => profile.id === "af_heart"));
  assert.ok(profiles.some((profile) => profile.id === "F4"));
  assert.ok(!profiles.some((profile) => profile.id.startsWith("qwen_")));
  assert.equal(voiceForLanguage("qwen_ryan", "en"), "qwen_ryan");
});

test("search surfaces the strongest tag match and respects language availability", () => {
  const english = builtInVoiceProfiles("en");
  assert.equal(searchVoiceProfiles(english, "calm asmr quiet")[0]?.name, "Nicole");
  assert.equal(searchVoiceProfiles(english, "calm, asmr, quiet")[0]?.name, "Nicole");
  assert.equal(searchVoiceProfiles(english, "olivia")[0]?.id, "F4");
  assert.deepEqual(searchVoiceProfiles(english, "unknown sound"), []);
  const spanish = builtInVoiceProfiles("es");
  assert.equal(spanish.length, 10);
  assert.ok(!spanish.some((profile) => profile.id === "af_heart"));
});

test("premium voices resolve to a cached bundled preview sample", () => {
  assert.equal(voicePreviewPath("qwen_ryan", "en"), "/voice-previews/qwen_ryan.m4a");
  assert.equal(voicePreviewPath("qwen_vivian", "zh"), "/voice-previews/qwen_vivian.m4a");
  assert.equal(voicePreviewPath("af_heart", "en"), "/voice-previews/af_heart.m4a");
  assert.equal(voicePreviewPath("M3", "fr"), "/voice-previews/fr/M3.m4a");
});
