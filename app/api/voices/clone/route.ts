import { NextResponse } from "next/server";
import { callQwen3Tts, qwen3TtsConfig } from "../../qwen3Tts";

export const runtime = "nodejs";

// Maximum base64 payload for a 25 second mono clip, with headroom for 48 kHz WAV.
const MAX_AUDIO_BASE64_LENGTH = 8_000_000;

export async function POST(request: Request) {
  const config = qwen3TtsConfig();
  if (!config) return NextResponse.json({ error: "voice_clone_not_configured" }, { status: 503 });

  const body = await request.json().catch(() => null) as {
    userId?: unknown; voiceId?: unknown; name?: unknown; language?: unknown;
    refText?: unknown; audio?: unknown;
  } | null;
  const userId = typeof body?.userId === "string" ? body.userId.trim() : "";
  const audio = typeof body?.audio === "string" ? body.audio : "";
  if (!userId || !audio) return NextResponse.json({ error: "invalid_request" }, { status: 400 });
  if (audio.length > MAX_AUDIO_BASE64_LENGTH) return NextResponse.json({ error: "reference_audio_too_large" }, { status: 413 });

  const upstreamBody: Record<string, unknown> = {
    user_id: userId,
    audio,
    voice_id: typeof body?.voiceId === "string" && body.voiceId.trim() ? body.voiceId.trim() : undefined,
    name: typeof body?.name === "string" ? body.name.trim().slice(0, 80) : undefined,
    language: typeof body?.language === "string" ? body.language.trim() : undefined,
    ref_text: typeof body?.refText === "string" ? body.refText.trim() : undefined,
  };

  let response: Response;
  try {
    response = await callQwen3Tts(config, "/voices/clone", upstreamBody, 300_000);
  } catch {
    return NextResponse.json({ error: "voice_clone_unavailable" }, { status: 502 });
  }
  const payload = await response.text();
  if (!response.ok) {
    return new Response(payload, {
      status: response.status,
      headers: { "Content-Type": response.headers.get("Content-Type") ?? "application/json" },
    });
  }
  return new Response(payload, {
    status: response.status,
    headers: { "Content-Type": "application/json", "Cache-Control": "private, no-store" },
  });
}
