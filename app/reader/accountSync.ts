import type { AccountSyncRecord, LibraryBook, LibraryFolder, ReadingPosition } from "./types";
import {
  listAccountSyncRecords,
  listAllAccountSyncRecords,
  listBooks,
  listFolders,
  removeBook,
  removeAccountSyncRecord,
  saveAccountSyncRecord,
  saveBook,
  saveFolder,
} from "./storage";

const API_BASE = (process.env.NEXT_PUBLIC_KOKO_BACKEND_URL
  ?? "https://koko-backend-production-c887.up.railway.app").replace(/\/$/, "");
export const CLOUD_DOCUMENT_LIMIT = 100;
export const CLOUD_DOCUMENT_MAX_BYTES = 10 * 1024 * 1024;

type RemoteDocument = {
  id: string;
  title: string;
  author: string | null;
  language: LibraryBook["language"] | null;
  format: LibraryBook["format"];
  sourceName: string;
  sourceIdentifier: string | null;
  parentId: string | null;
  size: number;
  contentBytes: number;
  contentSha256: string;
  updatedAt: string;
  revision: number;
};

type RemoteFolder = {
  id: string;
  name: string;
  parentId: string | null;
  updatedAt: string;
  revision: number;
};

type RemoteProgress = ReadingPosition & {
  documentId: string;
  updatedAt: string;
  revision: number;
};

type Manifest = {
  schemaVersion: 1;
  documentLimit: number;
  maxDocumentBytes: number;
  documents: RemoteDocument[];
  folders: RemoteFolder[];
  progress: RemoteProgress[];
};

type DocumentEnvelope = {
  schemaVersion: 1;
  document: Omit<LibraryBook, "cover" | "position">;
  cover: { type: string; data: string } | null;
};

export class AccountSyncError extends Error {
  constructor(public code: string, public status: number, message = code) {
    super(message);
  }
}

function syncKey(ownerId: string, kind: AccountSyncRecord["kind"], itemId: string): string {
  return `${ownerId}:${kind}:${itemId}`;
}

