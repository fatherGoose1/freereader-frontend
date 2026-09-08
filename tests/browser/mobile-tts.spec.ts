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
  for (const voice of ["F1", "M2"]) {
    const previous = await page.locator("audio").getAttribute("src");
    await page.getByRole("button", { name: "Voice", exact: true }).click();
    await page.getByLabel("Voice", { exact: false }).selectOption(voice);
    await page.getByRole("button", { name: "Done", exact: true }).click();
    await page.getByRole("button", { name: "Listen", exact: true }).click();
    await expect.poll(() => page.locator("audio").getAttribute("src"), { timeout: 90_000 }).not.toBe(previous);
  }
  expect(onnx.filter((url) => url.includes("soniqo/Supertonic-3-ONNX-INT8"))).toHaveLength(4);
});

test("desktop keeps original models and background generation", async ({ page }, testInfo) => {
  test.skip(!testInfo.project.name.startsWith("desktop"));
  const requests: string[] = [];
  await page.route("**/*.onnx*", (route) => {
    requests.push(route.request().url());
    return route.abort(); // Check routing without downloading the desktop's 398 MB weights.
  });
  await page.goto("/reader");
  await page.locator('input[type="file"]').first().setInputFiles({ name: "Desktop smoke.txt", mimeType: "text/plain", buffer: Buffer.from("Hello from desktop.") });
  await page.getByRole("button", { name: /^txt Desktop smoke/ }).click();
  await expect.poll(() => requests.length, { timeout: 30_000 }).toBeGreaterThan(0);
  expect(requests.every((url) => url.includes("Supertone/supertonic-3/resolve/3cadd1ee6394adea1bd021217a0e650ede09a323/"))).toBe(true);
});
