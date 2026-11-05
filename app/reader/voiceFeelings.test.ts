import assert from "node:assert/strict";
import test from "node:test";
import { freeMultilingualChoices, freeVoiceChoices, goldVoiceChoices } from "./voiceFeelings";
import { isLightVoice } from "./voices";

test("free English offers the ten light voices and free multilingual offers the Supertonic voices", () => {
  const free = freeVoiceChoices();
  assert.equal(free.length, 10);
  assert.equal(new Set(free.map((voice) => voice.id)).size, 10);
  assert.ok(free.every((voice) => voice.name.endsWith("(free)") && voice.feeling && isLightVoice(voice.id)));

  const multilingual = freeMultilingualChoices();
  assert.equal(multilingual.length, 10);
  assert.ok(multilingual.every((voice) => /^[MF][1-5]$/.test(voice.id) && voice.feeling));
});

test("Gold keeps Kokoro for every language and only English keeps the Supertonic voices", () => {
  const gold = goldVoiceChoices("en");
  assert.ok(gold.length > 30);
  assert.ok(gold.every((voice) => voice.feeling && !voice.id.startsWith("lite_")));
  // Non-English Gold is Kokoro only: Supertonic voices are free there.
  assert.ok(goldVoiceChoices("ja").length > 0);
  assert.ok(goldVoiceChoices("ja").every((voice) => !/^[MF][1-5]$/.test(voice.id)));
  assert.ok(goldVoiceChoices("ja").every((voice) => !voice.id.startsWith("lite_")));
});
