import type { LibraryBook, LibraryFolder } from "./types";

const DATABASE = "freereader-web";
const VERSION = 4;

type StoredBook = Omit<LibraryBook, "cover"> & {
  cover?: Blob;
  coverBytes?: Uint8Array<ArrayBuffer>;
  coverType?: string;
};

function openDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DATABASE, VERSION);
    request.onupgradeneeded = (event) => {
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
        const cursorRequest = request.transaction!.objectStore("assets").openCursor();
        cursorRequest.onsuccess = () => {
          const cursor = cursorRequest.result;
          if (!cursor) return;
          if (typeof cursor.key === "string" && /^books\/[^/]+\/source$/.test(cursor.key)) cursor.delete();
          cursor.continue();
        };
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function transact<T>(
  storeName: "books" | "assets" | "folders",
  mode: IDBTransactionMode,
  operation: (store: IDBObjectStore) => IDBRequest<T>,
): Promise<T> {
  const database = await openDatabase();
  return new Promise((resolve, reject) => {
    let request: IDBRequest<T>;
    let result: T;
    const transaction = database.transaction(storeName, mode);
    const fail = () => {
      database.close();
      reject(transaction.error ?? request?.error ?? new Error("Local storage transaction failed."));
    };
    try {
      request = operation(transaction.objectStore(storeName));
      request.onsuccess = () => { result = request.result; };
      request.onerror = fail;
      transaction.oncomplete = () => {
        database.close();
        resolve(result);
      };
      transaction.onerror = fail;
      transaction.onabort = fail;
    } catch (error) {
      database.close();
      reject(error);
    }
  });
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

async function rootDirectory(): Promise<FileSystemDirectoryHandle | null> {
  try {
    return await navigator.storage.getDirectory();
  } catch {
    return null;
  }
}

async function fileHandle(path: string, create: boolean): Promise<FileSystemFileHandle | null> {
  let directory = await rootDirectory();
  if (!directory) return null;
  const parts = path.split("/").filter(Boolean);
  for (const part of parts.slice(0, -1)) {
    directory = await directory.getDirectoryHandle(part, { create });
  }
  return directory.getFileHandle(parts.at(-1)!, { create });
}

export async function putLocalFile(path: string, data: Blob): Promise<void> {
  const handle = await fileHandle(path, true);
  if (handle) {
    const writable = await handle.createWritable();
    await writable.write(data);
    await writable.close();
    return;
  }
  await transact("assets", "readwrite", (store) => store.put(data, path));
}

export async function getLocalFile(path: string): Promise<File | Blob | null> {
  try {
    const handle = await fileHandle(path, false);
    if (handle) return await handle.getFile();
  } catch {
    // The file may not have been cached yet.
  }
  return (await transact<Blob | undefined>("assets", "readonly", (store) => store.get(path))) ?? null;
}

export async function streamToLocalFile(path: string, response: Response): Promise<Blob> {
  const handle = await fileHandle(path, true);
  if (handle && response.body) {
    const writable = await handle.createWritable();
    await response.body.pipeTo(writable);
    return handle.getFile();
  }
  const blob = await response.blob();
  await transact("assets", "readwrite", (store) => store.put(blob, path));
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
