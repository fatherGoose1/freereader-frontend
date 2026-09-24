import { NextResponse } from "next/server";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const body = await request.json().catch(() => null) as {
    text?: unknown; texts?: unknown; speed?: unknown;
    language?: unknown; detectLanguage?: unknown; voice?: unknown; steps?: unknown; engine?: unknown;
  } | null;
  if (!body || typeof body.speed !== "number" || !Number.isFinite(body.speed)) {
    return NextResponse.json({ error: "invalid_request" }, { status: 400 });
  }
  const texts = Array.isArray(body.texts)
    ? body.texts.filter((value): value is string => typeof value === "string" && value.trim().length > 0)
    : null;
  const single = typeof body.text === "string" && body.text.trim() ? body.text : null;
  if (!single && !texts?.length) {
    return NextResponse.json({ error: "invalid_request" }, { status: 400 });
  }
  if (body.engine !== undefined && body.engine !== "supertonic") {
    return NextResponse.json({ error: "invalid_engine" }, { status: 400 });
  }
  const upstreamBody: Record<string, unknown> = texts
    ? { texts, speed: body.speed }
    : { text: single, speed: body.speed };
  // The landing demo lets the backend detect short text; reader narration supplies its language.
  if (body.detectLanguage === true) {
    upstreamBody.detect_language = true;
    if (typeof body.voice === "string") upstreamBody.voice = body.voice;
    if (typeof body.steps === "number") upstreamBody.steps = body.steps;
  } else {
    if (typeof body.language === "string" && (body.language !== "en" || body.engine === "supertonic")) upstreamBody.language = body.language;
    if (typeof body.voice === "string") upstreamBody.voice = body.voice;
    if (typeof body.steps === "number") upstreamBody.steps = body.steps;
  }
  if (body.engine === "supertonic") upstreamBody.engine = "supertonic";
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
      body: JSON.stringify(upstreamBody),
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
  const valid = contentType.startsWith("audio/") || contentType.startsWith("application/zip");
  if (!valid || !response.body) {
    return NextResponse.json({ error: "invalid_speech_response" }, { status: 502 });
  }
  const headers = new Headers({ "Content-Type": contentType, "Cache-Control": "private, no-store" });
  for (const name of ["X-Audio-Duration", "X-Audio-Durations", "X-Generation-Seconds", "X-TTS-Model", "X-TTS-Language"]) {
    const value = response.headers.get(name);
    if (value) headers.set(name, value);
  }
  return new Response(response.body, { status: 200, headers });
}
