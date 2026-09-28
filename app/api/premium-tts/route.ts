import { NextResponse } from "next/server";
import { callBackend, freereaderBackendConfig } from "../freereaderBackend";
import { isQwenVoice } from "../../reader/voices";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const config = freereaderBackendConfig();
  if (!config) return NextResponse.json({ error: "speech_not_configured" }, { status: 503 });
  const token = request.headers.get("Authorization")?.match(/^Bearer (.+)$/)?.[1];
  if (!token) return NextResponse.json({ error: "premium_required" }, { status: 403 });
  const body = await request.json().catch(() => null) as { text?: unknown; voiceId?: unknown; language?: unknown; instruct?: unknown } | null;
  if (typeof body?.text !== "string" || !body.text.trim() || typeof body.voiceId !== "string" || !isQwenVoice(body.voiceId)
    || (body.instruct !== undefined && (typeof body.instruct !== "string" || body.instruct.length > 200))) {
    return NextResponse.json({ error: "invalid_request" }, { status: 400 });
  }
  const upstreamBody: Record<string, unknown> = { text: body.text.trim(), voice_id: body.voiceId };
  if (typeof body.language === "string") upstreamBody.language = body.language;
  if (typeof body.instruct === "string" && body.instruct.trim()) upstreamBody.instruct = body.instruct.trim();
  let response: Response;
  try {
    response = await callBackend(config, "/api/v1/freereader/speech/premium", upstreamBody, 300_000, token);
  } catch {
    return NextResponse.json({ error: "premium_speech_unavailable" }, { status: 502 });
  }
  if (!response.ok) return new Response(await response.text(), { status: response.status,
    headers: { "Content-Type": response.headers.get("Content-Type") ?? "application/json" } });
  const contentType = response.headers.get("Content-Type") ?? "";
  if (!contentType.startsWith("audio/") || !response.body) return NextResponse.json({ error: "invalid_premium_speech_response" }, { status: 502 });
  const headers = new Headers({ "Content-Type": contentType, "Cache-Control": "private, no-store" });
  for (const name of ["X-Audio-Duration", "X-Generation-Seconds", "X-TTS-Model", "X-TTS-Language"]) {
    const value = response.headers.get(name);
    if (value) headers.set(name, value);
  }
  return new Response(response.body, { headers });
}
