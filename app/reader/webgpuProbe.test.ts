import assert from "node:assert/strict";
import test from "node:test";
import { probeWebGPU } from "./webgpuProbe";

test("missing GPU and null adapter reject before loading ORT", async () => {
  const load = async (): Promise<typeof import("onnxruntime-web/webgpu")> => { throw new Error("ORT should not load"); };
  await assert.rejects(probeWebGPU(true, load), /navigator.gpu/);
  await assert.rejects(probeWebGPU(true, load, { requestAdapter: async () => null }), /requestAdapter:.*No WebGPU adapter/);
});

test("requestDevice failure reports the exact stage before loading ORT", async () => {
  let loaded = false;
  await assert.rejects(probeWebGPU(true, async () => { loaded = true; throw new Error("ORT should not load"); }, {
    requestAdapter: async () => ({ features: new Set(), limits: {}, requestDevice: async () => { throw new Error("device blocked"); } }),
  }), /requestDevice:.*device blocked/);
  assert.equal(loaded, false);
});

test("JSEP receives a fresh adapter after the single-use device check; failed inference cleans up", async (t) => {
  const location = Object.getOwnPropertyDescriptor(globalThis, "location");
  Object.defineProperty(globalThis, "location", { configurable: true, value: { href: "https://reader.example/" } });
  t.after(() => {
    if (location) Object.defineProperty(globalThis, "location", location);
    else Reflect.deleteProperty(globalThis, "location");
  });
  let adapterRequests = 0;
  let devicesDestroyed = 0;
  let released = 0;
  const device = () => ({ destroy() { devicesDestroyed += 1; }, lost: new Promise<never>(() => {}) });
  const validationDevice = device();
  const runtimeDevice = device();
  const adapter = () => ({ features: new Set<string>(), limits: {}, requestDevice: async () => validationDevice });
  const first = adapter();
  const fresh = adapter();
  const ort = {
    env: { wasm: {}, webgpu: { adapter: undefined as unknown, device: runtimeDevice } },
    InferenceSession: { create: async () => {
      assert.equal(ort.env.webgpu.adapter, fresh);
      assert.equal(devicesDestroyed, 1);
      return { run: async () => { throw new Error("GPU readback failed"); }, release: async () => { released += 1; } };
    } },
    Tensor: class { dispose() {} },
  } as unknown as typeof import("onnxruntime-web/all");
  await assert.rejects(probeWebGPU(true, async () => ort, {
    requestAdapter: async () => ++adapterRequests === 1 ? first : fresh,
  }), /ORT WebGPU probe:.*GPU readback failed/);
  assert.equal(adapterRequests, 2);
  assert.equal(devicesDestroyed, 2);
  assert.equal(released, 1);
});
