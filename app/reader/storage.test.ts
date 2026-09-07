import assert from "node:assert/strict";
import test, { afterEach, before, beforeEach, type TestContext } from "node:test";
import { indexedDB as fakeIndexedDB, IDBObjectStore as FakeIDBObjectStore } from "fake-indexeddb";
import type { LibraryBook } from "./types";

const DATABASE = "freereader-web";
let listBooks: typeof import("./storage").listBooks;
let getAudio: typeof import("./storage").getAudio;
let getLocalFile: typeof import("./storage").getLocalFile;
let putLocalFile: typeof import("./storage").putLocalFile;
let saveAudio: typeof import("./storage").saveAudio;
let saveBook: typeof import("./storage").saveBook;
let streamToLocalFile: typeof import("./storage").streamToLocalFile;

before(async () => {
  Object.defineProperty(globalThis, "indexedDB", { configurable: true, value: fakeIndexedDB });
  ({ getAudio, getLocalFile, putLocalFile, listBooks, saveAudio, saveBook, streamToLocalFile } = await import("./storage"));
});

const originalNavigator = Object.getOwnPropertyDescriptor(globalThis, "navigator");
beforeEach(() => {
  Object.defineProperty(globalThis, "navigator", {
    configurable: true,
    value: { storage: { getDirectory: async () => { throw new Error("OPFS unavailable"); } } },
  });
});
afterEach(() => {
  if (originalNavigator) Object.defineProperty(globalThis, "navigator", originalNavigator);
  else Reflect.deleteProperty(globalThis, "navigator");
});

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => { resolve = done; });
  return { promise, resolve };
}

function mockOPFS(t: TestContext) {
  let file = new File(["cached bytes"], "asset");
  let pending: Blob;
  const writable = {
    write: t.mock.fn(async (data: Blob) => { pending = data; }),
    close: t.mock.fn(async () => { file = new File([pending], "asset", { type: pending.type }); }),
    abort: t.mock.fn(async () => {}),
  };
  const handle = {
    createWritable: t.mock.fn(async () => writable),
    getFile: t.mock.fn(async () => file),
  };
  const directory = {
    getDirectoryHandle: async () => directory,
    getFileHandle: async () => handle,
  };
  t.mock.method(navigator.storage, "getDirectory", async () => directory);
  return { writable, handle, directory };
}

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

test("stores small audio as bytes but leaves models uncached when OPFS is unavailable", async (t) => {
  const put = t.mock.method(FakeIDBObjectStore.prototype, "put");
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
  assert.equal(model, null);
  assert.equal(put.mock.callCount(), 1);
  const [stored, key] = put.mock.calls[0].arguments;
  assert.equal(key, "audio/stored.wav");
  assert.ok(stored.bytes instanceof Uint8Array);
  assert.equal(stored.type, "audio/wav");
});

for (const available of [false, true]) {
  test(`consumes the response Blob once without cloning or serializing models (OPFS ${available})`, async (t) => {
    const opfs = available ? mockOPFS(t) : undefined;
    const blob = new Blob(["model bytes"], { type: "application/octet-stream" });
    const arrayBuffer = t.mock.method(blob, "arrayBuffer", async () => { throw new Error("Do not serialize models"); });
    const response = new Response();
    const body = t.mock.method(response, "blob", async () => blob);
    const clone = t.mock.method(response, "clone", () => { throw new Error("Do not tee the response"); });
    const open = t.mock.method(fakeIndexedDB, "open");
    const path = `models/single-blob/${available}.onnx`;

    assert.equal(await streamToLocalFile(path, response), blob);
    assert.equal(body.mock.callCount(), 1);
    assert.equal(clone.mock.callCount(), 0);
    assert.equal(arrayBuffer.mock.callCount(), 0);
    assert.equal(open.mock.callCount(), 0);
    if (opfs) {
      assert.equal(opfs.writable.write.mock.calls[0].arguments[0], blob);
      assert.equal(opfs.writable.close.mock.callCount(), 1);
      assert.equal(await (await getLocalFile(path))?.text(), "model bytes");
    } else {
      assert.equal(await getLocalFile(path), null);
    }
    assert.equal(open.mock.callCount(), 0);
  });
}

