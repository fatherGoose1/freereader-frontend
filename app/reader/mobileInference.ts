import { loadMobileModelAsset } from "./mobileModelCache";
import { configureMobileWasm } from "./mobileWasm";
import { normalizeForSpeech } from "./speechText";
import type { SpeechLanguage } from "./speech";

const MODEL_REVISION = "11f5965fd0bc7dfb191a16d83772fc658a3c03d8";
const ORIGINAL_REVISION = "3cadd1ee6394adea1bd021217a0e650ede09a323";
const MODEL_ROOT = `https://huggingface.co/soniqo/Supertonic-3-ONNX-INT8/resolve/${MODEL_REVISION}`;
const ORIGINAL_ROOT = `https://huggingface.co/Supertone/supertonic-3/resolve/${ORIGINAL_REVISION}`;
// Filenames and byte sizes verified against the pinned INT8 card and HF tree.
const MODELS = [
  ["onnx/duration_predictor.onnx", 1_281_963],
  ["onnx/text_encoder.onnx", 9_805_085],
  ["onnx/vector_estimator.onnx", 65_360_765],
  ["onnx/vocoder.onnx", 25_642_382],
] as const;
const VOICE_SIZES = {
  M1: 291_748, M2: 292_055, M3: 290_198, M4: 291_522, M5: 291_469,
  F1: 292_046, F2: 292_423, F3: 290_794, F4: 291_808, F5: 291_479,
} as const;
const MAX_INPUT_CHARS = 4_000;
const MAX_CHUNK_CHARS = 120;
const MAX_DURATION_SECONDS = 15;

class SpeechChunkTooLong extends Error {}

type Status = (message: string, progress?: number) => void;
type OrtModule = typeof import("onnxruntime-web/wasm");
type Session = Awaited<ReturnType<OrtModule["InferenceSession"]["create"]>>;
type Tensor = InstanceType<OrtModule["Tensor"]>;
type Voice = keyof typeof VOICE_SIZES;

interface TtsConfig {
  ae: { sample_rate: number; base_chunk_size: number };
  ttl: { chunk_compress_factor: number; latent_dim: number };
}

interface Components {
  ort: OrtModule;
  config: TtsConfig;
  indexer: number[];
  duration: Session;
  encoder: Session;
  estimator: Session;
  vocoder: Session;
}

interface Style {
  voice: Voice;
  ttl: Tensor;
  dp: Tensor;
}

// Owned by the dedicated worker, whose caller serializes synthesis requests.
let componentsPromise: Promise<Components> | null = null;
let cachedStyle: Style | null = null;

async function cachedAsset(path: string, size: number, quantized: boolean, status: Status): Promise<Blob> {
  const revision = quantized ? MODEL_REVISION : ORIGINAL_REVISION;
  const root = quantized ? MODEL_ROOT : ORIGINAL_ROOT;
  status(`Checking model cache: ${path}`);
  return loadMobileModelAsset({
    url: `${root}/${path}?download=true`,
    path: `models/${revision}/${path}`,
    size,
    label: path,
  }, status);
}

async function jsonAsset<T>(path: string, size: number, status: Status): Promise<T> {
  return JSON.parse(await (await cachedAsset(path, size, false, status)).text()) as T;
}

async function initialize(status: Status): Promise<Components> {
  const ort = await import("onnxruntime-web/wasm");
  configureMobileWasm(ort, self.location.href);
  const config = await jsonAsset<TtsConfig>("onnx/tts.json", 8_253, status);
  const indexer = await jsonAsset<number[]>("onnx/unicode_indexer.json", 277_676, status);
  // These pinned dimensions also bound latent allocations if the cache is corrupt.
  if (config.ae.sample_rate !== 44_100 || config.ae.base_chunk_size !== 512
    || config.ttl.chunk_compress_factor !== 6 || config.ttl.latent_dim !== 24) {
    throw new Error("Unexpected Supertonic 3 audio configuration.");
  }
  const sessions: Session[] = [];
  try {
    for (const [path, size] of MODELS) {
      const url = URL.createObjectURL(await cachedAsset(path, size, true, status));
      try {
        status(`Preparing mobile voice model (WASM): ${path}`);
        sessions.push(await ort.InferenceSession.create(url, {
          executionProviders: ["wasm"],
          executionMode: "sequential",
          graphOptimizationLevel: "basic",
          enableCpuMemArena: false,
          enableMemPattern: false,
          extra: { session: { disable_prepacking: "1" } },
        }));
      } finally {
        URL.revokeObjectURL(url);
      }
    }
    status("Mobile voice model ready with WASM", 1);
    return { ort, config, indexer, duration: sessions[0], encoder: sessions[1], estimator: sessions[2], vocoder: sessions[3] };
  } catch (error) {
    await Promise.allSettled(sessions.map((session) => session.release()));
    throw error;
  }
}

