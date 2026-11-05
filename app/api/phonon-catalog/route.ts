import { NextResponse } from "next/server";

export async function GET() {
  const backend = (process.env.KOKO_BACKEND_URL ?? "https://koko-backend-production-c887.up.railway.app").replace(/\/$/, "");
  try {
    const response = await fetch(`${backend}/api/v1/freereader/phonon/catalog`, { next: { revalidate: 300 },
      signal: AbortSignal.timeout(10_000) });
    if (!response.ok) throw new Error("catalog_unavailable");
    return NextResponse.json(await response.json(), { headers: { "Cache-Control": "public, max-age=300" } });
  } catch {
    return NextResponse.json({ error: "catalog_unavailable" }, { status: 503 });
  }
}
