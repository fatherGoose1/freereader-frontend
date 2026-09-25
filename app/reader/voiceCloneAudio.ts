// Client-side preparation for voice cloning: decode any recorded/uploaded clip,
// cut it to the 25 second maximum the Modal endpoint accepts, and hand back a
// WAV payload the API route can forward.

export const MAX_CLONE_SECONDS = 25;
export const MIN_CLONE_SECONDS = 3;

export interface PreparedCloneAudio {
  blob: Blob;
  durationSeconds: number;
  base64: string;
}

function audioContextConstructor(): typeof AudioContext | undefined {
  if (typeof window === "undefined") return undefined;
  return window.AudioContext
    ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
}

export function encodeWavPcm16(samples: Float32Array, sampleRate: number): Blob {
  const buffer = new ArrayBuffer(44 + samples.length * 2);
  const view = new DataView(buffer);
  const write = (offset: number, value: string) => {
    for (let index = 0; index < value.length; index += 1) view.setUint8(offset + index, value.charCodeAt(index));
  };
  write(0, "RIFF");
  view.setUint32(4, 36 + samples.length * 2, true);
  write(8, "WAVE");
  write(12, "fmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, 1, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * 2, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  write(36, "data");
  view.setUint32(40, samples.length * 2, true);
  for (let index = 0; index < samples.length; index += 1) {
    view.setInt16(44 + index * 2, Math.max(-1, Math.min(1, samples[index])) * 32767, true);
  }
  return new Blob([buffer], { type: "audio/wav" });
}

export function arrayBufferToBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let binary = "";
  const chunkSize = 0x8000;
  for (let offset = 0; offset < bytes.length; offset += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(offset, offset + chunkSize));
  }
  return btoa(binary);
}

export async function prepareCloneAudio(
  source: Blob,
  maxSeconds = MAX_CLONE_SECONDS,
): Promise<PreparedCloneAudio> {
  const AudioContextConstructor = audioContextConstructor();
  if (!AudioContextConstructor) throw new Error("Audio processing is not supported in this browser.");
  const context = new AudioContextConstructor();
  let buffer: AudioBuffer;
  try {
    buffer = await context.decodeAudioData((await source.arrayBuffer()).slice(0));
  } catch {
    throw new Error("That audio format could not be read. Try a WAV or MP3 file.");
  } finally {
    void context.close();
  }
  const sampleRate = buffer.sampleRate;
  const length = Math.min(buffer.length, Math.floor(maxSeconds * sampleRate));
  const mono = new Float32Array(length);
  for (let channel = 0; channel < buffer.numberOfChannels; channel += 1) {
    const data = buffer.getChannelData(channel);
    for (let index = 0; index < length; index += 1) mono[index] += data[index] / buffer.numberOfChannels;
  }
  const durationSeconds = length / sampleRate;
  if (durationSeconds < MIN_CLONE_SECONDS) {
    throw new Error(`That clip is only ${durationSeconds.toFixed(1)}s long. Use at least ${MIN_CLONE_SECONDS} seconds.`);
  }
  const blob = encodeWavPcm16(mono, sampleRate);
  return { blob, durationSeconds, base64: arrayBufferToBase64(await blob.arrayBuffer()) };
}

export class VoiceRecorder {
  private recorder?: MediaRecorder;
  private stream?: MediaStream;
  private chunks: BlobPart[] = [];

  static supported(): boolean {
    return typeof window !== "undefined"
      && typeof MediaRecorder !== "undefined"
      && !!navigator.mediaDevices?.getUserMedia;
  }

  async start(): Promise<void> {
    if (this.recorder) return;
    if (!VoiceRecorder.supported()) throw new Error("Microphone recording is not supported in this browser.");
    this.stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    const mimeType = ["audio/webm;codecs=opus", "audio/webm", "audio/mp4"]
      .find((type) => typeof MediaRecorder.isTypeSupported === "function" && MediaRecorder.isTypeSupported(type));
    this.chunks = [];
    this.recorder = new MediaRecorder(this.stream, mimeType ? { mimeType } : undefined);
    this.recorder.addEventListener("dataavailable", (event) => {
      if (event.data.size) this.chunks.push(event.data);
    });
    this.recorder.start();
  }

  async stop(): Promise<Blob> {
    const recorder = this.recorder;
    if (!recorder) throw new Error("Recording has not started.");
    const blob = await new Promise<Blob>((resolve) => {
      recorder.addEventListener("stop", () => resolve(new Blob(this.chunks, { type: recorder.mimeType || "audio/webm" })), { once: true });
      recorder.stop();
    });
    this.release();
    return blob;
  }

  cancel(): void {
    const recorder = this.recorder;
    if (recorder && recorder.state !== "inactive") recorder.stop();
    this.release();
  }

  private release(): void {
    this.recorder = undefined;
    this.stream?.getTracks().forEach((track) => track.stop());
    this.stream = undefined;
    this.chunks = [];
  }
}
