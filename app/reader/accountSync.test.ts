import assert from "node:assert/strict";
import test from "node:test";
import { decodeCloudDocument, encodeCloudDocument } from "./accountSync";
import type { LibraryBook } from "./types";

test("cloud documents gzip content and keep progress in its separate record", async () => {
  const now = new Date().toISOString();
  const book: LibraryBook = {
    id: "3a20e289-d97a-46d7-afd2-200e5e1021a3",
    title: "Synced Book",
    author: "Reader",
    language: "en",
    format: "epub",
    sourceName: "synced.epub",
    size: 1024,
    createdAt: now,
    updatedAt: now,
    chapters: [{ title: "Chapter 1", startBlockIndex: 0 }],
    blocks: [{ index: 0, text: "Repeated readable text. ".repeat(100), chapterIndex: 0, isHeading: false }],
    position: { blockIndex: 0, offsetSeconds: 12, speed: 1.25, updatedAt: now },
    cover: new Blob(["cover bytes"], { type: "image/jpeg" }),
  };

  const encoded = await encodeCloudDocument(book);
  assert.ok(encoded.byteLength < book.blocks[0].text.length);
  const decoded = await decodeCloudDocument(new Blob([encoded]));
  assert.deepEqual({ ...decoded, cover: undefined, position: undefined }, { ...book, cover: undefined, position: undefined });
  assert.deepEqual(decoded.position, { blockIndex: 0, offsetSeconds: 0, speed: 1 });
  assert.equal(decoded.cover?.type, "image/jpeg");
  assert.equal(await decoded.cover?.text(), "cover bytes");
});
