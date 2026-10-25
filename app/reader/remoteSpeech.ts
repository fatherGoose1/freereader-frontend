import JSZip from "jszip";
import type { TtsStatus } from "./tts";
import { normalizeForSpeech, normalizeForSupertonic } from "./speechText";
import { telemetryContext, type TelemetrySource } from "./telemetry";
import { currentAccessToken, currentSessionAccessToken } from "./authToken";
import { SpeechCancelledError } from "./ttsDiagnostics";
import { clonedVoiceId, isClonedVoice, isKokoroVoiceForLanguage, isPhononVoice, isQwenVoice, PUBLIC_PARKER_VOICE, voiceDisplayName } from "./voices";
import { findClonedVoice } from "./cloneVoices";
import { speakPhononVoice } from "./phonon";
import type { SpeechResult } from "./mobileSpeech";
import { parseWordTimings } from "./spokenWord";

type BatchItem = { text: string; isHeading: boolean };
type SpeechOptions = { language: string; voice: string; steps: number; engine?: "kokoro" | "supertonic"; source?: TelemetrySource; instruct?: string; enhanced?: boolean };

function unavailableMessage(response: Response, payload: { error?: unknown } | null): string {
  if (payload?.error === "usage_limit_reached") {
    return "You have used your monthly narration allowance. Check your plan and usage for more hours.";
  }
  if (payload?.error === "sign_in_required") return "sign_in_required";
  if (payload?.error === "premium_required") return "A Pro or Premium subscription is required to use premium voices.";
  if (payload?.error === "enhanced_audio_required") return "FreeReader Gold is required for enhanced audio. Refresh your account and try again.";
  if (payload?.error === "premium_voice_limit_reached") return "You have used your monthly premium voice allowance. Try a standard voice or upgrade your plan.";
  if (payload?.error === "voice_not_owned") return "This cloned voice belongs to another account.";
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
      if (requestedVoice && isPhononVoice(requestedVoice)) {
        if (options?.language !== "en") throw new Error("Cloned Phonon voices are available for English books only.");
        status?.("Generating with your cloned voice");
        const texts = items.map((item) => normalizeForSpeech(item.text, item.isHeading, "en"));
        let response: Response;
        if (requestedVoice === PUBLIC_PARKER_VOICE) {
          const token = await currentSessionAccessToken();
          if (!token) throw new Error("sign_in_required");
          response = await fetch("/api/public-phonon-tts", { method: "POST",
            headers: { "Content-Type": "application/json", "X-FreeReader-User-Token": token,
              "X-FreeReader-Context": JSON.stringify(telemetryContext(options?.source)) }, body: JSON.stringify({ texts, speed: speechSpeed }),
            signal: controller.signal });
          if (!response.ok) {
            throw new Error(unavailableMessage(response, await response.json().catch(() => null)));
          }
        } else {
          const token = await currentSessionAccessToken();
          if (!token) throw new Error("Sign in to use your cloned voice.");
          response = await speakPhononVoice(token, requestedVoice.slice(7), texts, speechSpeed, controller.signal);
        }
        if (items.length === 1) {
          const blob = await response.blob();
          if (!blob.size || !blob.type.startsWith("audio/")) throw new Error("Speech service returned invalid audio.");
          status?.("Speech ready", 1);
          return [speechResult(blob, Number(response.headers.get("X-Audio-Duration")),
            Number(response.headers.get("X-Generation-Seconds")), generationStartedAt)];
        }
        const durations = (response.headers.get("X-Audio-Durations") ?? "").split(",").map(Number);
        const archive = await JSZip.loadAsync(await response.arrayBuffer());
        const parts = await Promise.all(items.map(async (_, index) => {
          const entry = archive.file(`${index}.m4a`);
          if (!entry) throw new Error("Speech service returned an incomplete batch.");
          return speechResult(new Blob([await entry.async("blob")], { type: "audio/mp4" }), durations[index],
            Number(response.headers.get("X-Generation-Seconds")), generationStartedAt);
        }));
        status?.("Speech ready", 1);
        return parts;
      }
      if (requestedVoice && isClonedVoice(requestedVoice)) {
        return await this.synthesizeClone(items, speechSpeed, status, requestedVoice,
          options?.language, controller.signal, generationStartedAt, options?.instruct);
      }
      if (requestedVoice && isQwenVoice(requestedVoice)) {
        if (items.length !== 1 || options?.source !== "youtube_narration") throw new Error("Premium voices are available for video narration only.");
        const response = await fetch("/api/premium-tts", {
          method: "POST",
          headers: { "Content-Type": "application/json", ...(currentAccessToken() ? { Authorization: `Bearer ${currentAccessToken()}` } : {}) },
          body: JSON.stringify({ text: normalizeForSpeech(items[0].text, items[0].isHeading, options.language),
            voiceId: requestedVoice, language: options.language, instruct: options.instruct?.trim() || undefined }),
          signal: controller.signal,
        });
        if (!response.ok) throw new Error(unavailableMessage(response, await response.json().catch(() => null)));
        const blob = await response.blob();
        if (!blob.size || !blob.type.startsWith("audio/")) throw new Error("Speech service returned invalid audio.");
        return [speechResult(blob, Number(response.headers.get("X-Audio-Duration")),
          Number(response.headers.get("X-Generation-Seconds")), generationStartedAt)];
      }
      const language = options?.language;
      const supertonic = options?.engine === "supertonic" || (options?.engine !== "kokoro" && language !== undefined && language !== "en");
      const body: Record<string, unknown> = {
        texts: items.map((item) => supertonic
          ? normalizeForSupertonic(item.text, item.isHeading, language)
          : normalizeForSpeech(item.text, item.isHeading, language)),
        speed: speechSpeed,
      };
      if (language === "en" && requestedVoice && isKokoroVoiceForLanguage(requestedVoice, language) && !supertonic) body.word_timings = true;
      if (options) {
        body.language = language;
        body.voice = options.voice;
        body.steps = options.steps;
        if (options.engine) body.engine = options.engine;
        const voiceName = options.voice ? voiceDisplayName(options.voice) : undefined;
        if (voiceName) body.voice_name = voiceName;
      }
      const userToken = await currentSessionAccessToken();
      if (!userToken) throw new Error("sign_in_required");
      const response = await fetch("/api/tts", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-FreeReader-Context": JSON.stringify(telemetryContext(options?.source)),
          "X-FreeReader-User-Token": userToken,
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
      if (options?.engine === "kokoro" && reportedModel && !reportedModel.toLowerCase().includes("kokoro")) {
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
          const result = speechResult(new Blob([blob], { type: "audio/mp4" }), durations[index],
            generationSeconds, generationStartedAt);
          const timingFile = archive.file(`${index}.json`);
          if (timingFile) {
            try { result.wordTimings = parseWordTimings(JSON.parse(await timingFile.async("text"))); }
            catch { /* The audio remains usable without word timings. */ }
          }
          parts.push(result);
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
    voiceRef: string, language: string | undefined, signal: AbortSignal, generationStartedAt: number,
    instruct?: string): Promise<SpeechResult[]> {
    const record = findClonedVoice(clonedVoiceId(voiceRef));
    if (!record) throw new Error("This cloned voice is not available in this browser. Create it again from Clone voice.");
    const parts: SpeechResult[] = [];
    for (const item of items) {
      status?.(items.length > 1
        ? `Generating ${items.length} passages with your cloned voice`
        : "Generating with your cloned voice");
      const response = await fetch("/api/clone-tts", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...(currentAccessToken() ? { Authorization: `Bearer ${currentAccessToken()}` } : {}) },
        body: JSON.stringify({
          text: normalizeForSpeech(item.text, item.isHeading, language),
          voiceId: record.id,
          userId: record.userId,
          voiceName: record.name,
          language,
          speed: speechSpeed,
          ...(instruct?.trim() ? { instruct: instruct.trim() } : {}),
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
