import { test, expect, type Page } from "@playwright/test";
import JSZip from "jszip";

const SAMPLE_RATE = 24_000;

function wavBuffer(seconds: number): Buffer {
  const samples = Math.floor(SAMPLE_RATE * seconds);
  const buffer = Buffer.alloc(44 + samples * 2);
  buffer.write("RIFF", 0);
  buffer.writeUInt32LE(36 + samples * 2, 4);
  buffer.write("WAVE", 8);
  buffer.write("fmt ", 12);
  buffer.writeUInt32LE(16, 16);
  buffer.writeUInt16LE(1, 20);
  buffer.writeUInt16LE(1, 22);
  buffer.writeUInt32LE(SAMPLE_RATE, 24);
  buffer.writeUInt32LE(SAMPLE_RATE * 2, 28);
  buffer.writeUInt16LE(2, 32);
  buffer.writeUInt16LE(16, 34);
  buffer.write("data", 36);
  buffer.writeUInt32LE(samples * 2, 40);
  for (let index = 0; index < samples; index += 1) {
    buffer.writeInt16LE(Math.round(Math.sin((index / SAMPLE_RATE) * 2 * Math.PI * 220) * 8_000), 44 + index * 2);
  }
  return buffer;
}

async function mockSpeech(page: Page, options: { delayMs?: number; seconds?: number; onRequest?: (body: { text?: string; texts?: string[]; speed: number }) => void } = {}) {
  const seconds = options.seconds ?? 12;
  await page.route("**/api/tts", async (route) => {
    const body = route.request().postDataJSON() as { text?: string; texts?: string[]; speed: number };
    const texts = body.texts ?? (body.text ? [body.text] : []);
    options.onRequest?.(body);
    if (options.delayMs) await new Promise((resolve) => setTimeout(resolve, options.delayMs));
    const headers = {
      "X-Generation-Seconds": "0.05",
      "X-TTS-Model": "kokoro-7m-distill-fp32",
    };
    if (texts.length > 1) {
      const zip = new JSZip();
      texts.forEach((_, index) => zip.file(`${index}.wav`, wavBuffer(seconds)));
      const archive = await zip.generateAsync({ type: "nodebuffer" });
      await route.fulfill({ status: 200, headers: {
        ...headers,
        "Content-Type": "application/zip",
        "X-Audio-Durations": texts.map(() => seconds.toFixed(6)).join(","),
      }, body: archive });
      return;
    }
    await route.fulfill({ status: 200, headers: {
      ...headers, "Content-Type": "audio/wav", "X-Audio-Duration": String(seconds),
    }, body: wavBuffer(seconds) });
  });
}

async function importText(page: Page, name: string, text: string) {
  await page.locator('input[type="file"]').first().setInputFiles({ name, mimeType: "text/plain", buffer: Buffer.from(text) });
  await page.getByRole("button", { name: new RegExp(`^txt ${name.replace(/\.txt$/, "")}`) }).click();
}

const ENGLISH = "This is a long English passage about reading books and listening to stories while the next part is prepared. ";
const SPANISH = "Hola. Esta es una prueba larga de narración en español para confirmar que el idioma se detecta correctamente y que el audio no está disponible.";

test("plays the first chunk before look-ahead and reports backend generation timing", async ({ page }) => {
  const events: Array<{ event_name: string; properties: Record<string, unknown> }> = [];
  await page.route("**/api/telemetry", (route) => {
    events.push(...route.request().postDataJSON().events);
    return route.fulfill({ status: 202, json: {} });
  });
  const requests: Array<{ text?: string; texts?: string[]; speed: number }> = [];
  await mockSpeech(page, { delayMs: 150, onRequest: (body) => requests.push(body) });
  await page.goto("/reader");
  await importText(page, "Pipeline.txt", ENGLISH.repeat(30));
  await page.getByRole("button", { name: "Listen", exact: true }).click();
  await expect.poll(() => page.locator("audio").evaluate((audio: HTMLAudioElement) => audio.currentTime > 0 || !audio.paused), { timeout: 60_000 }).toBe(true);
  await expect.poll(() => requests.length, { timeout: 60_000 }).toBeGreaterThanOrEqual(1);
  // The cold start asks for one passage so audio begins sooner...
  expect(requests[0].texts?.length ?? 1).toBe(1);
  // ...then look-ahead batches the following passages into one round trip.
  await expect.poll(() => requests.some((request) => (request.texts?.length ?? 1) > 1), { timeout: 60_000 }).toBe(true);
  await page.getByRole("button", { name: "Pause", exact: true }).click();
  await expect.poll(() => events.filter((event) => event.event_name === "first_playable_audio").length).toBe(1);
  const reported = events.find((event) => event.event_name === "first_playable_audio")!.properties;
  expect(reported.audio_source).toBe("generated");
  expect(reported.engine).toBe("server");
});

