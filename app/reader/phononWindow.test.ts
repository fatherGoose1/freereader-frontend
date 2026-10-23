import assert from "node:assert/strict";
import test from "node:test";
import { clampPhononWindow } from "./phononAudio";

test("the fixed ten-second window stays inside the visible recording page", () => {
  assert.equal(clampPhononWindow(-2, 0, 60), 0);
  assert.equal(clampPhononWindow(55, 0, 60), 50);
  assert.equal(clampPhononWindow(9, 15, 60), 15);
  assert.equal(clampPhononWindow(70, 15, 60), 65);
  assert.equal(clampPhononWindow(2, 0, 11), 1);
});
