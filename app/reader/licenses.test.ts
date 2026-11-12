import assert from "node:assert/strict";
import { afterEach, test } from "node:test";
import { forgetPendingLicense, pendingLicense, redeemLicense, rememberPendingLicense } from "./licenses";

const originalFetch = globalThis.fetch;
const originalLocal = Object.getOwnPropertyDescriptor(globalThis, "localStorage");
const originalSession = Object.getOwnPropertyDescriptor(globalThis, "sessionStorage");

function storage() {
  const values = new Map<string, string>();
  return {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => { values.set(key, value); },
    removeItem: (key: string) => { values.delete(key); },
    clear: () => values.clear(),
  };
}

afterEach(() => {
  globalThis.fetch = originalFetch;
  if (originalLocal) Object.defineProperty(globalThis, "localStorage", originalLocal);
  else Reflect.deleteProperty(globalThis, "localStorage");
  if (originalSession) Object.defineProperty(globalThis, "sessionStorage", originalSession);
  else Reflect.deleteProperty(globalThis, "sessionStorage");
});

test("a license link survives email confirmation in a different tab, without claiming a code", () => {
  const local = storage();
  Object.defineProperty(globalThis, "localStorage", { configurable: true, value: local });
  Object.defineProperty(globalThis, "sessionStorage", { configurable: true, value: storage() });
  rememberPendingLicense("AB12CD34");
  Object.defineProperty(globalThis, "sessionStorage", { configurable: true, value: storage() });
  assert.equal(pendingLicense(), "AB12CD34");
  forgetPendingLicense();
  assert.equal(pendingLicense(), null);
});

test("redemption sends the code only with an account bearer token and surfaces used codes", async () => {
  globalThis.fetch = async (_url, init) => {
    assert.equal((init?.headers as Record<string, string>).Authorization, "Bearer confirmed-account-token");
    assert.deepEqual(JSON.parse(init?.body as string), { code: "AB12CD34" });
    return Response.json({ error: "already_redeemed" }, { status: 409 });
  };
  await assert.rejects(redeemLicense("confirmed-account-token", "AB12CD34"), /already been used/);
});
