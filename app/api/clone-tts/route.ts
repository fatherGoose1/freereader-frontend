import { NextResponse } from "next/server";
import { callQwen3Tts, qwen3TtsConfig } from "../qwen3Tts";

export const runtime = "nodejs";

// Generates speech with a persisted user clone. Mirrors the /api/tts response
// shape (audio bytes plus generation metadata headers) so the narration client
// can treat both providers identically.
export async function POST(request: Request) {
  const config = qwen3TtsConfig();
  if (!config) return NextResponse.json({ error: "clone_speech_not_configured" }, { status: 503 });

  const body = await request.json().catch(() => null) as {
    text?: unknown; voiceId?: unknown; userId?: unknown; language?: unknown; speed?: unknown;
  } | null;
  const text = typeof body?.text === "string" ? body.text.trim() : "";
  const voiceId = typeof body?.voiceId === "string" ? body.voiceId.trim() : "";
  const userId = typeof body?.userId === "string" ? body.userId.trim() : "";
  if (!text || !voiceId || !userId) return NextResponse.json({ error: "invalid_request" }, { status: 400 });

  const upstreamBody: Record<string, unknown> = {
    text,
    voice_type: "clone",
    voice_id: voiceId,
    user_id: userId,
    format: "m4a",
  };
  if (typeof body?.language === "string" && body.language) upstreamBody.language = body.language;
  if (typeof body?.speed === "number" && Number.isFinite(body.speed)) upstreamBody.speed = body.speed;

  let response: Response;
  try {
    response = await callQwen3Tts(config, "/generate", upstreamBody, 300_000);
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
  const payload = await response.json().catch(() => null) as {
    audio?: unknown; content_type?: unknown; duration_seconds?: unknown;
    generation_seconds?: unknown; model?: unknown;
  } | null;
  if (!payload || typeof payload.audio !== "string" || !payload.audio) {
    return NextResponse.json({ error: "invalid_clone_speech_response" }, { status: 502 });
  }

  const headers = new Headers({ "Content-Type": "audio/mp4", "Cache-Control": "private, no-store" });
  if (typeof payload.content_type === "string" && payload.content_type.startsWith("audio/")) headers.set("Content-Type", payload.content_type);
  if (typeof payload.duration_seconds === "number") headers.set("X-Audio-Duration", String(payload.duration_seconds));
  if (typeof payload.generation_seconds === "number") headers.set("X-Generation-Seconds", String(payload.generation_seconds));
  if (typeof payload.model === "string") headers.set("X-TTS-Model", payload.model);
  if (typeof upstreamBody.language === "string") headers.set("X-TTS-Language", upstreamBody.language);
  return new Response(Buffer.from(payload.audio, "base64"), { status: 200, headers });
}
