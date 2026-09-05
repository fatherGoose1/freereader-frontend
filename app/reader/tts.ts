import { getLocalFile, streamToLocalFile } from "./storage";
import { normalizeForSpeech } from "./speechText";

const REVISION = "3cadd1ee6394adea1bd021217a0e650ede09a323";
const MODEL_ROOT = `https://huggingface.co/Supertone/supertonic-3/resolve/${REVISION}`;
const ASSETS = [
  ["onnx/duration_predictor.onnx", 3_700_147],
  ["onnx/text_encoder.onnx", 36_416_150],
  ["onnx/tts.json", 8_253],
  ["onnx/unicode_indexer.json", 277_676],
  ["onnx/vector_estimator.onnx", 256_534_781],
  ["onnx/vocoder.onnx", 101_424_195],
] as const;
const VOICES = ["M1", "M2", "M3", "M4", "M5", "F1", "F2", "F3", "F4", "F5"] as const;
const VOICE_SIZES: Record<(typeof VOICES)[number], number> = {
  M1: 291_748, M2: 292_055, M3: 290_198, M4: 291_522, M5: 291_469,
  F1: 292_046, F2: 292_423, F3: 290_794, F4: 291_808, F5: 291_479,
};
const TOTAL_MODEL_BYTES = ASSETS.reduce((total, [, size]) => total + size, 0);

export type Voice = (typeof VOICES)[number];
export type TtsStatus = (message: string, progress?: number) => void;

type OrtModule = typeof import("onnxruntime-web/webgpu");
type Session = Awaited<ReturnType<OrtModule["InferenceSession"]["create"]>>;

interface Style {
  ttl: InstanceType<OrtModule["Tensor"]>;
  dp: InstanceType<OrtModule["Tensor"]>;
}

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
  provider: "WebGPU" | "WASM";
}

let componentsPromise: Promise<Components> | null = null;
const styles = new Map<Voice, Promise<Style>>();
let synthesisTail: Promise<unknown> = Promise.resolve();

async function cachedAsset(path: string, expectedSize: number, status?: TtsStatus): Promise<Blob> {
  const cachePath = `models/${REVISION}/${path}`;
  const local = await getLocalFile(cachePath);
  if (local?.size === expectedSize) return local;
  const response = await fetch(`${MODEL_ROOT}/${path}?download=true`);
  if (!response.ok) throw new Error(`Model download failed (${response.status})`);
  let downloaded = 0;
  const tracker = new TransformStream<Uint8Array, Uint8Array>({
    transform(chunk, controller) {
      downloaded += chunk.byteLength;
      status?.("Downloading voice model", downloaded / expectedSize);
      controller.enqueue(chunk);
    },
  });
  const tracked = response.body ? new Response(response.body.pipeThrough(tracker)) : response;
  const stored = await streamToLocalFile(cachePath, tracked);
  if (stored.size !== expectedSize) throw new Error(`Incomplete model asset: ${path}`);
  return stored;
}

async function jsonAsset<T>(path: string, expectedSize: number, status?: TtsStatus): Promise<T> {
  return JSON.parse(await (await cachedAsset(path, expectedSize, status)).text()) as T;
}

async function createSessions(
  ort: OrtModule,
  blobs: Map<string, Blob>,
  provider: "webgpu" | "wasm",
  status?: TtsStatus,
): Promise<[Session, Session, Session, Session]> {
  const names = ["duration_predictor.onnx", "text_encoder.onnx", "vector_estimator.onnx", "vocoder.onnx"];
  const sessions: Session[] = [];
  for (let index = 0; index < names.length; index += 1) {
    status?.(`Preparing voice model: ${names[index].replace(/_/g, " ")}`, (index + 1) / names.length);
    const blob = blobs.get(`onnx/${names[index]}`)!;
    const url = URL.createObjectURL(blob);
    try {
      sessions.push(await ort.InferenceSession.create(url, {
        executionProviders: [provider],
        graphOptimizationLevel: "all",
      }));
    } finally {
      URL.revokeObjectURL(url);
    }
  }
  return sessions as [Session, Session, Session, Session];
}

async function initialize(status?: TtsStatus): Promise<Components> {
  const ort = await import("onnxruntime-web/webgpu");
  ort.env.wasm.wasmPaths = "https://cdn.jsdelivr.net/npm/onnxruntime-web@1.29.0/dist/";
  const blobs = new Map<string, Blob>();
  let completed = 0;
  for (const [path, size] of ASSETS) {
    const blob = await cachedAsset(path, size, (message, progress = 0) => {
      const currentBytes = completed + size * progress;
      status?.(
        `${message} (${Math.round(currentBytes / 1_000_000)} of ${Math.round(TOTAL_MODEL_BYTES / 1_000_000)} MB)`,
        currentBytes / TOTAL_MODEL_BYTES,
      );
    });
    blobs.set(path, blob);
    completed += size;
    status?.("Downloading voice model", completed / TOTAL_MODEL_BYTES);
  }
  const config = JSON.parse(await blobs.get("onnx/tts.json")!.text()) as TtsConfig;
  const indexer = JSON.parse(await blobs.get("onnx/unicode_indexer.json")!.text()) as number[];
  let sessions: [Session, Session, Session, Session];
  let provider: "WebGPU" | "WASM" = "WebGPU";
  if ("gpu" in navigator) {
    try {
      sessions = await createSessions(ort, blobs, "webgpu", status);
    } catch (error) {
      console.warn("Supertonic WebGPU initialization failed; using WASM", error);
      provider = "WASM";
      sessions = await createSessions(ort, blobs, "wasm", status);
    }
  } else {
    provider = "WASM";
    sessions = await createSessions(ort, blobs, "wasm", status);
  }
  status?.(`Voice model ready with ${provider}`, 1);
  return {
    ort,
    config,
    indexer,
    duration: sessions[0],
    encoder: sessions[1],
    estimator: sessions[2],
    vocoder: sessions[3],
    provider,
  };
}

