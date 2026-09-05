import assert from "node:assert/strict";
import test from "node:test";
import { isLikelyHeading } from "./parsingText.ts";

test("matches the iOS plain-text heading rules", () => {
  assert.equal(isLikelyHeading("II"), true);
  assert.equal(isLikelyHeading("IV:"), true);
  assert.equal(isLikelyHeading("CHAPTER ONE"), true);
  assert.equal(isLikelyHeading("Section 4"), true);
  assert.equal(isLikelyHeading("A SHORT HEADING"), true);
});

test("does not turn lowercase Roman-looking words into sections", () => {
  assert.equal(isLikelyHeading("iv"), false);
  assert.equal(isLikelyHeading("mix"), false);
  assert.equal(isLikelyHeading("civil"), false);
});

test("does not treat uncased scripts as uppercase headings", () => {
  assert.equal(isLikelyHeading("这是正文"), false);
});
