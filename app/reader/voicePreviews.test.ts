import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { SPEECH_LANGUAGES } from "../languages";
import { voicesForLanguage } from "./speech";
import { voicePreviewPath } from "./voices";

test("every supported language and voice has a playable bundled preview", async () => {
  for (const [language] of SPEECH_LANGUAGES) {
    for (const [voice] of voicesForLanguage(language)) {
      const preview = voicePreviewPath(voice, language);
      // Non-English Kokoro voices are generated on demand by /api/voice-preview,
      // so only bundled Supertonic and English samples are checked here.
      if (preview.startsWith("/api/")) continue;
      const audio = await readFile(new URL(`../../public${preview}`, import.meta.url));
      assert.ok(audio.length > 512, `${preview} preview is empty`);
      assert.equal(audio.toString("ascii", 4, 8), "ftyp", `${preview} preview is not an MP4 audio file`);
    }
  }
});
