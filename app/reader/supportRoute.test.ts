import assert from "node:assert/strict";
import test from "node:test";
import { POST } from "../api/support-requests/route";

test("support proxy forwards only the message and email with the server token", async (t) => {
  const oldToken = process.env.FREEREADER_TTS_API_TOKEN;
  const oldBackend = process.env.KOKO_BACKEND_URL;
  process.env.FREEREADER_TTS_API_TOKEN = "test-server-token";
  process.env.KOKO_BACKEND_URL = "https://backend.example";
  t.after(() => {
    if (oldToken === undefined) delete process.env.FREEREADER_TTS_API_TOKEN;
    else process.env.FREEREADER_TTS_API_TOKEN = oldToken;
    if (oldBackend === undefined) delete process.env.KOKO_BACKEND_URL;
    else process.env.KOKO_BACKEND_URL = oldBackend;
  });
  const fetch = t.mock.method(globalThis, "fetch", async (input: RequestInfo | URL, init?: RequestInit) => {
    assert.equal(String(input), "https://backend.example/api/v1/freereader/support-requests");
    assert.equal(new Headers(init?.headers).get("Authorization"), "Bearer test-server-token");
    assert.deepEqual(JSON.parse(String(init?.body)), {
      email: "reader@example.com", message: "I need help with this book.",
    });
    return Response.json({ received: true }, { status: 201 });
  });
  const response = await POST(new Request("http://localhost/api/support-requests", {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email: "reader@example.com", message: "I need help with this book.", extra: "discard me" }),
  }));
  assert.equal(response.status, 201);
  assert.deepEqual(await response.json(), { received: true });
  assert.equal(fetch.mock.callCount(), 1);
});

test("support proxy rejects malformed input before contacting the backend", async (t) => {
  const fetch = t.mock.method(globalThis, "fetch", async () => { throw new Error("Unexpected request"); });
  const response = await POST(new Request("http://localhost/api/support-requests", {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email: null, message: "A message" }),
  }));
  assert.equal(response.status, 400);
  assert.equal(fetch.mock.callCount(), 0);
});
