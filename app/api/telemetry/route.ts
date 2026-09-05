import { NextResponse } from "next/server";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const backend = process.env.KOKO_BACKEND_URL
    ?? "https://koko-backend-production-c887.up.railway.app";
  const token = process.env.FREEREADER_TELEMETRY_INGEST_TOKEN;
  if (!token) {
    return NextResponse.json({ error: "telemetry_not_configured" }, { status: 503 });
  }
  const body = await request.text();
  const response = await fetch(`${backend.replace(/\/$/, "")}/api/v1/freereader/telemetry/events`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body,
    signal: AbortSignal.timeout(15_000),
  }).catch(() => null);
  if (!response) {
    return NextResponse.json({ error: "telemetry_unavailable" }, { status: 502 });
  }
  const payload = await response.text();
  return new Response(payload, {
    status: response.status,
    headers: { "Content-Type": "application/json" },
  });
}
