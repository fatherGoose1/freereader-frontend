import { NextResponse } from "next/server";
import { freereaderBackendConfig, manageBackendVoice } from "../freereaderBackend";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const config = freereaderBackendConfig();
  if (!config) return NextResponse.json({ error: "speech_not_configured" }, { status: 503 });
  const token = request.headers.get("Authorization")?.match(/^Bearer (.+)$/)?.[1];
  if (!token) return NextResponse.json({ error: "premium_required" }, { status: 403 });
  try {
    const response = await manageBackendVoice(config, "/api/v1/freereader/voices", token, "GET");
    return new Response(await response.text(), {
      status: response.status,
      headers: { "Content-Type": "application/json", "Cache-Control": "private, no-store" },
    });
  } catch {
    return NextResponse.json({ error: "voice_list_unavailable" }, { status: 502 });
  }
}
