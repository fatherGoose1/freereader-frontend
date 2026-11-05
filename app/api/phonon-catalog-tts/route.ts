import { NextResponse } from "next/server";
import { isCatalogVoice } from "../../reader/voices";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const body = await request.json().catch(() => null) as { voice_id?: unknown; texts?: unknown; speed?: unknown } | null;
  if (!body || Object.keys(body).some((key) => !["voice_id", "texts", "speed"].includes(key)) ||
      typeof body.voice_id !== "string" || !isCatalogVoice(`catalog:${body.voice_id}`) ||
      !Array.isArray(body.texts) || !body.texts.length || body.texts.length > 8 ||
      body.texts.some((text) => typeof text !== "string" || !text.trim() || text.length > 2000) ||
      typeof body.speed !== "number" || !Number.isFinite(body.speed) || body.speed < 0.5 || body.speed > 3) {
    return NextResponse.json({ error: "invalid_request" }, { status: 400 });
  }
  const token = request.headers.get("X-FreeReader-User-Token") ?? "";
  if (!token || token.length > 4096) return NextResponse.json({ error: "sign_in_required" }, { status: 401 });
  const backend = (process.env.KOKO_BACKEND_URL ?? "https://koko-backend-production-c887.up.railway.app").replace(/\/$/, "");
  const controller = new AbortController();
  const onAbort = () => controller.abort();
  request.signal.addEventListener("abort", onAbort);
  const timeout = setTimeout(onAbort, 120_000);
  let response: Response;
  try {
    response = await fetch(`${backend}/api/v1/freereader/phonon/catalog/speech`, {
      method: "POST", cache: "no-store", signal: controller.signal,
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({ voice_id: body.voice_id, texts: body.texts, speed: body.speed }),
    });
  } catch {
    return NextResponse.json({ error: "phonon_unavailable" }, { status: 502 });
  } finally {
    clearTimeout(timeout);
    request.signal.removeEventListener("abort", onAbort);
  }
  if (!response.ok) return new Response(await response.text(), { status: response.status,
    headers: { "Content-Type": response.headers.get("Content-Type") ?? "application/json" } });
  const type = response.headers.get("Content-Type") ?? "";
  if (!response.body || !(type.startsWith("audio/") || type.startsWith("application/zip"))) {
    return NextResponse.json({ error: "invalid_speech_response" }, { status: 502 });
  }
  const headers = new Headers({ "Content-Type": type, "Cache-Control": "private, no-store" });
  for (const name of ["X-Audio-Duration", "X-Audio-Durations", "X-Generation-Seconds", "X-TTS-Model", "X-TTS-Language"]) {
    const value = response.headers.get(name);
    if (value) headers.set(name, value);
  }
  return new Response(response.body, { headers });
}
