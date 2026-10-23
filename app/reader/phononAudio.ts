import { encodeWavPcm16 } from "./voiceCloneAudio";

export const PHONON_CLIP_SECONDS = 10;
export const PHONON_SAMPLE_RATE = 24_000;

export async function decodePhononRecording(file: Blob): Promise<AudioBuffer> {
  const Context = window.AudioContext ?? (window as Window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!Context) throw new Error("Audio processing is not supported in this browser.");
  const context = new Context();
  try {
    const decoded = await context.decodeAudioData(await file.arrayBuffer());
    if (decoded.duration < PHONON_CLIP_SECONDS || decoded.duration > 600) {
      throw new Error("Choose a recording between ten seconds and ten minutes.");
    }
    return decoded;
  } catch (error) {
    if (error instanceof Error && error.message.startsWith("Choose a recording")) throw error;
    throw new Error("That audio format could not be read. Try a WAV, MP3, or M4A file.");
  } finally {
    void context.close();
  }
}

export function phononWaveform(buffer: AudioBuffer, count = 64): number[] {
  const peaks: number[] = [];
  const samples = buffer.getChannelData(0);
  for (let bucket = 0; bucket < count; bucket += 1) {
    let peak = 0;
    const from = Math.floor(bucket * samples.length / count);
    const to = Math.floor((bucket + 1) * samples.length / count);
    const step = Math.max(1, Math.floor((to - from) / 128));
    for (let index = from; index < to; index += step) peak = Math.max(peak, Math.abs(samples[index]));
    peaks.push(Math.max(0.06, peak));
  }
  return peaks;
}

export async function preparePhononClip(buffer: AudioBuffer, start: number): Promise<Blob> {
  if (!Number.isFinite(start) || start < 0 || start + PHONON_CLIP_SECONDS > buffer.duration + 0.001) {
    throw new Error("Select ten full seconds of audio.");
  }
  const context = new OfflineAudioContext(1, PHONON_SAMPLE_RATE * PHONON_CLIP_SECONDS, PHONON_SAMPLE_RATE);
  const source = context.createBufferSource();
  source.buffer = buffer;
  source.connect(context.destination);
  source.start(0, start, PHONON_CLIP_SECONDS);
  const rendered = await context.startRendering();
  return encodeWavPcm16(rendered.getChannelData(0), PHONON_SAMPLE_RATE);
}
