import { NextResponse } from "next/server";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const body = await request.json().catch(() => null) as { texts?: unknown; speed?: unknown } | null;
  if (!body || Object.keys(body).some((key) => !["texts", "speed"].includes(key)) ||
      !Array.isArray(body.texts) || body.texts.length < 1 || body.texts.length > 8 ||
      body.texts.some((text) => typeof text !== "string" || !text.trim() || text.length > 1200) ||
      typeof body.speed !== "number" || !Number.isFinite(body.speed) || body.speed < 0.5 || body.speed > 3) {
    return NextResponse.json({ error: "invalid_request" }, { status: 400 });
  }
  const token = process.env.FREEREADER_TTS_API_TOKEN ?? process.env.PARRYT_API_TOKEN;
  if (!token) return NextResponse.json({ error: "speech_not_configured" }, { status: 503 });
  const userToken = (request.headers.get("x-freereader-user-token") ?? "").slice(0, 4096);
  if (!userToken) return NextResponse.json({ error: "sign_in_required" }, { status: 401 });
  const backend = (process.env.KOKO_BACKEND_URL ?? "https://koko-backend-production-c887.up.railway.app").replace(/\/$/, "");
  const controller = new AbortController();
  const onAbort = () => controller.abort();
  request.signal.addEventListener("abort", onAbort);
  const timeout = setTimeout(() => controller.abort(), 120_000);
  let response: Response;
  try {
    response = await fetch(`${backend}/api/v1/freereader/phonon/public/speech`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json",
        "X-FreeReader-User-Token": userToken, "X-FreeReader-Client": "web",
        "X-FreeReader-Context": (request.headers.get("x-freereader-context") ?? "").slice(0, 2048) },
      body: JSON.stringify({ texts: body.texts, speed: body.speed }),
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
  if (!response.body || !(contentType.startsWith("audio/") || contentType.startsWith("application/zip"))) {
    return NextResponse.json({ error: "invalid_speech_response" }, { status: 502 });
  }
  const headers = new Headers({ "Content-Type": contentType, "Cache-Control": "private, no-store" });
  for (const name of ["X-Audio-Duration", "X-Audio-Durations", "X-Generation-Seconds", "X-TTS-Model", "X-TTS-Language"]) {
    const value = response.headers.get(name);
    if (value) headers.set(name, value);
  }
  return new Response(response.body, { headers });
}
