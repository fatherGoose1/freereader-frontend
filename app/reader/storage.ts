import type { LibraryBook, LibraryFolder } from "./types";

const DATABASE = "freereader-web";
const VERSION = 4;
const STORAGE_TIMEOUT_MS = 5_000;
const failedOPFSWrites = new Set<string>();

async function withStorageTimeout<T>(operation: (signal: AbortSignal) => Promise<T>): Promise<T> {
  const controller = new AbortController();
  let timer: ReturnType<typeof setTimeout>;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => {
      const error = new Error("Local storage timed out.");
      controller.abort(error);
      reject(error);
    }, STORAGE_TIMEOUT_MS);
  });
  try {
    return await Promise.race([operation(controller.signal), timeout]);
  } finally {
    clearTimeout(timer!);
  }
}

function isModelPath(path: string): boolean {
  return path.split("/").filter(Boolean)[0] === "models";
}

type StoredBook = Omit<LibraryBook, "cover"> & {
  cover?: Blob;
  coverBytes?: Uint8Array<ArrayBuffer>;
  coverType?: string;
};

type StoredAsset = {
  bytes: Uint8Array<ArrayBuffer>;
  type: string;
};

function openDatabase(signal?: AbortSignal): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    signal?.throwIfAborted();
    const request = indexedDB.open(DATABASE, VERSION);
    const abort = () => {
      try { request.transaction?.abort(); } catch { /* Already finished. */ }
      reject(signal!.reason);
    };
    signal?.addEventListener("abort", abort, { once: true });
    request.onupgradeneeded = (event) => {
      if (signal?.aborted) {
        request.transaction!.abort();
        return;
      }
      if (!request.result.objectStoreNames.contains("books")) {
        request.result.createObjectStore("books", { keyPath: "id" });
      }
      if (!request.result.objectStoreNames.contains("assets")) {
        request.result.createObjectStore("assets");
      }
      if (!request.result.objectStoreNames.contains("folders")) {
        request.result.createObjectStore("folders", { keyPath: "id" });
      }
      if (event.oldVersion < 3) {
        const cursorRequest = request.transaction!.objectStore("books").openCursor();
        cursorRequest.onsuccess = () => {
          const cursor = cursorRequest.result;
          if (!cursor) return;
          const book = cursor.value as LibraryBook;
          cursor.update({ ...book, position: { ...book.position, speed: 1 } });
          cursor.continue();
        };
      }
      if (event.oldVersion < 4) {
        const store = request.transaction!.objectStore("assets");
        const cursorRequest = store.openKeyCursor();
        cursorRequest.onsuccess = () => {
          const cursor = cursorRequest.result;
          if (!cursor) return;
          if (typeof cursor.key === "string" && /^books\/[^/]+\/source$/.test(cursor.key)) store.delete(cursor.primaryKey);
          cursor.continue();
        };
      }
    };
    request.onsuccess = () => {
      signal?.removeEventListener("abort", abort);
      if (signal?.aborted) request.result.close();
      else resolve(request.result);
    };
    request.onerror = () => {
      signal?.removeEventListener("abort", abort);
      reject(request.error);
    };
  });
}

async function transact<T>(
  storeName: "books" | "assets" | "folders",
  mode: IDBTransactionMode,
  operation: (store: IDBObjectStore) => IDBRequest<T>,
  signal?: AbortSignal,
): Promise<T> {
  const run = async (signal?: AbortSignal): Promise<T> => {
    const database = await openDatabase(signal);
    try {
      signal?.throwIfAborted();
      const transaction = database.transaction(storeName, mode);
      const abort = () => {
        try { transaction.abort(); } catch { /* Already finished. */ }
      };
      let cancel: () => void;
      try {
        return await new Promise<T>((resolve, reject) => {
          cancel = () => {
            abort();
            reject(signal!.reason);
          };
          signal?.addEventListener("abort", cancel, { once: true });
          let result: T;
          const fail = (error: unknown) => {
            abort();
            reject(error ?? new Error("Local storage transaction failed."));
          };
          transaction.oncomplete = () => resolve(result);
          transaction.onerror = () => fail(transaction.error);
          transaction.onabort = () => fail(signal?.reason ?? transaction.error);
          try {
            const request = operation(transaction.objectStore(storeName));
            request.onsuccess = () => { result = request.result; };
            request.onerror = () => fail(request.error);
          } catch (error) {
            fail(error);
          }
        });
      } finally {
        signal?.removeEventListener("abort", cancel!);
      }
    } finally {
      database.close();
    }
  };
  return storeName === "assets" && !signal ? withStorageTimeout(run) : run(signal);
}