async function getComponents(status?: TtsStatus): Promise<Components> {
  componentsPromise ??= initialize(status).catch((error) => {
    componentsPromise = null;
    throw error;
  });
  return componentsPromise;
}

async function loadStyle(voice: Voice, components: Components, status?: TtsStatus): Promise<Style> {
  let promise = styles.get(voice);
  if (!promise) {
    promise = (async () => {
      status?.(`Loading ${voice} voice`);
      const data = await jsonAsset<{
        style_ttl: { data: number[][][]; dims: number[] };
        style_dp: { data: number[][][]; dims: number[] };
      }>(`voice_styles/${voice}.json`, VOICE_SIZES[voice], status);
      const ttl = new Float32Array(data.style_ttl.data.flat(2));
      const dp = new Float32Array(data.style_dp.data.flat(2));
      return {
        ttl: new components.ort.Tensor("float32", ttl, data.style_ttl.dims),
        dp: new components.ort.Tensor("float32", dp, data.style_dp.dims),
      };
    })();
    styles.set(voice, promise);
  }
  return promise;
}

function normalizeText(text: string, language: string, isHeading: boolean): string {
  return `<${language}>${normalizeForSpeech(text, isHeading)}</${language}>`;
}

function lengthMask(length: number): Float32Array {
  return new Float32Array(length).fill(1);
}

function randomNormal(): number {
  const u1 = Math.max(0.0001, Math.random());
  const u2 = Math.random();
  return Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
}

async function infer(
  components: Components,
  style: Style,
  text: string,
  language: string,
  steps: number,
  isHeading: boolean,
  speechSpeed = 0.9,
  status?: TtsStatus,
): Promise<{ samples: Float32Array; duration: number }> {
  const { ort, config } = components;
  const tagged = normalizeText(text, language, isHeading);
  const codePoints = Array.from(tagged, (character) => character.codePointAt(0)!);
  const ids = new BigInt64Array(codePoints.map((point) => BigInt(components.indexer[point] ?? -1)));
  const maskData = lengthMask(ids.length);
  const textIds = new ort.Tensor("int64", ids, [1, ids.length]);
  const textMask = new ort.Tensor("float32", maskData, [1, 1, ids.length]);
  const durationOutput = await components.duration.run({ text_ids: textIds, style_dp: style.dp, text_mask: textMask });
  const duration = Number(durationOutput.duration.data[0]) / speechSpeed;
  const encoderOutput = await components.encoder.run({ text_ids: textIds, style_ttl: style.ttl, text_mask: textMask });
  const chunkSize = config.ae.base_chunk_size * config.ttl.chunk_compress_factor;
  const latentLength = Math.max(1, Math.ceil(duration * config.ae.sample_rate / chunkSize));
  const channels = config.ttl.latent_dim * config.ttl.chunk_compress_factor;
  let latent = new Float32Array(channels * latentLength);
  latent.forEach((_, index) => { latent[index] = randomNormal(); });
  const latentMask = new ort.Tensor("float32", lengthMask(latentLength), [1, 1, latentLength]);
  const totalStep = new ort.Tensor("float32", new Float32Array([steps]), [1]);
  for (let step = 0; step < steps; step += 1) {
    status?.(`Generating speech (${step + 1}/${steps})`, (step + 1) / steps);
    const result = await components.estimator.run({
      noisy_latent: new ort.Tensor("float32", latent, [1, channels, latentLength]),
      text_emb: encoderOutput.text_emb,
      style_ttl: style.ttl,
      latent_mask: latentMask,
      text_mask: textMask,
      current_step: new ort.Tensor("float32", new Float32Array([step]), [1]),
      total_step: totalStep,
    });
    latent = new Float32Array(result.denoised_latent.data as Float32Array);
  }
  const output = await components.vocoder.run({ latent: new ort.Tensor("float32", latent, [1, channels, latentLength]) });
  const maximum = Math.min(output.wav_tts.data.length, Math.floor(config.ae.sample_rate * duration));
  return { samples: new Float32Array((output.wav_tts.data as Float32Array).slice(0, maximum)), duration };
}

function wavBlob(samples: Float32Array, sampleRate: number): Blob {
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

export function synthesize(
  text: string,
  voice: Voice = "M3",
  steps = 8,
  status?: TtsStatus,
  isHeading = false,
  speechSpeed = 0.9,
): Promise<{ blob: Blob; duration: number; provider: string }> {
  const task = synthesisTail.then(async () => {
    const components = await getComponents(status);
    const style = await loadStyle(voice, components, status);
    const result = await infer(components, style, text, "en", steps, isHeading, speechSpeed, status);
    return {
      blob: wavBlob(result.samples, components.config.ae.sample_rate),
      duration: result.duration,
      provider: components.provider,
    };
  });
  synthesisTail = task.catch(() => undefined);
  return task;
}

export { VOICES };
