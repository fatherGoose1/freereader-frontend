import { getAudio } from "../reader/storage";
import type { NarrationSegment } from "./model";

// Render the saved takes and their pauses into one downloadable mono WAV.
export async function exportVoiceover(segments: NarrationSegment[]): Promise<Blob> {
  const sampleRate = 24_000;
  const context = new AudioContext();
  try {
    const takes: { buffer: AudioBuffer; pauseSamples: number }[] = [];
    for (const segment of segments) {
      if (segment.status !== "ready" || !segment.audio) throw new Error("Generate all passages before exporting.");
      const blob = await getAudio(segment.audio.path);
      if (!blob) throw new Error("Some saved audio is missing. Regenerate the affected passage before exporting.");
      takes.push({ buffer: await context.decodeAudioData(await blob.arrayBuffer()), pauseSamples: Math.round(segment.pauseAfterMs * sampleRate / 1000) });
    }
    const samples = takes.reduce((count, take, index) => count + Math.round(take.buffer.duration * sampleRate) + (index < takes.length - 1 ? take.pauseSamples : 0), 0);
    const data = new ArrayBuffer(44 + samples * 2);
    const view = new DataView(data);
    const write = (offset: number, text: string) => { for (let i = 0; i < text.length; i++) view.setUint8(offset + i, text.charCodeAt(i)); };
    write(0, "RIFF"); view.setUint32(4, data.byteLength - 8, true);
    write(8, "WAVE"); write(12, "fmt "); view.setUint32(16, 16, true);
    view.setUint16(20, 1, true); view.setUint16(22, 1, true);
    view.setUint32(24, sampleRate, true); view.setUint32(28, sampleRate * 2, true);
    view.setUint16(32, 2, true); view.setUint16(34, 16, true);
    write(36, "data"); view.setUint32(40, samples * 2, true);
    let cursor = 44;
    for (const [index, { buffer, pauseSamples }] of takes.entries()) {
      const channels = Array.from({ length: buffer.numberOfChannels }, (_, channel) => buffer.getChannelData(channel));
      const count = Math.round(buffer.duration * sampleRate);
      for (let i = 0; i < count; i++) {
        const source = Math.min(buffer.length - 1, Math.floor(i * buffer.sampleRate / sampleRate));
        const value = channels.reduce((sum, channel) => sum + channel[source], 0) / channels.length;
        view.setInt16(cursor, Math.round(Math.max(-1, Math.min(1, value)) * 32767), true);
        cursor += 2;
      }
      if (index < takes.length - 1) cursor += pauseSamples * 2;
    }
    return new Blob([data], { type: "audio/wav" });
  } finally {
    await context.close();
  }
}
