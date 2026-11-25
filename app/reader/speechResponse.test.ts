import assert from "node:assert/strict";
import { test } from "node:test";
import JSZip from "jszip";
import { decodeSpeechResponse } from "./speechResponse";

async function archiveResponse(sidecars: Array<string | undefined>, count = sidecars.length) {
  const zip = new JSZip();
  for (let index = 0; index < count; index += 1) zip.file(`${index}.m4a`, `audio-${index}`);
  sidecars.forEach((data, index) => { if (data !== undefined) zip.file(`${index}.json`, data); });
  return new Response(await zip.generateAsync({ type: "arraybuffer" }), { headers: {
    "Content-Type": "application/zip", "X-Audio-Durations": Array.from({ length: count }, () => "2").join(","),
    "X-Generation-Seconds": "0.2",
  } });
}

test("unsolicited timing sidecars are read for a single Phonon/Supertonic/Kokoro passage", async () => {
  const [part] = await decodeSpeechResponse(await archiveResponse(["[[0,0.1,0.4],[1,0.5,0.9]]"]), 1, 123);
  assert.deepEqual(part.wordTimings, [[0, .1, .4], [1, .5, .9]]);
  assert.equal(await part.blob.text(), "audio-0");
  assert.equal(part.duration, 2);
  assert.equal(part.generationStartedAt, 123);
});

test("mixed timed/untimed batches preserve order and playable audio when a sidecar is invalid", async () => {
  const parts = await decodeSpeechResponse(await archiveResponse(["[[0,0.1,0.4]]", "not json", undefined]), 3, 123);
  assert.deepEqual(parts.map((part) => part.wordTimings), [[[0, .1, .4]], undefined, undefined]);
  assert.deepEqual(await Promise.all(parts.map((part) => part.blob.text())), ["audio-0", "audio-1", "audio-2"]);
});

test("ordinary audio remains supported when alignment is unavailable", async () => {
  const [part] = await decodeSpeechResponse(new Response("audio", { headers: {
    "Content-Type": "audio/mp4", "X-Audio-Duration": "3",
  } }), 1, 123);
  assert.equal(part.wordTimings, undefined);
  assert.equal(part.duration, 3);
});

test("missing batch audio is rejected even if its sidecar is present", async () => {
  await assert.rejects(decodeSpeechResponse(await archiveResponse(["[[0,0.1,0.4]]"], 0), 1, 123), /incomplete batch/);
});
