import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { SPEECH_LANGUAGES } from "../languages";
import { voicesForLanguage } from "./speech";

test("every supported language and voice has a playable bundled preview", async () => {
  for (const [language] of SPEECH_LANGUAGES) {
    for (const [voice] of voicesForLanguage(language)) {
      const path = language === "en" ? `${voice}.m4a` : `${language}/${voice}.m4a`;
      const audio = await readFile(new URL(`../../public/voice-previews/${path}`, import.meta.url));
      assert.ok(audio.length > 512, `${path} preview is empty`);
      assert.equal(audio.toString("ascii", 4, 8), "ftyp", `${path} preview is not an MP4 audio file`);
    }
  }
});
