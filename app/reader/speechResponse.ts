import JSZip from "jszip";
import type { SpeechResult } from "./mobileSpeech";
import { parseWordTimings } from "./spokenWord";

function result(blob: Blob, duration: number, generationSeconds: number, generationStartedAt: number): SpeechResult {
  return { blob, duration: Number.isFinite(duration) && duration > 0 ? duration : 0,
    provider: "Server", generationSeconds: Number.isFinite(generationSeconds) && generationSeconds >= 0 ? generationSeconds : 0,
    generationStartedAt };
}

/** Every server engine uses the same optional timing sidecars, including single-passage ZIPs. */
export async function decodeSpeechResponse(response: Response, expectedCount: number,
  generationStartedAt: number): Promise<SpeechResult[]> {
  const generationSeconds = Number(response.headers.get("X-Generation-Seconds"));
  if ((response.headers.get("Content-Type") ?? "").includes("zip")) {
    const durations = (response.headers.get("X-Audio-Durations") ?? "").split(",").map(Number);
    const archive = await JSZip.loadAsync(await response.arrayBuffer());
    return Promise.all(Array.from({ length: expectedCount }, async (_, index) => {
      const entry = archive.file(`${index}.m4a`);
      if (!entry) throw new Error("Speech service returned an incomplete batch.");
      const part = result(new Blob([await entry.async("blob")], { type: "audio/mp4" }), durations[index],
        generationSeconds, generationStartedAt);
      const timingFile = archive.file(`${index}.json`);
      if (timingFile) {
        try { part.wordTimings = parseWordTimings(JSON.parse(await timingFile.async("text"))); }
        catch { /* Valid audio remains playable if its optional timing sidecar is malformed. */ }
      }
      return part;
    }));
  }
  if (expectedCount !== 1) throw new Error("Speech service returned an incomplete batch.");
  const blob = await response.blob();
  if (!blob.size || !blob.type.startsWith("audio/")) throw new Error("Speech service returned invalid audio.");
  return [result(blob, Number(response.headers.get("X-Audio-Duration")), generationSeconds, generationStartedAt)];
}
