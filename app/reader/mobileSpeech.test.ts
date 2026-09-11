import assert from "node:assert/strict";
import test from "node:test";
import { MobileSpeechClient, usesMobileSpeech } from "./mobileSpeech";
import { splitMobileText, synthesizeMobile } from "./mobileInference";
import { configureMobileWasm, MOBILE_ORT_WASM_PATH, wasmThreads } from "./mobileWasm";

test("mobile routing excludes desktop Safari and desktop Chrome", () => {
  const device = (userAgent: string, platform = "", maxTouchPoints = 0) => ({ userAgent, platform, maxTouchPoints }) as Navigator;
  assert.equal(usesMobileSpeech(device("Mozilla Macintosh Safari", "MacIntel", 0)), false);
  assert.equal(usesMobileSpeech(device("Windows Chrome", "Win32", 10)), false);
  assert.equal(usesMobileSpeech(device("iPhone Safari")), true);
  assert.equal(usesMobileSpeech(device("Android Chrome")), true);
  assert.equal(usesMobileSpeech(device("Macintosh Safari", "MacIntel", 5)), true);
});

test("WASM uses matching same-origin glue and binary, SIMD, and no nested inference proxy", () => {
  const ort = { env: { wasm: {} } } as unknown as typeof import("onnxruntime-web/wasm");
  configureMobileWasm(ort, "https://reader.example/reader");
  assert.equal(ort.env.wasm.numThreads, 1);
  assert.equal(ort.env.wasm.proxy, false);
  assert.equal(ort.env.wasm.simd, "fixed");
  assert.deepEqual(ort.env.wasm.wasmPaths, {
    wasm: `https://reader.example${MOBILE_ORT_WASM_PATH}`,
    mjs: "https://reader.example/onnxruntime-web/1.29.0/ort-wasm-simd-threaded.mjs",
  });
  configureMobileWasm(ort, "https://reader.example/reader", true, true);
  assert.deepEqual(ort.env.wasm.wasmPaths, {
    wasm: "https://reader.example/onnxruntime-web/1.29.0/ort-wasm-simd-threaded.jsep.wasm",
    mjs: "https://reader.example/onnxruntime-web/1.29.0/ort-wasm-simd-threaded.jsep.mjs",
  });
});

test("WASM threads require isolation and leave cores available for playback", () => {
  assert.equal(wasmThreads(true, false, 8), 1);
  assert.equal(wasmThreads(false, false, 16), 1);
  assert.equal(wasmThreads(true, true, 8), 2);
  assert.equal(wasmThreads(false, true, 16), 4);
  assert.equal(wasmThreads(false, true, 2), 1);
});

test("mobile text chunks bound allocation without dropping text or breaking surrogate pairs", () => {
  for (const text of ["Long words and spaces. ".repeat(25), "a".repeat(119) + "\u{1f600}".repeat(130)]) {
    const chunks = splitMobileText(text);
    assert.equal(chunks.join(""), text);
    assert.ok(chunks.every((chunk) => chunk.length <= 120 && chunk.isWellFormed()));
  }
});

test("invalid mobile parameters reject before model initialization", async () => {
  await assert.rejects(synthesizeMobile("x".repeat(4001), "M3", 4, false, 1, "en", () => {}), /exceeds/);
  await assert.rejects(synthesizeMobile("Hello", "invalid", 4, false, 1, "en", () => {}), /Unknown/);
  await assert.rejects(synthesizeMobile("Hello", "M3", 4, false, 0, "en", () => {}), /speed/);
});

test("a stalled mobile worker is terminated and a fresh worker can retry", async (t) => {
  t.mock.timers.enable({ apis: ["setTimeout"] });
  let terminated = 0;
  let created = 0;
  const fake = { postMessage() {}, terminate() { terminated += 1; }, onmessage: null } as unknown as Worker;
  const client = new MobileSpeechClient(() => { created += 1; return fake; });
  const request = { text: "Hello", voice: "M3" as const, steps: 4, isHeading: false, speechSpeed: 1, language: "en" as const };
  const failure = assert.rejects(client.synthesize(request), /stalled/);
  await Promise.resolve();
  t.mock.timers.tick(120_000);
  await failure;
  assert.equal(terminated, 1);
  const retry = client.synthesize(request);
  await Promise.resolve();
  fake.onmessage?.({ data: { kind: "result", result: { blob: new Blob(), duration: 1, provider: "WASM", generationSeconds: 1, generationStartedAt: 1_000 } } } as MessageEvent);
  assert.equal((await retry).generationStartedAt, 1_000);
  assert.equal(created, 2);
  client.stop();
});

test("stopping the worker cancels queued work instead of restarting background generation", async () => {
  const fake = { postMessage() {}, terminate() {} } as unknown as Worker;
  let created = 0;
  const client = new MobileSpeechClient(() => { created += 1; return fake; });
  const request = { text: "Hello", voice: "M3" as const, steps: 4, isHeading: false, speechSpeed: 1, language: "en" as const };
  const first = assert.rejects(client.synthesize(request), /interrupted/);
  const queued = assert.rejects(client.synthesize(request), /cancelled/);
  await Promise.resolve();
  client.stop();
  await Promise.all([first, queued]);
  assert.equal(created, 1);
});