test("skips legacy model IDB reads while preserving legacy audio Blobs", async (t) => {
  const database = await requestResult(fakeIndexedDB.open(DATABASE, 4));
  const transaction = database.transaction("assets", "readwrite");
  transaction.objectStore("assets").put({ bytes: new Uint8Array([1]), type: "application/octet-stream" }, "models/legacy/model.onnx");
  await new Promise<void>((resolve) => { transaction.oncomplete = () => resolve(); });
  database.close();

  const get = t.mock.method(FakeIDBObjectStore.prototype, "get");
  assert.equal(await getLocalFile("models/legacy/model.onnx"), null);
  assert.equal(await getLocalFile("/models/legacy/model.onnx"), null);
  assert.equal(get.mock.callCount(), 0);
  assert.equal(await (await getLocalFile("audio/book/block.wav"))?.text(), "audio");
});

test("propagates download body errors without attempting to cache", async (t) => {
  const error = new Error("Download interrupted");
  const response = new Response(new ReadableStream({
    start(controller) {
      controller.enqueue(new Uint8Array([1, 2]));
      controller.error(error);
    },
  }));
  const opfs = t.mock.method(navigator.storage, "getDirectory");
  const open = t.mock.method(fakeIndexedDB, "open");
  await assert.rejects(streamToLocalFile("models/broken/model.onnx", response), (actual) => actual === error);
  assert.equal(opfs.mock.callCount(), 0);
  assert.equal(open.mock.callCount(), 0);
});

for (const stage of ["root", "directory", "file", "create", "write", "close"] as const) {
  test(`returns the in-memory model when OPFS ${stage} stalls`, async (t) => {
    t.mock.timers.enable({ apis: ["setTimeout"] });
    const { writable, handle, directory } = mockOPFS(t);
    const started = deferred<void>();
    const stall = async () => { started.resolve(); return new Promise<never>(() => {}); };
    if (stage === "root") t.mock.method(navigator.storage, "getDirectory", stall);
    if (stage === "directory") t.mock.method(directory, "getDirectoryHandle", stall);
    if (stage === "file") t.mock.method(directory, "getFileHandle", stall);
    if (stage === "create") t.mock.method(handle, "createWritable", stall);
    if (stage === "write") t.mock.method(writable, "write", stall);
    if (stage === "close") t.mock.method(writable, "close", stall);
    const open = t.mock.method(fakeIndexedDB, "open");
    const pending = streamToLocalFile(`models/stalled/${stage}.onnx`, new Response("complete model"));
    await started.promise;
    t.mock.timers.tick(5_000);
    assert.equal(await (await pending).text(), "complete model");
    assert.equal(open.mock.callCount(), 0);
    if (stage === "write" || stage === "close") assert.equal(writable.abort.mock.callCount(), 1);
  });
}

test("aborts a writable that arrives after the OPFS deadline without writing to it", async (t) => {
  t.mock.timers.enable({ apis: ["setTimeout"] });
  const { writable, handle } = mockOPFS(t);
  const started = deferred<void>();
  const late = deferred<typeof writable>();
  t.mock.method(handle, "createWritable", () => { started.resolve(); return late.promise; });
  const pending = streamToLocalFile("models/late/model.onnx", new Response("complete model"));
  await started.promise;
  t.mock.timers.tick(5_000);
  await pending;
  late.resolve(writable);
  await new Promise<void>((resolve) => setImmediate(resolve));
  assert.equal(writable.write.mock.callCount(), 0);
  assert.equal(writable.abort.mock.callCount(), 1);
});

