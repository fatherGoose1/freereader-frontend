import { getPublishedBookAddCounts, getPublishedBooks } from "../../../../lib/author-public";

// A stable per-book starting point; recorded library adds are counted separately.
function featuredReads(id: string): number {
  let hash = 0;
  for (const character of id) hash = (Math.imul(hash, 31) + character.charCodeAt(0)) >>> 0;
  return 10 + hash % 21;
}

export async function GET() {
  try {
    const [books, additions] = await Promise.all([getPublishedBooks(), getPublishedBookAddCounts()]);
    return Response.json({ books: books.map((book) => ({ ...book, reads: featuredReads(book.id) + (additions.get(book.id) ?? 0) })) }, {
      headers: { "Cache-Control": "no-store" },
    });
  } catch {
    return Response.json({ error: "Could not load author books. Please try again." }, { status: 503 });
  }
}
