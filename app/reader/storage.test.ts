import assert from "node:assert/strict";
import test, { before } from "node:test";
import { indexedDB as fakeIndexedDB, IDBObjectStore as FakeIDBObjectStore } from "fake-indexeddb";
import type { LibraryBook } from "./types";

const DATABASE = "freereader-web";
let listBooks: typeof import("./storage").listBooks;
let saveBook: typeof import("./storage").saveBook;

before(async () => {
  Object.defineProperty(globalThis, "indexedDB", { configurable: true, value: fakeIndexedDB });
  ({ listBooks, saveBook } = await import("./storage"));
});

function requestResult<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function createVersionThreeDatabase(): Promise<void> {
  const request = fakeIndexedDB.open(DATABASE, 3);
  request.onupgradeneeded = () => {
    request.result.createObjectStore("books", { keyPath: "id" });
    request.result.createObjectStore("assets");
    request.result.createObjectStore("folders", { keyPath: "id" });
  };
  const database = await requestResult(request);
  const transaction = database.transaction("assets", "readwrite");
  transaction.objectStore("assets").put(new Blob(["unused source"]), "books/orphan/source");
  transaction.objectStore("assets").put(new Blob(["audio"]), "audio/book/block.wav");
  await new Promise<void>((resolve, reject) => {
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error);
  });
  database.close();
}

test("removes legacy source blobs without deleting reusable assets", async () => {
  await createVersionThreeDatabase();
  await listBooks();

  const database = await requestResult(fakeIndexedDB.open(DATABASE, 4));
  const transaction = database.transaction("assets", "readonly");
  const keys = await requestResult(transaction.objectStore("assets").getAllKeys());
  database.close();
  assert.deepEqual(keys, ["audio/book/block.wav"]);
});

function containsBlob(value: unknown, seen = new Set<object>()): boolean {
  if (value instanceof Blob) return true;
  if (!value || typeof value !== "object" || value instanceof ArrayBuffer || ArrayBuffer.isView(value)) return false;
  if (seen.has(value)) return false;
  seen.add(value);
  return Object.values(value).some((child) => containsBlob(child, seen));
}

test("stores cover artwork without passing Blob data to IndexedDB", async () => {
  const now = new Date().toISOString();
  const book: LibraryBook = {
    id: "stored-book",
    title: "Stored Book",
    format: "pdf",
    sourceName: "stored.pdf",
    size: 42,
    createdAt: now,
    updatedAt: now,
    chapters: [{ title: "Chapter 1", startBlockIndex: 0 }],
    blocks: [{ index: 0, text: "Readable text", chapterIndex: 0, isHeading: false }],
    position: { blockIndex: 0, offsetSeconds: 0, speed: 1 },
    cover: new Blob(["cover bytes"], { type: "image/jpeg" }),
  };

  const originalPut = FakeIDBObjectStore.prototype.put;
  FakeIDBObjectStore.prototype.put = function (value: unknown, key?: IDBValidKey) {
    if (containsBlob(value)) throw new DOMException("Error preparing Blob/File data to be stored in object store", "DataCloneError");
    return key === undefined ? originalPut.call(this, value) : originalPut.call(this, value, key);
  };
  try {
    await saveBook(book);
  } finally {
    FakeIDBObjectStore.prototype.put = originalPut;
  }

  const [stored] = await listBooks();
  assert.deepEqual({ ...stored, cover: undefined }, { ...book, cover: undefined });
  assert.equal(stored.cover?.type, "image/jpeg");
  assert.equal(await stored.cover?.text(), "cover bytes");
});
