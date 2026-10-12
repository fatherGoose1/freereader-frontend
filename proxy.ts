import { NextRequest, NextResponse } from "next/server";

export function proxy(request: NextRequest) {
  const host = (request.headers.get("host") ?? "").split(":")[0].toLowerCase();
  const path = request.nextUrl.pathname;
  const eduHost = host === (process.env.EDU_HOST ?? "edu.freereader.io").toLowerCase();
  const eduPath = path === "/edu" || path.startsWith("/edu/") || path.startsWith("/api/edu/");
  const asset = path.startsWith("/api/") || path.startsWith("/_next/") || path === "/icon.svg" || path.startsWith("/voice-previews/");
  let response = NextResponse.next();
  if (eduHost && !eduPath && !asset) {
    const destination = request.nextUrl.clone();
    destination.pathname = `/edu${path === "/" ? "" : path}`;
    response = NextResponse.rewrite(destination);
  }
  if (eduHost || eduPath) {
    response.headers.set("Referrer-Policy", "no-referrer");
    response.headers.set("X-Content-Type-Options", "nosniff");
    // Host-only, non-authentication marker available before client instrumentation
    // runs, including custom EDU hosts. Spoofing this can only disable analytics.
    if (!asset || eduPath) response.cookies.set("freereader-edu-surface", "1", { path: "/", sameSite: "lax", secure: request.nextUrl.protocol === "https:" });
  } else if (!asset && request.cookies.has("freereader-edu-surface")) {
    response.cookies.delete("freereader-edu-surface");
  }
  return response;
}

export const config = { matcher: ["/((?!_next/static|_next/image).*)"] };
