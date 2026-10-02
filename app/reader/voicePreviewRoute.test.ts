import assert from "node:assert/strict";
import test from "node:test";
import { GET } from "../api/voice-preview/route";

function stub() {
  const original = process.env.FREEREADER_TTS_API_TOKEN;
  process.env.FREEREADER_TTS_API_TOKEN = "test-token";
  return () => {
    if (original === undefined) delete process.env.FREEREADER_TTS_API_TOKEN;
    else process.env.FREEREADER_TTS_API_TOKEN = original;
  };
}

test("generates a multilingual Kokoro preview through the backend", async (t) => {
  const restore = stub();
  t.after(restore);
  const fetch = t.mock.method(globalThis, "fetch", async (_input: RequestInfo | URL, init?: RequestInit) => {
    const body = JSON.parse(String(init?.body));
    assert.equal(body.engine, "kokoro");
    assert.equal(body.language, "fr");
    assert.equal(body.voice, "ff_siwis");
    assert.ok(typeof body.text === "string" && body.text.length > 0);
    return new Response(new Uint8Array([1, 2, 3]), { headers: { "Content-Type": "audio/mp4" } });
  });
  const response = await GET(new Request("http://localhost/api/voice-preview?language=fr&voice=ff_siwis"));
  assert.equal(response.status, 200);
  assert.equal(response.headers.get("Content-Type"), "audio/mp4");
  assert.match(response.headers.get("Cache-Control") ?? "", /max-age=86400/);
  assert.equal(fetch.mock.callCount(), 1);
});

test("rejects a voice that does not belong to the requested language", async () => {
  const response = await GET(new Request("http://localhost/api/voice-preview?language=ja&voice=af_heart"));
  assert.equal(response.status, 400);
});
