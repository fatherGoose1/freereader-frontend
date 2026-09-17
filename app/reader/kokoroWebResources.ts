import { downloadModel } from "./modelDownload";
import { loadMobileModelAsset } from "./mobileModelCache";
import { getLocalFile, putLocalFile } from "./storage";
import type { TtsStatus } from "./tts";
import type { KokoroVoice } from "./voices";

const REVISION = "1939ad2a8e416c0acfeecc08a694d14ef25f2231";
const ROOT = `https://huggingface.co/onnx-community/Kokoro-82M-v1.0-ONNX/resolve/${REVISION}`;
const DISTILLED_REVISION = "231bfd7fac82aa916e8e5600d527c48a591ff193";
const DISTILLED_ROOT = `https://huggingface.co/Shadow0482/Kokoro-7M-ONNX/resolve/${DISTILLED_REVISION}`;
const CACHE_NAME = "kokoro-web-resources-v1";

export type KokoroAsset = { url: string; path: string; size: number; label: string };

export const KOKORO_MODELS = {
  full: { url: `${ROOT}/onnx/model.onnx`, path: `models/kokoro-web/${REVISION}/model.onnx`, size: 325_532_232, label: "Kokoro FP32 (326 MB)" },
  mobile: { url: `${DISTILLED_ROOT}/kokoro_7m.onnx`, path: `models/kokoro-web/${DISTILLED_REVISION}/kokoro_7m.onnx`, size: 30_215_767, label: "Kokoro 7M Distill FP32 (30 MB)" },
} as const satisfies Record<string, KokoroAsset>;

export const KOKORO_DISTILLED_VOICE = {
  url: `${DISTILLED_ROOT}/af_msa.onnx`,
  path: `models/kokoro-web/${DISTILLED_REVISION}/af_msa.onnx`,
  size: 522_653,
  label: "af_msa distilled voice",
} as const satisfies KokoroAsset;

export function kokoroVoiceAsset(voice: KokoroVoice): KokoroAsset {
  return {
    url: `${ROOT}/voices/${voice}.bin`,
    path: `models/kokoro-web/${REVISION}/voices/${voice}.bin`,
    size: 522_240,
    label: `${voice} voice`,
  };
}

export async function loadKokoroAsset(asset: KokoroAsset, status?: TtsStatus, mobile = false): Promise<ArrayBuffer> {
  if (mobile) return (await loadMobileModelAsset(asset, status)).arrayBuffer();

  let cache: Cache | undefined;
  try {
    cache = await caches.open(CACHE_NAME);
    const cached = await cache.match(asset.url);
    if (cached) {
      const blob = await cached.blob();
      if (blob.size === asset.size) return blob.arrayBuffer();
      await cache.delete(asset.url);
    }
  } catch {
    // Cache Storage can be unavailable in private browsing; OPFS is the fallback.
  }

  const local = await getLocalFile(asset.path);
  if (local?.size === asset.size) return local.arrayBuffer();

  status?.(`Downloading voice model: ${asset.label}`, 0);
  const blob = await downloadModel(asset.url, asset.size,
    (progress) => status?.(`Downloading voice model: ${asset.label}`, progress));

  if (cache) {
    try {
      await cache.put(asset.url, new Response(blob, { headers: { "Content-Type": "application/octet-stream" } }));
      return blob.arrayBuffer();
    } catch {
      // Fall through to OPFS if Cache Storage rejects a large response.
    }
  }
  await putLocalFile(asset.path, blob);
  return blob.arrayBuffer();
}
