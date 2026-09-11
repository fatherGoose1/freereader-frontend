import { NextResponse } from "next/server";
import { failureCategory, fallbackError } from "../../reader/importErrors";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const body = await request.json().catch(() => null) as { url?: unknown } | null;
  if (!body || typeof body.url !== "string") {
    return NextResponse.json({ error: "invalid_url" }, { status: 400 });
  }
  let url: URL;
  try {
    url = new URL(body.url);
    if (!/^https?:$/.test(url.protocol) || url.username || url.password) throw new Error();
  } catch {
    return NextResponse.json({ error: "Enter a valid public web address.", code: "invalid_url", error_category: "unsupported" }, { status: 400 });
  }
  const backend = process.env.KOKO_BACKEND_URL ?? "https://koko-backend-production-c887.up.railway.app";
  const token = process.env.PARRYT_API_TOKEN;
  if (!token) {
    return NextResponse.json({ error: "URL fallback is not configured", code: "fallback_not_configured", error_category: "configuration" }, { status: 503 });
  }
  let response: Response;
  try {
    response = await fetch(`${backend.replace(/\/$/, "")}/api/v1/parryt/article-extractions`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ url: url.toString() }),
      signal: AbortSignal.timeout(30_000),
    });
  } catch (error) {
    const timedOut = failureCategory(error) === "timeout";
    return NextResponse.json({ error: timedOut ? "URL fallback timed out" : "URL fallback is unavailable" }, { status: timedOut ? 504 : 502 });
  }
  let payload: unknown;
  try { payload = await response.json(); }
  catch (error) {
    const status = failureCategory(error) === "timeout" ? 504 : response.ok ? 502 : response.status;
    const failure = fallbackError({ error: "invalid_backend_response" }, status, "unknown");
    return NextResponse.json({ error: failure.message, code: failure.code, error_category: failure.category }, { status });
  }
  if (!response.ok) {
    const failure = fallbackError(payload, response.status, "unknown");
    return NextResponse.json({ error: failure.message, code: failure.code, error_category: failure.category }, { status: response.status });
  }
  if (!payload || typeof payload !== "object" || !("text" in payload) || typeof payload.text !== "string") {
    return NextResponse.json({ error: "invalid_backend_response" }, { status: 502 });
  }
  if (!payload.text.trim()) {
    return NextResponse.json({ error: "No readable article text was found.", error_category: "insufficient_content" }, { status: 422 });
  }
  const article = payload as { title?: unknown; text: string; source_url?: unknown };
  return NextResponse.json({
    text: article.text,
    title: typeof article.title === "string" ? article.title : undefined,
    source_url: typeof article.source_url === "string" ? article.source_url : undefined,
  });
}
