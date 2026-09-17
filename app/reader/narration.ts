import { MobileSpeechClient, usesMobileSpeech, type SpeechResult } from "./mobileSpeech";
import { RemoteSpeechClient } from "./remoteSpeech";
import { speechEngine, voiceForLanguage, type SpeechLanguage } from "./speech";
import type { TtsStatus } from "./tts";
import type { NarratorVoice } from "./voices";
import { isSupertonicVoice } from "./voices";
import { SpeechCancelledError, ttsLog } from "./ttsDiagnostics";

type Clients = {
  supertonic: Pick<MobileSpeechClient, "synthesize" | "stop">;
  remote: Pick<RemoteSpeechClient, "synthesize" | "synthesizeBatch" | "stop">;
};
export type NarrationRoute = { model: string; voice: NarratorVoice; provider: "WASM" | "Server"; mobile: boolean };

export class UnsupportedMobileLanguageError extends Error {
  constructor() {
    super("FreeReader offers English narration only on mobile.");
    this.name = "UnsupportedMobileLanguageError";
  }
}

export class NarrationRouter {
  private active?: "supertonic" | "remote";
  private tail: Promise<unknown> = Promise.resolve();
  private epoch = 0;

  constructor(private readonly mobile = usesMobileSpeech(), private readonly clients: Clients = {
    supertonic: new MobileSpeechClient(), remote: new RemoteSpeechClient(),
  }) {
    ttsLog("classification", { device: mobile ? "mobile" : "desktop" });
  }

  stop() {
    this.epoch += 1;
    this.clients.supertonic.stop();
    this.clients.remote.stop();
    this.active = undefined;
  }

  async route(voice: NarratorVoice, language: SpeechLanguage): Promise<NarrationRoute> {
    const selected = voiceForLanguage(voice, language);
    // English is synthesized by the backend on every device; on-device Kokoro is retired.
    if (speechEngine(language) === "kokoro") {
      return { model: "kokoro-7m-fp32-server-v1", voice: selected, provider: "Server", mobile: this.mobile };
    }
    // Non-English still runs Supertonic locally, but only desktop ships that path.
    if (this.mobile) throw new UnsupportedMobileLanguageError();
    return { model: "supertonic-fp32-wasm-v2", voice: selected, provider: "WASM", mobile: false };
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
      const route = await this.route(voice, language);
      checkRequest();
      let result: SpeechResult;
      if (route.provider === "Server") {
        if (this.active === "supertonic") this.clients.supertonic.stop();
        this.active = "remote";
        result = await this.clients.remote.synthesize(text, speechSpeed, isHeading, status);
      } else {
        if (this.active === "remote") this.clients.remote.stop();
        this.active = "supertonic";
        if (!isSupertonicVoice(route.voice)) throw new Error("Non-English narration requires a Supertonic voice.");
        result = await this.clients.supertonic.synthesize(
          { text, voice: route.voice, steps, isHeading, speechSpeed, language, mobile: this.mobile }, status);
      }
      ttsLog("inference", { ...route, inferenceSeconds: result.generationSeconds,
        audioSeconds: result.duration, rtf: result.generationSeconds / result.duration,
        requestToAudioSeconds: (performance.now() - started) / 1000 });
      return { ...result, route };
    });
    this.tail = task.catch(() => undefined);
    return task;
  }

  synthesizeBatch(texts: string[], headings: boolean[], voice: NarratorVoice, steps: number, status: TtsStatus | undefined,
    speechSpeed: number, language: SpeechLanguage,
    isNeeded: () => boolean = () => true): Promise<{ parts: SpeechResult[]; route: NarrationRoute }> {
    const epoch = this.epoch;
    const checkRequest = () => {
      if (epoch !== this.epoch || !isNeeded()) throw new SpeechCancelledError("Narration was cancelled");
    };
    const task = this.tail.then(async () => {
      const started = performance.now();
      checkRequest();
      const route = await this.route(voice, language);
      checkRequest();
      let parts: SpeechResult[];
      if (route.provider === "Server") {
        if (this.active === "supertonic") this.clients.supertonic.stop();
        this.active = "remote";
        parts = await this.clients.remote.synthesizeBatch(
          texts.map((text, position) => ({ text, isHeading: headings[position] ?? false })), speechSpeed, status);
      } else {
        if (this.active === "remote") this.clients.remote.stop();
        this.active = "supertonic";
        if (!isSupertonicVoice(route.voice)) throw new Error("Non-English narration requires a Supertonic voice.");
        parts = [];
        for (let position = 0; position < texts.length; position += 1) {
          checkRequest();
          parts.push(await this.clients.supertonic.synthesize({
            text: texts[position], voice: route.voice, steps,
            isHeading: headings[position] ?? false, speechSpeed, language, mobile: this.mobile,
          }, status));
        }
      }
      const spoken = parts.reduce((total, part) => total + part.duration, 0);
      ttsLog("inference", { ...route, passages: parts.length, audioSeconds: spoken,
        requestToAudioSeconds: (performance.now() - started) / 1000 });
      return { parts, route };
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

export function synthesizeBatch(texts: string[], headings: boolean[], voice: NarratorVoice = "af_heart", steps = 8,
  status?: TtsStatus, speechSpeed = 0.9, language: SpeechLanguage = "en", isNeeded?: () => boolean) {
  return getRouter().synthesizeBatch(texts, headings, voice, steps, status, speechSpeed, language, isNeeded);
}