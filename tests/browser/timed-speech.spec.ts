import { test, expect, type Page } from "@playwright/test";
import { loadEnvConfig } from "@next/env";
import JSZip from "jszip";

loadEnvConfig(process.cwd());

function wav() {
  const audio = Buffer.alloc(44 + 24_000 * 20 * 2);
  audio.write("RIFF", 0); audio.writeUInt32LE(audio.length - 8, 4); audio.write("WAVEfmt ", 8);
  audio.writeUInt32LE(16, 16); audio.writeUInt16LE(1, 20); audio.writeUInt16LE(1, 22);
  audio.writeUInt32LE(24_000, 24); audio.writeUInt32LE(48_000, 28); audio.writeUInt16LE(2, 32); audio.writeUInt16LE(16, 34);
  audio.write("data", 36); audio.writeUInt32LE(audio.length - 44, 40);
  return audio;
}

async function prepareReader(page: Page, voice: string, plan = "gold_yearly") {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  if (!url) throw new Error("NEXT_PUBLIC_SUPABASE_URL is required for browser auth simulation");
  const user = { id: "33333333-3333-4333-8333-333333333333", email: "timings@example.com", aud: "authenticated", role: "authenticated",
    app_metadata: { provider: "google", providers: ["google"] }, user_metadata: {}, created_at: new Date().toISOString() };
  const session = { access_token: "gold-timing-token", refresh_token: "gold-refresh", token_type: "bearer", expires_in: 3600,
    expires_at: Math.floor(Date.now() / 1000) + 3600, user };
  await page.route("**/auth/v1/user", (route) => route.fulfill({ json: user }));
  await page.route("**/api/telemetry", (route) => route.fulfill({ status: 202, json: {} }));
  await page.route("**/api/reader-usage**", (route) => route.fulfill({ json: { plan } }));
  await page.route("**/api/phonon-catalog", (route) => route.fulfill({ json: { voices: [] } }));
  await page.addInitScript(({ storageKey, session, userId, voice }) => {
    localStorage.setItem(storageKey, JSON.stringify(session));
    localStorage.setItem(`freereader-first-login-gold:${userId}`, "shown");
    localStorage.setItem(`freereader-reader-preferences:v1:${userId}`, JSON.stringify({
      version: 1, updatedAt: new Date().toISOString(), defaultVoices: { en: voice },
      speakingSpeed: 1, defaultView: "ereader",
    }));
  }, { storageKey: `sb-${new URL(url).hostname.split(".")[0]}-auth-token`, session, userId: user.id, voice });
}

async function importPassages(page: Page) {
  await page.goto("/reader/audiobooks");
  await page.locator('input[type="file"]').first().setInputFiles({ name: "Timings.html", mimeType: "text/html",
    buffer: Buffer.from("<html lang='en'><title>Timings</title><body><p>The little boat sailed across the quiet bay.</p>"
      + "<p>Another little boat reached the shore.</p><p>A final little boat headed home.</p></body></html>") });
  await expect(page.locator("article")).toBeVisible();
  const expand = page.getByRole("button", { name: "Expand reading tools" });
  if (await expand.isVisible()) await expand.click();
}

for (const engine of ["paradee", "kokoro", "supertonic", "phonon"] as const) {
  test(`${engine} automatically highlights unsolicited single and batched timing sidecars`, async ({ page }) => {
    const voice = engine === "phonon" ? "catalog:NbpkqMVS3CJeq2j8" : engine === "supertonic" ? "M3" : "af_heart";
    await prepareReader(page, voice, engine === "paradee" ? "free" : "gold_yearly");
    const requests: Array<{ texts: string[]; word_timings?: boolean }> = [];
    await page.route(engine === "phonon" ? "**/api/phonon-catalog-tts" : "**/api/tts", async (route) => {
      const body = route.request().postDataJSON() as { texts: string[]; word_timings?: boolean };
      requests.push(body);
      const archive = new JSZip();
      body.texts.forEach((text, index) => {
        archive.file(`${index}.m4a`, wav());
        archive.file(`${index}.json`, JSON.stringify(text.split(/\s+/u).map((_, word) =>
          [word, word * 1.5, (word + 1) * 1.5])));
      });
      await route.fulfill({ contentType: "application/zip", body: await archive.generateAsync({ type: "nodebuffer" }),
        headers: { "X-Audio-Durations": body.texts.map(() => "20").join(",") } });
    });
    await importPassages(page);
    await page.getByRole("button", { name: "Listen", exact: true }).click();
    await expect.poll(() => page.locator("audio").evaluate((audio: HTMLAudioElement) => !audio.paused)).toBe(true);
    expect(requests[0].texts).toHaveLength(1);
    if (engine !== "kokoro") expect(requests[0].word_timings).toBeUndefined();
    await page.locator("audio").evaluate((audio: HTMLAudioElement) => { audio.currentTime = 2; });
    await expect.poll(() => page.evaluate(() => Array.from(CSS.highlights.get("freereader-spoken-word") ?? [],
      (range) => range.toString())[0] ?? "")).toBe("little");
    await expect.poll(() => requests.some((request) => request.texts.length > 1)).toBe(true);
    await page.locator("audio").evaluate((audio: HTMLAudioElement) => { audio.currentTime = 19.95; });
    await expect(page.locator('article p[aria-current="true"]')).toContainText("Another little boat");
    await page.locator("audio").evaluate((audio: HTMLAudioElement) => { audio.currentTime = 2; });
    await expect.poll(() => page.evaluate(() => Array.from(CSS.highlights.get("freereader-spoken-word") ?? [],
      (range) => range.toString())[0] ?? "")).toBe("little");
  });
}

