import { NextResponse } from "next/server";
import { callBackend, freereaderBackendConfig } from "../../freereaderBackend";

export const runtime = "nodejs";

// Conditions a reference clip into a reusable clone through the Koko backend,
// which stores the Qwen3-TTS conditioning on the Modal volume.
export async function POST(request: Request) {
  const config = freereaderBackendConfig();
  if (!config) return NextResponse.json({ error: "speech_not_configured" }, { status: 503 });

  const body = await request.json().catch(() => null) as {
    userId?: unknown; voiceId?: unknown; name?: unknown; language?: unknown;
    refText?: unknown; audio?: unknown;
  } | null;
  const userId = typeof body?.userId === "string" ? body.userId.trim() : "";
  const audio = typeof body?.audio === "string" ? body.audio : "";
  if (!userId || !audio) return NextResponse.json({ error: "invalid_request" }, { status: 400 });

  const upstreamBody: Record<string, unknown> = { user_id: userId, audio };
  if (typeof body?.voiceId === "string" && body.voiceId.trim()) upstreamBody.voice_id = body.voiceId.trim();
  if (typeof body?.name === "string") upstreamBody.name = body.name.trim().slice(0, 80);
  if (typeof body?.language === "string") upstreamBody.language = body.language.trim();
  if (typeof body?.refText === "string") upstreamBody.ref_text = body.refText.trim();

  let response: Response;
  try {
    response = await callBackend(config, "/api/v1/freereader/voices/clone", upstreamBody);
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
    status: 200,
    headers: { "Content-Type": "application/json", "Cache-Control": "private, no-store" },
  });
}
