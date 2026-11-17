import { NextResponse } from "next/server";

export const runtime = "nodejs";
const ACTIONS = new Set(["register", "quote", "checkout"]);

export async function POST(request: Request, { params }: { params: Promise<{ action: string }> }) {
  const { action } = await params;
  if (!ACTIONS.has(action)) return NextResponse.json({ error: "invalid_action" }, { status: 404 });
  const supplied = request.headers.get("Authorization") ?? "";
  if (!/^Bearer \S+$/.test(supplied) || supplied.length > 4103) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  let body: { quantity: number } | undefined;
  if (action !== "register") {
    const input = await request.json().catch(() => null);
    if (!Number.isInteger(input?.quantity) || input.quantity < 1 || input.quantity > 1000) {
      return NextResponse.json({ error: "invalid_quantity" }, { status: 400 });
    }
    body = { quantity: input.quantity };
  }
  const backend = (process.env.KOKO_BACKEND_URL ?? "https://koko-backend-production-c887.up.railway.app").replace(/\/$/, "");
  try {
    const response = await fetch(`${backend}/api/v1/freereader/licenses/${action}`, {
      method: "POST", cache: "no-store", signal: AbortSignal.timeout(30_000),
      headers: { Authorization: supplied, ...(body ? { "Content-Type": "application/json" } : {}) },
      ...(body ? { body: JSON.stringify(body) } : {}),
    });
    if (response.status === 404) {
      return NextResponse.json({ error: "admin_billing_unavailable" }, { status: 503, headers: { "Cache-Control": "private, no-store" } });
    }
    return NextResponse.json(await response.json(), { status: response.status, headers: { "Cache-Control": "private, no-store" } });
  } catch {
    return NextResponse.json({ error: "licenses_unavailable" }, { status: 502 });
  }
}
