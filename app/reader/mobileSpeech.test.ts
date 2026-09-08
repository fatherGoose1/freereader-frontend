import assert from "node:assert/strict";
import test from "node:test";
import { MobileSpeechClient, usesMobileSpeech } from "./mobileSpeech";
import { splitMobileText, synthesizeMobile } from "./mobileInference";

test("mobile routing excludes desktop Safari and desktop Chrome", () => {
  const device = (userAgent: string, platform = "", maxTouchPoints = 0) => ({ userAgent, platform, maxTouchPoints }) as Navigator;
  assert.equal(usesMobileSpeech(device("Mozilla Macintosh Safari", "MacIntel", 0)), false);
  assert.equal(usesMobileSpeech(device("Windows Chrome", "Win32", 10)), false);
  assert.equal(usesMobileSpeech(device("iPhone Safari")), true);
  assert.equal(usesMobileSpeech(device("Android Chrome")), true);
  assert.equal(usesMobileSpeech(device("Macintosh Safari", "MacIntel", 5)), true);
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
  fake.onmessage?.({ data: { kind: "result", result: { blob: new Blob(), duration: 1, provider: "WASM", generationSeconds: 1 } } } as MessageEvent);
  await retry;
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
