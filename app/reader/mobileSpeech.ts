import type { TtsStatus, Voice } from "./tts";
import type { SpeechLanguage } from "./speech";

export function usesMobileSpeech(device = typeof navigator === "undefined" ? undefined : navigator): boolean {
  return !!device && (/Android|iPhone|iPad|iPod/i.test(device.userAgent)
    || (/Macintosh|MacIntel/i.test(`${device.userAgent} ${device.platform}`) && device.maxTouchPoints > 1));
}

export type SpeechResult = {
  blob: Blob; duration: number; provider: string; generationSeconds: number;
  // performance.timeOrigin + performance.now(), comparable across worker/window clocks.
  generationStartedAt: number;
};
export type MobileRequest = { text: string; voice: Voice; steps: number; isHeading: boolean; speechSpeed: number; language: SpeechLanguage; mobile?: boolean };
export type MobileResponse =
  | { kind: "status"; message: string; progress?: number }
  | { kind: "result"; result: SpeechResult }
  | { kind: "error"; message: string };

// Both Supertonic variants run off the UI thread; the worker imports only its variant.
export class MobileSpeechClient {
  private worker?: Worker;
  private tail: Promise<unknown> = Promise.resolve();
  private idle?: ReturnType<typeof setTimeout>;
  private rejectActive?: (error: Error) => void;
  private epoch = 0;

  constructor(private readonly createWorker = () => new Worker(new URL("./mobileSpeech.worker.ts", import.meta.url), { type: "module" })) {}

  stop() {
    this.epoch += 1;
    clearTimeout(this.idle);
    this.worker?.terminate();
    this.worker = undefined;
    this.rejectActive?.(new Error("Mobile speech was interrupted. Tap Play to retry."));
  }

  synthesize(request: MobileRequest, status?: TtsStatus): Promise<SpeechResult> {
    const epoch = this.epoch;
    const task = this.tail.then(() => new Promise<SpeechResult>((resolve, reject) => {
      if (epoch !== this.epoch) { reject(new Error("Mobile speech was cancelled.")); return; }
      clearTimeout(this.idle);
      let timer: ReturnType<typeof setTimeout>;
      const finish = (error?: Error, result?: SpeechResult) => {
        clearTimeout(timer);
        this.rejectActive = undefined;
        if (error) {
          this.worker?.terminate();
          this.worker = undefined;
          reject(error);
        } else {
          this.idle = setTimeout(() => this.stop(), 120_000);
          resolve(result!);
        }
      };
      const watchdog = () => {
        clearTimeout(timer);
        timer = setTimeout(() => finish(new Error("Mobile voice initialization or generation stalled. Tap Play to retry.")), 120_000);
      };
      this.rejectActive = (error) => finish(error);
      try {
        this.worker ??= this.createWorker();
        this.worker.onmessage = (event: MessageEvent<MobileResponse>) => {
          const reply = event.data;
          if (reply.kind === "status") {
            watchdog();
            status?.(reply.message, reply.progress);
          } else if (reply.kind === "error") finish(new Error(reply.message));
          else finish(undefined, reply.result);
        };
        this.worker.onerror = () => finish(new Error("Mobile voice worker failed. Tap Play to retry."));
        this.worker.onmessageerror = () => finish(new Error("Could not read mobile voice output. Tap Play to retry."));
        watchdog();
        this.worker.postMessage(request);
      } catch (error) {
        finish(error instanceof Error ? error : new Error(String(error)));
      }
    }));
    this.tail = task.catch(() => undefined);
    return task;
  }
}