test("Phonon audio-only fallback remains playable without word highlights", async ({ page }) => {
  await prepareReader(page, "catalog:NbpkqMVS3CJeq2j8");
  await page.route("**/api/phonon-catalog-tts", async (route) => {
    const { texts } = route.request().postDataJSON() as { texts: string[] };
    if (texts.length === 1) return route.fulfill({ contentType: "audio/wav", body: wav(), headers: { "X-Audio-Duration": "20" } });
    const archive = new JSZip();
    texts.forEach((_, index) => archive.file(`${index}.m4a`, wav()));
    return route.fulfill({ contentType: "application/zip", body: await archive.generateAsync({ type: "nodebuffer" }),
      headers: { "X-Audio-Durations": texts.map(() => "20").join(",") } });
  });
  await importPassages(page);
  await page.getByRole("button", { name: "Listen", exact: true }).click();
  await expect.poll(() => page.locator("audio").evaluate((audio: HTMLAudioElement) => !audio.paused)).toBe(true);
  expect(await page.evaluate(() => CSS.highlights.get("freereader-spoken-word")?.size ?? 0)).toBe(0);
});

test("highlighting settings default by language, remember separate choices, and have no Gold branding", async ({ page }) => {
  await prepareReader(page, "af_heart");
  await importPassages(page);
  const openFont = async () => {
    await page.getByRole("button", { name: "Font", exact: true }).click();
    const settings = page.getByRole("dialog", { name: "Font settings" });
    const row = settings.locator("label").filter({ hasText: "Highlight spoken words" });
    const control = row.getByRole("switch");
    await expect(row).not.toContainText(/Gold|👑|crown/i);
    await expect(row.locator("svg, img, [role=img]")).toHaveCount(0);
    return { settings, control };
  };
  const selectLanguage = async (language: string) => {
    await page.getByRole("button", { name: "Voice", exact: true }).click();
    const settings = page.getByRole("dialog", { name: "Audio settings" });
    await settings.getByRole("combobox", { name: "Language" }).selectOption(language);
    await settings.getByRole("button", { name: "Done", exact: true }).click();
  };
  let font = await openFont();
  await expect(font.control).toBeChecked();
  await font.settings.getByRole("button", { name: "Done", exact: true }).click();
  await selectLanguage("fr"); // Gold Kokoro French now returns duration-based word cues.
  font = await openFont();
  await expect(font.control).toBeChecked();
  await font.settings.getByRole("button", { name: "Done", exact: true }).click();
  for (const unsupported of ["ja", "ko"]) { // No word segmentation / Supertonic-only.
    await selectLanguage(unsupported);
    font = await openFont();
    await expect(font.control).not.toBeChecked();
    await font.settings.getByRole("button", { name: "Done", exact: true }).click();
  }
  await selectLanguage("fr");
  font = await openFont();
  await expect(font.control).toBeChecked();
  await font.control.uncheck();
  await font.settings.getByRole("button", { name: "Done", exact: true }).click();
  await selectLanguage("en");
  font = await openFont();
  await expect(font.control).toBeChecked();
  await font.settings.getByRole("button", { name: "Done", exact: true }).click();
  await selectLanguage("fr");
  font = await openFont();
  await expect(font.control).not.toBeChecked();
});

test("free French narration has no word timings, so highlighting stays off by default", async ({ page }) => {
  await prepareReader(page, "af_heart", "free");
  await importPassages(page);
  const openFont = async () => {
    await page.getByRole("button", { name: "Font", exact: true }).click();
    const settings = page.getByRole("dialog", { name: "Font settings" });
    return { settings, control: settings.locator("label").filter({ hasText: "Highlight spoken words" }).getByRole("switch") };
  };
  const selectLanguage = async (language: string) => {
    await page.getByRole("button", { name: "Voice", exact: true }).click();
    const settings = page.getByRole("dialog", { name: "Audio settings" });
    await settings.getByRole("combobox", { name: "Language" }).selectOption(language);
    await settings.getByRole("button", { name: "Done", exact: true }).click();
  };
  let font = await openFont();
  await expect(font.control).toBeChecked(); // English still defaults on.
  await font.settings.getByRole("button", { name: "Done", exact: true }).click();
  await selectLanguage("fr");
  font = await openFont();
  await expect(font.control).not.toBeChecked(); // Free non-English uses Supertonic.
});
