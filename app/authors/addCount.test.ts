import assert from "node:assert/strict";
import test from "node:test";
import { POST } from "../api/authors/books/[slug]/add/route";

test("library adds use a published book and the same reader identity on repeat visits", async () => {
  const previousUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const previousKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  const previousFetch = globalThis.fetch;
  process.env.NEXT_PUBLIC_SUPABASE_URL = "https://example.test";
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = "test-anon-key";
  const readerId = "33333333-3333-4333-8333-333333333333";
  let records = 0;
  globalThis.fetch = async (input, init) => {
    const url = new URL(input instanceof Request ? input.url : String(input));
    if (url.pathname === "/rest/v1/author_books") {
      assert.equal(url.searchParams.get("status"), "eq.published");
      assert.equal(url.searchParams.get("slug"), "eq.river");
      return Response.json({ id: "11111111-1111-4111-8111-111111111111" });
    }
    assert.equal(url.pathname, "/rest/v1/rpc/record_author_book_add");
    assert.deepEqual(JSON.parse(String(init?.body)), {
      p_book_id: "11111111-1111-4111-8111-111111111111", p_reader_id: readerId,
    });
    records += 1;
    return Response.json(1); // The database's primary key keeps this count at one.
  };
  const request = () => new Request("http://localhost/api/authors/books/river/add", {
    method: "POST", body: JSON.stringify({ readerId }),
  });
  const context = { params: Promise.resolve({ slug: "river" }) };
  try {
    const invalid = await POST(new Request("http://localhost/api/authors/books/river/add", {
      method: "POST", body: JSON.stringify({ readerId: "not-a-uuid" }),
    }), context);
    assert.equal(invalid.status, 400);
    const first = await POST(request(), context);
    const second = await POST(request(), context);
    assert.equal(first.status, 200);
    assert.deepEqual(await first.json(), { additions: 1 });
    assert.deepEqual(await second.json(), { additions: 1 });
    assert.equal(records, 2);
  } finally {
    globalThis.fetch = previousFetch;
    if (previousUrl === undefined) delete process.env.NEXT_PUBLIC_SUPABASE_URL;
    else process.env.NEXT_PUBLIC_SUPABASE_URL = previousUrl;
    if (previousKey === undefined) delete process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    else process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = previousKey;
  }
});
