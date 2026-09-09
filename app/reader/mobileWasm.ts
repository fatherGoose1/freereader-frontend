type MobileOrt = typeof import("onnxruntime-web/wasm");

export const MOBILE_ORT_WASM_PATH = "/onnxruntime-web/1.29.0/ort-wasm-simd-threaded.wasm";

export function configureMobileWasm(ort: MobileOrt, baseUrl: string): void {
  ort.env.wasm.numThreads = 1;
  ort.env.wasm.proxy = false;
  ort.env.wasm.simd = "fixed";
  ort.env.wasm.wasmPaths = { wasm: new URL(MOBILE_ORT_WASM_PATH, baseUrl).href };
}
