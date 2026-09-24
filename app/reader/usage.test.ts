import assert from "node:assert/strict";
import test from "node:test";
import { formatRemaining } from "./usage";

test("formats remaining narration as hours and minutes", () => {
  assert.equal(formatRemaining(3600), "1 hr");
  assert.equal(formatRemaining(3600 + 5 * 60), "1 hr 5 min");
  assert.equal(formatRemaining(48 * 60), "48 min");
  assert.equal(formatRemaining(0), "0 min");
  assert.equal(formatRemaining(-30), "0 min");
});
