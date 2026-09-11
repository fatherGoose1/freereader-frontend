import { copyFile, mkdir, readFile } from "node:fs/promises";

const root = new URL("../", import.meta.url);
const { version } = JSON.parse(await readFile(new URL("node_modules/onnxruntime-web/package.json", root), "utf8"));
if (version !== "1.29.0") throw new Error("Update the TTS runtime paths when upgrading ONNX Runtime.");
const target = new URL(`public/onnxruntime-web/${version}/`, root);
await mkdir(target, { recursive: true });
for (const file of ["ort-wasm-simd-threaded.wasm", "ort-wasm-simd-threaded.mjs",
  "ort-wasm-simd-threaded.jsep.wasm", "ort-wasm-simd-threaded.jsep.mjs"]) {
  await copyFile(new URL(`node_modules/onnxruntime-web/dist/${file}`, root), new URL(file, target));
}
