import assert from "node:assert/strict";
import { test } from "node:test";
import { safeEduReturn } from "./security";
import { assertSessionActor } from "./client";

test("OAuth return paths cannot redirect to an external origin or a consumer route", () => {
  const origin = "https://edu.freereader.io";
  for (const unsafe of ["//evil.test", "/\t/evil.test", "/\n/evil.test", "/\\evil.test", "https://evil.test", "/auth/callback?code=secret", "/reader", "/edu/../reader"]) {
    assert.equal(safeEduReturn(unsafe, origin, "/"), "/");
  }
  const assignment = "/assignments/00000000-0000-4000-8000-000000000001";
  assert.equal(safeEduReturn(`${assignment}?code=secret`, origin, "/"), assignment);
  assert.equal(safeEduReturn(`/edu${assignment}`, "https://preview.test", "/edu/"), `/edu${assignment}`);
  assert.equal(safeEduReturn(assignment, "https://preview.test", "/edu/"), "/edu/");
});

test("a pending operation cannot use another user's session or a mismatched cached user profile", () => {
  const token = (sub: string) => `header.${Buffer.from(JSON.stringify({ sub })).toString("base64url")}.signature`;
  assert.doesNotThrow(() => assertSessionActor({ user: { id: "alice" }, access_token: token("alice") }, "alice"));
  assert.throws(() => assertSessionActor({ user: { id: "bob" }, access_token: token("bob") }, "alice"), /account changed/);
  assert.throws(() => assertSessionActor({ user: { id: "alice" }, access_token: token("bob") }, "alice"), /account changed/);
  assert.throws(() => assertSessionActor(null, "alice"), /account changed/);
});
