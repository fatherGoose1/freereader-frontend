import { test, expect, type Page } from "@playwright/test";
import { loadEnvConfig } from "@next/env";

loadEnvConfig(process.cwd());

async function openVoicePicker(page: Page) {
  await page.locator('input[type="file"]').first().setInputFiles({ name: "Story.html", mimeType: "text/html",
    buffer: Buffer.from("<html lang='en'><title>Story</title><body><p>Once upon a time, a reader opened a book and chose a voice.</p></body></html>") });
  await expect(page.locator("article")).toBeVisible();
  const tools = page.getByRole("button", { name: "Expand reading tools" });
  if (await tools.isVisible()) await tools.click();
  await page.getByRole("button", { name: "Voice", exact: true }).click();
  const settings = page.getByRole("dialog", { name: "Audio settings" });
  await expect(settings.getByRole("combobox", { name: "Language" })).toBeVisible();
  await expect(settings.getByRole("slider", { name: "Speaking speed" })).toBeVisible();
  await settings.getByRole("button", { name: /Choose voice/ }).click();
  return page.getByRole("dialog", { name: "Voice selection" });
}

test.beforeEach(async ({ page }) => {
  await page.route("**/api/telemetry", (route) => route.fulfill({ status: 202, json: {} }));
  await page.route("**/api/phonon-catalog", (route) => route.fulfill({ json: { voices: [
    { id: "8e7e52e7-77f4-4677-a488-ded347498b1a", name: "Parker (Founder)", locale: "US", gender: "male", feeling: "Personal", description: "Founder", kind: "published" },
    { id: "NbpkqMVS3CJeq2j8", name: "Zoey", locale: "US", gender: "female", feeling: "Playful", description: "Cheerful", kind: "catalog" },
  ] } }));
  await page.goto("/reader/audiobooks");
});

test("free readers see ten selectable (free) voices, feelings, and locked Gold voices", async ({ page }) => {
  const dialog = await openVoicePicker(page);
  await expect(dialog.getByRole("heading", { name: "Choose a voice" })).toBeVisible();
  const free = dialog.getByRole("region", { name: "Free voices" });
  const gold = dialog.getByRole("region", { name: "Gold voices" });
  await expect(free.locator("article")).toHaveCount(10);
  await expect(free).toContainText("Wren (free)");
  await expect(free.locator("article").filter({ hasText: "Wren (free)" })).toHaveAttribute("title", "Wren (free) · Natural");
  await expect(free.locator("article").filter({ hasText: "Wren (free)" })).toHaveClass(/voiceChoiceFemale/);
  await expect(gold.locator("article").filter({ hasText: "Zoey" })).toHaveClass(/voiceChoiceFemale/);
  await expect(gold.locator("article").first().getByRole("button", { name: /Get Gold to use/ })).toBeVisible();
  await expect(gold).toContainText("Zoey");
  await expect(dialog.getByRole("region", { name: "Your custom voices" })).toContainText("Create custom voices for your audio.");
  await expect(dialog.getByRole("searchbox")).toHaveCount(0);
  await expect(dialog.getByRole("combobox")).toHaveCount(0);
  await expect(dialog.getByText("Made by the founder")).toHaveCount(0);
  await expect(dialog.getByText("Distilled English voice")).toHaveCount(0);
  await expect(dialog.getByText("31 languages")).toHaveCount(0);
  if (await page.evaluate(() => innerWidth > 800)) {
    const columns = await free.locator('div[class*="voiceGrid"]').evaluate((element) => getComputedStyle(element).gridTemplateColumns.split(" ").length);
    expect(columns).toBeGreaterThanOrEqual(4);
  }
  const heartSample = page.waitForRequest((request) => request.url().endsWith("/voice-previews/af_heart.m4a"));
  await gold.getByRole("button", { name: "Play Heart sample" }).click();
  await heartSample;
  const zoeySample = page.waitForResponse((response) => response.url().includes("/api/phonon-sample?id=NbpkqMVS3CJeq2j8"));
  await gold.getByRole("button", { name: "Play Zoey sample" }).click();
  expect((await zoeySample).status()).toBe(200);
  const decodes = await page.evaluate(() => new Promise<boolean>((resolve) => {
    const audio = new Audio("/api/phonon-sample?id=NbpkqMVS3CJeq2j8");
    const timeout = setTimeout(() => resolve(false), 5000);
    audio.oncanplay = () => { clearTimeout(timeout); resolve(true); };
    audio.onerror = () => { clearTimeout(timeout); resolve(false); };
    audio.load();
  }));
  expect(decodes).toBe(true);
  await expect(dialog.locator("audio")).toHaveCount(0);
  await gold.getByRole("button", { name: "Get Gold to use Heart" }).click();
  const pricing = page.getByRole("dialog", { name: "Upgrade to FreeReader Gold" });
  await expect(pricing).toBeVisible();
  await expect(pricing).toContainText("$3.25");
  await expect(pricing.getByRole("button", { name: "Start 7-day free trial" })).toBeEnabled();
  await pricing.getByRole("button", { name: "Close" }).click();
  await expect(dialog).toBeVisible();
  await free.locator("article").filter({ hasText: "Wren (free)" }).getByRole("button", { name: "Choose Wren (free)" }).click();
  await expect(dialog).toHaveCount(0);
  const settings = page.getByRole("dialog", { name: "Audio settings" });
  await expect(settings.getByRole("button", { name: /Wren \(free\)/ })).toBeVisible();
  await settings.getByRole("button", { name: /Choose voice/ }).click();
  await expect(page.getByRole("region", { name: "Free voices" }).locator("article").filter({ hasText: "Wren (free)" }).getByRole("button", { name: "Wren (free) selected" }))
    .toHaveAttribute("aria-pressed", "true");
});

