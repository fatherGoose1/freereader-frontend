import { callBackend, freereaderBackendConfig } from "../freereaderBackend";
import { isKokoroVoiceForLanguage } from "../../reader/voices";
import { normalizeCapitalization } from "../../reader/speechText";

export const runtime = "nodejs";

const PREVIEW_TEXT = {
  es: "Un buen libro nos lleva a nuevos lugares. Escucha esta voz mientras comienza la historia.",
  fr: "Un bon livre nous emmène vers de nouveaux horizons. Écoutez cette voix raconter le début de notre histoire.",
  hi: "एक अच्छी कहानी हमें नई दुनिया में ले जाती है। सुनिए यह आवाज़ कैसे कहानी की शुरुआत करती है।",
  it: "Un buon libro ci porta in luoghi nuovi. Ascolta questa voce mentre la storia prende vita.",
  ja: "新しい物語が始まります。静かな朝に本を開いて、この声と一緒に物語の世界を楽しみましょう。",
  pt: "Uma boa história nos leva a novos lugares. Ouça esta voz enquanto a aventura começa.",
  zh: "一本好书能带我们走进新的世界。请听这个声音，和我们一起开始今天的故事。",
} as const;

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const language = searchParams.get("language") ?? "";
  const voice = searchParams.get("voice") ?? "";
  if (!(language in PREVIEW_TEXT) || !isKokoroVoiceForLanguage(voice, language)) {
    return Response.json({ error: "invalid_voice" }, { status: 400 });
  }
  const config = freereaderBackendConfig();
  if (!config) return Response.json({ error: "speech_not_configured" }, { status: 503 });
  try {
    const response = await callBackend(config, "/api/v1/freereader/speech", {
      text: normalizeCapitalization(PREVIEW_TEXT[language as keyof typeof PREVIEW_TEXT]), language,
      engine: "kokoro", voice, speed: 1,
    }, 120_000);
    if (!response.ok || !response.body || !response.headers.get("Content-Type")?.startsWith("audio/")) {
      return Response.json({ error: "preview_unavailable" }, { status: 502 });
    }
    return new Response(response.body, { headers: {
      "Content-Type": response.headers.get("Content-Type")!,
      "Cache-Control": "public, max-age=86400, s-maxage=86400",
      "X-Content-Type-Options": "nosniff",
    } });
  } catch {
    return Response.json({ error: "preview_unavailable" }, { status: 502 });
  }
}
