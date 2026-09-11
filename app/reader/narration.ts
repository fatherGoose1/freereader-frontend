import { MobileSpeechClient, usesMobileSpeech, type SpeechResult } from "./mobileSpeech";
import { KokoroWebSpeechClient } from "./kokoroWebSpeech";
import { speechEngine, voiceForLanguage, type SpeechLanguage } from "./speech";
import type { TtsStatus } from "./tts";
import { isKokoroVoice, type NarratorVoice } from "./voices";
import { errorReason, SpeechCancelledError, ttsLog } from "./ttsDiagnostics";

type Clients = {
  kokoro: Pick<KokoroWebSpeechClient, "probe" | "synthesize" | "stop">;
  supertonic: Pick<MobileSpeechClient, "synthesize" | "stop">;
};
export type NarrationRoute = { model: string; voice: NarratorVoice; provider: "WebGPU" | "WASM"; mobile: boolean };

export class NarrationRouter {
  private gpu?: Promise<boolean>;
  private fallbackReason?: string;
  private active?: "kokoro" | "supertonic";
  private tail: Promise<unknown> = Promise.resolve();
  private epoch = 0;

  constructor(private readonly mobile = usesMobileSpeech(), private readonly clients: Clients = {
    kokoro: new KokoroWebSpeechClient(), supertonic: new MobileSpeechClient(),
  }) {
    ttsLog("classification", { device: mobile ? "mobile" : "desktop", navigatorGpu: !!(globalThis.navigator as Navigator & { gpu?: unknown } | undefined)?.gpu });
  }

  stop() {
    this.epoch += 1;
    this.clients.kokoro.stop();
    this.clients.supertonic.stop();
    this.active = undefined;
    // The worker owns the tested device; a replacement worker must probe again.
    this.gpu = undefined;
  }

  private fallback(error: unknown) {
    this.fallbackReason = errorReason(error);
    this.clients.kokoro.stop(); // Termination also reclaims ORT memory after a worker crash/stall.
    this.gpu = Promise.resolve(false);
    ttsLog("fallback", { reason: this.fallbackReason, model: this.mobile ? "Supertonic 3 INT8" : "Supertonic 3 FP32", provider: "WASM" });
  }

  async route(voice: NarratorVoice, language: SpeechLanguage): Promise<NarrationRoute> {
    const selected = voiceForLanguage(voice, language);
    // Temporary mobile override: always use the existing Supertonic 3 INT8 WASM path below.
    if (!this.mobile && speechEngine(language) === "kokoro" && !this.fallbackReason) {
      this.gpu ??= this.clients.kokoro.probe(this.mobile).then(() => true).catch((error) => {
        if (error instanceof SpeechCancelledError) throw error;
        this.fallback(error);
        return false;
      });
      if (await this.gpu) return { model: this.mobile ? "kokoro-q8-webgpu-v2" : "kokoro-fp32-webgpu-v2", voice: selected, provider: "WebGPU", mobile: this.mobile };
    }
    // Preserve the existing 31-language support. Map an English Kokoro voice to
    // a Supertonic style of the same gender when its GPU route cannot be used.
    const fallbackVoice = isKokoroVoice(selected) ? (selected[1] === "f" ? "F1" : "M3") : selected;
    return { model: this.mobile ? "supertonic-int8-wasm-v2" : "supertonic-fp32-wasm-v2", voice: fallbackVoice, provider: "WASM", mobile: this.mobile };
  }

  synthesize(text: string, voice: NarratorVoice, steps: number, status: TtsStatus | undefined,
    isHeading: boolean, speechSpeed: number, language: SpeechLanguage,
    isNeeded: () => boolean = () => true): Promise<SpeechResult & { route: NarrationRoute }> {
    const epoch = this.epoch;
    const checkRequest = () => {
      if (epoch !== this.epoch || !isNeeded()) throw new SpeechCancelledError("Narration was cancelled");
    };
    const task = this.tail.then(async () => {
      const started = performance.now();
      checkRequest();
      let route = await this.route(voice, language);
      checkRequest();
      let result: SpeechResult | undefined;
      if (route.provider === "WebGPU" && isKokoroVoice(route.voice)) {
        if (this.active === "supertonic") this.clients.supertonic.stop();
        this.active = "kokoro";
        try {
          result = await this.clients.kokoro.synthesize(text, route.voice, speechSpeed, isHeading, status, this.mobile);
        } catch (error) {
          if (epoch !== this.epoch || error instanceof SpeechCancelledError) throw error;
          checkRequest();
          this.fallback(error);
          route = await this.route(voice, language);
        }
      }
      if (!result) {
        checkRequest();
        if (this.active === "kokoro") { this.clients.kokoro.stop(); this.gpu = undefined; }
        this.active = "supertonic";
        if (isKokoroVoice(route.voice)) throw new Error("Invalid fallback voice");
        result = await this.clients.supertonic.synthesize({ text, voice: route.voice, steps, isHeading, speechSpeed, language, mobile: this.mobile }, status);
      }
      ttsLog("inference", { ...route, inferenceSeconds: result.generationSeconds,
        audioSeconds: result.duration, rtf: result.generationSeconds / result.duration,
        requestToAudioSeconds: (performance.now() - started) / 1000 });
      return { ...result, route };
    });
    this.tail = task.catch(() => undefined);
    return task;
  }
}

let router: NarrationRouter | undefined;
function getRouter() {
  if (!router) {
    router = new NarrationRouter();
    window.addEventListener("pagehide", () => router?.stop());
  }
  return router;
}

export function narrationRoute(voice: NarratorVoice, language: SpeechLanguage) {
  return getRouter().route(voice, language);
}

export function synthesize(text: string, voice: NarratorVoice = "af_heart", steps = 8, status?: TtsStatus,
  isHeading = false, speechSpeed = 0.9, language: SpeechLanguage = "en", isNeeded?: () => boolean) {
  return getRouter().synthesize(text, voice, steps, status, isHeading, speechSpeed, language, isNeeded);
}
