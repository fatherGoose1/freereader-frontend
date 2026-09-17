import type { TtsStatus } from "./tts";
import { KOKORO_DISTILLED_VOICE, KOKORO_MODELS, kokoroVoiceAsset, loadKokoroAsset } from "./kokoroWebResources";
import { configureMobileWasm } from "./mobileWasm";
import { normalizeForSpeech } from "./speechText";
import type { KokoroVoice } from "./voices";
import { probeWebGPU } from "./webgpuProbe";
import { ttsLog } from "./ttsDiagnostics";

const SAMPLE_RATE = 24_000;
const MAX_TOKENS = 510;
const ESPEAK_MODULE = "/kokoro-web/espeak-ng.js";
const ESPEAK_WASM = "/kokoro-web/espeak-ng.wasm";
type Ort = typeof import("onnxruntime-web/all");
type Session = Awaited<ReturnType<Ort["InferenceSession"]["create"]>>;
export type KokoroProvider = "WebGPU" | "WASM";
type Provider = KokoroProvider;
type Components = { ort: Ort; session: Session; voiceSession?: Session; provider: Provider };
type Chunk = { tokens: number[] } | { silence: number };
type Phonemizer = (text: string, language: "en-us" | "en-gb") => Promise<string>;

let componentsPromise: Promise<Components> | undefined;
let gpuPromise: ReturnType<typeof probeWebGPU> | undefined;
let mobileOrtPromise: Promise<Ort> | undefined;
let providerPromise: Promise<Provider> | undefined;
const voices = new Map<KokoroVoice, Promise<Float32Array>>();

export function prepareKokoroWebGPU(mobile: boolean): Promise<Provider> {
  providerPromise ??= (async () => {
    gpuPromise ??= probeWebGPU(mobile);
    try {
      (await gpuPromise).assertUsable();
      return "WebGPU";
    } catch (error) {
      if (!mobile) throw error;
      ttsLog("provider fallback", { model: "Kokoro 7M Distill", from: "WebGPU", to: "WASM" });
      mobileOrtPromise ??= import("onnxruntime-web/wasm").then((module) => {
        const ort = module as unknown as Ort;
        configureMobileWasm(ort, globalThis.location.href);
        return ort;
      });
      await mobileOrtPromise;
      return "WASM";
    }
  })();
  return providerPromise;
}

export async function disposeKokoroWeb(): Promise<void> {
  const components = await componentsPromise?.catch(() => undefined);
  const gpu = await gpuPromise?.catch(() => undefined);
  await components?.session.release().catch(() => undefined);
  await components?.voiceSession?.release().catch(() => undefined);
  await gpu?.session.release().catch(() => undefined);
  gpu?.device.destroy();
  componentsPromise = undefined;
  gpuPromise = undefined;
  mobileOrtPromise = undefined;
  providerPromise = undefined;
  voices.clear();
}

const VOCAB: Record<string, number> = {
  ";": 1, ":": 2, ",": 3, ".": 4, "!": 5, "?": 6, "—": 9, "…": 10, '"': 11,
  "(": 12, ")": 13, "“": 14, "”": 15, " ": 16, "\u0303": 17, "ʣ": 18, "ʥ": 19,
  "ʦ": 20, "ʨ": 21, "ᵝ": 22, "ꭧ": 23, A: 24, I: 25, O: 31, Q: 33, S: 35, T: 36,
  W: 39, Y: 41, "ᵊ": 42, a: 43, b: 44, c: 45, d: 46, e: 47, f: 48, h: 50, i: 51,
  j: 52, k: 53, l: 54, m: 55, n: 56, o: 57, p: 58, q: 59, r: 60, s: 61, t: 62,
  u: 63, v: 64, w: 65, x: 66, y: 67, z: 68, "ɑ": 69, "ɐ": 70, "ɒ": 71, "æ": 72,
  "β": 75, "ɔ": 76, "ɕ": 77, "ç": 78, "ɖ": 80, "ð": 81, "ʤ": 82, "ə": 83, "ɚ": 85,
  "ɛ": 86, "ɜ": 87, "ɟ": 90, "ɡ": 92, "ɥ": 99, "ɨ": 101, "ɪ": 102, "ʝ": 103,
  "ɯ": 110, "ɰ": 111, "ŋ": 112, "ɳ": 113, "ɲ": 114, "ɴ": 115, "ø": 116, "ɸ": 118,
  "θ": 119, "œ": 120, "ɹ": 123, "ɾ": 125, "ɻ": 126, "ʁ": 128, "ɽ": 129, "ʂ": 130,
  "ʃ": 131, "ʈ": 132, "ʧ": 133, "ʊ": 135, "ʋ": 136, "ʌ": 138, "ɣ": 139, "ɤ": 140,
  "χ": 142, "ʎ": 143, "ʒ": 147, "ʔ": 148, "ˈ": 156, "ˌ": 157, "ː": 158, "ʰ": 162,
  "ʲ": 164, "↓": 169, "→": 171, "↗": 172, "↘": 173, "ᵻ": 177,
};

