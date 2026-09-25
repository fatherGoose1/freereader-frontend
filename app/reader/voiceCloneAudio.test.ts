import assert from "node:assert/strict";
import test from "node:test";
import { arrayBufferToBase64, encodeWavPcm16 } from "./voiceCloneAudio";

test("encodes mono float samples as a 16-bit PCM WAV", async () => {
  const blob = encodeWavPcm16(new Float32Array([0, 1, -1]), 24_000);
  assert.equal(blob.type, "audio/wav");
  const view = new DataView(await blob.arrayBuffer());
  const ascii = (offset: number, length: number) =>
    String.fromCharCode(...new Uint8Array(view.buffer, offset, length));
  assert.equal(ascii(0, 4), "RIFF");
  assert.equal(ascii(8, 4), "WAVE");
  assert.equal(ascii(36, 4), "data");
  assert.equal(view.getUint16(20, true), 1); // PCM
  assert.equal(view.getUint16(22, true), 1); // mono
  assert.equal(view.getUint32(24, true), 24_000);
  assert.equal(view.byteLength, 44 + 3 * 2);
  assert.equal(view.getInt16(44, true), 0);
  assert.equal(view.getInt16(46, true), 32767);
  assert.equal(view.getInt16(48, true), -32767);
});

test("base64 encodes binary payloads in chunks", () => {
  const bytes = new Uint8Array([0, 1, 2, 253, 254, 255]);
  assert.equal(arrayBufferToBase64(bytes.buffer), Buffer.from(bytes).toString("base64"));
  const large = new Uint8Array(70_000).fill(42);
  assert.equal(arrayBufferToBase64(large.buffer), Buffer.from(large).toString("base64"));
});
