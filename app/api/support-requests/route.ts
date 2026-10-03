import { callBackend, freereaderBackendConfig } from "../freereaderBackend";

export const runtime = "nodejs";

export async function POST(request: Request) {
  if (Number(request.headers.get("Content-Length")) > 8 * 1024) {
    return Response.json({ error: "request_too_large" }, { status: 413 });
  }
  const payload = await request.json().catch(() => null) as { email?: unknown; message?: unknown } | null;
  if (!payload || typeof payload.email !== "string" || typeof payload.message !== "string"
      || JSON.stringify(payload).length > 8 * 1024) {
    return Response.json({ error: "invalid_request" }, { status: 400 });
  }
  const config = freereaderBackendConfig();
  if (!config) return Response.json({ error: "support_unavailable" }, { status: 503 });
  try {
    const response = await callBackend(config, "/api/v1/freereader/support-requests", {
      email: payload.email, message: payload.message,
    }, 10_000);
    if (response.status === 201) return Response.json({ received: true }, { status: 201 });
    if (response.status === 400 || response.status === 413) {
      return Response.json({ error: "invalid_request" }, { status: response.status });
    }
    return Response.json({ error: "support_unavailable" }, { status: 503 });
  } catch {
    return Response.json({ error: "support_unavailable" }, { status: 503 });
  }
}