export async function listBooks(): Promise<LibraryBook[]> {
  const books = await transact<StoredBook[]>("books", "readonly", (store) => store.getAll());
  return books.map(({ cover, coverBytes, coverType, ...book }) => ({
    ...book,
    cover: coverBytes ? new Blob([coverBytes], { type: coverType }) : cover,
  })).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}

export async function saveBook(book: LibraryBook): Promise<IDBValidKey> {
  const { cover, ...metadata } = book;
  const stored: StoredBook = cover
    ? { ...metadata, coverBytes: new Uint8Array(await cover.arrayBuffer()), coverType: cover.type }
    : metadata;
  return transact("books", "readwrite", (store) => store.put(stored));
}

export function removeBook(id: string): Promise<undefined> {
  return transact("books", "readwrite", (store) => store.delete(id));
}

export async function listFolders(): Promise<LibraryFolder[]> {
  const folders = await transact<LibraryFolder[]>("folders", "readonly", (store) => store.getAll());
  return folders.sort((a, b) => a.name.localeCompare(b.name));
}

export function saveFolder(folder: LibraryFolder): Promise<IDBValidKey> {
  return transact("folders", "readwrite", (store) => store.put(folder));
}

async function fileHandle(path: string, create: boolean, signal: AbortSignal): Promise<FileSystemFileHandle> {
  let directory = await navigator.storage.getDirectory();
  signal.throwIfAborted();
  const parts = path.split("/").filter(Boolean);
  for (const part of parts.slice(0, -1)) {
    directory = await directory.getDirectoryHandle(part, { create });
    signal.throwIfAborted();
  }
  return directory.getFileHandle(parts.at(-1)!, { create });
}

async function storeAsset(path: string, data: Blob): Promise<void> {
  if (isModelPath(path)) return;
  await withStorageTimeout(async (signal) => {
    const stored: StoredAsset = {
      bytes: new Uint8Array(await data.arrayBuffer()),
      type: data.type,
    };
    signal.throwIfAborted();
    await transact("assets", "readwrite", (store) => store.put(stored, path), signal);
  });
}

function assetBlob(stored?: Blob | StoredAsset): Blob | null {
  if (!stored) return null;
  if (stored instanceof Blob) return stored;
  return new Blob([stored.bytes], { type: stored.type });
}

export async function putLocalFile(path: string, data: Blob): Promise<void> {
  // OPFS commits on close; ignore failed writes even if a handle exposes an old/partial file.
  failedOPFSWrites.add(path);
  try {
    await withStorageTimeout(async (signal) => {
      const handle = await fileHandle(path, true, signal);
      signal.throwIfAborted();
      let writable: FileSystemWritableFileStream | undefined;
      const abort = () => { void writable?.abort().catch(() => {}); };
      signal.addEventListener("abort", abort, { once: true });
      try {
        writable = await handle.createWritable();
        signal.throwIfAborted();
        await writable.write(data);
        signal.throwIfAborted();
        await writable.close();
        signal.throwIfAborted();
      } catch (error) {
        abort();
        throw error;
      } finally {
        signal.removeEventListener("abort", abort);
      }
    });
    failedOPFSWrites.delete(path);
    return;
  } catch {
    // Private browsing may expose OPFS but reject writes.
  }
  try {
    await storeAsset(path, data);
  } catch {
    // Audio and model files are caches; callers can keep using the in-memory Blob.
  }
}

export async function getLocalFile(path: string): Promise<File | Blob | null> {
  try {
    if (!failedOPFSWrites.has(path)) {
      const file = await withStorageTimeout(async (signal) => {
        const handle = await fileHandle(path, false, signal);
        signal.throwIfAborted();
        return handle.getFile();
      });
      if (file.size) return file;
    }
  } catch {
    // The file may not have been cached yet.
  }
  if (isModelPath(path)) return null;
  try {
    return assetBlob(await transact<Blob | StoredAsset | undefined>("assets", "readonly", (store) => store.get(path)));
  } catch {
    return null;
  }
}

export async function streamToLocalFile(path: string, response: Response): Promise<Blob> {
  const blob = await response.blob();
  await putLocalFile(path, blob);
  return blob;
}

export async function saveAudio(path: string, audio: Blob): Promise<void> {
  await putLocalFile(`audio/${path}`, audio);
}

export async function getAudio(path: string): Promise<File | Blob | null> {
  return getLocalFile(`audio/${path}`);
}

export async function requestPersistentStorage(): Promise<boolean> {
  return navigator.storage.persist?.() ?? false;
}
