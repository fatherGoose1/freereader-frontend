import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { EDU_ACCESS_COOKIE, eduAccessGranted } from "@/app/edu/access";

export const runtime = "nodejs";
export const maxDuration = 180;
const MAX_BODY = 128 * 1024;

async function proxy(request: Request, context: { params: Promise<{ path: string[] }> }) {
  if (process.env.EDU_ENABLED !== "true") return NextResponse.json({ error: "edu_disabled" }, { status: 404 });
  if (!eduAccessGranted((await cookies()).get(EDU_ACCESS_COOKIE)?.value)) {
    return NextResponse.json({ error: "locked" }, { status: 401 });
  }
  const { path } = await context.params;
  const shared = path[0] === "shared";
  const authorization = request.headers.get("authorization") ?? "";
  if (!shared && (!authorization.startsWith("Bearer ") || authorization.length > 8192)) {
    return NextResponse.json({ error: "sign_in_required" }, { status: 401 });
  }
  if (!path.length || path.some((part) => !/^[a-zA-Z0-9_-]+$/.test(part))) {
    return NextResponse.json({ error: "invalid_path" }, { status: 400 });
  }
  let body: Uint8Array<ArrayBuffer> | undefined;
  if (request.method !== "GET" && request.method !== "DELETE" && request.body) {
    const reader = request.body.getReader();
    const chunks: Uint8Array[] = [];
    let size = 0;
    try {
      for (;;) {
        const chunk = await reader.read();
        if (chunk.done) break;
        size += chunk.value.length;
        if (size > MAX_BODY) {
          await reader.cancel();
          return NextResponse.json({ error: "request_too_large" }, { status: 413 });
        }
        chunks.push(chunk.value);
      }
      body = new Uint8Array(size);
      let offset = 0;
      for (const chunk of chunks) { body.set(chunk, offset); offset += chunk.length; }
    } finally { reader.releaseLock(); }
  }
  const backend = (process.env.KOKO_BACKEND_URL ?? "https://koko-backend-production-c887.up.railway.app").replace(/\/$/, "");
  const controller = new AbortController();
  const abort = () => controller.abort();
  request.signal.addEventListener("abort", abort, { once: true });
  const timeout = setTimeout(abort, path.at(-1) === "speech" ? 120_000 : 90_000);
  try {
    const upstream = await fetch(`${backend}/api/v1/freereader/edu/${path.map(encodeURIComponent).join("/")}`, {
      method: request.method, headers: { ...(!shared ? { Authorization: authorization } : { "X-FreeReader-Edu-Guest": (request.headers.get("x-freereader-edu-guest") ?? "").slice(0, 128) }), "Content-Type": "application/json" },
      body: body ? new Blob([body], { type: "application/json" }) : undefined, signal: controller.signal, cache: "no-store", redirect: "error",
    });
    const headers = new Headers({ "Cache-Control": "private, no-store", "Referrer-Policy": "no-referrer", "X-Content-Type-Options": "nosniff", "Vary": "Authorization" });
    for (const name of ["Content-Type", "Retry-After", "X-Audio-Duration", "X-Generation-Seconds", "X-TTS-Model", "X-TTS-Language", "X-Speech-Cache"]) {
      const value = upstream.headers.get(name);
      if (value) headers.set(name, value);
    }
    return new Response(upstream.body, { status: upstream.status, headers });
  } catch {
    return NextResponse.json({ error: "edu_service_unavailable" }, { status: 502, headers: { "Cache-Control": "private, no-store" } });
  } finally {
    clearTimeout(timeout);
    request.signal.removeEventListener("abort", abort);
  }
}

export const GET = proxy;
export const POST = proxy;
export const PUT = proxy;
export const PATCH = proxy;
export const DELETE = proxy;
