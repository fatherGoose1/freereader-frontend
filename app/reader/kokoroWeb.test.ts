import assert from "node:assert/strict";
import test from "node:test";
import { loadKokoroAsset, type KokoroAsset } from "./kokoroWebResources";
import { KokoroWebSpeechClient, type KokoroWebResponse } from "./kokoroWebSpeech";
import { loadMobileModelAsset, MOBILE_MODEL_CACHE } from "./mobileModelCache";

test("Kokoro resources are reused from persistent Cache Storage after reload", async (t) => {
  const originalCaches = globalThis.caches;
  const originalFetch = globalThis.fetch;
  let stored: Response | undefined;
  let fetches = 0;
  const cache = {
    match: async () => stored?.clone(),
    put: async (_request: RequestInfo | URL, response: Response) => { stored = response.clone(); },
    delete: async () => { stored = undefined; return true; },
  } as unknown as Cache;
  Object.defineProperty(globalThis, "caches", { configurable: true, value: { open: async () => cache } });
  globalThis.fetch = async () => { fetches += 1; return new Response(new Uint8Array([1, 2, 3, 4])); };
  t.after(() => {
    Object.defineProperty(globalThis, "caches", { configurable: true, value: originalCaches });
    globalThis.fetch = originalFetch;
  });

  const asset: KokoroAsset = { url: "https://example.test/model.onnx", path: "models/test/model.onnx", size: 4, label: "test" };
  assert.deepEqual(new Uint8Array(await loadKokoroAsset(asset)), new Uint8Array([1, 2, 3, 4]));
  assert.deepEqual(new Uint8Array(await loadKokoroAsset(asset)), new Uint8Array([1, 2, 3, 4]));
  assert.equal(fetches, 1);
});

test("mobile model resources are deduplicated and reused from their persistent cache", async (t) => {
  const originalCaches = globalThis.caches;
  const originalFetch = globalThis.fetch;
  const responses = new Map<string, Response>();
  let opened = "";
  let fetches = 0;
  const cache = {
    match: async (url: string) => responses.get(url)?.clone(),
    put: async (url: string, response: Response) => { responses.set(url, response.clone()); },
    delete: async (url: string) => responses.delete(url),
  } as unknown as Cache;
  Object.defineProperty(globalThis, "caches", { configurable: true, value: {
    open: async (name: string) => { opened = name; return cache; },
  } });
  globalThis.fetch = async () => { fetches += 1; return new Response(new Uint8Array([1, 2, 3, 4])); };
  t.after(() => {
    Object.defineProperty(globalThis, "caches", { configurable: true, value: originalCaches });
    globalThis.fetch = originalFetch;
  });

  const asset = { url: "https://example.test/mobile.onnx", path: "models/test/mobile.onnx", size: 4, label: "mobile" };
  const first = loadMobileModelAsset(asset);
  const duplicate = loadMobileModelAsset(asset);
  assert.equal(first, duplicate);
  assert.equal(await (await first).text(), String.fromCharCode(1, 2, 3, 4));
  assert.deepEqual(new Uint8Array(await (await loadMobileModelAsset(asset)).arrayBuffer()), new Uint8Array([1, 2, 3, 4]));
  assert.equal(opened, MOBILE_MODEL_CACHE);
  assert.equal(fetches, 1);
});

function fakeWorker() {
  let terminated = 0;
  const requests: unknown[] = [];
  const worker = {
    onmessage: null as ((event: MessageEvent<KokoroWebResponse>) => void) | null,
    onerror: null,
    onmessageerror: null,
    postMessage(request: unknown) { requests.push(request); },
    terminate() { terminated += 1; },
  } as unknown as Worker;
  return { worker, requests, get terminated() { return terminated; } };
}

test("Kokoro Web client sends plain text to its worker and returns WAV audio", async () => {
  const fake = fakeWorker();
  const client = new KokoroWebSpeechClient(() => fake.worker);
  const resultPromise = client.synthesize("A passage.", "af_heart", 1);
  await Promise.resolve();
  assert.deepEqual(fake.requests[0], { text: "A passage.", voice: "af_heart", speechSpeed: 1, isHeading: false, mobile: false });
  const audio = new ArrayBuffer(48);
  fake.worker.onmessage?.({ data: { kind: "result", audio, duration: 1, provider: "WASM", generationSeconds: 0.5 } } as MessageEvent<KokoroWebResponse>);
  const result = await resultPromise;
  assert.equal(result.blob.type, "audio/wav");
  assert.equal(result.provider, "WASM");
  client.stop();
});

test("Kokoro Web client cancels active and queued speech", async () => {
  const fake = fakeWorker();
  const client = new KokoroWebSpeechClient(() => fake.worker);
  const active = assert.rejects(client.synthesize("First", "af_heart", 1), /interrupted/);
  const queued = assert.rejects(client.synthesize("Second", "af_bella", 1), /cancelled/);
  await Promise.resolve();
  client.stop();
  await Promise.all([active, queued]);
  assert.equal(fake.terminated, 1);
});
