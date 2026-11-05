import { NextResponse } from "next/server";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const installation = new URL(request.url).searchParams.get("installation_id") ?? "";
  if (!/^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(installation)) {
    return NextResponse.json({ error: "invalid_installation_id" }, { status: 400 });
  }
  const authorization = request.headers.get("Authorization") ?? "";
  if (authorization.length > 4103) return NextResponse.json({ error: "invalid_authorization" }, { status: 400 });
  const backend = (process.env.KOKO_BACKEND_URL ?? "https://koko-backend-production-c887.up.railway.app").replace(/\/$/, "");
  try {
    const response = await fetch(`${backend}/api/v1/freereader/usage?installation_id=${installation}`, {
      cache: "no-store", signal: AbortSignal.timeout(10_000),
      headers: authorization ? { Authorization: authorization } : {},
    });
    return NextResponse.json(await response.json(), { status: response.status,
      headers: { "Cache-Control": "private, no-store" } });
  } catch {
    return NextResponse.json({ error: "usage_unavailable" }, { status: 502 });
  }
}
