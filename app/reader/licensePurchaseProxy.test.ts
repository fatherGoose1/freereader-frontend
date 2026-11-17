import assert from "node:assert/strict";
import { afterEach, test } from "node:test";
import { POST } from "../api/reader-licenses/[action]/route";

const originalFetch = globalThis.fetch;
const originalBackend = process.env.KOKO_BACKEND_URL;

afterEach(() => {
  globalThis.fetch = originalFetch;
  if (originalBackend === undefined) delete process.env.KOKO_BACKEND_URL;
  else process.env.KOKO_BACKEND_URL = originalBackend;
});

const context = (action: string) => ({ params: Promise.resolve({ action }) });

test("admin signup and license checkout require an account token", async () => {
  globalThis.fetch = async () => { throw new Error("Backend should not be contacted"); };
  for (const action of ["register", "quote", "checkout"]) {
    const response = await POST(new Request(`http://localhost/api/reader-licenses/${action}`, { method: "POST" }), context(action));
    assert.equal(response.status, 401);
  }
});

test("license checkout forwards only a bounded integer quantity for the signed-in admin", async () => {
  process.env.KOKO_BACKEND_URL = "https://backend.example";
  let calls = 0;
  globalThis.fetch = async (url, options) => {
    calls++;
    assert.equal(url, "https://backend.example/api/v1/freereader/licenses/checkout");
    assert.equal((options?.headers as Record<string, string>).Authorization, "Bearer admin-token");
    assert.deepEqual(JSON.parse(options?.body as string), { quantity: 3 });
    return Response.json({ url: "https://checkout.stripe.com/test" });
  };
  for (const quantity of [true, 0, 1001, 2.5, "3"]) {
    const response = await POST(new Request("http://localhost/api/reader-licenses/checkout", {
      method: "POST", headers: { Authorization: "Bearer admin-token" }, body: JSON.stringify({ quantity }),
    }), context("checkout"));
    assert.equal(response.status, 400);
  }
  const response = await POST(new Request("http://localhost/api/reader-licenses/checkout", {
    method: "POST", headers: { Authorization: "Bearer admin-token" }, body: JSON.stringify({ quantity: 3, price: 0 }),
  }), context("checkout"));
  assert.equal(response.status, 200);
  assert.equal(calls, 1);
});

test("admin registration reports a missing backend endpoint clearly", async () => {
  process.env.KOKO_BACKEND_URL = "https://backend.example";
  globalThis.fetch = async () => new Response("Not Found", { status: 404, headers: { "Content-Type": "text/html" } });
  const response = await POST(new Request("http://localhost/api/reader-licenses/register", {
    method: "POST", headers: { Authorization: "Bearer admin-token" },
  }), context("register"));
  assert.equal(response.status, 503);
  assert.deepEqual(await response.json(), { error: "admin_billing_unavailable" });
});
