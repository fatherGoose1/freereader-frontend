import { test, expect } from "@playwright/test";

test("plays the first chunk before bounded look-ahead generation on desktop and mobile", async ({ page }) => {
  await page.addInitScript(() => {
    const state = { generated: 0, atPlayback: -1 };
    Object.assign(window, { ttsPipeline: state });
    document.addEventListener("playing", () => { if (state.atPlayback < 0) state.atPlayback = state.generated; }, true);
    window.Worker = class extends EventTarget {
      onmessage: ((event: MessageEvent) => void) | null = null;
      terminate() {}
      postMessage(request: { kind: string }) {
        if (request.kind === "probe") {
          setTimeout(() => this.onmessage?.(new MessageEvent("message", { data: { kind: "ready" } })), 0);
          return;
        }
        state.generated += 1;
        const audio = new ArrayBuffer(44 + 24_000 * 12 * 2);
        const view = new DataView(audio);
        for (const [offset, value] of [[0, "RIFF"], [8, "WAVE"], [12, "fmt "], [36, "data"]] as const) {
          for (let i = 0; i < value.length; i += 1) view.setUint8(offset + i, value.charCodeAt(i));
        }
        view.setUint32(4, audio.byteLength - 8, true); view.setUint32(16, 16, true);
        view.setUint16(20, 1, true); view.setUint16(22, 1, true); view.setUint32(24, 24_000, true);
        view.setUint32(28, 48_000, true); view.setUint16(32, 2, true); view.setUint16(34, 16, true);
        view.setUint32(40, audio.byteLength - 44, true);
        setTimeout(() => this.onmessage?.(new MessageEvent("message", { data: {
          kind: "result", audio, duration: 12, generationSeconds: 0.05, provider: "WebGPU",
        } })), 50);
      }
    } as unknown as typeof Worker;
  });
  await page.goto("/reader");
  await page.locator('input[type="file"]').first().setInputFiles({ name: "Pipeline.txt", mimeType: "text/plain",
    buffer: Buffer.from("This is an English passage about reading books and listening to stories while the next part is prepared.\n\n".repeat(30)) });
  await page.getByRole("button", { name: /^txt Pipeline/ }).click();
  await page.getByRole("button", { name: "Listen", exact: true }).click();
  const state = () => page.evaluate(() => (window as unknown as { ttsPipeline: { generated: number; atPlayback: number } }).ttsPipeline);
  await expect.poll(async () => (await state()).atPlayback).toBe(1);
  await expect.poll(async () => (await state()).generated).toBe(4);
  await page.getByRole("button", { name: "Pause", exact: true }).click();
  await page.waitForTimeout(250);
  expect((await state()).generated).toBe(4);
});

test("mobile defaults English to Kokoro and non-English to Supertonic", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name.startsWith("desktop"));
  await page.goto("/reader");
  await page.locator('input[type="file"]').first().setInputFiles({
    name: "English route.txt",
    mimeType: "text/plain",
    buffer: Buffer.from("This is a long English passage with enough natural language context to identify the text reliably for local narration."),
  });
  await page.getByRole("button", { name: /^txt English route/ }).click();
  await page.getByRole("button", { name: "Voice", exact: true }).click();
  await expect(page.getByRole("combobox", { name: "Language", exact: true })).toHaveValue("en");
  await expect(page.getByLabel("Voice", { exact: false })).toHaveValue("af_heart");
  await page.getByRole("button", { name: "Done", exact: true }).click();
  await page.getByRole("button", { name: "Library", exact: true }).click();

  await page.locator('input[type="file"]').first().setInputFiles({
    name: "Spanish route.txt",
    mimeType: "text/plain",
    buffer: Buffer.from("Hola. Esta es una prueba larga de la voz móvil en español para confirmar que el idioma se detecta correctamente."),
  });
  await page.getByRole("button", { name: /^txt Spanish route/ }).click();
  await page.getByRole("button", { name: "Voice", exact: true }).click();
  await expect(page.getByRole("combobox", { name: "Language", exact: true })).toHaveValue("es");
  await expect(page.getByLabel("Voice", { exact: false })).toHaveValue("M3");
});

