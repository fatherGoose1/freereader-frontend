import assert from "node:assert/strict";
import test, { type TestContext } from "node:test";
import { POST as cloneSpeech } from "../api/clone-tts/route";
import { POST as createClone } from "../api/voices/clone/route";

const ENV_KEYS = ["KOKO_BACKEND_URL", "FREEREADER_TTS_API_TOKEN", "PARRYT_API_TOKEN"] as const;
type EnvValues = Partial<Record<(typeof ENV_KEYS)[number], string>>;

function setEnv(t: TestContext, values: EnvValues) {
  const originals = Object.fromEntries(ENV_KEYS.map((key) => [key, process.env[key]]));
  for (const key of ENV_KEYS) {
    const value = values[key];
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
  t.after(() => {
    for (const key of ENV_KEYS) {
      const original = originals[key];
      if (original === undefined) delete process.env[key];
      else process.env[key] = original;
    }
  });
}

test("clone speech proxies to the backend speech/clone endpoint", async (t) => {
  setEnv(t, { KOKO_BACKEND_URL: "https://backend.example/", FREEREADER_TTS_API_TOKEN: "tts-key" });
  const fetch = t.mock.method(globalThis, "fetch", async (input: RequestInfo | URL, init?: RequestInit) => {
    assert.equal(String(input), "https://backend.example/api/v1/freereader/speech/clone");
    assert.equal(init?.method, "POST");
    const headers = init?.headers as Record<string, string>;
    assert.equal(headers.Authorization, "Bearer tts-key");
    assert.deepEqual(JSON.parse(String(init?.body)), {
      text: "Hello there.", voice_id: "voice-1", user_id: "user-1", language: "en", speed: 0.9,
    });
    return new Response(new Uint8Array([1, 2, 3]), {
      headers: {
        "Content-Type": "audio/mp4",
        "X-Audio-Duration": "1.5",
        "X-Generation-Seconds": "0.8",
        "X-TTS-Model": "qwen3-tts-12hz-0.6b-base",
      },
    });
  });
  const response = await cloneSpeech(new Request("http://localhost/api/clone-tts", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ text: "Hello there.", voiceId: "voice-1", userId: "user-1", language: "en", speed: 0.9 }),
  }));
  assert.equal(response.status, 200);
  assert.equal(response.headers.get("Content-Type"), "audio/mp4");
  assert.equal(response.headers.get("X-Audio-Duration"), "1.5");
  assert.equal(response.headers.get("X-TTS-Model"), "qwen3-tts-12hz-0.6b-base");
  assert.deepEqual([...new Uint8Array(await response.arrayBuffer())], [1, 2, 3]);
  assert.equal(fetch.mock.callCount(), 1);
});

test("clone speech is unavailable without a backend token", async (t) => {
  setEnv(t, { KOKO_BACKEND_URL: "https://backend.example", FREEREADER_TTS_API_TOKEN: undefined, PARRYT_API_TOKEN: undefined });
  const response = await cloneSpeech(new Request("http://localhost/api/clone-tts", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ text: "Hi", voiceId: "v", userId: "u" }),
  }));
  assert.equal(response.status, 503);
});

test("voice cloning forwards the reference clip to the backend voices/clone endpoint", async (t) => {
  setEnv(t, { KOKO_BACKEND_URL: "https://backend.example", FREEREADER_TTS_API_TOKEN: "tts-key" });
  const fetch = t.mock.method(globalThis, "fetch", async (input: RequestInfo | URL, init?: RequestInit) => {
    assert.equal(String(input), "https://backend.example/api/v1/freereader/voices/clone");
    assert.deepEqual(JSON.parse(String(init?.body)), {
      user_id: "user-1", audio: "AAAA", voice_id: "voice-1", name: "Narrator", language: "en", ref_text: "Hello.",
    });
    return new Response(JSON.stringify({
      voice_id: "voice-1", user_id: "user-1", ref_text: "Hello.", x_vector_only_mode: false,
      duration_seconds: 12.3, model: "Qwen/Qwen3-TTS-12Hz-0.6B-Base", revision: "abc",
      created_at: "2026-09-25T00:00:00.000Z",
    }), { headers: { "Content-Type": "application/json" } });
  });
  const response = await createClone(new Request("http://localhost/api/voices/clone", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ userId: "user-1", voiceId: "voice-1", name: "Narrator", language: "en", refText: "Hello.", audio: "AAAA" }),
  }));
  assert.equal(response.status, 200);
  assert.equal((await response.json() as { voice_id: string }).voice_id, "voice-1");
  assert.equal(fetch.mock.callCount(), 1);
});
