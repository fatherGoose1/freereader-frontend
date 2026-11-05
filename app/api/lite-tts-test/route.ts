import { NextResponse } from "next/server";
import { isLightVoice } from "../../reader/voices";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const payload = await request.json().catch(() => null) as { text?: unknown; speed?: unknown; voice?: unknown } | null;
  const voice = payload?.voice ?? "af_heart";
  if (!payload || typeof payload.text !== "string" || !payload.text.trim() || payload.text.length > 500 ||
      typeof payload.speed !== "number" || !Number.isFinite(payload.speed) || payload.speed < 0.5 || payload.speed > 3 ||
      typeof voice !== "string" || !isLightVoice(voice)) {
    return NextResponse.json({ error: "invalid_request" }, { status: 400 });
  }
  const token = process.env.FREEREADER_TTS_API_TOKEN ?? process.env.PARRYT_API_TOKEN;
  const user = (request.headers.get("x-freereader-user-token") ?? "").slice(0, 4096);
  if (!token) return NextResponse.json({ error: "speech_not_configured" }, { status: 503 });
  if (!user) return NextResponse.json({ error: "sign_in_required" }, { status: 401 });
  const backend = (process.env.KOKO_BACKEND_URL ?? "https://koko-backend-production-c887.up.railway.app").replace(/\/$/, "");
  const controller = new AbortController();
  const abort = () => controller.abort();
  request.signal.addEventListener("abort", abort);
  const timeout = setTimeout(abort, 35_000);
  let response: Response;
  try {
    response = await fetch(`${backend}/api/v1/freereader/speech/lite/test`, {
      method: "POST", cache: "no-store", signal: controller.signal,
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json",
        "X-FreeReader-User-Token": user, "X-FreeReader-Client": "web",
        "X-FreeReader-Context": (request.headers.get("x-freereader-context") ?? "").slice(0, 2048) },
      body: JSON.stringify({ text: payload.text.trim(), speed: payload.speed, voice, language: "en" }),
    });
  } catch {
    return NextResponse.json({ error: "speech_unavailable" }, { status: 502 });
  } finally {
    clearTimeout(timeout);
    request.signal.removeEventListener("abort", abort);
  }
  if (!response.ok) return new Response(await response.text(), { status: response.status,
    headers: { "Content-Type": response.headers.get("Content-Type") ?? "application/json" } });
  if (!response.headers.get("Content-Type")?.startsWith("audio/") || !response.body) {
    return NextResponse.json({ error: "invalid_speech_response" }, { status: 502 });
  }
  const headers = new Headers({ "Content-Type": "audio/mp4", "Cache-Control": "private, no-store" });
  for (const key of ["X-Audio-Duration", "X-Generation-Seconds", "X-TTS-Model"]) {
    const value = response.headers.get(key);
    if (value) headers.set(key, value);
  }
  return new Response(response.body, { headers });
}
