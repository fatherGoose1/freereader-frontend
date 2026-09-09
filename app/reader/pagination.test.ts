import assert from "node:assert/strict";
import test from "node:test";
import { readingPageStarts } from "./pagination";
import type { TextBlock } from "./types";

function block(index: number, text: string, isHeading: boolean): TextBlock {
  return { index, text, chapterIndex: 0, isHeading };
}

test("keeps consecutive chapter headings with their body on one page", () => {
  const blocks = [
    block(0, "Chapter I", true),
    block(1, "Lucy Looks into a Wardrobe", true),
    block(2, "Once there were four children.", false),
    block(3, "Chapter II", true),
    block(4, "What Lucy Found There", true),
    block(5, "The next chapter begins.", false),
  ];

  assert.deepEqual(readingPageStarts(blocks, 900), [0, 3]);
});

test("still starts a new page for a heading after body text", () => {
  const blocks = [
    block(0, "Chapter I", true),
    block(1, "The chapter begins.", false),
    block(2, "A Later Section", true),
    block(3, "The section begins.", false),
  ];

  assert.deepEqual(readingPageStarts(blocks, 900), [0, 2]);
});
