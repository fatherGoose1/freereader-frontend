import assert from "node:assert/strict";
import test from "node:test";
import { paginateLibrary } from "./libraryPagination";

test("library pages contain at most nine documents and clamp after the list shrinks", () => {
  const documents = Array.from({ length: 20 }, (_, index) => index + 1);
  assert.deepEqual(paginateLibrary(documents, 1), { page: 1, pageCount: 3, items: documents.slice(0, 9) });
  assert.deepEqual(paginateLibrary(documents, 2), { page: 2, pageCount: 3, items: documents.slice(9, 18) });
  assert.deepEqual(paginateLibrary(documents, 3), { page: 3, pageCount: 3, items: [19, 20] });
  assert.deepEqual(paginateLibrary(documents.slice(0, 10), 3), { page: 2, pageCount: 2, items: [10] });
  assert.deepEqual(paginateLibrary([], 2), { page: 1, pageCount: 1, items: [] });
});
