import assert from "node:assert/strict";
import { afterEach, test } from "node:test";
import { GET, POST } from "../api/edu/[...path]/route";

const originalFetch = globalThis.fetch;
const originalEnabled = process.env.EDU_ENABLED;
const originalBackend = process.env.KOKO_BACKEND_URL;
afterEach(() => {
  globalThis.fetch = originalFetch;
  if (originalEnabled === undefined) delete process.env.EDU_ENABLED; else process.env.EDU_ENABLED = originalEnabled;
  if (originalBackend === undefined) delete process.env.KOKO_BACKEND_URL; else process.env.KOKO_BACKEND_URL = originalBackend;
});
const params = (path: string[]) => ({ params: Promise.resolve({ path }) });

test("EDU API is disabled by default and cannot touch the consumer backend", async () => {
  delete process.env.EDU_ENABLED;
  globalThis.fetch = async () => { throw new Error("Unexpected upstream request"); };
  const response = await GET(new Request("https://www.freereader.io/api/edu/session"), params(["session"]));
  assert.equal(response.status, 404);
});

test("EDU proxy authenticates, rejects traversal, and bounds streaming request bodies", async () => {
  process.env.EDU_ENABLED = "true";
  globalThis.fetch = async () => { throw new Error("Unexpected upstream request"); };
  assert.equal((await GET(new Request("http://localhost/api/edu/session"), params(["session"]))).status, 401);
  const headers = { Authorization: "Bearer test-token", "Content-Type": "application/json" };
  assert.equal((await GET(new Request("http://localhost/api/edu/session", { headers }), params(["..", "sync"]))).status, 400);
  const response = await POST(new Request("http://localhost/api/edu/session", { method: "POST", headers, body: "x".repeat(128 * 1024 + 1) }), params(["schools", "id", "telemetry"]));
  assert.equal(response.status, 413);
});

test("EDU speech proxy preserves audio metadata and user identity without forwarding consumer context", async () => {
  process.env.EDU_ENABLED = "true"; process.env.KOKO_BACKEND_URL = "https://backend.test";
  globalThis.fetch = async (input, init) => {
    assert.equal(String(input), "https://backend.test/api/v1/freereader/edu/assignments/id/documents/version/speech");
    assert.equal(new Headers(init?.headers).get("Authorization"), "Bearer student-token");
    assert.equal(new Headers(init?.headers).get("X-FreeReader-User-Token"), null);
    return new Response(new Uint8Array([1, 2, 3]), { headers: { "Content-Type": "audio/mp4", "X-Audio-Duration": "3", "X-Speech-Cache": "hit" } });
  };
  const response = await POST(new Request("http://localhost/api/edu/speech", { method: "POST", headers: { Authorization: "Bearer student-token" }, body: "{}" }), params(["assignments", "id", "documents", "version", "speech"]));
  assert.equal(response.headers.get("X-Audio-Duration"), "3");
  assert.equal(response.headers.get("X-Speech-Cache"), "hit");
  assert.equal(response.headers.get("Cache-Control"), "private, no-store");
  assert.deepEqual([...new Uint8Array(await response.arrayBuffer())], [1, 2, 3]);
});
