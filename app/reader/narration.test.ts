import assert from "node:assert/strict";
import test from "node:test";
import { NarrationRouter } from "./narration";
import { SpeechCancelledError } from "./ttsDiagnostics";

const audio = { blob: new Blob(), duration: 2, generationSeconds: 1, generationStartedAt: 1_000, provider: "WebGPU" };
function setup(mobile: boolean, probeError?: Error, inferenceError?: Error) {
  const calls: string[] = [];
  const router = new NarrationRouter(mobile, {
    kokoro: {
      async probe() { calls.push("probe"); if (probeError) throw probeError; },
      async synthesize(...args) { calls.push(`kokoro:${args[5]}`); if (inferenceError) throw inferenceError; return audio; },
      stop() { calls.push("dispose-kokoro"); },
    },
    supertonic: {
      async synthesize(request) { calls.push(`supertonic:${request.mobile}:${request.voice}:${request.language}`); return { ...audio, provider: "WASM" }; },
      stop() { calls.push("dispose-supertonic"); },
    },
  });
  return { router, calls, speak: () => router.synthesize("Hello", "af_heart", 4, undefined, false, 1, "en") };
}

for (const mobile of [false, true]) {
  test(`${mobile ? "mobile" : "desktop"}: usable GPU selects only the correct Kokoro variant`, async () => {
    const { calls, speak } = setup(mobile);
    const result = await speak();
    assert.equal(result.route.model, mobile ? "kokoro-q8-webgpu-v2" : "kokoro-fp32-webgpu-v2");
    assert.deepEqual(calls, ["probe", `kokoro:${mobile}`]);
  });

  test(`${mobile ? "mobile" : "desktop"}: failed GPU probe skips Kokoro; fallback stays selected`, async () => {
    const { calls, speak } = setup(mobile, new Error("requestDevice rejected"));
    const result = await speak();
    assert.equal(result.route.model, mobile ? "supertonic-int8-wasm-v2" : "supertonic-fp32-wasm-v2");
    assert.equal(result.provider, "WASM");
    await speak();
    assert.deepEqual(calls, ["probe", "dispose-kokoro", `supertonic:${mobile}:F1:en`, `supertonic:${mobile}:F1:en`]);
  });

  test(`${mobile ? "mobile" : "desktop"}: Kokoro failure disposes before transparent fallback`, async () => {
    const { calls, speak } = setup(mobile, undefined, new Error("Unsupported operator / device lost"));
    assert.equal((await speak()).provider, "WASM");
    await speak();
    assert.equal(calls.filter((call) => call === "probe").length, 1);
    assert.ok(calls.indexOf("dispose-kokoro") < calls.indexOf(`supertonic:${mobile}:F1:en`));
    assert.equal(calls.filter((call) => call.startsWith("kokoro:")).length, 1);
  });
}

test("language switches release the previous large model worker", async () => {
  const { router, calls, speak } = setup(false);
  await speak();
  await router.synthesize("Bonjour", "M3", 4, undefined, false, 1, "fr");
  await speak();
  assert.deepEqual(calls, ["probe", "kokoro:false", "dispose-kokoro", "supertonic:false:M3:fr",
    "probe", "dispose-supertonic", "kokoro:false"]);
});

test("page exit cancellation does not trigger model downloads for fallback", async () => {
  const { calls, speak } = setup(true, undefined, new SpeechCancelledError("pagehide"));
  await assert.rejects(speak(), SpeechCancelledError);
  assert.deepEqual(calls, ["probe", "kokoro:true"]);
});

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => { resolve = done; });
  return { promise, resolve };
}

test("a seek drops stale queued synthesis while retaining an in-flight result and the loaded worker", async () => {
  const first = deferred<typeof audio>();
  const started = deferred<void>();
  const calls: string[] = [];
  let current = 0;
  const router = new NarrationRouter(false, {
    kokoro: {
      async probe() { calls.push("probe"); },
      async synthesize(text) {
        calls.push(text);
        if (text === "first") { started.resolve(); return first.promise; }
        return audio;
      },
      stop() { calls.push("stop"); },
    },
    supertonic: { async synthesize() { throw new Error("Unexpected fallback"); }, stop() {} },
  });
  const speak = (text: string, epoch: number) => router.synthesize(text, "af_heart", 4, undefined, false, 1, "en", () => current === epoch);
  const inFlight = speak("first", 0);
  await started.promise;
  const obsolete = assert.rejects(speak("old next section", 0), SpeechCancelledError);
  current = 1;
  const latest = speak("selected section", 1);
  first.resolve(audio);
  assert.equal((await inFlight).blob, audio.blob); // Still useful to the audio cache.
  await obsolete;
  await latest;
  assert.deepEqual(calls, ["probe", "first", "selected section"]);
});

test("a seek during the capability probe prevents obsolete inference", async () => {
  const probe = deferred<void>();
  const started = deferred<void>();
  let needed = true;
  const router = new NarrationRouter(true, {
    kokoro: {
      async probe() { started.resolve(); await probe.promise; },
      async synthesize() { throw new Error("Obsolete inference ran"); },
      stop() {},
    },
    supertonic: { async synthesize() { throw new Error("Unexpected fallback"); }, stop() {} },
  });
  const cancelled = assert.rejects(router.synthesize("Old selection", "af_heart", 4, undefined, false, 1, "en", () => needed), SpeechCancelledError);
  await started.promise;
  needed = false;
  probe.resolve();
  await cancelled;
});
