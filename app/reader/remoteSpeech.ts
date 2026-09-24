import JSZip from "jszip";
import type { TtsStatus } from "./tts";
import { normalizeForSpeech, normalizeForSupertonic } from "./speechText";
import { telemetryContext } from "./telemetry";
import { SpeechCancelledError } from "./ttsDiagnostics";
import type { SpeechResult } from "./mobileSpeech";

type BatchItem = { text: string; isHeading: boolean };
type SpeechOptions = { language: string; voice: string; steps: number; engine?: "supertonic" };

function unavailableMessage(response: Response, payload: { error?: unknown } | null): string {
  if (typeof payload?.error === "string" && payload.error) return payload.error;
  if (response.status === 413) return "This passage is too long to narrate.";
  return "Speech service is unavailable. Tap Play to retry.";
}

function speechResult(blob: Blob, duration: number, generationSeconds: number, generationStartedAt: number): SpeechResult {
  return {
    blob,
    duration: Number.isFinite(duration) && duration > 0 ? duration : 0,
    provider: "Server",
    generationSeconds: Number.isFinite(generationSeconds) && generationSeconds >= 0 ? generationSeconds : 0,
    generationStartedAt,
  };
}

export class RemoteSpeechClient {
  private controller?: AbortController;

  stop() {
    this.controller?.abort();
    this.controller = undefined;
  }

  async synthesize(text: string, speechSpeed: number, isHeading = false, status?: TtsStatus,
    options?: SpeechOptions): Promise<SpeechResult> {
    const [result] = await this.synthesizeBatch([{ text, isHeading }], speechSpeed, status, options);
    return result;
  }

  async synthesizeBatch(items: BatchItem[], speechSpeed: number, status?: TtsStatus,
    options?: SpeechOptions): Promise<SpeechResult[]> {
    this.stop();
    const controller = new AbortController();
    this.controller = controller;
    const started = performance.now();
    status?.(items.length > 1 ? `Generating ${items.length} passages` : "Generating speech");
    const language = options?.language;
    const supertonic = options?.engine === "supertonic" || (language !== undefined && language !== "en");
    const body: Record<string, unknown> = {
      texts: items.map((item) => supertonic
        ? normalizeForSupertonic(item.text, item.isHeading, language)
        : normalizeForSpeech(item.text, item.isHeading)),
      speed: speechSpeed,
    };
    if (options) {
      body.language = language;
      body.voice = options.voice;
      body.steps = options.steps;
      if (options.engine) body.engine = options.engine;
    }
    try {
      const response = await fetch("/api/tts", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-FreeReader-Context": JSON.stringify(telemetryContext()),
        },
        body: JSON.stringify(body),
        signal: controller.signal,
      });
      if (!response.ok) {
        const payload = await response.json().catch(() => null) as { error?: unknown } | null;
        throw new Error(unavailableMessage(response, payload));
      }
      const reportedModel = response.headers.get("X-TTS-Model");
      if (options?.engine === "supertonic" && reportedModel && !reportedModel.toLowerCase().includes("supertonic")) {
        throw new Error("This speech server does not support the selected voice yet. Update the speech service and try again.");
      }
      const generationSeconds = Number(response.headers.get("X-Generation-Seconds"));
      const generationStartedAt = performance.timeOrigin + started;
      const contentType = response.headers.get("Content-Type") ?? "";
      if (contentType.includes("zip")) {
        const durations = (response.headers.get("X-Audio-Durations") ?? "").split(",").map(Number);
        const archive = await JSZip.loadAsync(await response.arrayBuffer());
        const parts: SpeechResult[] = [];
        for (let index = 0; index < items.length; index += 1) {
          const entry = archive.file(`${index}.m4a`);
          if (!entry) throw new Error("Speech service returned an incomplete batch.");
          const blob = await entry.async("blob");
          parts.push(speechResult(new Blob([blob], { type: "audio/mp4" }), durations[index],
            generationSeconds, generationStartedAt));
        }
        status?.("Speech ready", 1);
        return parts;
      }
      const blob = await response.blob();
      if (!blob.size || !blob.type.startsWith("audio/")) throw new Error("Speech service returned invalid audio.");
      status?.("Speech ready", 1);
      return [speechResult(blob, Number(response.headers.get("X-Audio-Duration")), generationSeconds, generationStartedAt)];
    } catch (error) {
      if (controller.signal.aborted) throw new SpeechCancelledError("Speech was cancelled.");
      throw error;
    } finally {
      if (this.controller === controller) this.controller = undefined;
    }
  }
}
