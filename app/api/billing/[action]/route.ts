import { NextResponse } from "next/server";

export const runtime = "nodejs";

const ACTIONS = new Set(["checkout", "portal", "gold-offer-checkout", "signup-offer-checkout"]);
const PLANS = new Set(["gold_yearly", "gold_monthly"]);

export async function POST(request: Request, { params }: { params: Promise<{ action: string }> }) {
  const { action } = await params;
  if (!ACTIONS.has(action)) return NextResponse.json({ error: "invalid_action" }, { status: 404 });
  const supplied = request.headers.get("Authorization") ?? "";
  if (!supplied.startsWith("Bearer ") || supplied.length > 4103) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const body = action === "checkout" ? await request.json().catch(() => null) as { plan?: unknown } | null : null;
  if (action === "checkout" && (!body || typeof body.plan !== "string" || !PLANS.has(body.plan))) {
    return NextResponse.json({ error: "invalid_plan" }, { status: 400 });
  }
  const backend = (process.env.KOKO_BACKEND_URL ?? "https://koko-backend-production-c887.up.railway.app").replace(/\/$/, "");
  try {
    const response = await fetch(`${backend}/api/v1/freereader/billing/${action}`, {
      method: "POST", cache: "no-store", signal: AbortSignal.timeout(30_000),
      headers: { Authorization: supplied, ...(body ? { "Content-Type": "application/json" } : {}) },
      ...(body ? { body: JSON.stringify({ plan: body.plan }) } : {}),
    });
    return NextResponse.json(await response.json(), { status: response.status, headers: { "Cache-Control": "private, no-store" } });
  } catch {
    return NextResponse.json({ error: "billing_unavailable" }, { status: 502 });
  }
}
