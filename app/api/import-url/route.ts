import { NextResponse } from "next/server";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const body = await request.json().catch(() => null) as { url?: unknown } | null;
  if (!body || typeof body.url !== "string") {
    return NextResponse.json({ error: "invalid_url" }, { status: 400 });
  }
  const backend = process.env.KOKO_BACKEND_URL ?? "https://koko-backend-production-c887.up.railway.app";
  const token = process.env.PARRYT_API_TOKEN;
  if (!token) {
    return NextResponse.json({ error: "URL fallback is not configured" }, { status: 503 });
  }
  const response = await fetch(`${backend.replace(/\/$/, "")}/api/v1/parryt/article-extractions`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ url: body.url }),
    signal: AbortSignal.timeout(30_000),
  }).catch(() => null);
  if (!response) return NextResponse.json({ error: "URL fallback is unavailable" }, { status: 502 });
  const payload = await response.json().catch(() => ({ error: "invalid_backend_response" }));
  return NextResponse.json(payload, { status: response.status });
}
