import { test, expect } from "@playwright/test";

// Opt-in integration test downloads the pinned ~102 MB model and executes real WASM.
test("mobile synthesizes Supertonic 3 in its worker without loading desktop weights", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name.startsWith("desktop"));
  test.skip(process.env.RUN_MOBILE_TTS !== "1", "Set RUN_MOBILE_TTS=1 to download and test real voice models.");
  const onnx: string[] = [];
  const failures: string[] = [];
  page.on("pageerror", (error) => failures.push(error.message));
  page.on("console", (message) => { if (message.type() === "error") console.log(message.text()); });
  page.on("worker", (worker) => {
    worker.on("close", () => console.log("Voice worker closed"));
  });
  page.context().on("request", (request) => {
    if (request.url().includes(".onnx")) onnx.push(request.url());
  });
  await page.goto("/reader");
  await page.locator('input[type="file"]').first().setInputFiles({
    name: "Mobile smoke.txt", mimeType: "text/plain", buffer: Buffer.from("Hello. This is a test of the mobile voice."),
  });
  await page.getByRole("button", { name: /^txt Mobile smoke/ }).click();
  await page.waitForTimeout(1_000);
  expect(onnx).toHaveLength(0); // No whole-book background generation on mobile.
  await page.getByRole("button", { name: "Voice", exact: true }).click();
  await page.getByLabel("Voice", { exact: false }).selectOption("F1");
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
