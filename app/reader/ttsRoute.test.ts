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
    headers: { "Content-Type": "application/json", "X-FreeReader-User-Token": "reader-token" },
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
    headers: { "Content-Type": "application/json", "X-FreeReader-User-Token": "reader-token" },
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
    headers: { "Content-Type": "application/json", "X-FreeReader-User-Token": "reader-token" },
    body: JSON.stringify({ texts: ["A creator voice preview."], speed: 1.1, language: "en", engine: "supertonic", voice: "F1", steps: 12 }),
  }));
  assert.equal(response.status, 200);
  assert.equal(fetch.mock.callCount(), 1);
});

test("all signed-in requests use the same audio quality and anonymous requests are rejected", async (t) => {
  const originalToken = process.env.FREEREADER_TTS_API_TOKEN;
  process.env.FREEREADER_TTS_API_TOKEN = "test-token";
  t.after(() => {
    if (originalToken === undefined) delete process.env.FREEREADER_TTS_API_TOKEN;
    else process.env.FREEREADER_TTS_API_TOKEN = originalToken;
  });
  const bodies: unknown[] = [];
  t.mock.method(globalThis, "fetch", async (_input: RequestInfo | URL, init?: RequestInit) => {
    bodies.push(JSON.parse(String(init?.body)));
    assert.equal(new Headers(init?.headers).get("X-FreeReader-User-Token"), bodies.length === 1 ? "subscriber-token" : "reader-token");
    return new Response(new Uint8Array([1]), { headers: { "Content-Type": "audio/mp4" } });
  });

  const enhanced = await POST(new Request("http://localhost/api/tts", {
    method: "POST", headers: { "Content-Type": "application/json", "X-FreeReader-User-Token": "subscriber-token" },
    body: JSON.stringify({ text: "Hello reader.", speed: 1, voice: "af_heart", quality: "enhanced" }),
  }));
  const standard = await POST(new Request("http://localhost/api/tts", {
    method: "POST", headers: { "Content-Type": "application/json", "X-FreeReader-User-Token": "reader-token" },
    body: JSON.stringify({ text: "Hello reader.", speed: 1, voice: "af_heart", quality: "standard" }),
  }));

  assert.equal(enhanced.status, 200);
  assert.equal(standard.status, 200);
  assert.ok(!("quality" in (bodies[0] as Record<string, unknown>)));
  assert.ok(!("quality" in (bodies[1] as Record<string, unknown>)));
  const anonymous = await POST(new Request("http://localhost/api/tts", {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ text: "Hello reader.", speed: 1, quality: "enhanced" }),
  }));
  assert.equal(anonymous.status, 401);
  assert.equal(bodies.length, 2);
});

test("reader word timings request preserves the audio-and-timings archive", async (t) => {
  const originalToken = process.env.FREEREADER_TTS_API_TOKEN;
  process.env.FREEREADER_TTS_API_TOKEN = "test-token";
  t.after(() => {
    if (originalToken === undefined) delete process.env.FREEREADER_TTS_API_TOKEN;
    else process.env.FREEREADER_TTS_API_TOKEN = originalToken;
  });
  t.mock.method(globalThis, "fetch", async (_input: RequestInfo | URL, init?: RequestInit) => {
    assert.deepEqual(JSON.parse(String(init?.body)), {
      texts: ["Hello reader."], speed: 1, voice: "af_heart", word_timings: true,
    });
    return new Response(new Uint8Array([1, 2, 3]), {
      headers: { "Content-Type": "application/zip", "X-Audio-Durations": "2.000000" },
    });
  });
  const response = await POST(new Request("http://localhost/api/tts", {
    method: "POST", headers: { "Content-Type": "application/json", "X-FreeReader-User-Token": "reader-token" },
    body: JSON.stringify({ texts: ["Hello reader."], speed: 1, voice: "af_heart", word_timings: true }),
  }));
  assert.equal(response.status, 200);
  assert.equal(response.headers.get("X-Audio-Durations"), "2.000000");
  assert.deepEqual(new Uint8Array(await response.arrayBuffer()), new Uint8Array([1, 2, 3]));
});
