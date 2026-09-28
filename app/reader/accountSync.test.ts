import assert from "node:assert/strict";
import test from "node:test";
import { decodeCloudDocument, encodeCloudDocument, synchronizeLibrary } from "./accountSync";
import { indexedDB as fakeIndexedDB } from "fake-indexeddb";
import { listBooks, saveBook } from "./storage";
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

test("sync uploads a guest book and its reading progress, then preserves newer local progress when downloading document edits", async (t) => {
  Object.defineProperty(globalThis, "indexedDB", { configurable: true, value: fakeIndexedDB });
  const id = crypto.randomUUID();
  const old = "2026-09-01T00:00:00.000Z";
  const newer = "2026-09-02T00:00:00.000Z";
  const latest = "2026-09-03T00:00:00.000Z";
  const book: LibraryBook = {
    id, title: "Guest book", format: "txt", sourceName: "guest.txt", size: 15,
    createdAt: old, updatedAt: old, chapters: [],
    blocks: [{ index: 0, text: "Guest text", chapterIndex: 0, isHeading: false }],
    position: { blockIndex: 0, offsetSeconds: 42, speed: 1.25, updatedAt: latest },
  };
  await saveBook(book);
  const requests: Array<{ path: string; body?: { offsetSeconds?: number } }> = [];
  let remote = false;
  const edited = { ...book, title: "Cloud edit", updatedAt: newer };
  const cloudBytes = await encodeCloudDocument(edited);
  t.mock.method(globalThis, "fetch", async (input: RequestInfo | URL, init?: RequestInit) => {
    const path = String(input);
    const body = init?.body && typeof init.body === "string" ? JSON.parse(init.body) : undefined;
    requests.push({ path, body });
    if (path.endsWith("/manifest")) return Response.json({ schemaVersion: 1, documentLimit: 100, maxDocumentBytes: 10485760,
      folders: [], documents: remote ? [{ id, updatedAt: newer, revision: 2 }] : [],
      progress: remote ? [{ documentId: id, ...book.position, updatedAt: old, revision: 1 }] : [] });
    if (path.endsWith(`/documents/${id}/download`)) return Response.json({ url: "https://example.test/book", contentBytes: cloudBytes.length });
    if (path === "https://example.test/book") return new Response(new Blob([cloudBytes]));
    if (path.endsWith(`/documents/${id}/progress`)) return Response.json({ progress: {} });
    if (path.endsWith(`/documents/${id}`) && init?.method === "PUT") return Response.json({ document: { id, updatedAt: old, revision: 1 } });
    throw new Error(`Unexpected sync request: ${path}`);
  });

  const first = await synchronizeLibrary("token", "owner", await listBooks(), []);
  assert.equal(first.uploaded, 1);
  assert.equal(requests.find((request) => request.path.endsWith(`/documents/${id}/progress`))?.body?.offsetSeconds, 42);
  remote = true;
  requests.length = 0;
  const second = await synchronizeLibrary("token", "owner", await listBooks(), []);
  assert.equal(second.downloaded, 1);
  assert.equal(second.books.find((item) => item.id === id)?.title, "Cloud edit");
  assert.equal(second.books.find((item) => item.id === id)?.position.offsetSeconds, 42);
  assert.equal(requests.find((request) => request.path.endsWith(`/documents/${id}/progress`))?.body?.offsetSeconds, 42);
});
