import assert from "node:assert/strict";
import test from "node:test";
import { builtInVoiceProfiles, POPULAR_VOICE_IDS, searchVoiceProfiles } from "./voiceCatalog";

test("English exposes both engines with three available popular voices and sound tags", () => {
  const profiles = builtInVoiceProfiles("en");
  assert.deepEqual(POPULAR_VOICE_IDS.map((id) => profiles.find((profile) => profile.id === id)?.name), ["Heart", "Olivia", "Bella"]);
  assert.ok(profiles.every((profile) => profile.tags.length >= 3));
  assert.ok(profiles.some((profile) => profile.engine === "Kokoro"));
  assert.ok(profiles.some((profile) => profile.engine === "Supertonic"));
});

test("search surfaces the strongest tag match and respects language availability", () => {
  const english = builtInVoiceProfiles("en");
  assert.equal(searchVoiceProfiles(english, "calm asmr quiet")[0]?.name, "Nicole");
  assert.equal(searchVoiceProfiles(english, "calm, asmr, quiet")[0]?.name, "Nicole");
  assert.equal(searchVoiceProfiles(english, "olivia")[0]?.id, "F4");
  assert.deepEqual(searchVoiceProfiles(english, "unknown sound"), []);
  const spanish = builtInVoiceProfiles("es");
  assert.equal(spanish.length, 10);
  assert.ok(spanish.every((profile) => profile.engine === "Supertonic"));
  assert.ok(!spanish.some((profile) => profile.id === "af_heart"));
});
