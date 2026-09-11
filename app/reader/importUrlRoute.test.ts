import assert from "node:assert/strict";
import test, { beforeEach, afterEach } from "node:test";
import { POST } from "../api/import-url/route";

const request = (url: unknown = "https://example.com/article") => new Request("http://localhost/api/import-url", {
  method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ url }),
});
let originalToken: string | undefined;
beforeEach(() => { originalToken = process.env.PARRYT_API_TOKEN; });
afterEach(() => {
  if (originalToken === undefined) delete process.env.PARRYT_API_TOKEN;
  else process.env.PARRYT_API_TOKEN = originalToken;
});

test("article adapter validates URLs and reports missing configuration", async (t) => {
  process.env.PARRYT_API_TOKEN = "";
  const fetch = t.mock.method(globalThis, "fetch", async () => { throw new Error("Should not fetch"); });
  for (const url of [null, "invalid", "file:///test", "https://user:password@example.com"]) {
    assert.equal((await POST(request(url))).status, 400);
  }
  const response = await POST(request());
  assert.equal(response.status, 503);
  assert.equal((await response.json()).error_category, "configuration");
  assert.equal(fetch.mock.callCount(), 0);
});

test("article adapter validates successful backend payloads and non-JSON errors", async (t) => {
  process.env.PARRYT_API_TOKEN = "test-token";
  for (const entry of [
    { payload: { text: "Readable article text.", title: "Article", source_url: "https://example.com/article" }, status: 200, expected: 200 },
    { payload: { text: "   " }, status: 200, expected: 422 },
    { payload: { text: 42 }, status: 200, expected: 502 },
    { payload: null, status: 200, expected: 502 },
    { payload: { error: "subscription_required" }, status: 422, expected: 422 },
  ]) {
    const fetch = t.mock.method(globalThis, "fetch", async (_input: RequestInfo | URL, init?: RequestInit) => {
      assert.equal(new Headers(init?.headers).get("Authorization"), "Bearer test-token");
      assert.deepEqual(JSON.parse(String(init?.body)), { url: "https://example.com/article" });
      return Response.json(entry.payload, { status: entry.status });
    });
    const response = await POST(request());
    assert.equal(response.status, entry.expected);
    if (entry.status === 422) assert.equal((await response.json()).error_category, "restricted");
    fetch.mock.restore();
  }
  for (const status of [200, 502]) {
    const fetch = t.mock.method(globalThis, "fetch", async () => new Response("<html>Bad gateway</html>", { status }));
    const response = await POST(request());
    assert.equal(response.status, 502);
    assert.equal((await response.json()).error_category, "invalid_response");
    fetch.mock.restore();
  }
});

test("article adapter distinguishes backend timeouts and network failures", async (t) => {
  process.env.PARRYT_API_TOKEN = "test-token";
  for (const name of ["TimeoutError", "TypeError"]) {
    const fetch = t.mock.method(globalThis, "fetch", async () => { throw new DOMException("Request failed", name); });
    const response = await POST(request());
    assert.equal(response.status, name === "TimeoutError" ? 504 : 502);
    fetch.mock.restore();
  }
});
