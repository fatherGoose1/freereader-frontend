import { NextResponse } from "next/server";

export const runtime = "nodejs";

// Project Gutenberg cover images do not send CORS or CORP headers, so the
// document's COEP require-corp policy blocks direct <img> loads. Serving them
// from our own origin keeps crossOriginIsolated enabled for WASM threads.
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  if (!/^[1-9]\d{0,7}$/.test(id)) {
    return NextResponse.json({ error: "invalid_book_id" }, { status: 400 });
  }

  const response = await fetch(
    `https://www.gutenberg.org/cache/epub/${id}/pg${id}.cover.small.jpg`,
    { signal: AbortSignal.timeout(15_000) },
  ).catch(() => null);
  if (!response?.ok) {
    return NextResponse.json({ error: "cover_unavailable" }, { status: 404 });
  }

  const contentType = response.headers.get("Content-Type") ?? "";
  return new Response(response.body, {
    status: 200,
    headers: {
      "Content-Type": contentType.startsWith("image/") ? contentType : "image/jpeg",
      "Cache-Control": "public, max-age=86400, s-maxage=604800, stale-while-revalidate=604800",
    },
  });
}
