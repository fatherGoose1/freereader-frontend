import "fake-indexeddb/auto";
import assert from "node:assert/strict";
import { test } from "node:test";
import { clearDraft, emptyDraft, loadDraft, saveDraft } from "./draft";
import { groupAuthorBooks, toReaderBook, type AuthorBook, type AuthorBookWithDocument } from "./model";

test("an author draft survives a fresh read with its original file, profile image, cover and metadata", async () => {
  const key = `draft:${crypto.randomUUID()}`;
  const file = new File(["A story to narrate."], "story.txt", { type: "text/plain" });
  const cover = new Blob(["cover bytes"], { type: "image/png" });
  const profileImage = new Blob(["profile bytes"], { type: "image/webp" });
  try {
    await saveDraft(key, { ...emptyDraft(), title: "The Story", displayName: "Robin",
      file, cover, profileImage, rawText: "My notes", seriesOrder: "2",
    });
    const restored = await loadDraft(key);
    assert.equal(restored?.file?.name, "story.txt");
    assert.equal(restored?.file?.type, "text/plain");
    assert.equal(await restored.file.text(), "A story to narrate.");
    assert.equal(await restored.cover?.text(), "cover bytes");
    assert.equal(await restored.profileImage?.text(), "profile bytes");
    assert.equal(restored.title, "The Story");
    assert.equal(restored.seriesOrder, "2");
    // A final pre-redirect write cannot be overwritten by an older autosave.
    const previous = saveDraft(key, { ...restored, title: "Old" });
    const latest = saveDraft(key, { ...restored, title: "New" });
    await Promise.all([previous, latest]);
    assert.equal((await loadDraft(key))?.title, "New");
  } finally { await clearDraft(key); }
  assert.equal(await loadDraft(key), undefined);
});

test("series are grouped in explicit order and public books retain reader progress when updated", () => {
  const book = (id: string, seriesId: string | null, order: number | null): AuthorBook => ({
    id, user_id: "owner", slug: `slug-${id}`, title: `Title ${id}`, author_name: "Robin", description: "",
    cover_path: null, series_id: seriesId, series_order: order, status: "published",
    created_at: "2026-01-01T00:00:00Z", updated_at: "2026-02-01T00:00:00Z",
  });
  const one = book("one", "series", 1);
  const two = book("two", "series", 2);
  const standalone = book("solo", null, null);
  const groups = groupAuthorBooks([two, standalone, one], [{ id: "series", user_id: "owner", name: "A Series" }]);
  assert.deepEqual(groups.map((group) => group.books.map((entry) => entry.id)), [["one", "two"], ["solo"]]);
  const published: AuthorBookWithDocument = { ...one, document: {
    title: "Old embedded title", format: "txt", sourceName: "story.txt", size: 200,
    chapters: [], blocks: [{ index: 0, text: "Beginning", chapterIndex: 0, isHeading: false }],
  } };
  const imported = toReaderBook(published);
  assert.equal(imported.title, "Title one");
  assert.equal(imported.sourceIdentifier, "author-book:one");
  assert.equal(imported.sourceUrl, "/books/slug-one");
  const continued = toReaderBook(published, undefined, { ...imported,
    position: { blockIndex: 3, offsetSeconds: 5, speed: 1.2 },
  });
  assert.deepEqual(continued.position, { blockIndex: 3, offsetSeconds: 5, speed: 1.2 });
});
