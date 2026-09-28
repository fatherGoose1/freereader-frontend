import assert from "node:assert/strict";
import test from "node:test";
import { POST } from "../api/premium-tts/route";

test("Premium Qwen instructions reach the backend with account credentials", async (t) => {
  const oldUrl = process.env.KOKO_BACKEND_URL;
  const oldToken = process.env.FREEREADER_TTS_API_TOKEN;
  t.after(() => {
    if (oldUrl === undefined) delete process.env.KOKO_BACKEND_URL;
    else process.env.KOKO_BACKEND_URL = oldUrl;
    if (oldToken === undefined) delete process.env.FREEREADER_TTS_API_TOKEN;
    else process.env.FREEREADER_TTS_API_TOKEN = oldToken;
  });
  process.env.KOKO_BACKEND_URL = "https://backend.example";
  process.env.FREEREADER_TTS_API_TOKEN = "server-token";
  t.mock.method(globalThis, "fetch", async (input: RequestInfo | URL, init?: RequestInit) => {
    assert.equal(String(input), "https://backend.example/api/v1/freereader/speech/premium");
    assert.deepEqual(JSON.parse(String(init?.body)), { text: "Hello", voice_id: "qwen_ryan", instruct: "Speak softly", language: "en" });
    assert.equal(new Headers(init?.headers).get("X-FreeReader-User-Token"), "user-token");
    return new Response(new Blob(["audio"], { type: "audio/mp4" }));
  });
  const response = await POST(new Request("http://localhost/api/premium-tts", { method: "POST",
    headers: { Authorization: "Bearer user-token" },
    body: JSON.stringify({ text: "Hello", voiceId: "qwen_ryan", language: "en", instruct: "Speak softly" }) }));
  assert.equal(response.status, 200);
});

test("non-Qwen voices and unauthenticated instructions are rejected", async (t) => {
  const oldToken = process.env.FREEREADER_TTS_API_TOKEN;
  t.after(() => { if (oldToken === undefined) delete process.env.FREEREADER_TTS_API_TOKEN; else process.env.FREEREADER_TTS_API_TOKEN = oldToken; });
  process.env.FREEREADER_TTS_API_TOKEN = "server-token";
  const badVoice = await POST(new Request("http://localhost/api/premium-tts", { method: "POST",
    headers: { Authorization: "Bearer user-token" }, body: JSON.stringify({ text: "Hello", voiceId: "af_heart", instruct: "Sad" }) }));
  assert.equal(badVoice.status, 400);
  const anonymous = await POST(new Request("http://localhost/api/premium-tts", { method: "POST",
    body: JSON.stringify({ text: "Hello", voiceId: "qwen_ryan", instruct: "Sad" }) }));
  assert.equal(anonymous.status, 403);
});