async function loadStyle(voice: Voice, { ort }: Components, status: Status): Promise<Style> {
  if (cachedStyle?.voice === voice) return cachedStyle;
  if (cachedStyle) {
    const previous = cachedStyle;
    cachedStyle = null;
    previous.ttl.dispose();
    previous.dp.dispose();
  }
  status(`Loading ${voice} voice`);
  const data = await jsonAsset<{
    style_ttl: { data: number[][][]; dims: number[] };
    style_dp: { data: number[][][]; dims: number[] };
  }>(`voice_styles/${voice}.json`, VOICE_SIZES[voice], status);
  const ttl = new ort.Tensor("float32", new Float32Array(data.style_ttl.data.flat(2)), data.style_ttl.dims);
  try {
    const dp = new ort.Tensor("float32", new Float32Array(data.style_dp.data.flat(2)), data.style_dp.dims);
    cachedStyle = { voice, ttl, dp };
    return cachedStyle;
  } catch (error) {
    ttl.dispose();
    throw error;
  }
}

// Split already-normalized text without dropping whitespace or splitting surrogate pairs.
export function splitMobileText(text: string): string[] {
  const chunks: string[] = [];
  let start = 0;
  while (start < text.length) {
    let end = Math.min(start + MAX_CHUNK_CHARS, text.length);
    if (end < text.length) {
      if (!/\s/.test(text[end])) {
        for (let boundary = end - 1; boundary > start; boundary -= 1) {
          if (/\s/.test(text[boundary])) {
            end = boundary + 1;
            break;
          }
        }
      }
      if (text.codePointAt(end - 1)! > 0xffff) end -= 1;
    }
    chunks.push(text.slice(start, end));
    start = end;
  }
  return chunks;
}

async function inferPcm(
  components: Components,
  style: Style,
  text: string,
  language: SpeechLanguage,
  steps: number,
  speechSpeed: number,
  status: Status,
): Promise<Uint8Array<ArrayBuffer>> {
  if (!text.length || text.length > MAX_CHUNK_CHARS) throw new Error("Invalid mobile speech chunk length.");
  const { ort, config } = components;
  const tensors = new Set<Tensor>();
  const own = (tensor: Tensor): Tensor => { tensors.add(tensor); return tensor; };
  const dispose = (...values: Tensor[]) => {
    for (const tensor of values) {
      if (tensors.delete(tensor)) tensor.dispose();
    }
  };
  const run = async (session: Session, feeds: Record<string, Tensor>) => {
    const output = await session.run(feeds);
    Object.values(output).forEach(own);
    return output;
  };
  try {
    const codePoints = Array.from(`<${language}>${text}</${language}>`, (character) => character.codePointAt(0)!);
    const ids = new BigInt64Array(codePoints.map((point) => BigInt(components.indexer[point] ?? -1)));
    const textIds = own(new ort.Tensor("int64", ids, [1, ids.length]));
    const textMask = own(new ort.Tensor("float32", new Float32Array(ids.length).fill(1), [1, 1, ids.length]));
    const durationOutput = await run(components.duration, { text_ids: textIds, style_dp: style.dp, text_mask: textMask });
    const duration = Number(durationOutput.duration.data[0]) / speechSpeed;
    dispose(...Object.values(durationOutput));
    if (!Number.isFinite(duration) || duration <= 0) throw new Error("Invalid mobile speech duration.");
    if (duration > MAX_DURATION_SECONDS) throw new SpeechChunkTooLong("Mobile speech chunk exceeds the duration budget.");

    const chunkSize = config.ae.base_chunk_size * config.ttl.chunk_compress_factor;
    const latentLength = Math.max(1, Math.ceil(duration * config.ae.sample_rate / chunkSize));
    const channels = config.ttl.latent_dim * config.ttl.chunk_compress_factor;
    const encoderOutput = await run(components.encoder, { text_ids: textIds, style_ttl: style.ttl, text_mask: textMask });
    const textEmb = encoderOutput.text_emb;
    dispose(textIds, ...Object.values(encoderOutput).filter((tensor) => tensor !== textEmb));
    let latent: Tensor;
    {
      const noise = new Float32Array(channels * latentLength);
      for (let index = 0; index < noise.length; index += 1) {
        const u1 = Math.max(0.0001, Math.random());
        const u2 = Math.random();
        noise[index] = Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
      }
      latent = own(new ort.Tensor("float32", noise, [1, channels, latentLength]));
    }
    const latentMask = own(new ort.Tensor("float32", new Float32Array(latentLength).fill(1), [1, 1, latentLength]));
    const totalStep = own(new ort.Tensor("float32", new Float32Array([steps]), [1]));
    for (let step = 0; step < steps; step += 1) {
      status(`Generating speech (${step + 1}/${steps})`, (step + 1) / steps);
      const currentStep = own(new ort.Tensor("float32", new Float32Array([step]), [1]));
      const result = await run(components.estimator, {
        noisy_latent: latent,
        text_emb: textEmb,
        style_ttl: style.ttl,
        latent_mask: latentMask,
        text_mask: textMask,
        current_step: currentStep,
        total_step: totalStep,
      });
      const next = result.denoised_latent;
      if (next.type !== "float32" || next.data.length !== channels * latentLength) {
        throw new Error("Unexpected mobile speech latent shape.");
      }
      dispose(latent, currentStep, ...Object.values(result).filter((tensor) => tensor !== next));
      // Reuse the result as the next input, disposing it after the following run.
      latent = next;
    }
    dispose(textEmb, textMask, latentMask, totalStep);
    const output = await run(components.vocoder, { latent });
    dispose(latent);
    const wav = output.wav_tts;
    dispose(...Object.values(output).filter((tensor) => tensor !== wav));
    if (wav.type !== "float32") throw new Error("Unexpected mobile speech audio format.");
    const samples = wav.data as Float32Array;
    const maximum = Math.min(samples.length, Math.floor(config.ae.sample_rate * duration));
    const pcm = new Uint8Array(maximum * 2);
    const view = new DataView(pcm.buffer);
    for (let index = 0; index < maximum; index += 1) {
      view.setInt16(index * 2, Math.max(-1, Math.min(1, samples[index])) * 32767, true);
    }
    return pcm;
  } finally {
    dispose(...tensors);
  }
}

