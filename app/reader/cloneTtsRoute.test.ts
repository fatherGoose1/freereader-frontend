import assert from "node:assert/strict";
import test, { type TestContext } from "node:test";
import { POST as cloneSpeech } from "../api/clone-tts/route";
import { POST as createClone } from "../api/voices/clone/route";
import { GET as listClones } from "../api/voices/route";
import { DELETE as deleteClone } from "../api/voices/[id]/route";

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
    assert.equal(headers["X-FreeReader-User-Token"], "signed-in-token");
    assert.deepEqual(JSON.parse(String(init?.body)), {
      text: "Hello there.", voice_id: "vox2_voice-1", user_id: "user-1", language: "en", speed: 0.9,
      instruct: "Speak softly, with a hint of sadness",
    });
    return new Response(new Uint8Array([1, 2, 3]), {
      headers: {
        "Content-Type": "audio/mp4",
        "X-Audio-Duration": "1.5",
        "X-Generation-Seconds": "0.8",
        "X-TTS-Model": "voxcpm2-2b",
      },
    });
  });
  const response = await cloneSpeech(new Request("http://localhost/api/clone-tts", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: "Bearer signed-in-token" },
    body: JSON.stringify({ text: "Hello there.", voiceId: "vox2_voice-1", userId: "user-1", language: "en", speed: 0.9,
      instruct: "  Speak softly, with a hint of sadness  " }),
  }));
  assert.equal(response.status, 200);
  assert.equal(response.headers.get("Content-Type"), "audio/mp4");
  assert.equal(response.headers.get("X-Audio-Duration"), "1.5");
  assert.equal(response.headers.get("X-TTS-Model"), "voxcpm2-2b");
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
    assert.equal((init?.headers as Record<string, string>)["X-FreeReader-User-Token"], "signed-in-token");
    assert.deepEqual(JSON.parse(String(init?.body)), {
      user_id: "user-1", audio: "AAAA", name: "Narrator", language: "en", ref_text: "Hello.",
    });
    return new Response(JSON.stringify({
      voice_id: "vox2_voice-1", user_id: "user-1", ref_text: "Hello.",
      duration_seconds: 12.3, model: "openbmb/VoxCPM2", revision: "abc",
      created_at: "2026-09-25T00:00:00.000Z",
    }), { headers: { "Content-Type": "application/json" } });
  });
  const response = await createClone(new Request("http://localhost/api/voices/clone", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: "Bearer signed-in-token" },
    body: JSON.stringify({ userId: "user-1", name: "Narrator", language: "en", refText: "Hello.", audio: "AAAA" }),
  }));
  assert.equal(response.status, 200);
  assert.equal((await response.json() as { voice_id: string }).voice_id, "vox2_voice-1");
  assert.equal(fetch.mock.callCount(), 1);
});

test("GPU endpoints reject anonymous requests before contacting the backend", async (t) => {
  setEnv(t, { FREEREADER_TTS_API_TOKEN: "tts-key" });
  const fetch = t.mock.method(globalThis, "fetch", async () => { throw new Error("unexpected backend call"); });
  for (const endpoint of [cloneSpeech, createClone]) {
    const response = await endpoint(new Request("http://localhost/api/clone", {
      method: "POST", headers: { "Content-Type": "application/json" }, body: "{}",
    }));
    assert.equal(response.status, 403);
  }
  assert.equal(fetch.mock.callCount(), 0);
});

test("voice management uses the signed-in account for listing and deleting", async (t) => {
  setEnv(t, { KOKO_BACKEND_URL: "https://backend.example", FREEREADER_TTS_API_TOKEN: "tts-key" });
  const calls: Array<{ url: string; method: string; token: string | undefined }> = [];
  t.mock.method(globalThis, "fetch", async (input: RequestInfo | URL, init?: RequestInit) => {
    calls.push({ url: String(input), method: init?.method ?? "GET", token: (init?.headers as Record<string, string>)["X-FreeReader-User-Token"] });
    return Response.json(calls.length === 1 ? { voices: [{ id: "mine" }], limit: 3 } : { deleted: true });
  });
  const request = new Request("http://localhost/api/voices", { headers: { Authorization: "Bearer user-token" } });
  const listed = await listClones(request);
  assert.equal((await listed.json() as { limit: number }).limit, 3);
  const deleted = await deleteClone(new Request("http://localhost/api/voices/mine", { method: "DELETE", headers: { Authorization: "Bearer user-token" } }), { params: Promise.resolve({ id: "mine" }) });
  assert.equal((await deleted.json() as { deleted: boolean }).deleted, true);
  assert.deepEqual(calls, [
    { url: "https://backend.example/api/v1/freereader/voices", method: "GET", token: "user-token" },
    { url: "https://backend.example/api/v1/freereader/voices/mine", method: "DELETE", token: "user-token" },
  ]);
});
