import JSZip from "jszip";
import type { TtsStatus } from "./tts";
import { normalizeForSpeech, normalizeForSupertonic } from "./speechText";
import { telemetryContext, type TelemetrySource } from "./telemetry";
import { currentAccessToken } from "./authToken";
import { SpeechCancelledError } from "./ttsDiagnostics";
import { clonedVoiceId, isClonedVoice } from "./voices";
import { findClonedVoice } from "./cloneVoices";
import type { SpeechResult } from "./mobileSpeech";

type BatchItem = { text: string; isHeading: boolean };
type SpeechOptions = { language: string; voice: string; steps: number; engine?: "supertonic"; source?: TelemetrySource };

function unavailableMessage(response: Response, payload: { error?: unknown } | null): string {
  if (payload?.error === "usage_limit_reached") {
    return "You have used your monthly narration allowance. Upgrade to Pro for more hours.";
  }
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
    const generationStartedAt = performance.timeOrigin + started;
    try {
      const requestedVoice = options?.voice;
      if (requestedVoice && isClonedVoice(requestedVoice)) {
        return await this.synthesizeClone(items, speechSpeed, status, requestedVoice,
          options?.language, controller.signal, generationStartedAt);
      }
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
      const userToken = currentAccessToken();
      const response = await fetch("/api/tts", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-FreeReader-Context": JSON.stringify(telemetryContext(options?.source)),
          ...(userToken ? { "X-FreeReader-User-Token": userToken } : {}),
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

  // Cloned voices are conditioned on the GPU once; each generation only sends the
  // persisted voice id, never the original reference audio.
  private async synthesizeClone(items: BatchItem[], speechSpeed: number, status: TtsStatus | undefined,
    voiceRef: string, language: string | undefined, signal: AbortSignal, generationStartedAt: number): Promise<SpeechResult[]> {
    const record = findClonedVoice(clonedVoiceId(voiceRef));
    if (!record) throw new Error("This cloned voice is not available in this browser. Create it again from Clone voice.");
    const parts: SpeechResult[] = [];
    for (const item of items) {
      status?.(items.length > 1
        ? `Generating ${items.length} passages with your cloned voice`
        : "Generating with your cloned voice");
      const response = await fetch("/api/clone-tts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          text: normalizeForSpeech(item.text, item.isHeading, language),
          voiceId: record.id,
          userId: record.userId,
          language,
          speed: speechSpeed,
        }),
        signal,
      });
      if (!response.ok) {
        const payload = await response.json().catch(() => null) as { error?: unknown } | null;
        throw new Error(unavailableMessage(response, payload));
      }
      const blob = await response.blob();
      if (!blob.size || !blob.type.startsWith("audio/")) throw new Error("Speech service returned invalid audio.");
      parts.push(speechResult(blob, Number(response.headers.get("X-Audio-Duration")),
        Number(response.headers.get("X-Generation-Seconds")), generationStartedAt));
    }
    status?.("Speech ready", 1);
    return parts;
  }
}
