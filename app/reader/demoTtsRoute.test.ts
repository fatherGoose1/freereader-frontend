import assert from "node:assert/strict";
import test from "node:test";
import { POST } from "../api/demo-tts/route";

test("landing demo requests Gold-quality speech with a server-only credential", async (t) => {
  const previous = [process.env.FREEREADER_TTS_API_TOKEN, process.env.FREEREADER_DEMO_API_TOKEN, process.env.KOKO_BACKEND_URL];
  process.env.FREEREADER_TTS_API_TOKEN = "service-token";
  process.env.FREEREADER_DEMO_API_TOKEN = "demo-secret";
  process.env.KOKO_BACKEND_URL = "https://speech.example/";
  t.after(() => {
    for (const [key, value] of ["FREEREADER_TTS_API_TOKEN", "FREEREADER_DEMO_API_TOKEN", "KOKO_BACKEND_URL"].map((key, index) => [key, previous[index]] as const)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  });
  const fetch = t.mock.method(globalThis, "fetch", async (url: RequestInfo | URL, init?: RequestInit) => {
    assert.equal(String(url), "https://speech.example/api/v1/freereader/speech");
    assert.equal(new Headers(init?.headers).get("Authorization"), "Bearer service-token");
    assert.equal(new Headers(init?.headers).get("X-FreeReader-Demo-Token"), "demo-secret");
    assert.equal(new Headers(init?.headers).get("X-FreeReader-User-Token"), null);
    assert.deepEqual(JSON.parse(String(init?.body)), {
      text: "Bonjour l'ami", speed: 1, detect_language: true, steps: 12, quality: "enhanced",
    });
    return new Response(new Uint8Array([1, 2, 3]), {
      headers: { "Content-Type": "audio/mp4", "X-TTS-Language": "fr", "X-TTS-Model": "supertonic-3-fp32" },
    });
  });

  const response = await POST(new Request("http://localhost/api/demo-tts", {
    method: "POST", headers: { "Content-Type": "application/json", "X-FreeReader-Demo-Token": "forged" },
    body: JSON.stringify({ text: "Bonjour l'ami", quality: "standard", voice: "M3" }),
  }));
  assert.equal(response.status, 200);
  assert.equal(response.headers.get("X-TTS-Language"), "fr");
  assert.deepEqual(new Uint8Array(await response.arrayBuffer()), new Uint8Array([1, 2, 3]));
  assert.equal(fetch.mock.callCount(), 1);

  const tooLong = await POST(new Request("http://localhost/api/demo-tts", {
    method: "POST", body: JSON.stringify({ text: "a".repeat(801) }),
  }));
  assert.equal(tooLong.status, 413);
  assert.equal(fetch.mock.callCount(), 1);
});

test("landing demo fails closed without a configured demo credential", async (t) => {
  const old = process.env.FREEREADER_DEMO_API_TOKEN;
  delete process.env.FREEREADER_DEMO_API_TOKEN;
  t.after(() => { if (old === undefined) delete process.env.FREEREADER_DEMO_API_TOKEN; else process.env.FREEREADER_DEMO_API_TOKEN = old; });
  const response = await POST(new Request("http://localhost/api/demo-tts", {
    method: "POST", body: JSON.stringify({ text: "Hello reader." }),
  }));
  assert.equal(response.status, 503);
});