test("English narration uses the backend and never downloads an on-device model", async ({ page }, testInfo) => {
  const mobile = !testInfo.project.name.startsWith("desktop");
  const onnx: string[] = [];
  let speechRequests = 0;
  page.context().on("request", (request) => { if (request.url().endsWith(".onnx")) onnx.push(request.url()); });
  await mockSpeech(page, { onRequest: () => { speechRequests += 1; } });
  await page.goto("/reader");
  await importText(page, "English route.txt", ENGLISH.repeat(4));
  await page.getByRole("button", { name: "Voice", exact: true }).click();
  await expect(page.getByRole("combobox", { name: "Language", exact: true })).toHaveValue("en");
  await expect(page.getByLabel("Voice", { exact: false })).toHaveValue("af_heart");
  await page.getByRole("button", { name: "Done", exact: true }).click();
  await page.getByRole("button", { name: "Listen", exact: true }).click();
  await expect.poll(() => page.locator("audio").evaluate((audio: HTMLAudioElement) => Number.isFinite(audio.duration) && audio.duration > 0 && (!audio.paused || audio.currentTime > 0)), { timeout: 60_000 }).toBe(true);
  expect(speechRequests).toBeGreaterThanOrEqual(1);
  expect(onnx).toHaveLength(0);
  await expect(page.getByText("FreeReader only works on desktop")).toHaveCount(0);
  if (mobile) await expect(page.getByText("English only on mobile")).toHaveCount(0);
});

test("mobile blocks non-English narration with a warning instead of generating audio", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name.startsWith("desktop"));
  let speechRequests = 0;
  const onnx: string[] = [];
  page.context().on("request", (request) => { if (request.url().endsWith(".onnx")) onnx.push(request.url()); });
  await mockSpeech(page, { onRequest: () => { speechRequests += 1; } });
  await page.goto("/reader");
  await importText(page, "Spanish route.txt", SPANISH);
  await expect(page.getByRole("alert").filter({ hasText: "English only on mobile" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Listen", exact: true })).toBeDisabled();
  await page.getByRole("button", { name: "Library", exact: true }).click();
  await page.getByRole("button", { name: /^txt Spanish route/ }).click();
  await expect(page.getByRole("button", { name: "Listen", exact: true })).toBeDisabled();
  expect(speechRequests).toBe(0);
  expect(onnx).toHaveLength(0);
});

test("mobile preserves default English and non-English voice selections", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name.startsWith("desktop"));
  await page.goto("/reader");
  await importText(page, "English route.txt", ENGLISH);
  await page.getByRole("button", { name: "Voice", exact: true }).click();
  await expect(page.getByRole("combobox", { name: "Language", exact: true })).toHaveValue("en");
  await expect(page.getByLabel("Voice", { exact: false })).toHaveValue("af_heart");
  await page.getByRole("button", { name: "Done", exact: true }).click();
  await page.getByRole("button", { name: "Library", exact: true }).click();

  await importText(page, "Spanish route.txt", SPANISH);
  await page.getByRole("button", { name: "Voice", exact: true }).click();
  await expect(page.getByRole("combobox", { name: "Language", exact: true })).toHaveValue("es");
  await expect(page.getByLabel("Voice", { exact: false })).toHaveValue("M3");
});

// Opt-in integration test downloads the desktop Supertonic model and executes real WASM.
test("desktop synthesizes non-English text with Supertonic 3 WASM", async ({ page }, testInfo) => {
  test.setTimeout(600_000);
  test.skip(!testInfo.project.name.startsWith("desktop"), "Desktop only; mobile blocks non-English.");
  test.skip(process.env.RUN_MOBILE_TTS !== "1", "Set RUN_MOBILE_TTS=1 to download and test real voice models.");
  const onnx: string[] = [];
  const runtime: string[] = [];
  page.context().on("request", (request) => {
    if (request.url().includes(".onnx")) onnx.push(request.url());
    if (request.url().includes("ort-wasm")) runtime.push(request.url());
  });
  await page.goto("/reader");
  await importText(page, "Desktop smoke.txt", SPANISH);
  await page.getByRole("button", { name: "Voice", exact: true }).click();
  await page.getByRole("combobox", { name: "Language", exact: true }).selectOption("es");
  await page.getByRole("button", { name: "Done", exact: true }).click();
  await page.getByRole("button", { name: "Listen", exact: true }).click();
  await expect.poll(() => page.locator("audio").evaluate((audio: HTMLAudioElement) => Number.isFinite(audio.duration) && audio.duration > 0 && (!audio.paused || audio.currentTime > 0)), { timeout: 300_000, intervals: [2_000] }).toBe(true);
  expect(onnx.filter((url) => url.includes("Supertone/supertonic-3"))).toHaveLength(4);
  expect(runtime).toContainEqual(expect.stringContaining("/onnxruntime-web/1.29.0/ort-wasm-simd-threaded.wasm"));
});