function tokenize(phonemes: string): number[] {
  return [...phonemes].map((character) => VOCAB[character] || 16);
}

function normalizeText(text: string): string {
  return text.replaceAll("‘", "'").replaceAll("’", "'").replaceAll("«", "(").replaceAll("»", ")")
    .replaceAll("“", '"').replaceAll("”", '"').replace(/、/g, ", ").replace(/。/g, ". ")
    .replace(/！/g, "! ").replace(/，/g, ", ").replace(/：/g, ": ").replace(/；/g, "; ")
    .replace(/？/g, "? ").replaceAll("\n", "  ").replaceAll("\t", "  ").trim();
}

async function phonemizeWords(text: string, language: "en-us" | "en-gb"): Promise<string> {
  type ESpeakFactory = (options: {
    locateFile: (path: string) => string;
    arguments: string[];
  }) => Promise<{ FS: { readFile(path: string, options: { encoding: "utf8" }): string } }>;
  const moduleURL = ESPEAK_MODULE;
  const { default: ESpeakNg } = await import(/* turbopackIgnore: true */ moduleURL) as { default: ESpeakFactory };
  const output = `phonemes-${crypto.randomUUID()}`;
  const espeak = await ESpeakNg({
    locateFile: () => ESPEAK_WASM,
    arguments: ["--phonout", output, "-q", "--ipa", "-v", language, normalizeText(text)],
  });
  return espeak.FS.readFile(output, { encoding: "utf8" }).split("\n").join(" ").trim();
}

