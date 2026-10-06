import assert from "node:assert/strict";
import test from "node:test";
import { GET } from "../api/authors/books/route";
import { POST } from "../api/authors/books/[slug]/add/route";

test("the Free Books catalog requests published metadata and adds unique reader counts to stable seeds", async () => {
  const previousUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const previousKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  const previousFetch = globalThis.fetch;
  process.env.NEXT_PUBLIC_SUPABASE_URL = "https://example.test";
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = "test-anon-key";
  let requests = 0;
  const readers = new Set<string>();
  globalThis.fetch = async (input, init) => {
    const url = new URL(input instanceof Request ? input.url : String(input));
    requests += 1;
    if (url.pathname === "/rest/v1/rpc/author_book_add_counts") {
      return Response.json([{ book_id: "11111111-1111-4111-8111-111111111111", additions: 3 + readers.size }]);
    }
    if (url.pathname === "/rest/v1/rpc/record_author_book_add") {
      readers.add(JSON.parse(String(init?.body)).p_reader_id);
      return Response.json(3 + readers.size);
    }
    assert.equal(url.pathname, "/rest/v1/author_books");
    assert.equal(url.searchParams.get("status"), "eq.published");
    if (url.searchParams.get("select") === "id") return Response.json({ id: "11111111-1111-4111-8111-111111111111" });
    assert.equal(url.searchParams.get("select"), "id,slug,title,description,author_name,cover_path");
    return Response.json([
      { id: "11111111-1111-4111-8111-111111111111", slug: "river", title: "River", description: "A river tale", author_name: "Robin", cover_path: null },
      { id: "22222222-2222-4222-8222-222222222222", slug: "night", title: "Night", description: "A night tale", author_name: "Morgan", cover_path: null },
    ]);
  };
  try {
    const first = await GET();
    const second = await GET();
    assert.equal(first.status, 200);
    assert.equal(first.headers.get("Cache-Control"), "no-store");
    const books = (await first.json()).books as Array<{ id: string; reads: number }>;
    assert.equal(books.length, 2);
    assert.ok(books[0].reads >= 13 && books[0].reads <= 33);
    assert.ok(books[1].reads >= 10 && books[1].reads <= 30);
    assert.equal((books[0] as typeof books[0] & { description: string }).description, "A river tale");
    assert.deepEqual((await second.json()).books, books);
    const add = () => POST(new Request("http://localhost/api/authors/books/river/add", {
      method: "POST", body: JSON.stringify({ readerId: "33333333-3333-4333-8333-333333333333" }),
    }), { params: Promise.resolve({ slug: "river" }) });
    assert.equal((await add()).status, 200);
    const afterAdd = (await (await GET()).json()).books as typeof books;
    assert.equal(afterAdd[0].reads, books[0].reads + 1);
    assert.equal(afterAdd[1].reads, books[1].reads);
    assert.equal((await add()).status, 200);
    assert.deepEqual((await (await GET()).json()).books, afterAdd);
    assert.equal(requests, 12);
  } finally {
    globalThis.fetch = previousFetch;
    if (previousUrl === undefined) delete process.env.NEXT_PUBLIC_SUPABASE_URL;
    else process.env.NEXT_PUBLIC_SUPABASE_URL = previousUrl;
    if (previousKey === undefined) delete process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    else process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = previousKey;
  }
});
