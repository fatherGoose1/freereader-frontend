import { publicAuthorClient } from "../../../../../../lib/author-public";

export async function POST(request: Request, { params }: { params: Promise<{ slug: string }> }) {
  const { readerId } = await request.json().catch(() => ({})) as { readerId?: unknown };
  if (typeof readerId !== "string" || !/^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(readerId)) {
    return Response.json({ error: "A reader ID is required." }, { status: 400 });
  }
  try {
    const client = publicAuthorClient();
    const { data: book, error } = await client.from("author_books").select("id").eq("slug", (await params).slug)
      .eq("status", "published").maybeSingle();
    if (error) throw error;
    if (!book) return Response.json({ error: "This book is not currently published." }, { status: 404 });
    const { data, error: countError } = await client.rpc("record_author_book_add", {
      p_book_id: book.id, p_reader_id: readerId,
    });
    if (countError) throw countError;
    return Response.json({ additions: Number(data) }, { headers: { "Cache-Control": "no-store" } });
  } catch {
    return Response.json({ error: "Could not record this library add. Please try again." }, { status: 503 });
  }
}
