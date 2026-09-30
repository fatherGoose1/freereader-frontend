import type { AuthorLink, PublishedDocument } from "./model";

export type PublishingDraft = {
  id: string; ownerId?: string; slug?: string;
  step?: "profile" | "book";
  displayName: string; profileSlug: string; bio: string; links: AuthorLink[];
  profileImage?: Blob; profileImagePath?: string | null;
  title: string; description: string; authorName: string;
  cover?: Blob; coverPath?: string | null;
  seriesId: string; seriesName: string; seriesOrder: string;
  defaultVoice?: import("../reader/voices").NarratorVoice;
  voiceLanguage?: import("../reader/speech").SpeechLanguage;
  rightsCertified?: boolean;
  sourceMode: "file" | "text"; file?: File; rawText: string;
  document?: PublishedDocument;
};

export function emptyDraft(): PublishingDraft {
  return {
    id: crypto.randomUUID(), step: "profile", displayName: "", profileSlug: "", bio: "", links: [],
    title: "", description: "", authorName: "", seriesId: "", seriesName: "", seriesOrder: "1",
    sourceMode: "file", rawText: "", defaultVoice: "af_heart", rightsCertified: false,
  };
}

function database(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open("freereader-author-drafts", 1);
    request.onupgradeneeded = () => request.result.createObjectStore("drafts");
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

type StoredBlob = { bytes: Uint8Array<ArrayBuffer>; type: string; name?: string };
type StoredDraft = Omit<PublishingDraft, "profileImage" | "cover" | "file"> & {
  profileImage?: StoredBlob; cover?: StoredBlob; file?: StoredBlob;
};

async function encodeBlob(blob?: Blob): Promise<StoredBlob | undefined> {
  return blob ? { bytes: new Uint8Array(await blob.arrayBuffer()), type: blob.type,
    ...("name" in blob ? { name: String(blob.name) } : {}),
  } : undefined;
}

function decodeBlob(blob?: StoredBlob): Blob | undefined {
  return blob ? new Blob([blob.bytes], { type: blob.type }) : undefined;
}

async function transaction<T>(mode: IDBTransactionMode, operation: (store: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  const db = await database();
  try {
    return await new Promise<T>((resolve, reject) => {
      const tx = db.transaction("drafts", mode);
      const request = operation(tx.objectStore("drafts"));
      tx.oncomplete = () => resolve(request.result);
      tx.onerror = () => reject(tx.error);
      tx.onabort = () => reject(tx.error ?? new Error("Draft storage unavailable."));
    });
  } finally { db.close(); }
}

export async function loadDraft(key: string): Promise<PublishingDraft | undefined> {
  const stored = await transaction<StoredDraft | undefined>("readonly", (store) => store.get(key));
  if (!stored) return undefined;
  const { profileImage, cover, file, ...metadata } = stored;
  return { ...metadata, profileImage: decodeBlob(profileImage), cover: decodeBlob(cover),
    file: file ? new File([file.bytes], file.name || "book.txt", { type: file.type }) : undefined,
  };
}

// Serialize writes so a slow autosave cannot overwrite a newer pre-OAuth save.
let writes: Promise<unknown> = Promise.resolve();
export function saveDraft(key: string, draft: PublishingDraft): Promise<unknown> {
  writes = writes.catch(() => undefined).then(async () => {
    const { profileImage, cover, file, ...metadata } = draft;
    const stored: StoredDraft = { ...metadata, profileImage: await encodeBlob(profileImage),
      cover: await encodeBlob(cover), file: await encodeBlob(file),
    };
    return transaction("readwrite", (store) => store.put(stored, key));
  });
  return writes;
}

export function clearDraft(key: string): Promise<unknown> {
  writes = writes.catch(() => undefined).then(() => transaction("readwrite", (store) => store.delete(key)));
  return writes;
}
