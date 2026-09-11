import { configureMobileWasm } from "./mobileWasm";
import { errorReason, ttsLog } from "./ttsDiagnostics";

type Ort = typeof import("onnxruntime-web/all");
// Only the API surface used here; WebGPU is not yet in TypeScript's DOM lib.
type Device = {
  destroy(): void;
  lost: Promise<{ reason: string; message: string }>;
};
type Adapter = {
  features: ReadonlySet<string>;
  limits: Record<string, number>;
  requestDevice(options: { requiredLimits: Record<string, number> }): Promise<Device>;
};
type Gpu = { requestAdapter(): Promise<Adapter | null> };

// 101-byte ONNX: opset 13, float32 MatMul(x[1,2], w[2,1]) -> y[1,1].
// Both operands are inputs, so optimization cannot constant-fold the probe.
export const GPU_PROBE_MODEL = Uint8Array.from(
  "08083a5d0a110a01780a017712017922064d61744d756c12096770752d70726f62655a130a0178120e0a0c080112080a0208010a0208025a130a0177120e0a0c080112080a0208020a02080162130a0179120e0a0c080112080a0208010a0208014202100d"
    .match(/../g)!, (byte) => parseInt(byte, 16),
);

// In 1.29 /webgpu is native WebGPU + Asyncify. /all retains the established
// JSEP WebGPU backend and its async GPU readback path.
export async function probeWebGPU(mobile: boolean, loadOrt: () => Promise<Ort> = () => import("onnxruntime-web/all"),
  gpu = (globalThis.navigator as Navigator & { gpu?: Gpu } | undefined)?.gpu) {
  let stage = "navigator.gpu";
  let device: Device | undefined;
  let ort: Ort | undefined;
  let session: Awaited<ReturnType<Ort["InferenceSession"]["create"]>> | undefined;
  ttsLog("GPU detection", { navigatorGpu: !!gpu });
  try {
    if (!gpu) throw new Error("navigator.gpu is unavailable in the inference worker");
    stage = "requestAdapter";
    const adapter = await gpu.requestAdapter();
    ttsLog("GPU adapter", { available: !!adapter });
    if (!adapter) throw new Error("No WebGPU adapter returned");
    stage = "requestDevice";
    // Default device limits can be lower than the adapter's and too small for Kokoro.
    // Request only supported limits; neither FP32 nor the INT8 export needs shader-f16.
    const requiredLimits = Object.fromEntries([
      "maxBufferSize", "maxStorageBufferBindingSize", "maxComputeWorkgroupStorageSize",
      "maxComputeInvocationsPerWorkgroup", "maxComputeWorkgroupSizeX", "maxComputeWorkgroupSizeY",
      "maxComputeWorkgroupSizeZ", "maxComputeWorkgroupsPerDimension", "maxStorageBuffersPerShaderStage",
    ].filter((key) => adapter.limits[key] !== undefined).map((key) => [key, adapter.limits[key]]));
    device = await adapter.requestDevice({ requiredLimits });
    ttsLog("GPU device", { available: true, shaderF16: adapter.features.has("shader-f16"), limits: requiredLimits });
    stage = "ORT WebGPU probe";
    ort = await loadOrt();
    configureMobileWasm(ort, globalThis.location.href, mobile, true);
    // JSEP creates its own device. Modern adapters are single-use, so it needs a
    // fresh adapter after our explicit requestDevice check (including on Chrome).
    device.destroy();
    device = undefined;
    const ortAdapter = await gpu.requestAdapter();
    if (!ortAdapter) throw new Error("No adapter available for ORT after device validation");
    ort.env.webgpu.adapter = ortAdapter;
    session = await ort.InferenceSession.create(GPU_PROBE_MODEL, {
      executionProviders: ["webgpu"],
      preferredOutputLocation: "gpu-buffer",
      extra: { session: { disable_cpu_ep_fallback: "1" } },
    });
    device = await ort.env.webgpu.device as Device;
    let lost: string | undefined;
    void device.lost.then((info) => { lost = `WebGPU device lost (${info.reason}): ${info.message}`; });
    const assertUsable = () => { if (lost) throw new Error(lost); };
    const x = new ort.Tensor("float32", [2, 3], [1, 2]);
    const w = new ort.Tensor("float32", [4, 5], [2, 1]);
    let output: Awaited<ReturnType<typeof session.run>> | undefined;
    try {
      output = await session.run({ x, w });
      if (output.y.location !== "gpu-buffer") throw new Error("ORT probe did not execute on the GPU");
      if ((await output.y.getData())[0] !== 23) throw new Error("ORT GPU probe returned incorrect output");
      assertUsable();
    } finally {
      x.dispose(); w.dispose();
      Object.values(output ?? {}).forEach((tensor) => tensor.dispose());
    }
    ttsLog("ORT WebGPU", { usable: true, backend: "JSEP", probeBytes: GPU_PROBE_MODEL.byteLength, wasmThreads: ort.env.wasm.numThreads });
    // Retain this tiny session with the tested device, which Kokoro will reuse.
    // The caller releases both sessions on failure/shutdown.
    return { ort, device, session, assertUsable };
  } catch (error) {
    await session?.release().catch(() => undefined);
    // Session creation can fail after JSEP has already created its device.
    device ??= await ort?.env.webgpu.device as Device | undefined;
    device?.destroy();
    const reason = `${stage}: ${errorReason(error)}`;
    ttsLog("GPU detection failed", { stage, reason });
    throw new Error(reason);
  }
}
