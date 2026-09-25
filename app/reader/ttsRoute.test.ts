import assert from "node:assert/strict";
import test from "node:test";
import { POST } from "../api/tts/route";

test("landing speech requests let the backend select a voice after detecting language", async (t) => {
  const originalToken = process.env.FREEREADER_TTS_API_TOKEN;
  const originalBackend = process.env.KOKO_BACKEND_URL;
  process.env.FREEREADER_TTS_API_TOKEN = "test-token";
  process.env.KOKO_BACKEND_URL = "https://speech.example";
  t.after(() => {
    if (originalToken === undefined) delete process.env.FREEREADER_TTS_API_TOKEN;
    else process.env.FREEREADER_TTS_API_TOKEN = originalToken;
    if (originalBackend === undefined) delete process.env.KOKO_BACKEND_URL;
    else process.env.KOKO_BACKEND_URL = originalBackend;
  });

  const fetch = t.mock.method(globalThis, "fetch", async (_input: RequestInfo | URL, init?: RequestInit) => {
    assert.deepEqual(JSON.parse(String(init?.body)), {
      text: "Bonjour l'ami",
      speed: 1,
      detect_language: true,
      steps: 12,
    });
    return new Response(new Uint8Array([1]), {
      headers: {
        "Content-Type": "audio/mp4",
        "X-TTS-Model": "supertonic-3-fp32",
        "X-TTS-Language": "fr",
      },
    });
  });
  const request = new Request("http://localhost/api/tts", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      text: "Bonjour l'ami",
      speed: 1,
      detectLanguage: true,
      voice: "M3",
      steps: 12,
    }),
  });

  const response = await POST(request);
  assert.equal(response.status, 200);
  assert.equal(response.headers.get("X-TTS-Language"), "fr");
  assert.equal(fetch.mock.callCount(), 1);
});

test("English narration forwards the selected Kokoro voice", async (t) => {
  const originalToken = process.env.FREEREADER_TTS_API_TOKEN;
  const originalBackend = process.env.KOKO_BACKEND_URL;
  process.env.FREEREADER_TTS_API_TOKEN = "test-token";
  process.env.KOKO_BACKEND_URL = "https://speech.example";
  t.after(() => {
    if (originalToken === undefined) delete process.env.FREEREADER_TTS_API_TOKEN;
    else process.env.FREEREADER_TTS_API_TOKEN = originalToken;
    if (originalBackend === undefined) delete process.env.KOKO_BACKEND_URL;
    else process.env.KOKO_BACKEND_URL = originalBackend;
  });
  const fetch = t.mock.method(globalThis, "fetch", async (_input: RequestInfo | URL, init?: RequestInit) => {
    assert.deepEqual(JSON.parse(String(init?.body)), {
      text: "A creator voice preview.",
      speed: 1.1,
      voice: "af_bella",
      steps: 12,
    });
    return new Response(new Uint8Array([1]), { headers: { "Content-Type": "audio/mp4" } });
  });
  const response = await POST(new Request("http://localhost/api/tts", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      text: "A creator voice preview.",
      speed: 1.1,
      language: "en",
      voice: "af_bella",
      steps: 12,
    }),
  }));

  assert.equal(response.status, 200);
  assert.equal(fetch.mock.callCount(), 1);
});

test("English Supertonic requests tell the backend which model to use", async (t) => {
  const originalToken = process.env.FREEREADER_TTS_API_TOKEN;
  process.env.FREEREADER_TTS_API_TOKEN = "test-token";
  t.after(() => {
    if (originalToken === undefined) delete process.env.FREEREADER_TTS_API_TOKEN;
    else process.env.FREEREADER_TTS_API_TOKEN = originalToken;
  });
  const fetch = t.mock.method(globalThis, "fetch", async (_input: RequestInfo | URL, init?: RequestInit) => {
    assert.deepEqual(JSON.parse(String(init?.body)), {
      texts: ["A creator voice preview."], speed: 1.1, voice: "F1", language: "en", engine: "supertonic", steps: 12,
    });
    return new Response(new Uint8Array([1]), { headers: { "Content-Type": "audio/mp4" } });
  });
  const response = await POST(new Request("http://localhost/api/tts", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ texts: ["A creator voice preview."], speed: 1.1, language: "en", engine: "supertonic", voice: "F1", steps: 12 }),
  }));
  assert.equal(response.status, 200);
  assert.equal(fetch.mock.callCount(), 1);
});
