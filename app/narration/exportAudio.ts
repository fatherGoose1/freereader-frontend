import { getAudio } from "../reader/storage";
import { isSupertonicVoice } from "../reader/voices";
import type { NarrationSegment } from "./model";

// Decode at the highest source rate in the project. Web Audio resamples any
// lower-rate takes with its own interpolation; copying decoded samples directly
// avoids the aliasing caused by dropping samples during export.
export async function exportVoiceover(segments: NarrationSegment[]): Promise<Blob> {
  if (!segments.length) throw new Error("Generate your voiceover before exporting.");
  const sourceRate = segments.some((segment) => segment.audio && (
    segment.audio.model.toLowerCase().includes("supertonic") || isSupertonicVoice(segment.audio.voice)
  )) ? 44_100 : 24_000;
  const context = new AudioContext({ sampleRate: sourceRate });
  const sampleRate = context.sampleRate;
  try {
    const takes: { buffer: AudioBuffer; pauseSamples: number }[] = [];
    for (const segment of segments) {
      if (segment.status !== "ready" || !segment.audio) throw new Error("Generate all passages before exporting.");
      const blob = await getAudio(segment.audio.path);
      if (!blob) throw new Error("Some saved audio is missing. Regenerate the affected passage before exporting.");
      takes.push({ buffer: await context.decodeAudioData(await blob.arrayBuffer()), pauseSamples: Math.round(segment.pauseAfterMs * sampleRate / 1000) });
    }
    const samples = takes.reduce((count, take, index) => count + take.buffer.length + (index < takes.length - 1 ? take.pauseSamples : 0), 0);
    const bytesPerSample = 3;
    if (samples > (0xffffffff - 36) / bytesPerSample) throw new Error("Voiceover is too long for a single WAV file.");
    const data = new ArrayBuffer(44 + samples * bytesPerSample);
    const view = new DataView(data);
    const write = (offset: number, text: string) => { for (let i = 0; i < text.length; i++) view.setUint8(offset + i, text.charCodeAt(i)); };
    write(0, "RIFF"); view.setUint32(4, data.byteLength - 8, true);
    write(8, "WAVE"); write(12, "fmt "); view.setUint32(16, 16, true);
    view.setUint16(20, 1, true); view.setUint16(22, 1, true);
    view.setUint32(24, sampleRate, true); view.setUint32(28, sampleRate * bytesPerSample, true);
    view.setUint16(32, bytesPerSample, true); view.setUint16(34, 24, true);
    write(36, "data"); view.setUint32(40, samples * bytesPerSample, true);
    let cursor = 44;
    for (const [index, { buffer, pauseSamples }] of takes.entries()) {
      const channels = Array.from({ length: buffer.numberOfChannels }, (_, channel) => buffer.getChannelData(channel));
      for (let i = 0; i < buffer.length; i++) {
        const value = channels.reduce((sum, channel) => sum + channel[i], 0) / channels.length;
        const sample = Math.round(Math.max(-1, Math.min(1, value)) * 8388607);
        view.setUint8(cursor++, sample & 0xff);
        view.setUint8(cursor++, (sample >> 8) & 0xff);
        view.setUint8(cursor++, (sample >> 16) & 0xff);
      }
      if (index < takes.length - 1) cursor += pauseSamples * bytesPerSample;
    }
    return new Blob([data], { type: "audio/wav" });
  } finally {
    await context.close();
  }
}
