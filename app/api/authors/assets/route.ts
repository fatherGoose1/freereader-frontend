const API_BASE = (process.env.KOKO_BACKEND_URL ?? process.env.NEXT_PUBLIC_KOKO_BACKEND_URL
  ?? "https://koko-backend-production-c887.up.railway.app").replace(/\/$/, "");

const PATH = /^[0-9a-f-]{36}\/[0-9a-f-]{36}\.(jpg|png|webp)$/;

export async function POST(request: Request) {
  const authorization = request.headers.get("Authorization");
  if (!authorization?.startsWith("Bearer ")) return Response.json({ error: "Sign in with Google first." }, { status: 401 });
  const type = request.headers.get("Content-Type") ?? "";
  if (!["image/jpeg", "image/png", "image/webp"].includes(type)) return Response.json({ error: "Unsupported image." }, { status: 415 });
  if (Number(request.headers.get("Content-Length")) > 5 * 1024 * 1024) return Response.json({ error: "Image too large." }, { status: 413 });
  const body = await request.arrayBuffer();
  if (body.byteLength > 5 * 1024 * 1024) return Response.json({ error: "Image too large." }, { status: 413 });
  try {
    const response = await fetch(`${API_BASE}/api/v1/freereader/authors/assets`, {
      method: "POST", headers: { Authorization: authorization, "Content-Type": type }, body, cache: "no-store",
    });
    return new Response(await response.text(), { status: response.status, headers: { "Content-Type": "application/json", "Cache-Control": "no-store" } });
  } catch {
    return Response.json({ error: "Image upload is unavailable. Please try again." }, { status: 503 });
  }
}

export async function GET(request: Request) {
  const path = new URL(request.url).searchParams.get("path");
  if (!path || !PATH.test(path)) {
    return new Response(null, { status: 404 });
  }
  try {
    const authorization = request.headers.get("Authorization");
    const upstream = await fetch(`${API_BASE}/api/v1/freereader/authors/assets/${path}`, {
      headers: authorization ? { Authorization: authorization } : {}, cache: "no-store",
    });
    if (!upstream.ok) return new Response(null, { status: upstream.status });
    return new Response(await upstream.arrayBuffer(), { headers: {
      "Content-Type": upstream.headers.get("Content-Type") ?? "application/octet-stream",
      "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff",
      "Cross-Origin-Resource-Policy": "same-origin",
    } });
  } catch {
    return new Response(null, { status: 503 });
  }
}