export async function synthesizeMobile(
  text: string,
  voice: string,
  steps: number,
  isHeading: boolean,
  speechSpeed: number,
  language: SpeechLanguage,
  status: (message: string, progress?: number) => void,
): Promise<{ blob: Blob; duration: number; provider: string; generationSeconds: number }> {
  if (text.length > MAX_INPUT_CHARS) throw new Error(`Mobile speech input exceeds ${MAX_INPUT_CHARS} characters.`);
  if (!Object.hasOwn(VOICE_SIZES, voice)) throw new Error(`Unknown Supertonic voice: ${voice}`);
  if (!Number.isSafeInteger(steps) || steps < 1 || steps > 64) throw new Error("Speech steps must be between 1 and 64.");
  if (!Number.isFinite(speechSpeed) || speechSpeed <= 0) throw new Error("Speech speed must be finite and positive.");
  const normalized = normalizeForSpeech(text, isHeading, language);
  if (!normalized) throw new Error("Mobile speech input is empty after normalization.");
  const chunks = splitMobileText(normalized);
  componentsPromise ??= initialize(status).catch((error) => {
    componentsPromise = null;
    throw error;
  });
  const components = await componentsPromise;
  const style = await loadStyle(voice as Voice, components, status);
  const generationStarted = performance.now();
  const sampleRate = components.config.ae.sample_rate;
  const silence = new Uint8Array(Math.round(sampleRate * 0.1) * 2);
  const parts: BlobPart[] = [];
  let dataBytes = 0;
  for (let index = 0; index < chunks.length; index += 1) {
    let pcm: Uint8Array<ArrayBuffer>;
    try {
      pcm = await inferPcm(components, style, chunks[index], language, steps, speechSpeed,
        (message, progress = 0) => status(`Chunk ${index + 1}/${chunks.length}: ${message}`, (index + progress) / chunks.length));
    } catch (error) {
      if (!(error instanceof SpeechChunkTooLong) || Array.from(chunks[index]).length < 2) throw error;
      const characters = Array.from(chunks[index]);
      const middle = Math.ceil(characters.length / 2);
      chunks.splice(index, 1, characters.slice(0, middle).join(""), characters.slice(middle).join(""));
      index -= 1;
      continue;
    }
    if (index > 0) {
      parts.push(silence);
      dataBytes += silence.byteLength;
    }
    parts.push(pcm);
    dataBytes += pcm.byteLength;
  }
  const header = new ArrayBuffer(44);
  const view = new DataView(header);
  const write = (offset: number, value: string) => {
    for (let index = 0; index < value.length; index += 1) view.setUint8(offset + index, value.charCodeAt(index));
  };
  write(0, "RIFF");
  view.setUint32(4, 36 + dataBytes, true);
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
  view.setUint32(40, dataBytes, true);
  return {
    blob: new Blob([header, ...parts], { type: "audio/wav" }),
    duration: dataBytes / (sampleRate * 2),
    provider: "WASM",
    generationSeconds: (performance.now() - generationStarted) / 1000,
  };
}
