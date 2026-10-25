import assert from "node:assert/strict";
import test from "node:test";
import { POST } from "../api/public-phonon-tts/route";
import { RemoteSpeechClient } from "./remoteSpeech";
import { PUBLIC_PARKER_VOICE } from "./voices";

test("public Parker voice uses the server credential and signed-in reader without a client-selected embedding", async (t) => {
  const previousToken = process.env.FREEREADER_TTS_API_TOKEN;
  const previousBackend = process.env.KOKO_BACKEND_URL;
  process.env.FREEREADER_TTS_API_TOKEN = "server-token";
  process.env.KOKO_BACKEND_URL = "https://backend.example/";
  t.after(() => {
    if (previousToken === undefined) delete process.env.FREEREADER_TTS_API_TOKEN;
    else process.env.FREEREADER_TTS_API_TOKEN = previousToken;
    if (previousBackend === undefined) delete process.env.KOKO_BACKEND_URL;
    else process.env.KOKO_BACKEND_URL = previousBackend;
  });
  const fetch = t.mock.method(globalThis, "fetch", async (input: RequestInfo | URL, init?: RequestInit) => {
    assert.equal(String(input), "https://backend.example/api/v1/freereader/phonon/public/speech");
    assert.equal(new Headers(init?.headers).get("Authorization"), "Bearer server-token");
    assert.equal(new Headers(init?.headers).get("X-FreeReader-User-Token"), "reader-token");
    assert.deepEqual(JSON.parse(String(init?.body)), { texts: ["Welcome."], speed: 1 });
    return new Response(new Uint8Array([1, 2, 3]), { headers: {
      "Content-Type": "audio/mp4", "X-Audio-Duration": "2", "X-TTS-Model": "phonon-31m-en",
    } });
  });
  const response = await POST(new Request("http://localhost/api/public-phonon-tts", { method: "POST",
    body: JSON.stringify({ texts: ["Welcome."], speed: 1 }), headers: { "Content-Type": "application/json", "X-FreeReader-User-Token": "reader-token" } }));
  assert.equal(response.status, 200);
  assert.equal(response.headers.get("X-TTS-Model"), "phonon-31m-en");
  assert.deepEqual([...new Uint8Array(await response.arrayBuffer())], [1, 2, 3]);
  assert.equal(fetch.mock.callCount(), 1);
  const anonymous = await POST(new Request("http://localhost/api/public-phonon-tts", { method: "POST",
    body: JSON.stringify({ texts: ["Welcome."], speed: 1 }) }));
  assert.equal(anonymous.status, 401);
  assert.equal(fetch.mock.callCount(), 1);
  const rejected = await POST(new Request("http://localhost/api/public-phonon-tts", { method: "POST",
    body: JSON.stringify({ texts: ["Welcome."], speed: 1, voice_id: "private-voice" }) }));
  assert.equal(rejected.status, 400);
  assert.equal(fetch.mock.callCount(), 1);
});

test("Parker's English voice requires a session before requesting audio", async (t) => {
  const fetch = t.mock.method(globalThis, "fetch", async () => { throw new Error("No request expected"); });
  const client = new RemoteSpeechClient();
  await assert.rejects(client.synthesizeBatch([{ text: "Hello, readers.", isHeading: false }], 1, undefined,
    { language: "en", voice: PUBLIC_PARKER_VOICE, steps: 12 }), /sign_in_required/);
  assert.equal(fetch.mock.callCount(), 0);
});
