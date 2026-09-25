import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { englishVoices } from "./voices";

test("every selectable voice has a playable bundled preview", async () => {
  for (const [voice] of englishVoices()) {
    const file = new URL(`../../public/voice-previews/${voice}.m4a`, import.meta.url);
    const audio = await readFile(file);
    assert.ok(audio.length > 512, `${voice} preview is empty`);
    assert.equal(audio.toString("ascii", 4, 8), "ftyp", `${voice} preview is not an MP4 audio file`);
  }
});