test("Gold readers see their custom voice and the Phonon catalogue", async ({ page }) => {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  if (!url) test.skip(true, "Supabase frontend URL is needed for browser auth simulation");
  const user = { id: "33333333-3333-4333-8333-333333333333", email: "gold@example.com", aud: "authenticated", role: "authenticated",
    app_metadata: { provider: "google", providers: ["google"] }, user_metadata: {}, created_at: new Date().toISOString() };
  const session = { access_token: "gold-voice-token", refresh_token: "gold-refresh", token_type: "bearer", expires_in: 3600,
    expires_at: Math.floor(Date.now() / 1000) + 3600, user };
  await page.route("**/auth/v1/user", (route) => route.fulfill({ status: 200, json: user }));
  await page.route("**/api/reader-usage**", (route) => route.fulfill({ status: 200, json: { plan: "gold_yearly" } }));
  await page.route("**/api/v1/freereader/phonon/voices", (route) => route.fulfill({ status: 200, json: {
    can_clone: true, monthly_remaining: 2, stored_remaining: 2,
    voices: [{ id: "4d16a52c-40d6-462e-a015-5665798732af", name: "My memoir voice", status: "active", error: null,
      created_at: new Date().toISOString() }],
  } }));
  const storageKey = `sb-${new URL(url!).hostname.split(".")[0]}-auth-token`;
  await page.evaluate(([key, value]) => localStorage.setItem(key, value), [storageKey, JSON.stringify(session)]);
  await page.reload();
  const dialog = await openVoicePicker(page);
  await expect(dialog.getByRole("region", { name: "Free voices" }).locator("article")).toHaveCount(10);
  const clones = dialog.getByRole("region", { name: "Your custom voices" });
  await expect(clones).toContainText("My memoir voice");
  await expect(clones.locator("article").filter({ hasText: "My memoir voice" })).toHaveAttribute("title", "My memoir voice · Personal");
  const goldVoices = dialog.getByRole("region", { name: "Gold voices" });
  await expect(goldVoices).toContainText("Parker (Founder)");
  await expect(goldVoices).toContainText("Zoey");
  await goldVoices.locator("article").filter({ hasText: "Zoey" })
    .getByRole("button", { name: "Choose Zoey" }).click();
  await expect(dialog).toHaveCount(0);
  await page.getByRole("dialog", { name: "Audio settings" }).getByRole("button", { name: /Choose voice/ }).click();
  await expect(page.getByRole("region", { name: "Gold voices" }).locator("article").filter({ hasText: "Zoey" }).getByRole("button", { name: "Zoey selected" }))
    .toHaveAttribute("aria-pressed", "true");
  const requests: Array<{ voice_id: string }> = [];
  await page.route("**/api/phonon-catalog-tts", (route) => {
    requests.push(route.request().postDataJSON());
    const wav = Buffer.alloc(44 + 24_000 * 2 * 2);
    wav.write("RIFF", 0); wav.writeUInt32LE(wav.length - 8, 4); wav.write("WAVEfmt ", 8);
    wav.writeUInt32LE(16, 16); wav.writeUInt16LE(1, 20); wav.writeUInt16LE(1, 22);
    wav.writeUInt32LE(24_000, 24); wav.writeUInt32LE(48_000, 28); wav.writeUInt16LE(2, 32); wav.writeUInt16LE(16, 34);
    wav.write("data", 36); wav.writeUInt32LE(wav.length - 44, 40);
    return route.fulfill({ contentType: "audio/wav", headers: { "X-Audio-Duration": "2" }, body: wav });
  });
  await page.getByRole("dialog", { name: "Voice selection" }).getByRole("button", { name: "Back to audio settings" }).click();
  await page.getByRole("dialog", { name: "Audio settings" }).getByRole("button", { name: "Done" }).click();
  await page.getByRole("button", { name: "Listen", exact: true }).click();
  await expect.poll(() => requests[0]?.voice_id).toBe("NbpkqMVS3CJeq2j8");
});

test("free readers get the free Supertonic voices for non-English", async ({ page }) => {
  await page.locator('input[type="file"]').first().setInputFiles({ name: "Story.html", mimeType: "text/html",
    buffer: Buffer.from("<html lang='es'><title>Historia</title><body><p>Había una vez un lector que eligió una voz.</p></body></html>") });
  await expect(page.locator("article")).toBeVisible();
  const tools = page.getByRole("button", { name: "Expand reading tools" });
  if (await tools.isVisible()) await tools.click();
  await page.getByRole("button", { name: "Voice", exact: true }).click();
  const settings = page.getByRole("dialog", { name: "Audio settings" });
  await settings.getByRole("combobox", { name: "Language" }).selectOption("es");
  await settings.getByRole("button", { name: /Choose voice/ }).click();
  const dialog = page.getByRole("dialog", { name: "Voice selection" });
  const free = dialog.getByRole("region", { name: "Free voices" });
  await expect(free.locator("article")).toHaveCount(10);
  await expect(free).toContainText("Robert");
  await expect(dialog.getByText("Free voices speak English")).toHaveCount(0);
  await free.locator("article").filter({ hasText: "Sarah" }).getByRole("button", { name: "Choose Sarah" }).click();
  await expect(dialog).toHaveCount(0);
  await expect(settings.getByRole("button", { name: /Choose voice, currently Sarah/ })).toBeVisible();
});
