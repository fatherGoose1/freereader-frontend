import { NextResponse } from "next/server";
import { allowedFile, archiveMetadata } from "../../archive";
import { MAX_IMPORT_BYTES } from "../../../../reader/importFormats";

export const runtime = "nodejs";

export async function GET(request: Request, { params }: { params: Promise<{ identifier: string }> }) {
  const { identifier } = await params;
  const { status, data } = await archiveMetadata(identifier);
  if (!data) return NextResponse.json({ error: "archive_unavailable" }, { status });
  const file = allowedFile(data, new URL(request.url).searchParams.get("name") ?? "");
  if (!file) return NextResponse.json({ error: "file_unavailable" }, { status: 404 });
  const response = await fetch(`https://archive.org/download/${encodeURIComponent(identifier)}/${encodeURIComponent(file.name)}`, {
    signal: AbortSignal.timeout(60_000),
    cache: "no-store",
  }).catch(() => null);
  if (!response?.ok) return NextResponse.json({ error: "file_unavailable" }, { status: response?.status === 401 || response?.status === 403 ? 403 : 502 });
  if (/text\/html/i.test(response.headers.get("content-type") ?? "")) {
    await response.body?.cancel();
    return NextResponse.json({ error: "file_unavailable" }, { status: 403 });
  }
  if (Number(response.headers.get("content-length")) > MAX_IMPORT_BYTES) {
    await response.body?.cancel();
    return NextResponse.json({ error: "file_too_large" }, { status: 413 });
  }
  return new Response(response.body, {
    headers: { "Content-Type": response.headers.get("content-type") ?? "application/octet-stream", "Cache-Control": "no-store" },
  });
}
