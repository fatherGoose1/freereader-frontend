import assert from "node:assert/strict";
import test from "node:test";
import { POST } from "../api/lite-tts-test/route";

test("the light-voice tester forwards the selected voice and rejects unrelated voice IDs", async (t) => {
  const original = process.env.FREEREADER_TTS_API_TOKEN;
  process.env.FREEREADER_TTS_API_TOKEN = "test-token";
  t.after(() => {
    if (original === undefined) delete process.env.FREEREADER_TTS_API_TOKEN;
    else process.env.FREEREADER_TTS_API_TOKEN = original;
  });
  const fetch = t.mock.method(globalThis, "fetch", async (_input: RequestInfo | URL, init?: RequestInit) => {
    assert.deepEqual(JSON.parse(String(init?.body)), {
      text: "Hello there.", speed: 1, voice: "lite_maeve", language: "en",
    });
    return new Response(new Uint8Array([1, 2]), { headers: {
      "Content-Type": "audio/mp4", "X-Audio-Duration": "1.5", "X-TTS-Model": "paradee-v2f-lite-en",
    } });
  });
  const headers = { "Content-Type": "application/json", "X-FreeReader-User-Token": "reader-token" };
  const request = (voice: string) => new Request("http://localhost/api/lite-tts-test", {
    method: "POST", headers, body: JSON.stringify({ text: "Hello there.", speed: 1, voice }),
  });
  const success = await POST(request("lite_maeve"));
  assert.equal(success.status, 200);
  assert.equal(success.headers.get("X-TTS-Model"), "paradee-v2f-lite-en");
  assert.equal((await POST(request("af_bella"))).status, 400);
  assert.equal(fetch.mock.callCount(), 1);
});
