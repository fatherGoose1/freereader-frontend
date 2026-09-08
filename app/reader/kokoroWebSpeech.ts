import type { TtsStatus } from "./tts";
import type { KokoroVoice } from "./voices";

export type KokoroWebRequest = { text: string; voice: KokoroVoice; speechSpeed: number; isHeading: boolean };
export type KokoroWebResponse =
  | { kind: "status"; message: string; progress?: number }
  | { kind: "result"; audio: ArrayBuffer; duration: number; provider: string; generationSeconds: number }
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
    this.rejectActive?.(new Error("Kokoro speech was interrupted. Tap Play to retry."));
  }

  synthesize(text: string, voice: KokoroVoice, speechSpeed: number, isHeading = false, status?: TtsStatus) {
    const epoch = this.epoch;
    const task = this.tail.then(() => new Promise<{ blob: Blob; duration: number; provider: string; generationSeconds: number }>((resolve, reject) => {
      if (epoch !== this.epoch) { reject(new Error("Kokoro speech was cancelled.")); return; }
      let timer: ReturnType<typeof setTimeout>;
      const finish = (error?: Error, result?: { blob: Blob; duration: number; provider: string; generationSeconds: number }) => {
        clearTimeout(timer); this.rejectActive = undefined;
        if (error) { this.worker?.terminate(); this.worker = undefined; reject(error); } else resolve(result!);
      };
      const watchdog = () => {
        clearTimeout(timer);
        timer = setTimeout(() => finish(new Error("Kokoro model initialization or generation stalled. Tap Play to retry.")), 300_000);
      };
      this.rejectActive = (error) => finish(error);
      try {
        this.worker ??= this.createWorker();
        this.worker.onmessage = (event: MessageEvent<KokoroWebResponse>) => {
          const reply = event.data;
          if (reply.kind === "status") { watchdog(); status?.(reply.message, reply.progress); }
          else if (reply.kind === "error") finish(new Error(reply.message));
          else finish(undefined, { blob: new Blob([reply.audio], { type: "audio/wav" }), duration: reply.duration, provider: reply.provider, generationSeconds: reply.generationSeconds });
        };
        this.worker.onerror = () => finish(new Error("Kokoro voice worker failed. Tap Play to retry."));
        this.worker.onmessageerror = () => finish(new Error("Could not read Kokoro voice output. Tap Play to retry."));
        watchdog();
        this.worker.postMessage({ text, voice, speechSpeed, isHeading } satisfies KokoroWebRequest);
      } catch (error) { finish(error instanceof Error ? error : new Error(String(error))); }
    }));
    this.tail = task.catch(() => undefined);
    return task;
  }
}
