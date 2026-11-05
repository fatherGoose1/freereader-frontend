import { NextResponse } from "next/server";

export const runtime = "nodejs";

const PLANS = new Set(["pro", "premium", "gold_yearly", "gold_monthly"]);

export async function GET(request: Request) {
  const plan = new URL(request.url).searchParams.get("plan");
  if (!plan || !PLANS.has(plan)) return NextResponse.json({ error: "invalid_plan" }, { status: 400 });
  const backend = (process.env.KOKO_BACKEND_URL ?? "https://koko-backend-production-c887.up.railway.app").replace(/\/$/, "");
  try {
    const response = await fetch(`${backend}/api/v1/freereader/billing/price?plan=${plan}`, {
      next: { revalidate: 300 }, signal: AbortSignal.timeout(10_000),
    });
    const body = await response.json();
    return NextResponse.json(body, { status: response.status,
      headers: { "Cache-Control": response.ok ? "public, max-age=300" : "no-store" } });
  } catch {
    return NextResponse.json({ error: "price_unavailable" }, { status: 502 });
  }
}
