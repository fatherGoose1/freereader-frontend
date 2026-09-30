import { getPublicBook } from "../../../../../lib/author-public";

export async function GET(_request: Request, { params }: { params: Promise<{ slug: string }> }) {
  try {
    const book = await getPublicBook((await params).slug);
    return Response.json(book ? { book } : { error: "This book is not currently published." }, {
      status: book ? 200 : 404, headers: { "Cache-Control": "no-store" },
    });
  } catch {
    return Response.json({ error: "Could not load this book. Please try again." }, { status: 503 });
  }
}
