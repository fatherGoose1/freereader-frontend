import assert from "node:assert/strict";
import { afterEach, test } from "node:test";
import { authReturnPending, isAuthCallbackUrl, rememberAuthReturn } from "./authCallback";

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
  if (originalSession) Object.defineProperty(globalThis, "sessionStorage", originalSession);
  else Reflect.deleteProperty(globalThis, "sessionStorage");
});

test("only real auth returns count as callbacks", () => {
  assert.equal(isAuthCallbackUrl(new URL("https://www.freereader.io/?code=abc")), true);
  assert.equal(isAuthCallbackUrl(new URL("https://www.freereader.io/?token_hash=abc&type=email")), true);
  assert.equal(isAuthCallbackUrl(new URL("https://www.freereader.io/#access_token=abc&refresh_token=def")), true);
  assert.equal(isAuthCallbackUrl(new URL("https://www.freereader.io/#error=access_denied")), true);
  assert.equal(isAuthCallbackUrl(new URL("https://www.freereader.io/")), false);
  assert.equal(isAuthCallbackUrl(new URL("https://www.freereader.io/reader/audiobooks?redeem=AB12CD34")), false);
});

test("a root fallback can mark a recent auth return without reviving stale state", () => {
  Object.defineProperty(globalThis, "sessionStorage", { configurable: true, value: storage() });
  assert.equal(authReturnPending(), false);
  rememberAuthReturn();
  assert.equal(authReturnPending(), true);
  sessionStorage.setItem("freereader-auth-return", String(Date.now() - 6 * 60 * 1000));
  assert.equal(authReturnPending(), false);
  assert.equal(sessionStorage.getItem("freereader-auth-return"), null);
});