async function phonemize(text: string, language: "en-us" | "en-gb", toPhonemes: Phonemizer): Promise<string> {
  const normalized = normalizeText(text);
  const ending = normalized.match(/([;:,.!?]+)["')\]]*$/);
  const spokenText = ending ? normalized.slice(0, ending.index).trimEnd() : normalized;
  const phonemes = spokenText ? await toPhonemes(spokenText, language) : "";
  return `${phonemes}${ending?.[1] ?? ""}`;
}

export async function preprocessKokoroText(
  text: string,
  language: "en-us" | "en-gb",
  toPhonemes: Phonemizer = phonemizeWords,
): Promise<Chunk[]> {
  const sanitized = normalizeText(text).replace(/([.!?]+)(["')\]]*)(?=\s|$)/g, "$1$2[0.4s]")
    .replace(/,(["')\]]*)(?=\s|$)/g, ",$1[0.2s]")
    .replace(/;(["')\]]*)(?=\s|$)/g, ";$1[0.4s]")
    .replace(/:(["')\]]*)(?=\s|$)/g, ":$1[0.3s]").replace(/\n+/g, "[0.4s]").trim();
  const segments = sanitized.split(/(\[[0-9]+(?:\.[0-9]+)?s\])/g).map((value) => value.trim()).filter(Boolean);
  const chunks: Chunk[] = [];
  for (const segment of segments) {
    const silence = segment.match(/^\[([0-9]+(?:\.[0-9]+)?)s\]$/);
    if (silence) {
      chunks.push({ silence: Number(silence[1]) });
      continue;
    }
    const phonemes = await phonemize(segment, language, toPhonemes);
    const characters = [...phonemes];
    for (let offset = 0; offset < characters.length; offset += MAX_TOKENS) {
      chunks.push({ tokens: tokenize(characters.slice(offset, offset + MAX_TOKENS).join("")) });
    }
  }
  return chunks;
}

function trimWaveform(waveform: Float32Array): Float32Array {
  const windowSize = 256;
  const amplitudes = new Float32Array(Math.ceil(waveform.length / windowSize));
  let maximum = 0;
  for (let window = 0; window < amplitudes.length; window += 1) {
    const start = window * windowSize;
    const end = Math.min(start + windowSize, waveform.length);
    let sum = 0;
    for (let index = start; index < end; index += 1) sum += Math.abs(waveform[index]);
    amplitudes[window] = sum / (end - start);
    maximum = Math.max(maximum, amplitudes[window]);
  }
  const threshold = maximum * 0.05;
  let first = amplitudes.findIndex((value) => value > threshold);
  let last = amplitudes.findLastIndex((value) => value > threshold);
  if (first < 0 || last < 0) return waveform;
  first = Math.max(0, first * windowSize - 256);
  last = Math.min(waveform.length, (last + 1) * windowSize + 256);
  return waveform.slice(first, last);
}

function encodeWav(chunks: Float32Array[], sampleCount: number): ArrayBuffer {
  const buffer = new ArrayBuffer(44 + sampleCount * 4);
  const view = new DataView(buffer);
  const write = (offset: number, value: string) => {
    for (let index = 0; index < value.length; index += 1) view.setUint8(offset + index, value.charCodeAt(index));
  };
  write(0, "RIFF"); view.setUint32(4, 36 + sampleCount * 4, true); write(8, "WAVE"); write(12, "fmt ");
  view.setUint32(16, 16, true); view.setUint16(20, 3, true); view.setUint16(22, 1, true);
  view.setUint32(24, SAMPLE_RATE, true); view.setUint32(28, SAMPLE_RATE * 4, true);
  view.setUint16(32, 4, true); view.setUint16(34, 32, true); write(36, "data");
  view.setUint32(40, sampleCount * 4, true);
  let offset = 44;
  for (const chunk of chunks) {
    for (const sample of chunk) { view.setFloat32(offset, sample, true); offset += 4; }
  }
  return buffer;
}

async function createComponents(status?: TtsStatus, mobile = false): Promise<Components> {
  const provider = await prepareKokoroWebGPU(mobile);
  if (mobile) {
    const ort = provider === "WebGPU" ? (await gpuPromise!).ort : await mobileOrtPromise!;
    const [model, voice] = await Promise.all([
      loadKokoroAsset(KOKORO_MODELS.mobile, status, true),
      loadKokoroAsset(KOKORO_DISTILLED_VOICE, status, true),
    ]);
    ttsLog("model", { model: "Kokoro 7M Distill", variant: KOKORO_MODELS.mobile.label,
      bytes: KOKORO_MODELS.mobile.size + KOKORO_DISTILLED_VOICE.size, provider, mobile: true });
    const options = provider === "WebGPU" ? {
      executionProviders: ["webgpu"] as const,
      graphOptimizationLevel: "all" as const,
    } : {
      executionProviders: ["wasm"] as const,
      executionMode: "sequential" as const,
      graphOptimizationLevel: "all" as const,
      enableCpuMemArena: false,
      enableMemPattern: false,
      extra: { session: { disable_prepacking: "1" } },
    };
    let voiceSession: Session | undefined;
    try {
      if (provider === "WebGPU") (await gpuPromise!).assertUsable();
      status?.(`Preparing distilled voice model with ${provider}`);
      voiceSession = await ort.InferenceSession.create(voice, options);
      const session = await ort.InferenceSession.create(model, options);
      if (provider === "WebGPU") (await gpuPromise!).assertUsable();
      return { ort, session, voiceSession, provider };
    } catch (error) {
      await voiceSession?.release().catch(() => undefined);
      throw error;
    }
  }
  const { ort, assertUsable } = await gpuPromise!;
  const asset = KOKORO_MODELS.full;
  ttsLog("model", { model: "Kokoro", variant: asset.label, bytes: asset.size, provider: "WebGPU", mobile });
  const model = await loadKokoroAsset(asset, status, mobile);
  assertUsable();
  status?.("Preparing voice model with WebGPU");
  const session = await ort.InferenceSession.create(model, {
    executionProviders: ["webgpu"],
    graphOptimizationLevel: "all",
  });
  return { ort, session, provider: "WebGPU" };
}

async function getComponents(status?: TtsStatus, mobile = false): Promise<Components> {
  componentsPromise ??= createComponents(status, mobile).catch((error) => { componentsPromise = undefined; throw error; });
  return componentsPromise;
}

async function getVoice(voice: KokoroVoice, status?: TtsStatus, mobile = false): Promise<Float32Array> {
  let value = voices.get(voice);
  if (!value) {
    value = loadKokoroAsset(kokoroVoiceAsset(voice), status, mobile).then((buffer) => new Float32Array(buffer));
    voices.set(voice, value);
  }
  return value;
}

export async function synthesizeKokoroWeb(
  text: string,
  voice: KokoroVoice,
  speechSpeed: number,
  isHeading: boolean,
  status?: TtsStatus,
  mobile = false,
): Promise<{ audio: ArrayBuffer; duration: number; provider: Provider; generationSeconds: number; generationStartedAt: number }> {
  if (!text.trim()) throw new Error("Kokoro speech requires text.");
  if (!Number.isFinite(speechSpeed) || speechSpeed < 0.1 || speechSpeed > 5) throw new Error("Speech speed must be between 0.1 and 5.");
  // No Kokoro assets (including the voice) are fetched before the GPU/ORT probe.
  await prepareKokoroWebGPU(mobile);
  const [{ ort, session, voiceSession, provider }, voiceData, chunks] = await Promise.all([
    getComponents(status, mobile), mobile ? undefined : getVoice(voice, status),
    preprocessKokoroText(normalizeForSpeech(text, isHeading), voice.startsWith("b") ? "en-gb" : "en-us"),
  ]);
  status?.("Generating speech");
  const started = performance.now();
  const waveforms: Float32Array[] = [];
  let sampleCount = 0;
  for (const chunk of chunks) {
    if ("silence" in chunk) {
      const waveform = new Float32Array(Math.floor(chunk.silence * SAMPLE_RATE));
      waveforms.push(waveform); sampleCount += waveform.length; continue;
    }
    if (!chunk.tokens.length) continue;
    const padded = [0, ...chunk.tokens, 0];
    const inputIds = new ort.Tensor("int64", BigInt64Array.from(padded, BigInt), [1, padded.length]);
    const speed = new ort.Tensor("float32", [speechSpeed], [1]);
    let style: InstanceType<Ort["Tensor"]> | undefined;
    let voiceResult: Awaited<ReturnType<Session["run"]>> | undefined;
    let result: Awaited<ReturnType<typeof session.run>> | undefined;
    try {
      if (provider === "WebGPU") (await gpuPromise!).assertUsable();
      if (voiceSession) {
        const index = new ort.Tensor("int64", BigInt64Array.of(BigInt(padded.length - 1)), [1]);
        try {
          voiceResult = await voiceSession.run({ index });
          style = voiceResult[voiceSession.outputNames[0]];
        } finally {
          index.dispose();
        }
      } else {
        const offset = (chunk.tokens.length - 1) * 256;
        style = new ort.Tensor("float32", voiceData!.subarray(offset, offset + 256), [1, 256]);
      }
      result = await session.run({ input_ids: inputIds, style, speed });
      const waveform = trimWaveform(await result[session.outputNames[0]].getData() as Float32Array);
      if (provider === "WebGPU") (await gpuPromise!).assertUsable();
      waveforms.push(waveform); sampleCount += waveform.length;
    } finally {
      inputIds.dispose(); speed.dispose();
      if (voiceResult) Object.values(voiceResult).forEach((tensor) => tensor.dispose());
      else style?.dispose();
      Object.values(result ?? {}).forEach((tensor) => tensor.dispose());
    }
  }
  if (!sampleCount) throw new Error("Kokoro speech generation produced no audio. Tap Play to retry.");
  return { audio: encodeWav(waveforms, sampleCount), duration: sampleCount / SAMPLE_RATE, provider,
    generationSeconds: (performance.now() - started) / 1000, generationStartedAt: performance.timeOrigin + started };
}