// Opt-in integration test downloads the pinned ~102 MB model and executes real WASM.
test("synthesizes non-English text with the correct Supertonic 3 WASM variant", async ({ page }, testInfo) => {
  test.setTimeout(600_000);
  const mobile = !testInfo.project.name.startsWith("desktop");
  const modelRoot = mobile ? "soniqo/Supertonic-3-ONNX-INT8" : "Supertone/supertonic-3";
  test.skip(process.env.RUN_MOBILE_TTS !== "1", "Set RUN_MOBILE_TTS=1 to download and test real voice models.");
  const onnx: string[] = [];
  const runtime: string[] = [];
  const failures: string[] = [];
  page.on("pageerror", (error) => failures.push(error.message));
  page.on("console", (message) => { if (message.type() === "error") console.log(message.text()); });
  page.on("worker", (worker) => {
    worker.on("close", () => console.log("Voice worker closed"));
  });
  page.context().on("request", (request) => {
    if (request.url().includes(".onnx")) onnx.push(request.url());
    if (request.url().includes("ort-wasm")) runtime.push(request.url());
  });
  await page.goto("/reader");
  await page.locator('input[type="file"]').first().setInputFiles({
    name: "Mobile smoke.txt", mimeType: "text/plain", buffer: Buffer.from("Hola."),
  });
  await page.getByRole("button", { name: /^txt Mobile smoke/ }).click();
  await page.waitForTimeout(1_000);
  expect(onnx).toHaveLength(0); // No whole-book background generation on mobile.
  await page.getByRole("button", { name: "Voice", exact: true }).click();
  await page.getByRole("combobox", { name: "Language", exact: true }).selectOption("es");
  await page.getByLabel("Voice", { exact: false }).selectOption("F1");
  await page.getByRole("button", { name: "Low", exact: true }).click();
  await page.getByRole("button", { name: "Done", exact: true }).click();
  await page.getByRole("button", { name: "Listen", exact: true }).click();
  await expect.poll(async () => {
    const state = await page.locator("audio").evaluate((audio: HTMLAudioElement) => ({ duration: audio.duration, src: audio.src, played: !audio.paused || audio.currentTime > 0 }));
    if (state.src && Number.isFinite(state.duration) && state.duration > 0 && state.played) return "ready";
    return await page.locator("main").innerText();
  }, { timeout: 220_000, intervals: [2_000] }).toBe("ready");
  expect(failures).toEqual([]);
  expect(onnx.filter((url) => url.includes(modelRoot))).toHaveLength(4);
  expect(onnx.some((url) => url.includes(mobile ? "Supertone/supertonic-3/" : "soniqo/Supertonic-3-ONNX-INT8"))).toBe(false);
  expect(runtime).toContainEqual(expect.stringContaining("/onnxruntime-web/1.29.0/ort-wasm-simd-threaded.wasm"));
  expect(runtime.every((url) => new URL(url).origin === new URL(page.url()).origin)).toBe(true);
  if (mobile) await expect.poll(() => page.evaluate(async () => (await (await caches.open("freereader-mobile-models-v1")).keys()).length)).toBe(7);
  const audio = await page.locator("audio").evaluate(async (element: HTMLAudioElement) => {
    const bytes = await (await fetch(element.src)).arrayBuffer();
    const view = new DataView(bytes);
    let peak = 0;
    for (let i = 44; i < bytes.byteLength; i += 2) peak = Math.max(peak, Math.abs(view.getInt16(i, true)));
    return { bytes: bytes.byteLength, peak, sampleRate: view.getUint32(24, true) };
  });
  expect(audio.sampleRate).toBe(44_100);
  expect(audio.bytes).toBeGreaterThan(44_100);
  expect(audio.peak).toBeGreaterThan(100);
  for (const voice of ["M2", "F2"]) {
    const previous = await page.locator("audio").getAttribute("src");
    await page.getByRole("button", { name: "Voice", exact: true }).click();
    await page.getByLabel("Voice", { exact: false }).selectOption(voice);
    await page.getByRole("button", { name: "Done", exact: true }).click();
    await page.getByRole("button", { name: "Listen", exact: true }).click();
    await expect.poll(() => page.locator("audio").getAttribute("src"), { timeout: 90_000 }).not.toBe(previous);
  }
  expect(onnx.filter((url) => url.includes(modelRoot))).toHaveLength(4);

  await page.reload();
  const retained = !mobile || await page.evaluate(async () => (await (await caches.open("freereader-mobile-models-v1")).keys()).some((key) => key.url.includes("duration_predictor.onnx")));
  await page.getByRole("button", { name: /^txt Mobile smoke/ }).click();
  await page.getByRole("button", { name: "Voice", exact: true }).click();
  await page.getByRole("combobox", { name: "Language", exact: true }).selectOption("es");
  await page.getByLabel("Voice", { exact: false }).selectOption("M4");
  await page.getByRole("button", { name: "Low", exact: true }).click();
  await page.getByRole("button", { name: "Done", exact: true }).click();
  await page.getByRole("button", { name: "Listen", exact: true }).click();
  await expect.poll(() => page.locator("audio").getAttribute("src"), { timeout: 220_000 }).not.toBeNull();
  expect(onnx.filter((url) => url.includes(modelRoot))).toHaveLength(retained ? 4 : 8);
});

