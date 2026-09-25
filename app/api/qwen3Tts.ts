// Server-only helpers for the FreeReader Qwen3-TTS Modal endpoint. The proxy
// token and secret must never reach the browser, so every request goes through
// a Next.js route handler.

export interface Qwen3TtsConfig {
  url: string;
  token: string;
  secret: string;
}

export function qwen3TtsConfig(): Qwen3TtsConfig | null {
  const url = process.env.MODAL_QWEN3_TTS_URL?.trim();
  const token = process.env.MODAL_QWEN3_TTS_PROXY_TOKEN?.trim();
  const secret = process.env.MODAL_QWEN3_TTS_PROXY_SECRET?.trim();
  if (!url || !token || !secret) return null;
  return { url: url.replace(/\/$/, ""), token, secret };
}

export function qwen3TtsHeaders(config: Qwen3TtsConfig): Record<string, string> {
  return {
    "Content-Type": "application/json",
    "Modal-Key": config.token,
    "Modal-Secret": config.secret,
  };
}

export function callQwen3Tts(
  config: Qwen3TtsConfig,
  path: string,
  body: unknown,
  timeoutMs = 240_000,
): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  return fetch(`${config.url}${path}`, {
    method: "POST",
    headers: qwen3TtsHeaders(config),
    body: JSON.stringify(body),
    cache: "no-store",
    signal: controller.signal,
  }).finally(() => clearTimeout(timer));
}
