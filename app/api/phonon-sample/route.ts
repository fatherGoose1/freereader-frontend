import { phononSampleSourceUrl } from "../../reader/phononSamples";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const id = new URL(request.url).searchParams.get("id") ?? "";
  const source = phononSampleSourceUrl(id);
  if (!source) return Response.json({ error: "invalid_voice" }, { status: 400 });
  try {
    const upstream = await fetch(source, { next: { revalidate: 86_400 }, signal: AbortSignal.timeout(15_000) });
    if (!upstream.ok || !upstream.body || !upstream.headers.get("Content-Type")?.startsWith("audio/ogg")) {
      return Response.json({ error: "sample_unavailable" }, { status: 502 });
    }
    return new Response(upstream.body, { headers: {
      "Content-Type": "audio/ogg", "Cache-Control": "public, max-age=86400", "Cross-Origin-Resource-Policy": "same-origin",
    } });
  } catch {
    return Response.json({ error: "sample_unavailable" }, { status: 502 });
  }
}
