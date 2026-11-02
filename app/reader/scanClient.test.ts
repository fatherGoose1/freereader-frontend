import assert from "node:assert/strict";
import { afterEach, test } from "node:test";
import { uploadScanPages } from "./scanClient";

const originalFetch = globalThis.fetch;
afterEach(() => { globalThis.fetch = originalFetch; });

test("Safari upload failure retries the same page through the authenticated backend", async () => {
  const page = new Blob(["image bytes"], { type: "image/jpeg" });
  const messages: string[] = [];
  const calls: string[] = [];
  globalThis.fetch = async () => { throw new TypeError("Load failed"); };
  await uploadScanPages([page], { id: "scan-id", uploadUrls: ["https://storage.test/upload"] },
    (message) => messages.push(message), async (path, init) => {
      calls.push(path);
      assert.equal(init?.method, "PUT");
      assert.equal(init?.body, page);
      assert.equal(new Headers(init?.headers).get("Content-Type"), "image/jpeg");
      return {} as never;
    }, false);
  assert.deepEqual(calls, ["/scan-id/pages/0"]);
  assert.match(messages.at(-1)!, /through FreeReader/);
});

test("successful signed upload does not repeat the page on the backend", async () => {
  globalThis.fetch = async () => new Response("", { status: 200 });
  await uploadScanPages([new Blob(["image bytes"])], { id: "scan-id", uploadUrls: ["https://storage.test/upload"] },
    () => {}, async () => { throw new Error("Unexpected fallback"); }, true);
});
