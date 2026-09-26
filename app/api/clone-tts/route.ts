import { NextResponse } from "next/server";
import { callBackend, freereaderBackendConfig } from "../freereaderBackend";

export const runtime = "nodejs";

// Generates speech with a persisted user clone through the Koko backend, which
// calls the Qwen3-TTS Modal app. Mirrors the /api/tts response shape.
export async function POST(request: Request) {
  const config = freereaderBackendConfig();
  if (!config) return NextResponse.json({ error: "speech_not_configured" }, { status: 503 });
  const userToken = request.headers.get("Authorization")?.match(/^Bearer (.+)$/)?.[1];
  if (!userToken) return NextResponse.json({ error: "premium_required" }, { status: 403 });

  const body = await request.json().catch(() => null) as {
    text?: unknown; voiceId?: unknown; userId?: unknown; language?: unknown; speed?: unknown;
  } | null;
  const text = typeof body?.text === "string" ? body.text.trim() : "";
  const voiceId = typeof body?.voiceId === "string" ? body.voiceId.trim() : "";
  const userId = typeof body?.userId === "string" ? body.userId.trim() : "";
  if (!text || !voiceId || !userId) return NextResponse.json({ error: "invalid_request" }, { status: 400 });

  const upstreamBody: Record<string, unknown> = { text, voice_id: voiceId, user_id: userId };
  if (typeof body?.language === "string" && body.language) upstreamBody.language = body.language;
  if (typeof body?.speed === "number" && Number.isFinite(body.speed)) upstreamBody.speed = body.speed;

  let response: Response;
  try {
    response = await callBackend(config, "/api/v1/freereader/speech/clone", upstreamBody, 300_000, userToken);
  } catch {
    return NextResponse.json({ error: "clone_speech_unavailable" }, { status: 502 });
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
    return NextResponse.json({ error: "invalid_clone_speech_response" }, { status: 502 });
  }
  const headers = new Headers({ "Content-Type": contentType, "Cache-Control": "private, no-store" });
  for (const name of ["X-Audio-Duration", "X-Generation-Seconds", "X-TTS-Model", "X-TTS-Language"]) {
    const value = response.headers.get(name);
    if (value) headers.set(name, value);
  }
  return new Response(response.body, { status: 200, headers });
}