test("synthesizes English with WebGPU Kokoro or Supertonic WASM and reuses retained weights", async ({ page }, testInfo) => {
  test.setTimeout(420_000);
  const mobile = !testInfo.project.name.startsWith("desktop");
  test.skip(process.env.RUN_MOBILE_TTS !== "1", "Set RUN_MOBILE_TTS=1 to download and test real voice models.");
  const models: string[] = [];
  const runtime: string[] = [];
  page.context().on("request", (request) => {
    if (new URL(request.url()).pathname.endsWith(".onnx")) models.push(request.url());
    if (request.url().includes("ort-wasm")) runtime.push(request.url());
  });
  await page.goto("/reader");
  await page.locator('input[type="file"]').first().setInputFiles({
    name: "Kokoro mobile.txt", mimeType: "text/plain", buffer: Buffer.from("Hello from mobile."),
  });
  await page.getByRole("button", { name: /^txt Kokoro mobile/ }).click();
  await page.getByRole("button", { name: "Voice", exact: true }).click();
  await page.getByRole("combobox", { name: "Language", exact: true }).selectOption("en");
  await expect(page.getByLabel("Voice", { exact: false })).toHaveValue("af_heart");
  await page.getByRole("button", { name: "Done", exact: true }).click();
  await page.getByRole("button", { name: "Listen", exact: true }).click();
  await expect.poll(async () => {
    const state = await page.locator("audio").evaluate((audio: HTMLAudioElement) => ({ duration: audio.duration, src: audio.src, played: !audio.paused || audio.currentTime > 0 }));
    return state.src && Number.isFinite(state.duration) && state.duration > 0 && state.played;
  }, { timeout: 360_000, intervals: [2_000] }).toBe(true);
  expect(models.some((url) => url.endsWith(mobile ? "/onnx/model.onnx" : "/onnx/model_quantized.onnx"))).toBe(false);
  if (models.some((url) => url.includes("Kokoro"))) {
    expect(runtime).toContainEqual(expect.stringContaining("ort-wasm-simd-threaded.jsep.wasm"));
  } else {
    expect(models.filter((url) => url.includes(mobile ? "soniqo/Supertonic-3-ONNX-INT8" : "Supertone/supertonic-3"))).toHaveLength(4);
    expect(runtime).toContainEqual(expect.stringContaining("/onnxruntime-web/1.29.0/ort-wasm-simd-threaded.wasm"));
  }
  const downloads = models.length;
  const sampleRate = await page.locator("audio").evaluate(async (audio: HTMLAudioElement) => {
    const bytes = await (await fetch(audio.src)).arrayBuffer();
    const wav = new DataView(bytes);
    const float = wav.getUint16(20, true) === 3;
    let peak = 0;
    for (let i = 44; i < bytes.byteLength; i += float ? 4 : 2) {
      peak = Math.max(peak, Math.abs(float ? wav.getFloat32(i, true) : wav.getInt16(i, true) / 32768));
    }
    if (peak < 0.001) throw new Error("Generated audio is silent");
    return wav.getUint32(24, true);
  });
  expect(sampleRate).toBe(models.some((url) => /supertonic/i.test(url)) ? 44_100 : 24_000);
  console.log(`English audio: ${sampleRate} Hz, ${downloads} model downloads`);

  await page.reload();
  // WebKit's ephemeral automation contexts can evict Cache Storage on navigation.
  // Verify reuse when retained, and successful recovery if the browser evicted it.
  const retained = await page.evaluate(async (name) => (await (await caches.open(name)).keys()).some((key) => key.url.includes(".onnx")),
    mobile ? "freereader-mobile-models-v1" : "kokoro-web-resources-v1");
  await page.getByRole("button", { name: /^txt Kokoro mobile/ }).click();
  await page.getByRole("button", { name: "Voice", exact: true }).click();
  await page.getByLabel("Voice", { exact: false }).selectOption("af_bella");
  await page.getByRole("button", { name: "Done", exact: true }).click();
  await page.getByRole("button", { name: "Listen", exact: true }).click();
  await expect.poll(() => page.locator("audio").getAttribute("src"), { timeout: 360_000 }).not.toBeNull();
  if (retained || !mobile || sampleRate === 44_100) expect(models).toHaveLength(downloads);
  else expect(models).toHaveLength(downloads * 2);
});

