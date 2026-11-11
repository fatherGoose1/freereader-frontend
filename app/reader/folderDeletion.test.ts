import assert from "node:assert/strict";
import test, { before } from "node:test";
import { indexedDB as fakeIndexedDB } from "fake-indexeddb";
import { deleteLibraryFolder, folderContents } from "./folderDeletion";
import { listBooks, listFolders, removeBook, removeFolder, saveBook, saveFolder } from "./storage";
import type { LibraryBook, LibraryFolder } from "./types";

before(() => { Object.defineProperty(globalThis, "indexedDB", { configurable: true, value: fakeIndexedDB }); });

function folder(name: string, parentId?: string): LibraryFolder {
  return { id: crypto.randomUUID(), name, parentId, createdAt: "2025-01-01T00:00:00Z", updatedAt: "2025-01-01T00:00:00Z" };
}

function book(title: string, parentId: string): LibraryBook {
  return { id: crypto.randomUUID(), title, parentId, format: "txt", sourceName: title, size: 20,
    createdAt: "2025-01-01T00:00:00Z", updatedAt: "2025-01-01T00:00:00Z",
    chapters: [], blocks: [], position: { blockIndex: 0, offsetSeconds: 0, speed: 1 } };
}

test("keeping documents moves books in nested folders to My library and removes only that folder tree", async () => {
  const root = folder("Research");
  const child = folder("Notes", root.id);
  const other = folder("Elsewhere");
  const direct = book("Direct", root.id);
  const nested = book("Nested", child.id);
  const unrelated = book("Unrelated", other.id);
  for (const item of [root, child, other]) await saveFolder(item);
  for (const item of [direct, nested, unrelated]) await saveBook(item);

  assert.deepEqual(folderContents(root, [root, child, other], [direct, nested, unrelated]).folders.map((item) => item.id), [child.id, root.id]);
  assert.equal(await deleteLibraryFolder(root, [root, child, other], [direct, nested, unrelated], false), 2);
  assert.deepEqual((await listFolders()).map((item) => item.id), [other.id]);
  const remaining = await listBooks();
  assert.equal(remaining.length, 3);
  assert.equal(remaining.find((item) => item.id === direct.id)?.parentId, undefined);
  assert.equal(remaining.find((item) => item.id === nested.id)?.parentId, undefined);
  assert.equal(remaining.find((item) => item.id === unrelated.id)?.parentId, other.id);
  assert.notEqual(remaining.find((item) => item.id === nested.id)?.updatedAt, nested.updatedAt);
  for (const item of remaining) await removeBook(item.id);
  await removeFolder(other.id);
});

test("deleting documents removes nested books remotely and locally before deleting their folders", async (t) => {
  const root = folder("Archive");
  const child = folder("Drafts", root.id);
  const direct = book("Direct draft", root.id);
  const nested = book("Nested draft", child.id);
  for (const item of [root, child]) await saveFolder(item);
  for (const item of [direct, nested]) await saveBook(item);
  const calls: string[] = [];
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (input, init) => {
    assert.equal(init?.method, "DELETE");
    assert.equal(new Headers(init?.headers).get("Authorization"), "Bearer account-token");
    calls.push(new URL(String(input)).pathname);
    return new Response(null, { status: 204 });
  };
  t.after(() => { globalThis.fetch = originalFetch; });

  assert.equal(await deleteLibraryFolder(root, [root, child], [direct, nested], true, "account-token"), 2);
  assert.deepEqual(calls, [
    `/api/v1/freereader/sync/documents/${direct.id}`,
    `/api/v1/freereader/sync/documents/${nested.id}`,
    `/api/v1/freereader/sync/folders/${child.id}`,
    `/api/v1/freereader/sync/folders/${root.id}`,
  ]);
  assert.deepEqual(await listBooks(), []);
  assert.deepEqual(await listFolders(), []);
});

test("keeping documents deletes synced folders but leaves their books in My library", async (t) => {
  const root = folder("Cloud folder");
  const kept = book("Keep me", root.id);
  await saveFolder(root);
  await saveBook(kept);
  const calls: string[] = [];
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (input, init) => {
    assert.equal(init?.method, "DELETE");
    calls.push(new URL(String(input)).pathname);
    return new Response(null, { status: 204 });
  };
  t.after(() => { globalThis.fetch = originalFetch; });

  await deleteLibraryFolder(root, [root], [kept], false, "account-token");
  assert.deepEqual(calls, [`/api/v1/freereader/sync/folders/${root.id}`]);
  assert.equal((await listBooks())[0]?.parentId, undefined);
  assert.deepEqual(await listFolders(), []);
  await removeBook(kept.id);
});

test("a failed cloud delete leaves the local document and folder available to retry", async (t) => {
  const root = folder("Try again");
  const retained = book("Retained", root.id);
  await saveFolder(root);
  await saveBook(retained);
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => Response.json({ error: "unavailable" }, { status: 503 });
  t.after(() => { globalThis.fetch = originalFetch; });

  await assert.rejects(deleteLibraryFolder(root, [root], [retained], true, "account-token"));
  assert.equal((await listBooks())[0]?.id, retained.id);
  assert.equal((await listFolders())[0]?.id, root.id);
  await removeBook(retained.id);
  await removeFolder(root.id);
});
