import { deleteCloudDocument, deleteCloudFolder } from "./accountSync";
import { deleteScan } from "./scanClient";
import { removeBook, removeFolder, saveBook } from "./storage";
import type { LibraryBook, LibraryFolder } from "./types";

export function folderContents(folder: LibraryFolder, folders: LibraryFolder[], books: LibraryBook[]) {
  const seen = new Set<string>();
  const descendants: LibraryFolder[] = [];
  const visit = (current: LibraryFolder) => {
    if (seen.has(current.id)) return;
    seen.add(current.id);
    for (const child of folders.filter((item) => item.parentId === current.id)) visit(child);
    descendants.push(current);
  };
  visit(folder);
  return { folders: descendants, books: books.filter((book) => book.parentId && seen.has(book.parentId)) };
}

export async function deleteLibraryFolder(
  folder: LibraryFolder,
  folders: LibraryFolder[],
  books: LibraryBook[],
  deleteDocuments: boolean,
  token?: string,
): Promise<number> {
  const contents = folderContents(folder, folders, books);
  for (const book of contents.books) {
    if (deleteDocuments) {
      if (book.sourceIdentifier?.startsWith("scan:")) await deleteScan(book.id);
      if (token) await deleteCloudDocument(token, book.id);
      await removeBook(book.id);
    } else {
      await saveBook({ ...book, parentId: undefined, updatedAt: new Date().toISOString() });
    }
  }
  // Delete children first so the cloud endpoint cannot reparent them to the root.
  for (const item of contents.folders) {
    if (token) await deleteCloudFolder(token, item.id);
    await removeFolder(item.id);
  }
  return contents.books.length;
}
