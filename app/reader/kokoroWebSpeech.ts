import type { TtsStatus } from "./tts";
import type { KokoroVoice } from "./voices";
import { SpeechCancelledError } from "./ttsDiagnostics";

export type KokoroWebRequest = { kind: "probe"; mobile: boolean }
  | { kind: "synthesize"; text: string; voice: KokoroVoice; speechSpeed: number; isHeading: boolean; mobile: boolean };
export type KokoroWebResponse =
  | { kind: "status"; message: string; progress?: number }
  | { kind: "ready" }
  | { kind: "result"; audio: ArrayBuffer; duration: number; provider: string; generationSeconds: number; generationStartedAt: number }
  | { kind: "error"; message: string };

export class KokoroWebSpeechClient {
  private worker?: Worker;
  private tail: Promise<unknown> = Promise.resolve();
  private rejectActive?: (error: Error) => void;
  private epoch = 0;

  constructor(private readonly createWorker = () => new Worker(new URL("./kokoroWebSpeech.worker.ts", import.meta.url), { type: "module" })) {}

  stop() {
    this.epoch += 1;
    this.worker?.terminate();
    this.worker = undefined;
    this.rejectActive?.(new SpeechCancelledError("Kokoro speech was interrupted."));
  }

  async probe(mobile: boolean) {
    await this.request({ kind: "probe", mobile });
  }

  async synthesize(text: string, voice: KokoroVoice, speechSpeed: number, isHeading = false, status?: TtsStatus, mobile = false) {
    const reply = await this.request({ kind: "synthesize", text, voice, speechSpeed, isHeading, mobile }, status);
    if (reply.kind !== "result") throw new Error("Missing Kokoro audio result");
    return { blob: new Blob([reply.audio], { type: "audio/wav" }), duration: reply.duration,
      provider: reply.provider, generationSeconds: reply.generationSeconds, generationStartedAt: reply.generationStartedAt };
  }

  private request(request: KokoroWebRequest, status?: TtsStatus) {
    const epoch = this.epoch;
    const task = this.tail.then(() => new Promise<Extract<KokoroWebResponse, { kind: "result" | "ready" }>>((resolve, reject) => {
      if (epoch !== this.epoch) { reject(new SpeechCancelledError("Kokoro speech was cancelled.")); return; }
      let timer: ReturnType<typeof setTimeout>;
      const finish = (error?: Error, result?: Extract<KokoroWebResponse, { kind: "result" | "ready" }>) => {
        clearTimeout(timer); this.rejectActive = undefined;
        if (error) { this.worker?.terminate(); this.worker = undefined; reject(error); } else resolve(result!);
      };
      const watchdog = () => {
        clearTimeout(timer);
        timer = setTimeout(() => finish(new Error(request.kind === "probe"
          ? "WebGPU/ORT capability probe timed out" : "Kokoro model initialization or generation stalled")), request.kind === "probe" ? 60_000 : 300_000);
      };
      this.rejectActive = (error) => finish(error);
      try {
        this.worker ??= this.createWorker();
        this.worker.onmessage = (event: MessageEvent<KokoroWebResponse>) => {
          const reply = event.data;
          if (reply.kind === "status") { watchdog(); status?.(reply.message, reply.progress); }
          else if (reply.kind === "error") finish(new Error(reply.message));
          else finish(undefined, reply);
        };
        this.worker.onerror = (event) => finish(new Error(`Kokoro worker: ${event.message || "unknown worker failure"}`));
        this.worker.onmessageerror = () => finish(new Error("Could not read Kokoro voice output. Tap Play to retry."));
        watchdog();
        this.worker.postMessage(request);
      } catch (error) { finish(error instanceof Error ? error : new Error(String(error))); }
    }));
    this.tail = task.catch(() => undefined);
    return task;
  }
}
