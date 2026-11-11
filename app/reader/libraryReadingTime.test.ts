import assert from "node:assert/strict";
import test from "node:test";
import { libraryTimeRemaining } from "./libraryReadingTime";

test("library time remaining shows hours and minutes based on unread words", () => {
  assert.equal(libraryTimeRemaining(212_250, 0), "23h 35m left");
  assert.equal(libraryTimeRemaining(18_000, 0.5), "1h left");
  assert.equal(libraryTimeRemaining(300, 0.5), "1m left");
  assert.equal(libraryTimeRemaining(18_000, 0.5, 2), "30m left");
  assert.equal(libraryTimeRemaining(300, 1), "0m left");
});
