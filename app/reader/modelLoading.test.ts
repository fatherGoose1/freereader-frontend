import assert from "node:assert/strict";
import test from "node:test";
import { loadModelSessions } from "./modelSessions";
import { downloadModel } from "./modelDownload";

test("downloads and initializes one model at a time, revoking each URL", async (t) => {
  const events: string[] = [];
  t.mock.method(URL, "createObjectURL", () => "blob:model");
  t.mock.method(URL, "revokeObjectURL", () => events.push("revoke"));
  const sessions = await loadModelSessions([["first", 1], ["second", 1]], async (path) => {
    events.push(`download ${path}`);
    return new Blob(["x"]);
  }, async (_, path) => {
    events.push(`initialize ${path}`);
    return { release: async () => {} };
  });
  assert.equal(sessions.length, 2);
  assert.deepEqual(events, ["download first", "initialize first", "revoke", "download second", "initialize second", "revoke"]);
});

test("releases partial sessions and all URLs before a provider retry", async (t) => {
  let released = 0;
  const revoke = t.mock.method(URL, "revokeObjectURL", () => {});
  await assert.rejects(loadModelSessions([["first", 1], ["second", 1]], async () => new Blob(["x"]),
    async (_, path) => {
      if (path === "second") throw new Error("Out of memory");
      return { release: async () => { released += 1; } };
    }), /Out of memory/);
  assert.equal(released, 1);
  assert.equal(revoke.mock.callCount(), 2);
});

test("rejects incomplete downloads and allows a fresh retry", async (t) => {
  const mock = t.mock.method(globalThis, "fetch", async () => new Response("x"));
  await assert.rejects(downloadModel("https://example.com/model", 2), /Incomplete/);
  mock.mock.mockImplementation(async () => new Response("xy"));
  assert.equal(await (await downloadModel("https://example.com/model", 2)).text(), "xy");
});

test("aborts a stalled network request with an actionable retry error", async (t) => {
  t.mock.timers.enable({ apis: ["setTimeout"] });
  let signal: AbortSignal | undefined;
  t.mock.method(globalThis, "fetch", (_: string, init: RequestInit) => new Promise<Response>((_, reject) => {
    signal = init.signal!;
    signal.addEventListener("abort", () => reject(signal!.reason));
  }));
  const result = assert.rejects(downloadModel("https://example.com/model", 2), /stalled.*retry/);
  t.mock.timers.tick(60_000);
  await result;
  assert.equal(signal?.aborted, true);
});

test("resets the inactivity deadline on received bytes, then aborts a stalled body", async (t) => {
  t.mock.timers.enable({ apis: ["setTimeout"] });
  let stream!: ReadableStreamDefaultController<Uint8Array>;
  const body = new ReadableStream<Uint8Array>({ start(controller) { stream = controller; } });
  t.mock.method(globalThis, "fetch", async (_: string, init: RequestInit) => {
    init.signal!.addEventListener("abort", () => stream.error(init.signal!.reason));
    return new Response(body);
  });
  let progressed!: () => void;
  const progress = new Promise<void>((resolve) => { progressed = resolve; });
  const result = assert.rejects(downloadModel("https://example.com/model", 2, () => progressed()), /stalled/);
  t.mock.timers.tick(30_000);
  stream.enqueue(new Uint8Array([1]));
  await progress;
  t.mock.timers.tick(30_000);
  assert.equal(body.locked, true);
  t.mock.timers.tick(30_000);
  await result;
});
