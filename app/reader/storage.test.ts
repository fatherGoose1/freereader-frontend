import assert from "node:assert/strict";
import test, { before } from "node:test";
import { indexedDB as fakeIndexedDB, IDBObjectStore as FakeIDBObjectStore } from "fake-indexeddb";
import type { LibraryBook } from "./types";

const DATABASE = "freereader-web";
let listBooks: typeof import("./storage").listBooks;
let getAudio: typeof import("./storage").getAudio;
let getLocalFile: typeof import("./storage").getLocalFile;
let saveAudio: typeof import("./storage").saveAudio;
let saveBook: typeof import("./storage").saveBook;
let streamToLocalFile: typeof import("./storage").streamToLocalFile;

before(async () => {
  Object.defineProperty(globalThis, "indexedDB", { configurable: true, value: fakeIndexedDB });
  ({ getAudio, getLocalFile, listBooks, saveAudio, saveBook, streamToLocalFile } = await import("./storage"));
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

function rejectBlobWrites(): () => void {
  const originalPut = FakeIDBObjectStore.prototype.put;
  FakeIDBObjectStore.prototype.put = function (value: unknown, key?: IDBValidKey) {
    if (containsBlob(value)) throw new DOMException("Error preparing Blob/File data to be stored in object store", "DataCloneError");
    return key === undefined ? originalPut.call(this, value) : originalPut.call(this, value, key);
  };
  return () => { FakeIDBObjectStore.prototype.put = originalPut; };
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

  const restorePut = rejectBlobWrites();
  try {
    await saveBook(book);
  } finally {
    restorePut();
  }

  const [stored] = await listBooks();
  assert.deepEqual({ ...stored, cover: undefined }, { ...book, cover: undefined });
  assert.equal(stored.cover?.type, "image/jpeg");
  assert.equal(await stored.cover?.text(), "cover bytes");
});

test("stores audio and model assets without passing Blobs to IndexedDB", async () => {
  const restorePut = rejectBlobWrites();
  try {
    await saveAudio("stored.wav", new Blob(["audio bytes"], { type: "audio/wav" }));
    await streamToLocalFile(
      "models/revision/model.onnx",
      new Response("model bytes", { headers: { "content-type": "application/octet-stream" } }),
    );
  } finally {
    restorePut();
  }

  const audio = await getAudio("stored.wav");
  const model = await getLocalFile("models/revision/model.onnx");
  assert.equal(audio?.type, "audio/wav");
  assert.equal(await audio?.text(), "audio bytes");
  assert.equal(model?.type, "application/octet-stream");
  assert.equal(await model?.text(), "model bytes");
});

test("continues with in-memory audio and models when persistent cache writes fail", async () => {
  const originalPut = FakeIDBObjectStore.prototype.put;
  FakeIDBObjectStore.prototype.put = function () {
    throw new DOMException("Storage quota exceeded", "QuotaExceededError");
  };
  try {
    await saveAudio("uncached.wav", new Blob(["uncached audio"], { type: "audio/wav" }));
    const model = await streamToLocalFile(
      "models/revision/uncached.onnx",
      new Response("uncached model", { headers: { "content-type": "application/octet-stream" } }),
    );
    assert.equal(await model.text(), "uncached model");
  } finally {
    FakeIDBObjectStore.prototype.put = originalPut;
  }
});
