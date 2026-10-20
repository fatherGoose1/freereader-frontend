import { NextResponse } from "next/server";
import { normalizeCapitalization } from "../../reader/speechText";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const body = await request.json().catch(() => null) as { text?: unknown } | null;
  if (!body || typeof body.text !== "string" || !body.text.trim()) {
    return NextResponse.json({ error: "invalid_request" }, { status: 400 });
  }
  const text = body.text.trim();
  if (text.length > 800) return NextResponse.json({ error: "text_too_large" }, { status: 413 });

  const token = process.env.FREEREADER_TTS_API_TOKEN ?? process.env.PARRYT_API_TOKEN;
  const demoToken = process.env.FREEREADER_DEMO_API_TOKEN;
  if (!token || !demoToken) return NextResponse.json({ error: "speech_not_configured" }, { status: 503 });
  const backend = (process.env.KOKO_BACKEND_URL ?? "https://koko-backend-production-c887.up.railway.app").replace(/\/$/, "");
  const controller = new AbortController();
  const onAbort = () => controller.abort();
  request.signal.addEventListener("abort", onAbort);
  const timeout = setTimeout(() => controller.abort(), 120_000);
  let response: Response;
  try {
    response = await fetch(`${backend}/api/v1/freereader/speech`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
        "X-FreeReader-Demo-Token": demoToken,
      },
      body: JSON.stringify({ text: normalizeCapitalization(text), speed: 1, detect_language: true, steps: 12, quality: "enhanced" }),
      signal: controller.signal,
      cache: "no-store",
    });
  } catch {
    return NextResponse.json({ error: "speech_unavailable" }, { status: 502 });
  } finally {
    clearTimeout(timeout);
    request.signal.removeEventListener("abort", onAbort);
  }
  if (!response.ok) return new Response(await response.text(), { status: response.status,
    headers: { "Content-Type": response.headers.get("Content-Type") ?? "application/json" } });
  const contentType = response.headers.get("Content-Type") ?? "";
  if (!contentType.startsWith("audio/") || !response.body) {
    return NextResponse.json({ error: "invalid_speech_response" }, { status: 502 });
  }
  const headers = new Headers({ "Content-Type": contentType, "Cache-Control": "private, no-store" });
  for (const name of ["X-Audio-Duration", "X-Generation-Seconds", "X-TTS-Model", "X-TTS-Language"]) {
    const value = response.headers.get(name);
    if (value) headers.set(name, value);
  }
  return new Response(response.body, { status: 200, headers });
}