for (const gpuDisabled of [true, false]) {
  test(`GPU-first downloads and isolated worker runtime (GPU disabled: ${gpuDisabled})`, async ({ page }, testInfo) => {
    if (gpuDisabled) {
      await page.context().route("**/_next/static/chunks/*.js", async (route) => {
        const response = await route.fetch();
        await route.fulfill({ response, body: `if (typeof WorkerGlobalScope !== "undefined") Object.defineProperty(navigator, "gpu", { value: undefined, configurable: true });\n${await response.text()}` });
      });
    }
    await page.addInitScript(() => {
        const OriginalWorker = window.Worker;
        window.Worker = class extends OriginalWorker {
          constructor(url: string | URL, options?: WorkerOptions) {
            super(url, options);
            this.addEventListener("message", (event) => {
              if (event.data.kind === "ready" || event.data.kind === "error") console.info("TTS worker result", JSON.stringify(event.data));
            });
          }
        };
    });
    page.on("console", (message) => { if (message.text().startsWith("TTS worker result")) console.log(message.text()); });
    const requests: string[] = [];
    const models: string[] = [];
    page.context().on("request", (request) => requests.push(request.url()));
    await page.route("**/onnx/tts.json*", (route) => route.fulfill({ body: JSON.stringify({
      ae: { sample_rate: 44100, base_chunk_size: 512 }, ttl: { chunk_compress_factor: 6, latent_dim: 24 },
    }).padEnd(8_253), contentType: "application/json" }));
    await page.route("**/onnx/unicode_indexer.json*", (route) => route.fulfill({ body: "[]".padEnd(277_676), contentType: "application/json" }));
    await page.route("**/*.onnx*", (route) => { models.push(route.request().url()); return route.abort(); });
    await page.route("**/voices/*.bin", (route) => route.fulfill({ body: Buffer.alloc(522_240) }));
    await page.goto("/reader");
    expect(await page.evaluate(() => crossOriginIsolated)).toBe(true);
    await page.locator('input[type="file"]').first().setInputFiles({ name: "GPU route.txt", mimeType: "text/plain", buffer: Buffer.from("Hello from FreeReader.") });
    await page.getByRole("button", { name: /^txt GPU route/ }).click();
    expect(models).toHaveLength(0);
    await page.getByRole("button", { name: "Listen", exact: true }).click();
    await expect.poll(() => models.length, { timeout: 90_000 }).toBeGreaterThan(0);
    const mobile = !testInfo.project.name.startsWith("desktop");
    if (gpuDisabled || !models[0].includes("Kokoro")) {
      expect(models[0]).toContain(mobile ? "soniqo/Supertonic-3-ONNX-INT8" : "Supertone/supertonic-3");
      expect(requests.some((url) => url.includes("Kokoro"))).toBe(false);
    } else {
      // This branch executes the real tiny ONNX GPU probe, never a mocked ORT.
      expect(models[0]).toContain(mobile ? "model_quantized.onnx" : "/onnx/model.onnx");
      const runtimeIndex = requests.findIndex((url) => url.includes("ort-wasm-simd-threaded.jsep.wasm"));
      expect(runtimeIndex).toBeGreaterThanOrEqual(0);
      expect(runtimeIndex).toBeLessThan(requests.indexOf(models[0]));
      // Aborting Kokoro initialization must transparently begin the correct fallback.
      await expect.poll(() => models.some((url) => url.includes(mobile ? "soniqo/Supertonic-3-ONNX-INT8" : "Supertone/supertonic-3")), { timeout: 30_000 }).toBe(true);
    }
  });
}