test("falls back to IDB when an OPFS read stalls", async (t) => {
  t.mock.timers.enable({ apis: ["setTimeout"] });
  const { handle } = mockOPFS(t);
  const started = deferred<void>();
  t.mock.method(handle, "getFile", async () => { started.resolve(); return new Promise<never>(() => {}); });
  const pending = getLocalFile("audio/book/block.wav");
  await started.promise;
  t.mock.timers.tick(5_000);
  assert.equal(await (await pending)?.text(), "audio");
});

test("empty OPFS files do not mask legacy IDB audio", async (t) => {
  const { handle } = mockOPFS(t);
  t.mock.method(handle, "getFile", async () => new File([], "empty"));
  assert.equal(await (await getLocalFile("audio/book/block.wav"))?.text(), "audio");
});

for (const failure of ["reject", "timeout"] as const) {
  test(`partial OPFS files do not mask audio fallback after a write ${failure}`, async (t) => {
    t.mock.timers.enable({ apis: ["setTimeout"] });
    const { writable, handle } = mockOPFS(t);
    const started = deferred<void>();
    t.mock.method(writable, "write", async () => {
      started.resolve();
      if (failure === "reject") throw new Error("Write failed");
      return new Promise<never>(() => {});
    });
    t.mock.method(handle, "getFile", async () => new File(["partial"], "partial"));
    const path = `partial-${failure}.wav`;
    const pending = saveAudio(path, new Blob(["complete audio"], { type: "audio/wav" }));
    await started.promise;
    if (failure === "timeout") t.mock.timers.tick(5_000);
    await pending;
    assert.equal(await (await getAudio(path))?.text(), "complete audio");
    assert.equal(handle.getFile.mock.callCount(), 0);
    assert.equal(writable.abort.mock.callCount(), 1);
  });
}

for (const operation of ["read", "write"] as const) {
  test(`bounds asset IDB ${operation} opens and closes late connections`, async (t) => {
    t.mock.timers.enable({ apis: ["setTimeout"] });
    const started = deferred<void>();
    const database = { close: t.mock.fn(), transaction: t.mock.fn() };
    const request = { result: database, transaction: null, onsuccess: () => {} };
    t.mock.method(fakeIndexedDB, "open", () => { started.resolve(); return request; });
    const pending = operation === "read"
      ? getAudio("never-opened.wav")
      : putLocalFile("audio/never-opened.wav", new Blob(["audio"]));
    await started.promise;
    t.mock.timers.tick(5_000);
    assert.equal(await pending, operation === "read" ? null : undefined);
    request.onsuccess();
    assert.equal(database.close.mock.callCount(), 1);
    assert.equal(database.transaction.mock.callCount(), 0);
  });

  test(`aborts stalled asset IDB ${operation} transactions even if abort never fires`, async (t) => {
    t.mock.timers.enable({ apis: ["setTimeout"] });
    const started = deferred<void>();
    const store = {
      get: t.mock.fn(() => { started.resolve(); return {}; }),
      put: t.mock.fn(() => { started.resolve(); return {}; }),
    };
    const transaction = { objectStore: () => store, abort: t.mock.fn() };
    const database = { close: t.mock.fn(), transaction: () => transaction };
    t.mock.method(fakeIndexedDB, "open", () => {
      const request = { result: database, onsuccess: () => {} };
      queueMicrotask(() => request.onsuccess());
      return request;
    });
    const pending = operation === "read"
      ? getAudio("never-completed.wav")
      : saveAudio("never-completed.wav", new Blob(["audio"]));
    await started.promise;
    t.mock.timers.tick(5_000);
    assert.equal(await pending, operation === "read" ? null : undefined);
    assert.equal(transaction.abort.mock.callCount(), 1);
    assert.equal(database.close.mock.callCount(), 1);
    assert.equal(store[operation === "read" ? "get" : "put"].mock.callCount(), 1);
  });
}

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
