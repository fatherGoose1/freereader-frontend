import assert from "node:assert/strict";
import { afterEach, test } from "node:test";
import { GET, POST } from "../api/reader-licenses/route";

const originalFetch = globalThis.fetch;
const originalBackend = process.env.KOKO_BACKEND_URL;

afterEach(() => {
  globalThis.fetch = originalFetch;
  if (originalBackend === undefined) delete process.env.KOKO_BACKEND_URL;
  else process.env.KOKO_BACKEND_URL = originalBackend;
});

test("local license listing forwards the account token server-side without browser CORS", async () => {
  process.env.KOKO_BACKEND_URL = "https://backend.example";
  globalThis.fetch = async (url, options) => {
    assert.equal(url, "https://backend.example/api/v1/freereader/licenses");
    assert.equal(options?.method, "GET");
    assert.equal((options?.headers as Record<string, string>).Authorization, "Bearer signed-in-user");
    return Response.json({ total: 2, available: 2, licenses: [] });
  };
  const response = await GET(new Request("http://localhost:3001/api/reader-licenses", {
    headers: { Authorization: "Bearer signed-in-user" },
  }));
  assert.equal(response.status, 200);
  assert.equal(response.headers.get("cache-control"), "private, no-store");
  assert.equal((await response.json()).available, 2);
});

test("the proxy rejects unsigned redemption before contacting the backend", async () => {
  globalThis.fetch = async () => { throw new Error("backend should not be called"); };
  const response = await POST(new Request("http://localhost:3001/api/reader-licenses", {
    method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ code: "AB12CD34" }),
  }));
  assert.equal(response.status, 401);
});

test("the proxy submits an uppercase code only with the signed-in account token", async () => {
  process.env.KOKO_BACKEND_URL = "https://backend.example";
  globalThis.fetch = async (url, options) => {
    assert.equal(url, "https://backend.example/api/v1/freereader/licenses/redeem");
    assert.equal((options?.headers as Record<string, string>).Authorization, "Bearer signed-in-user");
    assert.deepEqual(JSON.parse(options?.body as string), { code: "AB12CD34" });
    return Response.json({ plan: "gold_yearly" });
  };
  const response = await POST(new Request("http://localhost:3001/api/reader-licenses", {
    method: "POST", headers: { Authorization: "Bearer signed-in-user", "Content-Type": "application/json" },
    body: JSON.stringify({ code: "ab12cd34" }),
  }));
  assert.equal(response.status, 200);
});
