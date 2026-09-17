import assert from "node:assert/strict";
import test from "node:test";
import { NarrationRouter, UnsupportedMobileLanguageError } from "./narration";
import { SpeechCancelledError } from "./ttsDiagnostics";

const audio = { blob: new Blob(), duration: 2, generationSeconds: 1, generationStartedAt: 1_000, provider: "Server" };
function setup(mobile: boolean, remoteError?: Error) {
  const calls: string[] = [];
  const router = new NarrationRouter(mobile, {
    supertonic: {
      async synthesize(request) { calls.push(`supertonic:${request.mobile}:${request.voice}:${request.language}`); return { ...audio, provider: "WASM" }; },
      stop() { calls.push("dispose-supertonic"); },
    },
    remote: {
      async synthesize(text) { calls.push(`remote:${text}`); if (remoteError) throw remoteError; return audio; },
      async synthesizeBatch(items) { calls.push(`remote-batch:${items.map((item) => item.text).join("|")}`); if (remoteError) throw remoteError; return items.map(() => audio); },
      stop() { calls.push("dispose-remote"); },
    },
  });
  return {
    router, calls,
    speakEnglish: () => router.synthesize("Hello", "af_heart", 4, undefined, false, 1, "en"),
    speakFrench: () => router.synthesize("Bonjour", "M3", 4, undefined, false, 1, "fr"),
  };
}

for (const mobile of [false, true]) {
  test(`${mobile ? "mobile" : "desktop"}: English uses the backend speech service`, async () => {
    const { calls, speakEnglish } = setup(mobile);
    const result = await speakEnglish();
    assert.equal(result.route.model, "kokoro-7m-fp32-server-v1");
    assert.equal(result.route.provider, "Server");
    assert.deepEqual(calls, ["remote:Hello"]);
  });

  test(`${mobile ? "mobile" : "desktop"}: a backend failure surfaces without a local model`, async () => {
    const { calls, speakEnglish } = setup(mobile, new Error("speech_unavailable"));
    await assert.rejects(speakEnglish(), /speech_unavailable/);
    assert.deepEqual(calls, ["remote:Hello"]);
  });
}

test("batches English passages into a single remote call", async () => {
  const { router, calls } = setup(false);
  const { parts, route } = await router.synthesizeBatch(
    ["One", "Two", "Three"], [false, false, true], "af_heart", 4, undefined, 1, "en");
  assert.equal(parts.length, 3);
  assert.equal(route.provider, "Server");
  assert.deepEqual(calls, ["remote-batch:One|Two|Three"]);
});

test("desktop: non-English still runs Supertonic on device", async () => {
  const { calls, speakFrench } = setup(false);
  const result = await speakFrench();
  assert.equal(result.route.model, "supertonic-fp32-wasm-v2");
  assert.equal(result.route.provider, "WASM");
  assert.deepEqual(calls, ["supertonic:false:M3:fr"]);
});

test("mobile: non-English is rejected before any model loads", async () => {
  const { calls, speakFrench } = setup(true);
  await assert.rejects(speakFrench(), UnsupportedMobileLanguageError);
  assert.deepEqual(calls, []);
});

test("switching from English to non-English releases the previous engine", async () => {
  const { calls, speakEnglish, speakFrench } = setup(false);
  await speakEnglish();
  await speakFrench();
  await speakEnglish();
  assert.deepEqual(calls, ["remote:Hello", "dispose-remote", "supertonic:false:M3:fr",
    "dispose-supertonic", "remote:Hello"]);
});

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => { resolve = done; });
  return { promise, resolve };
}

test("a seek drops stale queued synthesis while retaining an in-flight result", async () => {
  const first = deferred<typeof audio>();
  const started = deferred<void>();
  const calls: string[] = [];
  let current = 0;
  const router = new NarrationRouter(false, {
    supertonic: { async synthesize() { throw new Error("Unexpected fallback"); }, stop() {} },
    remote: {
      async synthesize(text) {
        calls.push(text);
        if (text === "first") { started.resolve(); return first.promise; }
        return audio;
      },
      async synthesizeBatch(items) {
        calls.push(items.map((item) => item.text).join("|"));
        if (items[0].text === "first") { started.resolve(); return [await first.promise]; }
        return items.map(() => audio);
      },
      stop() { calls.push("stop"); },
    },
  });
  const speak = (text: string, epoch: number) => router.synthesize(text, "af_heart", 4, undefined, false, 1, "en", () => current === epoch);
  const inFlight = speak("first", 0);
  await started.promise;
  const obsolete = assert.rejects(speak("old next section", 0), SpeechCancelledError);
  current = 1;
  const latest = speak("selected section", 1);
  first.resolve(audio);
  assert.equal((await inFlight).blob, audio.blob);
  await obsolete;
  await latest;
  assert.deepEqual(calls, ["first", "selected section"]);
});