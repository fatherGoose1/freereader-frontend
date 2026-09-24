import assert from "node:assert/strict";
import test from "node:test";
import { applyPronunciations, createNarrationProject, invalidateSegment, mergePassages, movePassage, pronunciationParts, segmentScript, spokenText, splitPassage, updateGlobalPronunciations } from "../narration/model";

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

test("global pronunciations annotate all matching text while passage rules take priority", () => {
  const [local, shared, other] = segmentScript("SQL opens the story.\n\nSQL appears again.\n\nNothing to replace.");
  local.pronunciations = [{ id: "local", phrase: "SQL", pronunciation: "structured query" }];
  const project = createNarrationProject();
  project.segments = [local, shared, other].map((segment) => ({ ...segment, status: "ready" as const,
    audio: { path: segment.id, mimeType: "audio/mp4", duration: 2, generatedAt: "now", voice: "af_heart" as const, model: "kokoro", speed: 1 },
  }));
  const first = updateGlobalPronunciations(project, [{ id: "global", phrase: "SQL", pronunciation: "sequel" }]);
  assert.equal(spokenText(first.segments[0], first.pronunciations), "structured query opens the story.");
  assert.equal(spokenText(first.segments[1], first.pronunciations), "sequel appears again.");
  assert.equal(first.segments[0].status, "ready");
  assert.equal(first.segments[1].needsRegeneration, true);
  assert.equal(first.segments[2].status, "ready");
  assert.deepEqual(pronunciationParts("SQL appears again.", first.pronunciations)[0], { written: "SQL", pronunciation: "sequel" });

  const second = updateGlobalPronunciations(first, [{ id: "global", phrase: "SQL", pronunciation: "ess queue ell" }]);
  assert.equal(spokenText(second.segments[0], second.pronunciations), "structured query opens the story.");
  assert.equal(spokenText(second.segments[1], second.pronunciations), "ess queue ell appears again.");
  assert.equal(second.segments[0].audio?.path, local.id);
  assert.equal(second.segments[2].audio?.path, other.id);
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

test("moving a passage changes its position without discarding generated takes", () => {
  let index = 0;
  const original = segmentScript("First.\n\nSecond.\n\nThird.", () => String(++index));
  const ready = original.map((segment) => ({ ...segment, status: "ready" as const,
    audio: { path: segment.id, mimeType: "audio/mp4", duration: 1, generatedAt: "now", voice: "af_heart" as const, model: "kokoro", speed: 1 },
  }));
  const moved = movePassage(ready, "1", 2);
  assert.deepEqual(moved.map((segment) => segment.id), ["2", "3", "1"]);
  assert.deepEqual(moved.map((segment) => segment.audio?.path), ["2", "3", "1"]);
  assert.deepEqual(ready.map((segment) => segment.id), ["1", "2", "3"]);
});

test("splitting preserves delivery and pause placement while invalidating only that passage", () => {
  const [first, second] = segmentScript("Read SQL clearly and then continue.\n\nAn untouched take.", (() => {
    let index = 0;
    return () => String(++index);
  })());
  const ready = { ...first, status: "ready" as const, pauseAfterMs: 1000, voiceId: "F1" as const, speedOverride: 1.2,
    pronunciations: [{ id: "sql", phrase: "SQL", pronunciation: "sequel" }],
    audio: { path: "first", mimeType: "audio/mp4", duration: 2, generatedAt: "now", voice: "F1" as const, model: "supertonic", speed: 1.2 },
  };
  const [left, right, unchanged] = splitPassage([ready, second], first.id, "Read SQL clearly".length, () => "new");
  assert.equal(left.text, "Read SQL clearly");
  assert.equal(right.text, "and then continue.");
  assert.equal(left.pauseAfterMs, 0);
  assert.equal(right.pauseAfterMs, 1000);
  assert.equal(left.voiceId, "F1");
  assert.equal(right.speedOverride, 1.2);
  assert.deepEqual(left.pronunciations.map((rule) => rule.phrase), ["SQL"]);
  assert.deepEqual(right.pronunciations, []);
  assert.equal(left.needsRegeneration, true);
  assert.equal(right.needsRegeneration, true);
  assert.equal(left.audio, null);
  assert.equal(right.audio, null);
  assert.equal(unchanged, second);
  assert.throws(() => splitPassage([ready], first.id, 0), /between two parts/);
});

test("merging keeps the earlier delivery and later pause, only invalidating the combined take", () => {
  let index = 0;
  const [first, second, third] = segmentScript("Hello there.\n\nWelcome back.\n\nKeep listening.", () => String(++index));
  const ready = { ...second, status: "ready" as const, pauseAfterMs: 600,
    audio: { path: "second", mimeType: "audio/mp4", duration: 2, generatedAt: "now", voice: "af_heart" as const, model: "kokoro", speed: 1 },
  };
  const [merged, untouched] = mergePassages([first, ready, third], first.id);
  assert.equal(merged.id, first.id);
  assert.equal(merged.text, "Hello there. Welcome back.");
  assert.equal(merged.pauseAfterMs, 600);
  assert.equal(merged.needsRegeneration, true);
  assert.equal(merged.audio, null);
  assert.equal(untouched, third);
});
