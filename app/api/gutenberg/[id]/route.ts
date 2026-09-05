import { NextResponse } from "next/server";

export const runtime = "nodejs";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  if (!/^[1-9]\d{0,7}$/.test(id)) {
    return NextResponse.json({ error: "invalid_book_id" }, { status: 400 });
  }

  const backend = process.env.KOKO_BACKEND_URL
    ?? "https://koko-backend-production-c887.up.railway.app";
  const token = process.env.PARRYT_API_TOKEN;
  if (!token) {
    return NextResponse.json({ error: "Gutenberg downloads are not configured" }, { status: 503 });
  }

  const response = await fetch(
    `${backend.replace(/\/$/, "")}/api/v1/parryt/gutenberg-epubs/${id}`,
    {
      headers: { Authorization: `Bearer ${token}` },
      signal: AbortSignal.timeout(60_000),
    },
  ).catch(() => null);
  if (!response) {
    return NextResponse.json({ error: "Gutenberg download is unavailable" }, { status: 502 });
  }

  if (!response.ok) {
    const payload = await response.json().catch(() => ({ error: "invalid_backend_response" }));
    return NextResponse.json(payload, { status: response.status });
  }

  return new Response(response.body, {
    status: 200,
    headers: {
      "Content-Type": "application/epub+zip",
      "Content-Disposition": response.headers.get("Content-Disposition")
        ?? `attachment; filename="pg${id}.epub"`,
      "Cache-Control": "private, max-age=3600",
    },
  });
}
