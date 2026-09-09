import { downloadModel } from "./modelDownload";
import { getLocalFile, putLocalFile } from "./storage";
import type { TtsStatus } from "./tts";

export const MOBILE_MODEL_CACHE = "freereader-mobile-models-v1";

export type MobileModelAsset = {
  url: string;
  path: string;
  size: number;
  label: string;
};

const pending = new Map<string, Promise<Blob>>();

async function load(asset: MobileModelAsset, status?: TtsStatus): Promise<Blob> {
  let cache: Cache | undefined;
  try {
    cache = await caches.open(MOBILE_MODEL_CACHE);
    const cached = await cache.match(asset.url);
    if (cached) {
      const blob = await cached.blob();
      if (blob.size === asset.size) return blob;
      await cache.delete(asset.url);
    }
  } catch {
    // Cache Storage may be unavailable in private browsing; OPFS is the fallback.
    cache = undefined;
  }

  const local = await getLocalFile(asset.path);
  if (local?.size === asset.size) return local;

  status?.(`Downloading voice model: ${asset.label}`, 0);
  const blob = await downloadModel(asset.url, asset.size,
    (progress) => status?.(`Downloading voice model: ${asset.label}`, progress));

  if (cache) {
    try {
      await cache.put(asset.url, new Response(blob, { headers: { "Content-Type": "application/octet-stream" } }));
      return blob;
    } catch {
      // OPFS can still persist the model when Cache Storage is full or unavailable.
    }
  }
  await putLocalFile(asset.path, blob);
  return blob;
}

export function loadMobileModelAsset(asset: MobileModelAsset, status?: TtsStatus): Promise<Blob> {
  const existing = pending.get(asset.url);
  if (existing) return existing;
  const request = load(asset, status).finally(() => pending.delete(asset.url));
  pending.set(asset.url, request);
  return request;
}
