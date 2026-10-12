import assert from "node:assert/strict";
import { afterEach, test } from "node:test";
import { requestSpeech } from "../reader/speechRequest";

const fetch = globalThis.fetch;
afterEach(() => { globalThis.fetch = fetch; });

test("EDU retries only explicit capacity responses and preserves the actor's request", async () => {
  let calls = 0;
  globalThis.fetch = async (_input, init) => {
    assert.equal(new Headers(init?.headers).get("Authorization"), "Bearer actor-token");
    return ++calls < 3 ? new Response("busy", { status: 503, headers: { "Retry-After": ".001" } }) : new Response("audio");
  };
  const result = await requestSpeech("/api/edu/assignments/id/documents/version/speech", { headers: { Authorization: "Bearer actor-token" } });
  assert.equal(await result.text(), "audio");
  assert.equal(calls, 3);
});

test("EDU never retries failed authentication or waits after cancellation", async () => {
  let calls = 0;
  globalThis.fetch = async () => { calls += 1; return new Response("unauthorized", { status: 401 }); };
  assert.equal((await requestSpeech("/api/edu/speech", {})).status, 401);
  assert.equal(calls, 1);
  const controller = new AbortController();
  globalThis.fetch = async () => { calls += 1; return new Response("busy", { status: 503, headers: { "Retry-After": "1" } }); };
  const task = requestSpeech("/api/edu/speech", { signal: controller.signal }, () => controller.abort());
  await assert.rejects(task, { name: "AbortError" });
  assert.equal(calls, 2);
});