async function api<T>(path: string, token: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${API_BASE}/api/v1/freereader/sync${path}`, {
    ...init,
    headers: { Authorization: `Bearer ${token}`, ...init?.headers },
  });
  if (!response.ok) {
    const payload = await response.json().catch(() => null) as { error?: string } | null;
    throw new AccountSyncError(payload?.error ?? "sync_failed", response.status);
  }
  if (response.status === 204) return undefined as T;
  return response.json() as Promise<T>;
}

function bytesToBase64(bytes: Uint8Array): string {
  let binary = "";
  for (let offset = 0; offset < bytes.length; offset += 32_768) {
    binary += String.fromCharCode(...bytes.subarray(offset, offset + 32_768));
  }
  return btoa(binary);
}

function base64ToBytes(value: string): Uint8Array<ArrayBuffer> {
  const binary = atob(value);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
  return bytes;
}

async function gzip(value: string): Promise<Uint8Array<ArrayBuffer>> {
  if (typeof CompressionStream !== "function") throw new AccountSyncError("compression_unavailable", 0);
  const stream = new Blob([value]).stream().pipeThrough(new CompressionStream("gzip"));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

async function gunzip(value: Blob): Promise<string> {
  if (typeof DecompressionStream !== "function") throw new AccountSyncError("compression_unavailable", 0);
  const stream = value.stream().pipeThrough(new DecompressionStream("gzip"));
  return new Response(stream).text();
}

export async function encodeCloudDocument(book: LibraryBook): Promise<Uint8Array<ArrayBuffer>> {
  const { cover, position: _position, ...document } = book;
  const envelope: DocumentEnvelope = {
    schemaVersion: 1,
    document,
    cover: cover
      ? { type: cover.type || "image/jpeg", data: bytesToBase64(new Uint8Array(await cover.arrayBuffer())) }
      : null,
  };
  return gzip(JSON.stringify(envelope));
}

export async function decodeCloudDocument(blob: Blob, position?: RemoteProgress): Promise<LibraryBook> {
  const envelope = JSON.parse(await gunzip(blob)) as DocumentEnvelope;
  if (envelope.schemaVersion !== 1 || !envelope.document?.id || !Array.isArray(envelope.document.blocks)) {
    throw new AccountSyncError("invalid_cloud_document", 0);
  }
  const cover = envelope.cover
    ? new Blob([base64ToBytes(envelope.cover.data)], { type: envelope.cover.type })
    : undefined;
  return {
    ...envelope.document,
    cover,
    position: position
      ? {
        blockIndex: position.blockIndex,
        offsetSeconds: position.offsetSeconds,
        speed: position.speed,
        updatedAt: position.updatedAt,
      }
      : { blockIndex: 0, offsetSeconds: 0, speed: 1 },
  };
}

export async function fetchManifest(token: string): Promise<Manifest> {
  const manifest = await api<Manifest>("/manifest", token);
  if (manifest.schemaVersion !== 1) throw new AccountSyncError("unsupported_sync_version", 0);
  return manifest;
}

async function uploadDocument(token: string, book: LibraryBook, revision?: number): Promise<RemoteDocument> {
  const content = await encodeCloudDocument(book);
  if (content.byteLength > CLOUD_DOCUMENT_MAX_BYTES) {
    throw new AccountSyncError("document_too_large", 413);
  }
  const result = await api<{ document: RemoteDocument }>(`/documents/${book.id}`, token, {
    method: "PUT",
    body: new Blob([content], { type: "application/gzip" }),
    headers: revision ? { "Content-Type": "application/gzip", "If-Match": String(revision) }
      : { "Content-Type": "application/gzip" },
  });
  return result.document;
}

async function downloadDocument(token: string, remote: RemoteDocument, progress?: RemoteProgress): Promise<LibraryBook> {
  const signed = await api<{ url: string; contentBytes: number }>(`/documents/${remote.id}/download`, token);
  if (signed.contentBytes > CLOUD_DOCUMENT_MAX_BYTES) throw new AccountSyncError("document_too_large", 413);
  const response = await fetch(signed.url);
  if (!response.ok) throw new AccountSyncError("document_download_failed", response.status);
  return decodeCloudDocument(await response.blob(), progress);
}

async function uploadFolder(token: string, folder: LibraryFolder, revision?: number): Promise<RemoteFolder> {
  const result = await api<{ folder: RemoteFolder }>(`/folders/${folder.id}`, token, {
    method: "PUT",
    headers: { "Content-Type": "application/json", ...(revision && { "If-Match": String(revision) }) },
    body: JSON.stringify({ name: folder.name, parentId: folder.parentId ?? null, updatedAt: folder.updatedAt }),
  });
  return result.folder;
}

function syncRecord(ownerId: string, kind: AccountSyncRecord["kind"], item: { id: string; revision: number; updatedAt: string }): AccountSyncRecord {
  return {
    key: syncKey(ownerId, kind, item.id),
    ownerId,
    kind,
    itemId: item.id,
    revision: item.revision,
    contentUpdatedAt: item.updatedAt,
    syncedAt: new Date().toISOString(),
  };
}

export async function uploadCloudProgress(token: string, book: LibraryBook): Promise<void> {
  const updatedAt = book.position.updatedAt ?? book.updatedAt;
  await api(`/documents/${book.id}/progress`, token, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ ...book.position, updatedAt }),
  });
}

export async function uploadCloudDocument(token: string, ownerId: string, book: LibraryBook): Promise<void> {
  const records = await listAllAccountSyncRecords();
  if (records.some((value) => value.kind === "document" && value.itemId === book.id && value.ownerId !== ownerId)) {
    throw new AccountSyncError("document_belongs_to_another_account", 409);
  }
  const record = records.find((value) => value.kind === "document" && value.itemId === book.id);
  const remote = await uploadDocument(token, book, record?.revision);
  await saveAccountSyncRecord(syncRecord(ownerId, "document", remote));
  await uploadCloudProgress(token, book);
}

export async function uploadCloudFolder(token: string, ownerId: string, folder: LibraryFolder): Promise<void> {
  const records = await listAllAccountSyncRecords();
  if (records.some((value) => value.kind === "folder" && value.itemId === folder.id && value.ownerId !== ownerId)) return;
  const record = records.find((value) => value.kind === "folder" && value.itemId === folder.id);
  const remote = await uploadFolder(token, folder, record?.revision);
  await saveAccountSyncRecord(syncRecord(ownerId, "folder", remote));
}

export function deleteCloudDocument(token: string, documentId: string): Promise<void> {
  return api(`/documents/${documentId}`, token, { method: "DELETE" });
}

export async function deleteCloudAccount(token: string, ownerId: string): Promise<void> {
  await api("/account", token, { method: "DELETE" });
  const records = await listAccountSyncRecords(ownerId);
  await Promise.all(records.map((record) => removeAccountSyncRecord(record.key)));
}

export type SyncResult = {
  books: LibraryBook[];
  folders: LibraryFolder[];
  uploaded: number;
  downloaded: number;
  localOnly: number;
};

export async function synchronizeLibrary(
  token: string,
  ownerId: string,
  initialBooks: LibraryBook[],
  initialFolders: LibraryFolder[],
): Promise<SyncResult> {
  const manifest = await fetchManifest(token);
  const allRecords = await listAllAccountSyncRecords();
  const records = allRecords.filter((record) => record.ownerId === ownerId);
  const recordsByKey = new Map(records.map((record) => [record.key, record]));
  const remoteFolders = new Map(manifest.folders.map((folder) => [folder.id, folder]));
  let folders = [...initialFolders];
  let uploaded = 0;
  let downloaded = 0;
  let localOnly = 0;

  for (const folder of initialFolders) {
    if (allRecords.some((record) => record.kind === "folder" && record.itemId === folder.id && record.ownerId !== ownerId)) {
      continue;
    }
    const remote = remoteFolders.get(folder.id);
    if (!remote || folder.updatedAt > remote.updatedAt) {
      const saved = await uploadFolder(token, folder, remote?.revision);
      await saveAccountSyncRecord(syncRecord(ownerId, "folder", saved));
      remoteFolders.delete(folder.id);
    } else if (remote.updatedAt > folder.updatedAt) {
      const updated = { ...folder, name: remote.name, parentId: remote.parentId ?? undefined, updatedAt: remote.updatedAt };
      await saveFolder(updated);
      folders = folders.map((value) => value.id === updated.id ? updated : value);
      await saveAccountSyncRecord(syncRecord(ownerId, "folder", remote));
      remoteFolders.delete(folder.id);
    } else {
      await saveAccountSyncRecord(syncRecord(ownerId, "folder", remote));
      remoteFolders.delete(folder.id);
    }
  }
  for (const remote of remoteFolders.values()) {
    const folder: LibraryFolder = {
      id: remote.id,
      name: remote.name,
      parentId: remote.parentId ?? undefined,
      createdAt: remote.updatedAt,
      updatedAt: remote.updatedAt,
    };
    await saveFolder(folder);
    await saveAccountSyncRecord(syncRecord(ownerId, "folder", remote));
    folders.push(folder);
  }

  const remoteDocuments = new Map(manifest.documents.map((document) => [document.id, document]));
  const remoteProgress = new Map(manifest.progress.map((progress) => [progress.documentId, progress]));
  let books = [...initialBooks];
  for (const book of initialBooks) {
    if (allRecords.some((record) => record.kind === "document" && record.itemId === book.id && record.ownerId !== ownerId)) {
      localOnly += 1;
      continue;
    }
    const remote = remoteDocuments.get(book.id);
    const record = recordsByKey.get(syncKey(ownerId, "document", book.id));
    if (!remote && record) {
      await removeBook(book.id);
      books = books.filter((value) => value.id !== book.id);
      continue;
    }
    if (!remote) {
      try {
        const saved = await uploadDocument(token, book);
        await saveAccountSyncRecord(syncRecord(ownerId, "document", saved));
        await uploadCloudProgress(token, book);
        uploaded += 1;
      } catch (error) {
        if (error instanceof AccountSyncError && ["document_limit_reached", "document_too_large"].includes(error.code)) {
          localOnly += 1;
          continue;
        }
        throw error;
      }
      continue;
    }

    let resolved = book;
    let resolvedRemote = remote;
    if (remote.updatedAt > book.updatedAt) {
      resolved = await downloadDocument(token, remote, remoteProgress.get(book.id));
      await saveBook(resolved);
      books = books.map((value) => value.id === book.id ? resolved : value);
      downloaded += 1;
    } else if (book.updatedAt > remote.updatedAt) {
      resolvedRemote = await uploadDocument(token, book, remote.revision);
      uploaded += 1;
    }
    const progress = remoteProgress.get(book.id);
    const localProgressAt = resolved.position.updatedAt ?? resolved.updatedAt;
    if (progress && progress.updatedAt > localProgressAt) {
      resolved = {
        ...resolved,
        position: {
          blockIndex: progress.blockIndex,
          offsetSeconds: progress.offsetSeconds,
          speed: progress.speed,
          updatedAt: progress.updatedAt,
        },
      };
      await saveBook(resolved);
      books = books.map((value) => value.id === book.id ? resolved : value);
    } else if (!progress || localProgressAt > progress.updatedAt) {
      await uploadCloudProgress(token, resolved);
    }
    await saveAccountSyncRecord(syncRecord(ownerId, "document", resolvedRemote));
    remoteDocuments.delete(book.id);
  }

  for (const remote of remoteDocuments.values()) {
    const record = recordsByKey.get(syncKey(ownerId, "document", remote.id));
    if (record) {
      await deleteCloudDocument(token, remote.id);
      continue;
    }
    const downloadedBook = await downloadDocument(token, remote, remoteProgress.get(remote.id));
    await saveBook(downloadedBook);
    await saveAccountSyncRecord(syncRecord(ownerId, "document", remote));
    books.push(downloadedBook);
    downloaded += 1;
  }
  return { books: await listBooks(), folders: await listFolders(), uploaded, downloaded, localOnly };
}
