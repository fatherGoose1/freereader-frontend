// Server-only helper for talking to the Koko backend, which owns the Modal
// Qwen3-TTS credentials. The browser never receives a Modal token or URL.

export interface FreeReaderBackendConfig {
  url: string;
  token: string;
}

export function freereaderBackendConfig(): FreeReaderBackendConfig | null {
  const url = (process.env.KOKO_BACKEND_URL
    ?? "https://koko-backend-production-c887.up.railway.app").replace(/\/$/, "");
  const token = process.env.FREEREADER_TTS_API_TOKEN ?? process.env.PARRYT_API_TOKEN;
  if (!token) return null;
  return { url, token };
}

export async function callBackend(
  config: FreeReaderBackendConfig,
  path: string,
  body: unknown,
  timeoutMs = 300_000,
): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  return fetch(`${config.url}${path}`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${config.token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
    cache: "no-store",
    signal: controller.signal,
  }).finally(() => clearTimeout(timer));
}
