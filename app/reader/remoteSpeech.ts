import type { TtsStatus } from "./tts";
import { normalizeForSpeech } from "./speechText";
import { telemetryContext } from "./telemetry";
import { SpeechCancelledError } from "./ttsDiagnostics";
import type { SpeechResult } from "./mobileSpeech";

export class RemoteSpeechClient {
  private controller?: AbortController;

  stop() {
    this.controller?.abort();
    this.controller = undefined;
  }

  async synthesize(text: string, speechSpeed: number, isHeading = false, status?: TtsStatus): Promise<SpeechResult> {
    this.stop();
    const controller = new AbortController();
    this.controller = controller;
    const started = performance.now();
    status?.("Generating mobile speech");
    try {
      const response = await fetch("/api/tts", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-FreeReader-Context": JSON.stringify(telemetryContext()),
        },
        body: JSON.stringify({ text: normalizeForSpeech(text, isHeading), speed: speechSpeed }),
        signal: controller.signal,
      });
      if (!response.ok) {
        const payload = await response.json().catch(() => null) as { error?: unknown } | null;
        throw new Error(typeof payload?.error === "string" ? payload.error : "Mobile speech service is unavailable. Tap Play to retry.");
      }
      const blob = await response.blob();
      if (!blob.size || !blob.type.startsWith("audio/")) throw new Error("Mobile speech service returned invalid audio.");
      const duration = Number(response.headers.get("X-Audio-Duration"));
      const generationSeconds = Number(response.headers.get("X-Generation-Seconds"));
      status?.("Mobile speech ready", 1);
      return {
        blob,
        duration: Number.isFinite(duration) && duration > 0 ? duration : 0,
        provider: "Server",
        generationSeconds: Number.isFinite(generationSeconds) && generationSeconds >= 0
          ? generationSeconds : (performance.now() - started) / 1000,
        generationStartedAt: performance.timeOrigin + started,
      };
    } catch (error) {
      if (controller.signal.aborted) throw new SpeechCancelledError("Mobile speech was cancelled.");
      throw error;
    } finally {
      if (this.controller === controller) this.controller = undefined;
    }
  }
}
