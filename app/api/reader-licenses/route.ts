import { NextResponse } from "next/server";

export const runtime = "nodejs";

function authorization(request: Request): string | null {
  const supplied = request.headers.get("Authorization") ?? "";
  return /^Bearer \S+$/.test(supplied) && supplied.length <= 4103 ? supplied : null;
}

async function forward(token: string, code?: string) {
  const backend = (process.env.KOKO_BACKEND_URL ?? "https://koko-backend-production-c887.up.railway.app").replace(/\/$/, "");
  try {
    const response = await fetch(`${backend}/api/v1/freereader/licenses${code ? "/redeem" : ""}`, {
      method: code ? "POST" : "GET", cache: "no-store", signal: AbortSignal.timeout(15_000),
      headers: { Authorization: token, ...(code ? { "Content-Type": "application/json" } : {}) },
      ...(code ? { body: JSON.stringify({ code }) } : {}),
    });
    return NextResponse.json(await response.json(), { status: response.status,
      headers: { "Cache-Control": "private, no-store" } });
  } catch {
    return NextResponse.json({ error: "licenses_unavailable" }, { status: 502 });
  }
}

export async function GET(request: Request) {
  const token = authorization(request);
  if (!token) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  return forward(token);
}

export async function POST(request: Request) {
  const token = authorization(request);
  if (!token) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const body = await request.json().catch(() => null);
  const code = typeof body?.code === "string" ? body.code.trim().toUpperCase() : "";
  if (!/^[A-Z0-9]{8}$/.test(code)) return NextResponse.json({ error: "invalid_code" }, { status: 400 });
  return forward(token, code);
}
