import { NextResponse } from "next/server";
import { freereaderBackendConfig, manageBackendVoice } from "../../freereaderBackend";

export const runtime = "nodejs";

export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const config = freereaderBackendConfig();
  if (!config) return NextResponse.json({ error: "speech_not_configured" }, { status: 503 });
  const token = request.headers.get("Authorization")?.match(/^Bearer (.+)$/)?.[1];
  if (!token) return NextResponse.json({ error: "premium_required" }, { status: 403 });
  const { id } = await params;
  if (!/^[A-Za-z0-9][A-Za-z0-9_.-]{0,127}$/.test(id)) {
    return NextResponse.json({ error: "invalid_voice_id" }, { status: 400 });
  }
  try {
    const response = await manageBackendVoice(config, `/api/v1/freereader/voices/${encodeURIComponent(id)}`, token, "DELETE");
    return new Response(await response.text(), {
      status: response.status,
      headers: { "Content-Type": "application/json", "Cache-Control": "private, no-store" },
    });
  } catch {
    return NextResponse.json({ error: "voice_delete_unavailable" }, { status: 502 });
  }
}
