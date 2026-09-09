import { test, expect } from "@playwright/test";

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
test("mobile synthesizes non-English text with Supertonic 3 without loading desktop weights", async ({ page }, testInfo) => {
  test.setTimeout(600_000);
  test.skip(testInfo.project.name.startsWith("desktop"));
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
    const state = await page.locator("audio").evaluate((audio: HTMLAudioElement) => ({ duration: audio.duration, src: audio.src, paused: audio.paused }));
    if (state.src && Number.isFinite(state.duration) && state.duration > 0 && !state.paused) return "ready";
    return await page.locator("main").innerText();
  }, { timeout: 220_000, intervals: [2_000] }).toBe("ready");
  expect(failures).toEqual([]);
  expect(onnx.filter((url) => url.includes("soniqo/Supertonic-3-ONNX-INT8"))).toHaveLength(4);
  expect(onnx.some((url) => url.includes("Supertone/supertonic-3/"))).toBe(false);
  expect(runtime).toEqual([expect.stringContaining("/onnxruntime-web/1.29.0/ort-wasm-simd-threaded.wasm")]);
  expect(runtime.every((url) => new URL(url).origin === new URL(page.url()).origin)).toBe(true);
  await expect.poll(() => page.evaluate(async () => (await (await caches.open("freereader-mobile-models-v1")).keys()).length)).toBe(7);
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
  expect(onnx.filter((url) => url.includes("soniqo/Supertonic-3-ONNX-INT8"))).toHaveLength(4);

  await page.reload();
  await page.getByRole("button", { name: /^txt Mobile smoke/ }).click();
  await page.getByRole("button", { name: "Voice", exact: true }).click();
  await page.getByRole("combobox", { name: "Language", exact: true }).selectOption("es");
  await page.getByLabel("Voice", { exact: false }).selectOption("M4");
  await page.getByRole("button", { name: "Low", exact: true }).click();
  await page.getByRole("button", { name: "Done", exact: true }).click();
  await page.getByRole("button", { name: "Listen", exact: true }).click();
  await expect.poll(() => page.locator("audio").getAttribute("src"), { timeout: 220_000 }).not.toBeNull();
  expect(onnx.filter((url) => url.includes("soniqo/Supertonic-3-ONNX-INT8"))).toHaveLength(4);
});

test("mobile synthesizes English with the cached quantized Kokoro model", async ({ page }, testInfo) => {
  test.setTimeout(420_000);
  test.skip(testInfo.project.name.startsWith("desktop"));
  test.skip(process.env.RUN_MOBILE_TTS !== "1", "Set RUN_MOBILE_TTS=1 to download and test real voice models.");
  const models: string[] = [];
  const runtime: string[] = [];
  page.context().on("request", (request) => {
    if (request.url().includes("/onnx/model")) models.push(request.url());
    if (request.url().includes("ort-wasm")) runtime.push(request.url());
  });
  await page.goto("/reader");
  await page.locator('input[type="file"]').first().setInputFiles({
    name: "Kokoro mobile.txt", mimeType: "text/plain", buffer: Buffer.from("Hello from mobile."),
  });
  await page.getByRole("button", { name: /^txt Kokoro mobile/ }).click();
  await page.getByRole("button", { name: "Listen", exact: true }).click();
  await expect.poll(async () => {
    const state = await page.locator("audio").evaluate((audio: HTMLAudioElement) => ({ duration: audio.duration, src: audio.src, paused: audio.paused }));
    return state.src && Number.isFinite(state.duration) && state.duration > 0 && !state.paused;
  }, { timeout: 360_000, intervals: [2_000] }).toBe(true);
  expect(models.filter((url) => url.includes("model_quantized.onnx"))).toHaveLength(1);
  expect(models.some((url) => url.endsWith("/onnx/model.onnx"))).toBe(false);
  expect(runtime).toEqual([expect.stringContaining("/onnxruntime-web/1.29.0/ort-wasm-simd-threaded.wasm")]);
  await expect.poll(() => page.evaluate(async () => (await (await caches.open("freereader-mobile-models-v1")).keys()).length)).toBe(2);

  await page.reload();
  await page.getByRole("button", { name: /^txt Kokoro mobile/ }).click();
  await page.getByRole("button", { name: "Voice", exact: true }).click();
  await page.getByLabel("Voice", { exact: false }).selectOption("af_bella");
  await page.getByRole("button", { name: "Done", exact: true }).click();
  await page.getByRole("button", { name: "Listen", exact: true }).click();
  await expect.poll(() => page.locator("audio").getAttribute("src"), { timeout: 360_000 }).not.toBeNull();
  expect(models.filter((url) => url.includes("model_quantized.onnx"))).toHaveLength(1);
});

test("desktop reuses Kokoro Web voice assets after a full reload", async ({ page }, testInfo) => {
  test.skip(!testInfo.project.name.startsWith("desktop"));
  const voiceUrl = "https://huggingface.co/onnx-community/Kokoro-82M-v1.0-ONNX/resolve/1939ad2a8e416c0acfeecc08a694d14ef25f2231/voices/af_heart.bin";
  let modelRequests = 0;
  let voiceRequests = 0;
  await page.route("**/*.onnx*", (route) => {
    modelRequests += 1;
    return route.abort();
  });
  await page.route("**/voices/af_heart.bin", (route) => {
    voiceRequests += 1;
    return route.fulfill({ body: Buffer.alloc(522_240), contentType: "application/octet-stream" });
  });
  await page.goto("/reader");
  await page.evaluate(() => caches.delete("kokoro-web-resources-v1"));
  await page.locator('input[type="file"]').first().setInputFiles({ name: "Cache smoke.txt", mimeType: "text/plain", buffer: Buffer.from("Hello from Kokoro Web.") });
  await page.getByRole("button", { name: /^txt Cache smoke/ }).click();
  await expect.poll(() => voiceRequests, { timeout: 30_000 }).toBe(1);
  await expect.poll(() => modelRequests, { timeout: 30_000 }).toBeGreaterThan(0);
  await expect.poll(() => page.evaluate(async (url) => !!(await (await caches.open("kokoro-web-resources-v1")).match(url)), voiceUrl)).toBe(true);

  const firstModelRequests = modelRequests;
  await page.reload();
  await page.getByRole("button", { name: /^txt Cache smoke/ }).click();
  await expect.poll(() => modelRequests, { timeout: 30_000 }).toBeGreaterThan(firstModelRequests);
  await page.waitForTimeout(500);
  expect(voiceRequests).toBe(1);
});
