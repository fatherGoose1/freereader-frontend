import assert from "node:assert/strict";
import { AsyncLocalStorage } from "node:async_hooks";
import { afterEach, test } from "node:test";
import type { WorkStore } from "next/dist/server/app-render/work-async-storage.external";
import type { RequestStore } from "next/dist/server/app-render/work-unit-async-storage.external";
import { EDU_ACCESS_COOKIE, eduAccessToken } from "./access";

const originalFetch = globalThis.fetch;
const originalEnabled = process.env.EDU_ENABLED;
const originalBackend = process.env.KOKO_BACKEND_URL;
const originalPassword = process.env.EDU_ACCESS_PASSWORD;
afterEach(() => {
  globalThis.fetch = originalFetch;
  if (originalEnabled === undefined) delete process.env.EDU_ENABLED; else process.env.EDU_ENABLED = originalEnabled;
  if (originalBackend === undefined) delete process.env.KOKO_BACKEND_URL; else process.env.KOKO_BACKEND_URL = originalBackend;
  if (originalPassword === undefined) delete process.env.EDU_ACCESS_PASSWORD; else process.env.EDU_ACCESS_PASSWORD = originalPassword;
});
const params = (path: string[]) => ({ params: Promise.resolve({ path }) });
// Next supplies AsyncLocalStorage and request cookies at runtime. Load its
// route after installing the Node equivalent so the direct route tests model
// the real request scope instead of creating Next's unavailable-store shim.
const modules = (async () => {
  (globalThis as typeof globalThis & { AsyncLocalStorage?: typeof AsyncLocalStorage }).AsyncLocalStorage = AsyncLocalStorage;
  const [route, work, unit] = await Promise.all([
    import("../api/edu/[...path]/route"),
    import("next/dist/server/app-render/work-async-storage.external"),
    import("next/dist/server/app-render/work-unit-async-storage.external"),
  ]);
  return { route, work, unit };
})();
async function invoke(method: "GET" | "POST", request: Request, context: ReturnType<typeof params>, gated = true) {
  const { route, work, unit } = await modules;
  const call = () => route[method](request, context);
  if (!gated) return call();
  const cookie = { get: (name: string) => name === EDU_ACCESS_COOKIE ? { value: eduAccessToken("test-edu-password") } : undefined };
  const store = { type: "request", phase: "render", cookies: cookie, mutableCookies: cookie, userspaceMutableCookies: cookie } as unknown as RequestStore;
  return work.workAsyncStorage.run({ route: "/api/edu/[...path]" } as WorkStore,
    () => unit.workUnitAsyncStorage.run(store, call));
}

test("EDU API is disabled by default and cannot touch the consumer backend", async () => {
  delete process.env.EDU_ENABLED;
  globalThis.fetch = async () => { throw new Error("Unexpected upstream request"); };
  const response = await invoke("GET", new Request("https://www.freereader.io/api/edu/session"), params(["session"]), false);
  assert.equal(response.status, 404);
});

test("EDU proxy authenticates, rejects traversal, and bounds streaming request bodies", async () => {
  process.env.EDU_ENABLED = "true"; process.env.EDU_ACCESS_PASSWORD = "test-edu-password";
  globalThis.fetch = async () => { throw new Error("Unexpected upstream request"); };
  assert.equal((await invoke("GET", new Request("http://localhost/api/edu/session"), params(["session"]))).status, 401);
  const headers = { Authorization: "Bearer test-token", "Content-Type": "application/json" };
  assert.equal((await invoke("GET", new Request("http://localhost/api/edu/session", { headers }), params(["..", "sync"]))).status, 400);
  const response = await invoke("POST", new Request("http://localhost/api/edu/session", { method: "POST", headers, body: "x".repeat(128 * 1024 + 1) }), params(["schools", "id", "telemetry"]));
  assert.equal(response.status, 413);
});

test("EDU speech proxy preserves audio metadata and user identity without forwarding consumer context", async () => {
  process.env.EDU_ENABLED = "true"; process.env.EDU_ACCESS_PASSWORD = "test-edu-password"; process.env.KOKO_BACKEND_URL = "https://backend.test";
  globalThis.fetch = async (input, init) => {
    assert.equal(String(input), "https://backend.test/api/v1/freereader/edu/assignments/id/documents/version/speech");
    assert.equal(new Headers(init?.headers).get("Authorization"), "Bearer student-token");
    assert.equal(new Headers(init?.headers).get("X-FreeReader-User-Token"), null);
    return new Response(new Uint8Array([1, 2, 3]), { headers: { "Content-Type": "audio/mp4", "X-Audio-Duration": "3", "X-Speech-Cache": "hit" } });
  };
  const response = await invoke("POST", new Request("http://localhost/api/edu/speech", { method: "POST", headers: { Authorization: "Bearer student-token" }, body: "{}" }), params(["assignments", "id", "documents", "version", "speech"]));
  assert.equal(response.headers.get("X-Audio-Duration"), "3");
  assert.equal(response.headers.get("X-Speech-Cache"), "hit");
  assert.equal(response.headers.get("Cache-Control"), "private, no-store");
  assert.deepEqual([...new Uint8Array(await response.arrayBuffer())], [1, 2, 3]);
});
