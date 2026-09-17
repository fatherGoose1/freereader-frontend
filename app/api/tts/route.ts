import { NextResponse } from "next/server";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const body = await request.json().catch(() => null) as { text?: unknown; speed?: unknown } | null;
  if (!body || typeof body.text !== "string" || !body.text.trim()
    || typeof body.speed !== "number" || !Number.isFinite(body.speed)) {
    return NextResponse.json({ error: "invalid_request" }, { status: 400 });
  }
  const backend = process.env.KOKO_BACKEND_URL
    ?? "https://koko-backend-production-c887.up.railway.app";
  const token = process.env.FREEREADER_TTS_API_TOKEN ?? process.env.PARRYT_API_TOKEN;
  if (!token) return NextResponse.json({ error: "speech_not_configured" }, { status: 503 });
  const upstreamContext = (request.headers.get("x-freereader-context") ?? "").slice(0, 2048);

  let response: Response;
  const controller = new AbortController();
  const onAbort = () => controller.abort();
  request.signal.addEventListener("abort", onAbort);
  const timeout = setTimeout(() => controller.abort(), 120_000);
  try {
    response = await fetch(`${backend.replace(/\/$/, "")}/api/v1/freereader/speech`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
        ...(upstreamContext ? { "X-FreeReader-Context": upstreamContext } : {}),
      },
      body: JSON.stringify({ text: body.text, speed: body.speed }),
      signal: controller.signal,
      cache: "no-store",
    });
  } catch {
    return NextResponse.json({ error: "speech_unavailable" }, { status: 502 });
  } finally {
    clearTimeout(timeout);
    request.signal.removeEventListener("abort", onAbort);
  }
  if (!response.ok) {
    const payload = await response.text();
    return new Response(payload, {
      status: response.status,
      headers: { "Content-Type": response.headers.get("Content-Type") ?? "application/json" },
    });
  }
  const contentType = response.headers.get("Content-Type") ?? "";
  if (!contentType.startsWith("audio/") || !response.body) {
    return NextResponse.json({ error: "invalid_speech_response" }, { status: 502 });
  }
  const headers = new Headers({ "Content-Type": contentType, "Cache-Control": "private, no-store" });
  for (const name of ["X-Audio-Duration", "X-Generation-Seconds", "X-TTS-Model"]) {
    const value = response.headers.get(name);
    if (value) headers.set(name, value);
  }
  return new Response(response.body, { status: 200, headers });
}
