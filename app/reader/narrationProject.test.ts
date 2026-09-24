import assert from "node:assert/strict";
import test from "node:test";
import { applyPronunciations, invalidateSegment, segmentScript } from "../narration/model";

test("scripts become editable paragraph segments with bounded long passages", () => {
  let id = 0;
  const script = [
    "A short opening paragraph with two sentences. It remains one useful editing unit.",
    Array.from({ length: 110 }, (_, index) => `word${index}`).join(" "),
  ].join("\n\n");
  const segments = segmentScript(script, () => `segment-${++id}`);

  assert.equal(segments[0].text, "A short opening paragraph with two sentences. It remains one useful editing unit.");
  assert.ok(segments.length >= 3);
  assert.ok(segments.every((segment) => segment.text.length <= 420));
  assert.deepEqual(segments.map((segment) => segment.id), segments.map((_, index) => `segment-${index + 1}`));
});

test("pronunciation overrides replace every occurrence without changing visible segment text", () => {
  const [segment] = segmentScript("SQL works with SQL Server.", () => "segment");
  const overrides = [{ id: "rule", phrase: "SQL", pronunciation: "sequel" }];

  assert.equal(applyPronunciations(segment.text, overrides), "sequel works with sequel Server.");
  assert.equal(segment.text, "SQL works with SQL Server.");
});

test("invalidating one edited segment preserves unrelated generated audio", () => {
  const [first, second] = segmentScript("First passage.\n\nSecond passage.", (() => {
    let id = 0;
    return () => String(++id);
  })());
  const ready = {
    ...second,
    status: "ready" as const,
    audio: {
      path: "narrations/project/2/audio",
      mimeType: "audio/mp4",
      duration: 2,
      generatedAt: new Date(0).toISOString(),
      voice: "af_heart" as const,
      model: "kokoro",
      speed: 1,
    },
  };

  const updated = [invalidateSegment({ ...first, text: "Edited first passage." }), ready];
  assert.equal(updated[0].audio, null);
  assert.equal(updated[0].status, "idle");
  assert.equal(updated[1].audio?.path, "narrations/project/2/audio");
  assert.equal(updated[1].status, "ready");
  const editedReady = invalidateSegment({ ...ready, text: "Edited second passage." });
  assert.equal(editedReady.needsRegeneration, true);
  assert.equal(invalidateSegment(editedReady).needsRegeneration, true);
});
