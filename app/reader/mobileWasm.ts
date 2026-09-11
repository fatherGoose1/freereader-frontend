type MobileOrt = typeof import("onnxruntime-web/wasm");
import { ttsLog } from "./ttsDiagnostics";

export const MOBILE_ORT_WASM_PATH = "/onnxruntime-web/1.29.0/ort-wasm-simd-threaded.wasm";

export function wasmThreads(mobile: boolean, isolated = globalThis.crossOriginIsolated === true,
  cores = globalThis.navigator?.hardwareConcurrency ?? 2): number {
  return isolated && typeof SharedArrayBuffer !== "undefined"
    ? Math.max(1, Math.min(mobile ? 2 : 4, Math.floor(cores / 2))) : 1;
}

export function configureMobileWasm(ort: MobileOrt, baseUrl: string, mobile = true, webgpu = false): void {
  ort.env.wasm.numThreads = wasmThreads(mobile);
  ort.env.wasm.proxy = false;
  ort.env.wasm.simd = "fixed";
  const stem = `/onnxruntime-web/1.29.0/ort-wasm-simd-threaded${webgpu ? ".jsep" : ""}`;
  // Match /all's JSEP WebGPU backend; /wasm uses the standard SIMD build.
  // Same-origin glue is also needed by Emscripten's pthread workers.
  ort.env.wasm.wasmPaths = {
    wasm: new URL(`${stem}.wasm`, baseUrl).href,
    mjs: new URL(`${stem}.mjs`, baseUrl).href,
  };
  ttsLog("runtime", { provider: webgpu ? "WebGPU" : "WASM", simd: "fixed",
    wasmThreads: ort.env.wasm.numThreads, crossOriginIsolated: globalThis.crossOriginIsolated === true,
    ortVersion: ort.env.versions?.web });
}
