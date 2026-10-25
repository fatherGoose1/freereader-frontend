import { test, expect, type Page } from "@playwright/test";
import { loadEnvConfig } from "@next/env";
import JSZip from "jszip";
import { spokenWords } from "../../app/reader/spokenWord";

loadEnvConfig(process.cwd());

const paragraph = "Reading gives us a little time to pause and discover a different perspective. A good book can turn an ordinary afternoon into something memorable. ";

function playableWav(seconds = 20): Buffer {
  const audio = Buffer.alloc(44 + 24_000 * seconds * 2);
  audio.write("RIFF", 0); audio.writeUInt32LE(audio.length - 8, 4); audio.write("WAVEfmt ", 8);
  audio.writeUInt32LE(16, 16); audio.writeUInt16LE(1, 20); audio.writeUInt16LE(1, 22);
  audio.writeUInt32LE(24_000, 24); audio.writeUInt32LE(48_000, 28); audio.writeUInt16LE(2, 32); audio.writeUInt16LE(16, 34);
  audio.write("data", 36); audio.writeUInt32LE(audio.length - 44, 40);
  return audio;
}

async function upload(page: Page, title: string, chapters = 1) {
  await page.locator('input[type="file"]').setInputFiles({
    name: `${title}.html`, mimeType: "text/html",
    buffer: Buffer.from(`<html lang="en"><title>${title}</title><body>${Array.from({ length: chapters }, (_, i) => `<h1>Chapter ${i + 1}</h1><p>${paragraph.repeat(7)}</p>`).join("")}</body></html>`),
  });
  // Adding a document opens it immediately; return to the library for these checks.
  await expect(page.locator("article")).toBeVisible();
  await page.getByRole("button", { name: "Library", exact: true }).click();
  await expect(page.getByRole("button", { name: new RegExp(`^html ${title}`) })).toBeVisible();
}

async function openControls(page: Page) {
  const tools = page.getByRole("button", { name: "Expand reading tools" });
  if (await tools.isVisible()) await tools.click();
  const player = page.getByRole("button", { name: "Expand player controls" });
  if (await player.isVisible()) await player.click();
}

test.beforeEach(async ({ page }) => {
  await page.route("**/api/telemetry", (route) => route.fulfill({ status: 202, json: {} }));
  await page.route("**/api/v1/freereader/billing/price?plan=gold_*", (route) => {
    const yearly = new URL(route.request().url()).searchParams.get("plan") === "gold_yearly";
    return route.fulfill({ status: 200, json: {
      amount_cents: yearly ? 3900 : 500, currency: "usd", interval: yearly ? "year" : "month",
    } });
  });
  await page.goto("/reader/audiobooks");
});

test("Gold plans show the configured Stripe amounts before checkout", async ({ page }) => {
  await page.getByRole("region", { name: "Upgrade to FreeReader Gold" }).getByRole("button", { name: "See Gold plans" }).click();
  const dialog = page.getByRole("dialog", { name: "Upgrade to FreeReader Gold" });
  await expect(dialog).toContainText("$3.25");
  await expect(dialog).toContainText("billed $39 yearly");
  await expect(dialog).toContainText("7 days free");
  await expect(dialog.locator("li").first()).toHaveText("Unlimited audio");
  await expect(dialog.locator("li small")).toHaveCount(0);
  await expect(dialog.getByRole("button", { name: "Start 7-day free trial" })).toBeEnabled();
  await dialog.getByRole("button", { name: "Monthly" }).click();
  await expect(dialog).toContainText("$5/month, billed monthly");
  await expect(dialog).not.toContainText("7 days free");
  await expect(dialog).toContainText("Voice cloning");
  await dialog.getByRole("button", { name: "Close" }).click();
  const banner = page.getByRole("region", { name: "Upgrade to FreeReader Gold" });
  await expect(banner).toContainText("Voice cloning");
  await expect(banner.locator("li").first()).toHaveText("✦Unlimited audio");
  await expect(banner.locator("li small")).toHaveCount(0);
});

test("a guest can find voice cloning from Voice Settings and see the Gold gate", async ({ page }) => {
  await upload(page, "Clone entry");
  await page.getByRole("button", { name: /^html Clone entry/ }).click();
  await openControls(page);
  await page.getByRole("button", { name: "Voice", exact: true }).click();
  const settings = page.getByRole("dialog", { name: "Voice settings" });
  await expect(settings.getByLabel("Voice").locator("option").first()).toHaveText("Parker (Founder)");
  await settings.getByRole("button", { name: /Clone a voice/ }).click();
  const dialog = page.getByRole("dialog", { name: "Clone a voice" });
  await expect(dialog).toContainText("Sign in to save your voices");
  await expect(dialog).toContainText("shared with the iPhone app");
  await dialog.getByRole("button", { name: "Done" }).click();
  await settings.getByLabel("Voice").selectOption("phonon:8e7e52e7-77f4-4677-a488-ded347498b1a");
  await settings.getByRole("button", { name: "Done" }).click();
  const publicRequests: Array<{ texts: string[]; speed: number }> = [];
  await page.route("**/api/public-phonon-tts", (route) => {
    publicRequests.push(route.request().postDataJSON());
    return route.fulfill({ contentType: "audio/wav", headers: { "X-Audio-Duration": "20" }, body: playableWav() });
  });
  await page.getByRole("button", { name: "Listen", exact: true }).click();
  await expect(page.getByRole("dialog", { name: "Sign in to generate audio" })).toBeVisible();
  expect(publicRequests).toHaveLength(0);
  await page.getByRole("dialog", { name: "Sign in to generate audio" }).getByRole("button", { name: "Close" }).click();
  await expect(page.locator("article")).toBeVisible();
});

test("a signed-in free account can delete stored voices but must upgrade to clone", async ({ page }) => {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  if (!url) test.skip(true, "Supabase frontend URL is needed for browser auth simulation");
  const user = { id: "44444444-4444-4444-8444-444444444444", email: "free@example.com", aud: "authenticated", role: "authenticated",
    app_metadata: { provider: "google", providers: ["google"] }, user_metadata: {}, created_at: new Date().toISOString() };
  const session = { access_token: "free-phonon-token", refresh_token: "free-phonon-refresh", token_type: "bearer", expires_in: 3600,
    expires_at: Math.floor(Date.now() / 1000) + 3600, user };
  await page.route("**/auth/v1/user", (route) => route.fulfill({ status: 200, json: user }));
  await page.route("**/api/v1/freereader/usage**", (route) => route.fulfill({ status: 200,
    json: { plan: "free", daily_used_seconds: 1_560, daily_budget_seconds: 3_600, daily_remaining_seconds: 2_040 } }));
  let deleted = false;
  await page.route("**/api/v1/freereader/phonon/voices**", (route) => {
    expect(route.request().headers().authorization).toBe("Bearer free-phonon-token");
    if (route.request().method() === "DELETE") { deleted = true; return route.fulfill({ json: { deleted: true } }); }
    return route.fulfill({ json: { can_clone: false, monthly_remaining: 1, stored_remaining: deleted ? 3 : 2,
      voices: deleted ? [] : [{ id: "4d16a52c-40d6-462e-a015-5665798732af", name: "Old voice", status: "active", error: null, created_at: new Date().toISOString() }] } });
  });
  const storageKey = `sb-${new URL(url!).hostname.split(".")[0]}-auth-token`;
  await page.evaluate(([key, value]) => localStorage.setItem(key, value), [storageKey, JSON.stringify(session)]);
  await page.reload();
  await expect(page.getByRole("button", { name: "Account settings" })).toBeVisible();
  const firstLoginOffer = page.getByRole("dialog", { name: "Upgrade to FreeReader Gold" });
  await expect(firstLoginOffer).toBeVisible();
  await firstLoginOffer.getByRole("button", { name: "Close" }).click();
  await page.getByRole("button", { name: "Account settings" }).click();
  await expect(page.getByText("Today: 26 min of 1 hr of audio used")).toBeVisible();
  await page.getByRole("button", { name: "Account settings" }).click();
  await upload(page, "Free clone gate");
  await page.getByRole("button", { name: /^html Free clone gate/ }).click();
  await openControls(page);
  await page.getByRole("button", { name: "Voice", exact: true }).click();
  await page.getByRole("dialog", { name: "Voice settings" }).getByRole("button", { name: /Clone a voice/ }).click();
  const dialog = page.getByRole("dialog", { name: "Clone a voice" });
  await expect(dialog).toContainText("Old voice");
  await expect(dialog.getByRole("button", { name: "Use for books" })).toHaveCount(0);
  page.once("dialog", (confirmation) => confirmation.accept());
  await dialog.getByRole("button", { name: "Delete" }).click();
  await expect.poll(() => deleted).toBe(true);
  await expect(dialog).toContainText("Your first voice will appear here");
  await dialog.getByRole("button", { name: "Explore Gold" }).click();
  await expect(page.getByRole("dialog", { name: "Upgrade to FreeReader Gold" })).toContainText("Voice cloning");
});

test("a Gold account shares cloned voices, quota, creation and narration with iOS", async ({ page }, testInfo) => {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  if (!url) test.skip(true, "Supabase frontend URL is needed for browser auth simulation");
  const owner = "33333333-3333-4333-8333-333333333333";
  const voiceId = "4d16a52c-40d6-462e-a015-5665798732af";
  const newVoiceId = "6a1bcbfd-25d9-4c4a-81a6-9fc715e2db78";
  const user = { id: owner, email: "gold@example.com", aud: "authenticated", role: "authenticated",
    app_metadata: { provider: "google", providers: ["google"] }, user_metadata: {}, created_at: new Date().toISOString() };
  const session = { access_token: "phonon-test-token", refresh_token: "phonon-refresh", token_type: "bearer", expires_in: 3600,
    expires_at: Math.floor(Date.now() / 1000) + 3600, user };
  await page.route("**/auth/v1/user", (route) => route.fulfill({ status: 200, json: user }));
  await page.route("**/api/v1/freereader/usage**", (route) => route.fulfill({ status: 200, json: { plan: "gold_yearly" } }));
  await page.route("**/api/v1/freereader/sync/**", (route) => route.fulfill({ status: 403, json: { error: "sync_unavailable" } }));
  let pending = false;
  let active = false;
  const voice = (id: string, name: string, status: string) => ({ id, name, status, error: null, created_at: new Date().toISOString() });
  const catalog = () => ({ voices: [voice(voiceId, "iPhone voice", "active"),
    ...(pending ? [voice(newVoiceId, "Web voice", active ? "active" : "pending")] : [])],
    monthly_remaining: pending ? 1 : 2, stored_remaining: pending ? 1 : 2, can_clone: true });
  const uploads: Buffer[] = [];
  const speeches: Array<{ voice_id: string; texts: string[]; speed: number }> = [];
  let releaseClone: (() => void) | undefined;
  await page.route("**/api/v1/freereader/phonon/**", async (route) => {
    expect(route.request().headers().authorization).toBe("Bearer phonon-test-token");
    const path = new URL(route.request().url()).pathname;
    if (path.endsWith("/voices") && route.request().method() === "POST") {
      uploads.push(route.request().postDataBuffer()!);
      pending = true;
      await new Promise<void>((resolve) => { releaseClone = resolve; });
      return route.fulfill({ status: 202, json: voice(newVoiceId, "Web voice", "pending") });
    }
    if (path.endsWith(`/voices/${newVoiceId}`)) {
      active = true;
      return route.fulfill({ status: 200, json: voice(newVoiceId, "Web voice", "active") });
    }
    if (path.endsWith("/voices")) return route.fulfill({ status: 200, json: catalog() });
    if (path.endsWith("/speech")) {
      const request = route.request().postDataJSON() as { voice_id: string; texts: string[]; speed: number };
      speeches.push(request);
      if (request.texts.length > 1) {
        const archive = new JSZip();
        request.texts.forEach((_, index) => archive.file(`${index}.m4a`, playableWav()));
        return route.fulfill({ contentType: "application/zip", headers: { "X-Audio-Durations": request.texts.map(() => "20").join(",") },
          body: await archive.generateAsync({ type: "nodebuffer" }) });
      }
      return route.fulfill({ contentType: "audio/wav", headers: { "X-Audio-Duration": "20" }, body: playableWav() });
    }
    return route.fulfill({ status: 404, json: { error: "voice_not_found" } });
  });
  const storageKey = `sb-${new URL(url!).hostname.split(".")[0]}-auth-token`;
  await page.addInitScript(() => {
    const originalFetch = window.fetch.bind(window);
    window.fetch = (input, init) => {
      if (String(input).endsWith("/phonon/voices") && init?.method === "POST" && init.body instanceof FormData) {
        const clip = init.body.get("audio");
        (window as Window & { phononUpload?: Promise<{ name: FormDataEntryValue | null; length: number; rate: number; bytes: number }> }).phononUpload =
          (clip as Blob).arrayBuffer().then((buffer) => ({ name: (init.body as FormData).get("name"),
            length: buffer.byteLength, rate: new DataView(buffer).getUint32(24, true), bytes: new DataView(buffer).getUint32(40, true) }));
      }
      return originalFetch(input, init);
    };
  });
  await page.evaluate(([key, value]) => localStorage.setItem(key, value), [storageKey, JSON.stringify(session)]);
  await page.reload();
  await upload(page, "Phonon reading", 3);
  await page.getByRole("button", { name: /^html Phonon reading/ }).click();
  await openControls(page);
  await page.getByRole("button", { name: "Voice", exact: true }).click();
  const settings = page.getByRole("dialog", { name: "Voice settings" });
  await expect(settings.getByLabel("Voice")).toContainText("iPhone voice (My voices)");
  await expect(settings.getByLabel("Voice").locator("option").first()).toHaveText("Parker (Founder)");
  await settings.getByRole("button", { name: /Clone a voice/ }).click();
  const dialog = page.getByRole("dialog", { name: "Clone a voice" });
  await expect(dialog).toContainText("2 of 3 clones left this month");
  await expect(dialog).toContainText("iPhone voice");
  await expect(dialog.getByRole("button", { name: "Preview", exact: true })).toHaveCount(0);
  await dialog.locator('input[type="file"]').setInputFiles({ name: "sample.wav", mimeType: "audio/wav", buffer: playableWav(75) });
  await expect(dialog.getByLabel("Voice name")).toBeVisible();
  await expect(dialog.getByText("Voice name *")).toBeVisible();
  await expect(dialog.getByRole("button", { name: "Please name your voice" })).toBeDisabled();
  const waveform = dialog.getByRole("group", { name: "Ten-second voice sample window" });
  const selectionWindow = waveform.locator('[class*="phononWaveformWindow"]');
  await expect(waveform).toBeVisible();
  const frameWidth = (await waveform.boundingBox())!.width;
  expect((await selectionWindow.boundingBox())!.width / frameWidth).toBeCloseTo(1 / 6, 1);
  const timeline = dialog.getByRole("slider", { name: /Explore the recording/ });
  await timeline.focus();
  await timeline.press("End");
  await expect(dialog.locator('label[for="phonon-start"]')).toContainText("Your clip: 15.0s – 25.0s");
  if (testInfo.project.name === "desktop-chromium") {
    const bounds = (await selectionWindow.boundingBox())!;
    await page.mouse.move(bounds.x + bounds.width / 2, bounds.y + bounds.height / 2);
    await page.mouse.down();
    await page.mouse.move(bounds.x + bounds.width / 2 + frameWidth * .2, bounds.y + bounds.height / 2, { steps: 5 });
    await page.mouse.up();
  } else {
    const bounds = (await waveform.boundingBox())!;
    await page.touchscreen.tap(bounds.x + bounds.width * .75, bounds.y + bounds.height / 2);
  }
  await expect.poll(async () => Number((await dialog.locator('label[for="phonon-start"]').textContent())?.match(/Your clip: ([\d.]+)s/)?.[1])).toBeGreaterThan(20);
  await dialog.getByLabel("Voice name").fill("Web voice");
  await dialog.getByRole("button", { name: "Clone this voice" }).click();
  await expect.poll(() => uploads.length).toBe(1);
  await expect(dialog.getByRole("button", { name: "Creating your voice…" })).toBeDisabled();
  await expect(dialog.locator('[class*="addSpinner"]')).toBeVisible();
  expect(await page.evaluate(() => (window as Window & { phononUpload?: Promise<unknown> }).phononUpload)).toEqual({
    name: "Web voice", length: 480044, rate: 24_000, bytes: 480_000,
  });
  releaseClone?.();
  await expect(dialog).toContainText("1 of 3 clones left this month");
  await expect(dialog).toContainText("Web voice");
  await expect.poll(() => active).toBe(true);
  await dialog.getByRole("button", { name: "Use for books" }).first().click();
  await expect(settings.getByLabel("Voice")).toHaveValue(`phonon:${voiceId}`);
  await settings.getByRole("button", { name: "Done" }).click();
  await page.getByRole("button", { name: "Listen", exact: true }).click();
  await expect.poll(() => speeches.length).toBeGreaterThan(0);
  expect(speeches[0].voice_id).toBe(voiceId);
  expect(speeches[0].speed).toBe(1);
  await expect.poll(() => speeches.some((request) => request.texts.length > 1)).toBe(true);
});

test("guests see the Gold upgrade notice and yearly free-trial pricing", async ({ page }) => {
  const notice = page.getByRole("region", { name: "Upgrade to FreeReader Gold" });
  const floatingUpgrade = page.locator('button[class*="upgradeFab"]');
  await expect(page.getByRole("button", { name: "Get FreeReader Gold" })).toBeVisible();
  await expect(notice).toContainText("7 days");
  await expect(notice).toBeVisible();
  if (await page.evaluate(() => innerWidth > 800)) await expect(floatingUpgrade).toBeVisible();

  // The notice opens the pricing dialog with the yearly trial and monthly price.
  await notice.getByRole("button", { name: "See Gold plans" }).click();
  const dialog = page.getByRole("dialog", { name: "Upgrade to FreeReader Gold" });
  await expect(dialog).toBeVisible();
  await expect(dialog).toContainText("$3.25");
  await expect(dialog).toContainText("7 days free");
  await expect(dialog).toContainText("billed $39 yearly");
  await dialog.getByRole("button", { name: "Monthly" }).click();
  await expect(dialog).toContainText("$5");
  await expect(dialog).not.toContainText("7 days free");
  await dialog.getByRole("button", { name: "Close" }).click();
  await expect(dialog).toHaveCount(0);

  await upload(page, "Guest reading");
  await page.getByRole("button", { name: /^html Guest reading/ }).click();
  await openControls(page);
  await expect(notice).toBeVisible();
  // The floating upgrade button is hidden inside the mobile reading shell.
  if (await page.evaluate(() => innerWidth > 800)) await expect(floatingUpgrade).toBeVisible();
  await expect(page.locator('a[href*="buymeacoffee.com"]')).toHaveCount(0);
  await expect(page.getByText("Press Listen to hear this passage. Your place is saved automatically.")).toHaveCount(0);
  await expect(page.getByText("Listen along")).toHaveCount(0);
  await expect(page.locator('[class*="playerRow"]').getByRole("button", { name: "Voice", exact: true })).toHaveCount(0);
  const fontButton = page.locator('#reader-reading-tools').getByRole("button", { name: "Font", exact: true });
  const voiceButton = page.locator('#reader-reading-tools').getByRole("button", { name: "Voice", exact: true });
  await expect(fontButton).toBeVisible();
  await expect(voiceButton).toBeVisible();
  expect(await fontButton.textContent()).toBe("Aa");
  expect(await voiceButton.textContent()).toBe("");
  const fontBounds = (await fontButton.boundingBox())!;
  const sizeBounds = (await page.getByRole("button", { name: "Decrease text size" }).boundingBox())!;
  expect(fontBounds.width).toBeGreaterThanOrEqual(44);
  expect(fontBounds.height).toBeGreaterThanOrEqual(44);
  if (await page.evaluate(() => innerWidth > 800)) expect(fontBounds.x).toBeLessThan(sizeBounds.x);
  else expect(fontBounds.y).toBeLessThan(sizeBounds.y);
  await fontButton.click();
  const fontDialog = page.getByRole("dialog", { name: "Font settings" });
  await expect(fontDialog.getByRole("switch", { name: "Highlight spoken words" })).toBeVisible();
  await expect(fontDialog.getByRole("switch", { name: "OpenDyslexic font" })).toBeVisible();
  await expect(fontDialog.getByLabel("Default reading view")).toHaveCount(0);
  await expect(fontDialog).not.toContainText("These choices apply");
  await fontDialog.getByRole("button", { name: "Done" }).click();
  await voiceButton.click();
  const voiceDialog = page.getByRole("dialog", { name: "Voice settings" });
  await expect(voiceDialog.getByRole("switch")).toHaveCount(0);
  await expect(voiceDialog.getByLabel("Default reading view")).toHaveCount(0);
  await expect(voiceDialog).not.toContainText("Individual books remember");
});

test("an OAuth fallback to the homepage returns to the reader with the chosen billing interval", async ({ page }) => {
  await page.evaluate(() => sessionStorage.setItem("freereaderUpgradePlan", "gold_monthly"));
  await page.goto("/");
  await page.waitForURL("**/reader/audiobooks");
  const dialog = page.getByRole("dialog", { name: "Upgrade to FreeReader Gold" });
  await expect(dialog).toContainText("Google sign-in didn't finish");
  await expect(dialog).toContainText("$5");
});

test("a Gold subscriber manages billing from the account circle in the library and reader", async ({ page }) => {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  if (!url) test.skip(true, "Supabase frontend URL is needed for browser auth simulation");
  const storageKey = `sb-${new URL(url!).hostname.split(".")[0]}-auth-token`;
  const session = {
    access_token: "gold-test-token", refresh_token: "gold-test-refresh", token_type: "bearer", expires_in: 3600,
    expires_at: Math.floor(Date.now() / 1000) + 3600,
    user: { id: "11111111-1111-4111-8111-111111111111", email: "reader@example.com", aud: "authenticated", role: "authenticated",
      app_metadata: { provider: "google", providers: ["google"] }, user_metadata: {}, created_at: new Date().toISOString() },
  };
  await page.route("**/auth/v1/user", (route) => route.fulfill({ status: 200, json: session.user }));
  await page.route("**/api/v1/freereader/usage**", (route) => route.fulfill({ status: 200, json: { plan: "gold_yearly" } }));
  await page.route("**/api/v1/freereader/sync/**", (route) => route.fulfill({ status: 403, json: { error: "sync_unavailable" } }));
  const portalRequests: string[] = [];
  await page.route("**/api/v1/freereader/billing/portal", (route) => {
    portalRequests.push(route.request().headers().authorization ?? "");
    return route.fulfill({ status: 503, json: { error: "billing_not_configured" } });
  });
  await page.evaluate(([key, value]) => localStorage.setItem(key, value), [storageKey, JSON.stringify(session)]);
  await page.reload();
  const account = page.getByRole("button", { name: "Account settings" });
  await expect(account).toBeVisible();
  await expect(page.getByRole("button", { name: "Upgrade to FreeReader Gold" })).toHaveCount(0);
  await account.click();
  await expect(page.getByText("FreeReader Gold", { exact: true })).toBeVisible();
  await expect(page.getByText("Yearly plan")).toBeVisible();
  await page.getByRole("button", { name: "Manage subscription" }).click();
  await expect(page.locator('[class*="accountPopover"]').getByRole("alert")).toContainText("Couldn't open Stripe billing");
  expect(portalRequests).toEqual(["Bearer gold-test-token"]);
  await page.getByRole("button", { name: "Account settings" }).click();
  await upload(page, "Gold reader");
  await page.getByRole("button", { name: /^html Gold reader/ }).click();
  await expect(account).toBeVisible();
  await account.click();
  await expect(page.getByRole("button", { name: "Manage subscription" })).toBeVisible();
});

test("library entry points, search, sorting, and folders are usable", async ({ page }, testInfo) => {
  await expect(page.getByRole("button", { name: "Add your first file" })).toBeVisible();
  await page.screenshot({ path: testInfo.outputPath("empty-library.png"), fullPage: true });
  await upload(page, "Zebra Notes");
  await upload(page, "An Afternoon Read");
  await page.getByLabel("Sort library").selectOption("title");
  await expect(page.getByRole("button", { name: /^html / }).first()).toContainText("An Afternoon Read");
  await page.getByLabel("Search library").fill("zebra");
  await expect(page.getByRole("button", { name: /^html / })).toHaveCount(1);
  await page.getByLabel("Search library").fill("missing title");
  await expect(page.getByRole("heading", { name: "No matching reading" })).toBeVisible();
  await page.getByRole("button", { name: "Clear search" }).click();
  await page.getByRole("button", { name: "New folder", exact: true }).click();
  await page.getByLabel("Folder name").fill("Weekend reads");
  await page.getByRole("button", { name: "Create", exact: true }).click();
  await page.getByRole("button", { name: "Organize Zebra Notes" }).click();
  await page.getByRole("dialog").getByRole("button", { name: /Weekend reads/ }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await page.getByLabel("Search library").fill("zebra");
  await expect(page.getByRole("button", { name: /^html Zebra Notes/ })).toBeVisible();
  await page.getByLabel("Search library").fill("");
  await page.getByRole("button", { name: /Weekend reads/ }).click();
  await expect(page.getByRole("button", { name: /^html Zebra Notes/ })).toBeVisible();
  await page.getByRole("button", { name: "Library", exact: true }).click();
  await page.screenshot({ path: testInfo.outputPath("populated-library.png"), fullPage: true });
  await expect(page.locator("body")).toHaveJSProperty("scrollWidth", await page.evaluate(() => window.innerWidth));
});

test("continuous scrolling, text sizing, settings and resume preserve the reading position", async ({ page }, testInfo) => {
  await upload(page, "A Quiet Afternoon", 8);
  await page.getByRole("button", { name: /^html A Quiet Afternoon/ }).click();
  await openControls(page);
  const viewport = page.locator('[class*="eReaderViewport"]');
  await expect(page.getByRole("navigation", { name: "Reading pages" })).toHaveCount(0);
  await expect.poll(() => viewport.evaluate((element) => element.scrollHeight > element.clientHeight)).toBe(true);
  const chapter = page.getByLabel("Choose chapter");
  if (await chapter.isVisible()) await chapter.selectOption({ label: "Chapter 4" });
  else await page.locator("aside").getByRole("button", { name: "Chapter 4" }).click();
  await expect(page.locator('article [aria-current="true"]')).toHaveText("Chapter 4");
  await expect(page.locator('article [aria-current="true"]')).toHaveCSS("box-shadow", "none");
  await expect.poll(() => viewport.evaluate((element) => {
    const current = element.querySelector('[aria-current="true"]')!.getBoundingClientRect();
    const bounds = element.getBoundingClientRect();
    return Math.round(100 * Math.abs((current.top + current.bottom) / 2 - (bounds.top + bounds.bottom) / 2) / bounds.height);
  })).toBeLessThan(25);
  const position = await page.locator('article [aria-current="true"]').textContent();
  await viewport.evaluate((element) => { element.scrollTop += 250; });
  await expect(page.locator('article [aria-current="true"]')).toHaveText(position!);
  const originalSize = await page.locator("article p").first().evaluate((p) => getComputedStyle(p).fontSize);
  await page.getByRole("button", { name: "Increase text size" }).click();
  await expect(page.locator("article p").first()).not.toHaveCSS("font-size", originalSize);
  await page.getByRole("button", { name: "Voice", exact: true }).click();
  await expect(page.getByRole("dialog", { name: "Voice settings" })).toBeVisible();
  await page.screenshot({ path: testInfo.outputPath("voice-settings.png") });
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Voice", exact: true })).toBeFocused();
  await page.screenshot({ path: testInfo.outputPath("reading-view.png"), fullPage: true });
  await page.getByRole("button", { name: "Library", exact: true }).click();
  await page.screenshot({ path: testInfo.outputPath("continue-reading.png"), fullPage: true });
  await page.getByRole("button", { name: "Continue reading", exact: true }).click();
  await openControls(page);
  await expect(page.locator('article [aria-current="true"]')).toHaveText(position!);
  await expect.poll(() => viewport.evaluate((element) => element.scrollTop > 0)).toBe(true);
  await expect(page.locator("body")).toHaveJSProperty("scrollWidth", await page.evaluate(() => window.innerWidth));
});

test("switching reading fonts recenters the spoken word promptly without showing Resume", async ({ page }) => {
  await page.route("**/api/tts", async (route) => {
    const { texts } = route.request().postDataJSON() as { texts: string[] };
    const archive = new JSZip();
    texts.forEach((text, index) => {
      archive.file(`${index}.m4a`, playableWav());
      archive.file(`${index}.json`, JSON.stringify(spokenWords(text).map((_, word) => [word, word * 0.15, word * 0.15 + 0.15])));
    });
    await route.fulfill({ contentType: "application/zip", body: await archive.generateAsync({ type: "nodebuffer" }), headers: { "X-Audio-Durations": texts.map(() => "20").join(",") } });
  });
  await upload(page, "Font following", 8);
  await page.getByRole("button", { name: /^html Font following/ }).click();
  await openControls(page);
  const chapter = page.getByLabel("Choose chapter");
  if (await chapter.isVisible()) await chapter.selectOption({ label: "Chapter 4" });
  else await page.locator("aside").getByRole("button", { name: "Chapter 4" }).click();
  const viewport = page.locator('[class*="eReaderViewport"]');
  await expect.poll(() => viewport.evaluate((element) => element.scrollTop > element.clientHeight)).toBe(true);
  await viewport.locator("p").filter({ hasText: "Reading gives us a little time" }).first().click();
  await expect(viewport.locator('p[aria-current="true"]')).toBeVisible();
  await page.getByRole("button", { name: "Listen", exact: true }).click();
  await expect.poll(() => page.evaluate(() => CSS.highlights.has("freereader-spoken-word"))).toBe(true);
  const activeWordPosition = () => viewport.evaluate((element) => {
    const word = (Array.from(CSS.highlights.get("freereader-spoken-word") ?? [])[0] as Range | undefined)?.getBoundingClientRect();
    const bounds = element.getBoundingClientRect();
    return word ? Math.abs((word.top + word.bottom - bounds.top - bounds.bottom) / 2) / bounds.height : 1;
  });
  await page.getByRole("button", { name: "Font", exact: true }).click();
  const toggle = page.getByRole("switch", { name: "OpenDyslexic font" });
  const before = await viewport.locator('[aria-current="true"]').evaluate((element) => parseFloat(getComputedStyle(element).fontSize));
  await toggle.check();
  await expect.poll(activeWordPosition, { timeout: 3000 }).toBeLessThan(0.3);
  await expect(page.getByRole("button", { name: "Resume centered scrolling" })).toHaveCount(0);
  const after = await viewport.locator('[aria-current="true"]').evaluate((element) => parseFloat(getComputedStyle(element).fontSize));
  expect(after / before).toBeCloseTo(0.85, 1);
  await page.waitForTimeout(300);
  await expect.poll(activeWordPosition, { timeout: 3000 }).toBeLessThan(0.3);
  await toggle.uncheck();
  await expect.poll(activeWordPosition, { timeout: 3000 }).toBeLessThan(0.3);
  await expect(page.getByRole("button", { name: "Resume centered scrolling" })).toHaveCount(0);
});

test("long documents scroll to the end without mounting every passage", async ({ page }) => {
  await page.locator('input[type="file"]').setInputFiles({
    name: "Long reading.html", mimeType: "text/html",
    buffer: Buffer.from(`<html><title>Long reading</title><body>${Array.from({ length: 350 }, (_, index) => `<p>Passage ${index}: ${paragraph}</p>`).join("")}</body></html>`),
  });
  const viewport = page.locator('[class*="eReaderViewport"]');
  await expect(viewport).toBeVisible();
  await expect.poll(() => viewport.evaluate((element) => element.clientHeight > 0 && element.scrollHeight > element.clientHeight)).toBe(true);
  await expect.poll(() => viewport.locator("[data-block-index]").count()).toBeLessThan(100);
  await viewport.evaluate((element) => { element.scrollTop = element.scrollHeight; });
  await expect.poll(() => viewport.locator("p").last().textContent()).toContain("Passage 349:");
  await expect.poll(() => viewport.locator("[data-block-index]").count()).toBeLessThan(100);
  await viewport.evaluate((element) => { element.scrollTop = 0; });
  await expect.poll(() => viewport.locator("p").first().textContent()).toContain("Passage 0:");
});

test("resume centered scrolling immediately returns from far away and restores following", async ({ page }) => {
  await page.locator('input[type="file"]').setInputFiles({
    name: "Long follow.html", mimeType: "text/html",
    buffer: Buffer.from(`<html><title>Long follow</title><body>${Array.from({ length: 350 }, (_, index) => `<p>Passage ${index}: ${paragraph}</p>`).join("")}</body></html>`),
  });
  const viewport = page.locator('[class*="eReaderViewport"]');
  await expect.poll(() => viewport.evaluate((element) => element.clientHeight > 0 && element.scrollHeight > element.clientHeight)).toBe(true);
  await viewport.evaluate((element) => { element.scrollTop = element.scrollHeight; });
  const resume = page.getByRole("button", { name: "Resume centered scrolling" });
  await expect(resume).toBeVisible();
  await resume.click();
  expect(await viewport.evaluate((element) => element.scrollTop <= element.clientHeight)).toBe(true);
  await expect(resume).toHaveCount(0);
  await expect.poll(() => viewport.locator('p[aria-current="true"]').textContent()).toContain("Passage 0:");
  const centered = await viewport.evaluate((element) => element.scrollTop);
  await page.waitForTimeout(220);
  expect(Math.abs((await viewport.evaluate((element) => element.scrollTop)) - centered)).toBeLessThan(20);
});

test("playback follows passages smoothly while explicit selections snap immediately", async ({ page }) => {
  await page.route("**/api/tts", async (route) => {
    const { texts } = route.request().postDataJSON() as { texts: string[] };
    const archive = new JSZip();
    texts.forEach((text, index) => {
      archive.file(`${index}.m4a`, playableWav());
      archive.file(`${index}.json`, JSON.stringify(spokenWords(text).map((_, word) => [word, word * 0.15, word * 0.15 + 0.15])));
    });
    await route.fulfill({ contentType: "application/zip", body: await archive.generateAsync({ type: "nodebuffer" }), headers: { "X-Audio-Durations": texts.map(() => "20").join(",") } });
  });
  await upload(page, "Smooth follow", 5);
  await page.getByRole("button", { name: /^html Smooth follow/ }).click();
  const viewport = page.locator('[class*="eReaderViewport"]');
  await expect.poll(() => viewport.evaluate((element) => element.scrollHeight > element.clientHeight)).toBe(true);
  const chapter = page.getByLabel("Choose chapter");
  if (await chapter.isVisible()) await chapter.selectOption({ label: "Chapter 3" });
  else await page.locator("aside").getByRole("button", { name: "Chapter 3" }).click();
  await page.getByRole("button", { name: "Listen", exact: true }).click();
  await expect.poll(() => page.locator("audio").evaluate((audio: HTMLAudioElement) => audio.duration > 0)).toBe(true);
  const current = await viewport.locator('[aria-current="true"]').textContent();
  await page.locator("audio").evaluate((audio: HTMLAudioElement) => {
    audio.currentTime = audio.duration;
    // WebKit does not consistently dispatch ended when a test seeks to the last frame.
    audio.dispatchEvent(new Event("ended"));
  });
  const positions = await viewport.evaluate((element) => new Promise<number[]>((resolve) => {
    const values: number[] = [];
    const until = performance.now() + 650;
    const sample = () => {
      values.push(element.scrollTop);
      if (performance.now() < until) requestAnimationFrame(sample);
      else resolve(values);
    };
    requestAnimationFrame(sample);
  }));
  expect(Math.max(...positions) - Math.min(...positions)).toBeGreaterThan(40);
  expect(new Set(positions.map((position) => Math.round(position / 5))).size).toBeGreaterThan(5);
  await expect.poll(() => viewport.locator('[aria-current="true"]').textContent()).not.toBe(current);

  if (await chapter.isVisible()) await chapter.selectOption({ label: "Chapter 4" });
  else await page.locator("aside").getByRole("button", { name: "Chapter 4" }).click();
  await expect.poll(() => viewport.evaluate((element) => {
    const current = element.querySelector('[aria-current="true"]')?.getBoundingClientRect();
    const bounds = element.getBoundingClientRect();
    return current ? Math.abs((current.top + current.bottom - bounds.top - bounds.bottom) / 2) / bounds.height : 1;
  })).toBeLessThan(0.25);
});

test("manual scrolling stays put until follow resumes, while chapter selections snap into place", async ({ page }, testInfo) => {
  await upload(page, "Free scrolling", 8);
  await page.getByRole("button", { name: /^html Free scrolling/ }).click();
  const viewport = page.locator('[class*="eReaderViewport"]');
  const resume = page.getByRole("button", { name: "Resume centered scrolling" });
  await expect(resume).toHaveCount(0);
  const chapter = page.getByLabel("Choose chapter");
  if (await chapter.isVisible()) await chapter.selectOption({ label: "Chapter 4" });
  else await page.locator("aside").getByRole("button", { name: "Chapter 4" }).click();
  await expect.poll(() => viewport.evaluate((element) => {
    const current = element.querySelector('[aria-current="true"]')?.getBoundingClientRect();
    const bounds = element.getBoundingClientRect();
    return current ? Math.abs((current.top + current.bottom - bounds.top - bounds.bottom) / 2) / bounds.height : 1;
  })).toBeLessThan(0.25);
  await expect(resume).toHaveCount(0);

  if (testInfo.project.name === "desktop-chromium") {
    await viewport.hover();
    await page.mouse.wheel(0, 240);
  } else await viewport.evaluate((element) => { element.scrollTop += 240; });
  await expect(resume).toBeVisible();
  const parked = await viewport.evaluate((element) => element.scrollTop);
  await page.waitForTimeout(500);
  expect(Math.abs((await viewport.evaluate((element) => element.scrollTop)) - parked)).toBeLessThan(35);
  await expect(resume).toBeVisible();

  if (await chapter.isVisible()) await chapter.selectOption({ label: "Chapter 6" });
  else await page.locator("aside").getByRole("button", { name: "Chapter 6" }).click();
  await expect.poll(() => viewport.evaluate((element) => {
    const current = element.querySelector('[aria-current="true"]')?.getBoundingClientRect();
    const bounds = element.getBoundingClientRect();
    return current ? Math.abs((current.top + current.bottom - bounds.top - bounds.bottom) / 2) / bounds.height : 1;
  })).toBeLessThan(0.25);
  await expect(resume).toBeVisible();

  await viewport.evaluate((element) => { element.scrollTop += 200; });
  await expect(resume).toBeVisible();

  await resume.click();
  await expect(resume).toHaveCount(0);
  await expect.poll(() => viewport.evaluate((element) => {
    const current = element.querySelector('[aria-current="true"]')?.getBoundingClientRect();
    const bounds = element.getBoundingClientRect();
    return current ? Math.abs((current.top + current.bottom - bounds.top - bounds.bottom) / 2) / bounds.height : 1;
  })).toBeLessThan(0.25);
  if (await chapter.isVisible()) await chapter.selectOption({ label: "Chapter 5" });
  else await page.locator("aside").getByRole("button", { name: "Chapter 5" }).click();
  await expect(resume).toHaveCount(0);
});

test("spoken-word highlighting continues while manual scrolling disables word follow", async ({ page }) => {
  await page.route("**/api/tts", async (route) => {
    const { texts } = route.request().postDataJSON() as { texts: string[] };
    const archive = new JSZip();
    texts.forEach((text, index) => {
      archive.file(`${index}.m4a`, playableWav());
      archive.file(`${index}.json`, JSON.stringify(spokenWords(text).map((_, word) => [word, word * 0.15, word * 0.15 + 0.15])));
    });
    await route.fulfill({ contentType: "application/zip", body: await archive.generateAsync({ type: "nodebuffer" }), headers: { "X-Audio-Durations": texts.map(() => "20").join(",") } });
  });
  await page.locator('input[type="file"]').setInputFiles({
    name: "Listening aside.html", mimeType: "text/html",
    buffer: Buffer.from(`<html><title>Listening aside</title><body>${Array.from({ length: 8 }, () => `<p>${paragraph.repeat(5)}</p>`).join("")}</body></html>`),
  });
  const viewport = page.locator('[class*="eReaderViewport"]');
  await page.getByRole("button", { name: "Listen", exact: true }).click();
  const highlighted = () => page.evaluate(() => Array.from(CSS.highlights.get("freereader-spoken-word") ?? [], (range) => range.toString())[0]);
  await expect.poll(highlighted).toBeTruthy();
  const resume = page.getByRole("button", { name: "Resume centered scrolling" });
  await viewport.evaluate((element) => { element.scrollTop += 250; });
  await expect(resume).toBeVisible();
  const parked = await viewport.evaluate((element) => element.scrollTop);
  const previousWord = await highlighted();
  await page.locator("audio").evaluate((audio: HTMLAudioElement) => { audio.currentTime = 7; });
  await expect.poll(highlighted).not.toBe(previousWord);
  await page.waitForTimeout(300);
  expect(Math.abs((await viewport.evaluate((element) => element.scrollTop)) - parked)).toBeLessThan(35);
  await expect(resume).toBeVisible();
  const previousSource = await page.locator("audio").evaluate((audio: HTMLAudioElement) => audio.currentSrc);
  await page.locator("audio").evaluate((audio: HTMLAudioElement) => { audio.currentTime = audio.duration - 0.05; });
  await expect.poll(() => page.locator("audio").evaluate((audio: HTMLAudioElement) => audio.currentSrc)).not.toBe(previousSource);
  expect(Math.abs((await viewport.evaluate((element) => element.scrollTop)) - parked)).toBeLessThan(35);
  await resume.click();
  await expect(resume).toHaveCount(0);
  await expect.poll(() => viewport.evaluate((element) => {
    const word = (Array.from(CSS.highlights.get("freereader-spoken-word") ?? [])[0] as Range | undefined)?.getBoundingClientRect();
    const bounds = element.getBoundingClientRect();
    return word ? Math.abs((word.top + word.bottom - bounds.top - bounds.bottom) / 2) / bounds.height : 1;
  })).toBeLessThan(0.3);
});

test("spoken-word highlighting does not reflow lines", async ({ page }) => {
  await page.route("**/api/tts", async (route) => {
    const { texts } = route.request().postDataJSON() as { texts: string[] };
    const archive = new JSZip();
    texts.forEach((text, index) => {
      archive.file(`${index}.m4a`, playableWav());
      archive.file(`${index}.json`, JSON.stringify(spokenWords(text).map((_, word) => [word, word * 0.15, word * 0.15 + 0.15])));
    });
    await route.fulfill({ contentType: "application/zip", body: await archive.generateAsync({ type: "nodebuffer" }), headers: { "X-Audio-Durations": texts.map(() => "20").join(",") } });
  });
  await page.locator('input[type="file"]').setInputFiles({
    name: "Steady lines.html", mimeType: "text/html",
    buffer: Buffer.from(`<html><title>Steady lines</title><body><p>${paragraph.repeat(5)}</p></body></html>`),
  });
  await page.getByRole("button", { name: "Listen", exact: true }).click();
  const passage = page.locator('article p[aria-current="true"]');
  const highlighted = () => page.evaluate(() => Array.from(CSS.highlights.get("freereader-spoken-word") ?? [], (range) => range.toString())[0]);
  await expect.poll(highlighted).toBeTruthy();
  await expect(passage).toHaveCSS("background-color", "rgb(237, 242, 255)");
  expect(await passage.evaluate((element) => getComputedStyle(element, "::highlight(freereader-spoken-word)").backgroundColor)).toBe("rgb(170, 186, 255)");
  const geometry = () => passage.evaluate((element) => {
    const range = document.createRange();
    range.setStart(element.firstChild!, 30);
    range.setEnd(element.firstChild!, 45);
    return { height: element.getBoundingClientRect().height, line: range.getBoundingClientRect().top - element.getBoundingClientRect().top, text: element.firstChild!.textContent };
  });
  const before = await geometry();
  const initialHighlight = await highlighted();
  await page.locator("audio").evaluate((audio: HTMLAudioElement) => { audio.currentTime = 7; });
  await expect.poll(highlighted).not.toBe(initialHighlight);
  expect(await geometry()).toEqual(before);
});

test("short words receive their own highlights during normal playback", async ({ page }) => {
  await page.route("**/api/tts", async (route) => {
    const { texts } = route.request().postDataJSON() as { texts: string[] };
    const archive = new JSZip();
    texts.forEach((text, index) => {
      archive.file(`${index}.m4a`, playableWav());
      archive.file(`${index}.json`, JSON.stringify(spokenWords(text).map((_, word) => [word, word * 0.08, word * 0.08 + 0.08])));
    });
    await route.fulfill({ contentType: "application/zip", body: await archive.generateAsync({ type: "nodebuffer" }), headers: { "X-Audio-Durations": texts.map(() => "20").join(",") } });
  });
  await page.locator('input[type="file"]').setInputFiles({
    name: "Short words.html", mimeType: "text/html",
    buffer: Buffer.from(`<html><title>Short words</title><body><p>${"We go to a small place. I am in it. ".repeat(12)}</p></body></html>`),
  });
  await page.evaluate(() => {
    const observed = window as unknown as { highlightedWords: string[] };
    observed.highlightedWords = [];
    const capture = () => {
      const word = Array.from(CSS.highlights.get("freereader-spoken-word") ?? [], (range) => range.toString())[0];
      if (word && observed.highlightedWords.at(-1) !== word) observed.highlightedWords.push(word);
      requestAnimationFrame(capture);
    };
    requestAnimationFrame(capture);
  });
  await page.getByRole("button", { name: "Listen", exact: true }).click();
  for (const word of ["to", "a", "I", "in"]) {
    await expect.poll(() => page.evaluate(() => (window as unknown as { highlightedWords: string[] }).highlightedWords)).toContain(word);
  }
});

test("the Duchess quotation highlights words across curly quotes and an em dash", async ({ page }) => {
  const passage = "“Ah, well! It means much the same thing,” said the Duchess, digging her sharp little chin into Alice’s shoulder as she added, “and the moral of that is—‘Take care of the sense, and the sounds will take care of themselves.’”";
  let spokenText = "";
  await page.route("**/api/tts", async (route) => {
    const { texts } = route.request().postDataJSON() as { texts: string[] };
    spokenText = texts[0];
    const archive = new JSZip();
    archive.file("0.m4a", playableWav());
    archive.file("0.json", JSON.stringify(spokenWords(spokenText).map((_, index) => [index, index * .3, (index + 1) * .3])));
    await route.fulfill({ contentType: "application/zip", body: await archive.generateAsync({ type: "nodebuffer" }), headers: { "X-Audio-Durations": "20" } });
  });
  await page.locator('input[type="file"]').setInputFiles({
    name: "Duchess.html", mimeType: "text/html",
    buffer: Buffer.from(`<html><title>Duchess</title><body><p>${passage}</p></body></html>`),
  });
  await page.getByRole("button", { name: "Listen", exact: true }).click();
  await expect.poll(() => spokenText.length).toBeGreaterThan(0);
  await expect.poll(() => page.locator("audio").evaluate((audio: HTMLAudioElement) => !audio.paused)).toBe(true);
  const words = spokenWords(spokenText);
  for (const target of ["Alice’s", "is,", "Take", "themselves.’”"]) {
    const index = words.findIndex((word) => spokenText.slice(word.start, word.start + word.length).includes(target));
    expect(index).toBeGreaterThanOrEqual(0);
    await page.locator("audio").evaluate((audio: HTMLAudioElement, time) => { audio.currentTime = time; }, index * .3 + .05);
    await expect.poll(() => page.evaluate(() => Array.from(CSS.highlights.get("freereader-spoken-word") ?? [], (range) => range.toString())[0] ?? "")).toBe(target.replace(/[^\p{L}\p{N}]+$/gu, ""));
  }
});

test("older browsers still highlight short words without changing text layout", async ({ page }) => {
  await page.evaluate(() => { Object.defineProperty(CSS, "highlights", { configurable: true, value: undefined }); });
  await page.route("**/api/tts", async (route) => {
    const { texts } = route.request().postDataJSON() as { texts: string[] };
    const archive = new JSZip();
    texts.forEach((text, index) => {
      archive.file(`${index}.m4a`, playableWav());
      archive.file(`${index}.json`, JSON.stringify(spokenWords(text).map((_, word) => [word, word * 0.2, word * 0.2 + 0.2])));
    });
    await route.fulfill({ contentType: "application/zip", body: await archive.generateAsync({ type: "nodebuffer" }), headers: { "X-Audio-Durations": texts.map(() => "20").join(",") } });
  });
  await page.locator('input[type="file"]').setInputFiles({
    name: "Short word fallback.html", mimeType: "text/html",
    buffer: Buffer.from(`<html><title>Short word fallback</title><body><p>${"We go to a small place. ".repeat(12)}</p></body></html>`),
  });
  const passage = page.locator('article p[aria-current="true"]');
  const height = await passage.evaluate((element) => element.getBoundingClientRect().height);
  await page.getByRole("button", { name: "Listen", exact: true }).click();
  await page.locator("audio").evaluate((audio: HTMLAudioElement) => { audio.currentTime = 0.7; });
  await expect(passage.locator('[class*="spokenWord"]')).toHaveText("a");
  expect(await passage.evaluate((element) => element.getBoundingClientRect().height)).toBe(height);
});

test("voice settings generate at the chosen 0.5–3.0 speaking speed without player speed or quality controls", async ({ page }) => {
  const requests: Array<{ speed: number; engine?: string; quality?: string }> = [];
  await page.route("**/api/tts", (route) => {
    requests.push(route.request().postDataJSON());
    return route.fulfill({ status: 503, json: { error: "Try again" } });
  });
  await upload(page, "Speaking speeds");
  await page.getByRole("button", { name: /^html Speaking speeds/ }).click();
  await openControls(page);
  await expect(page.getByRole("combobox", { name: "Speed" })).toHaveCount(0);
  await page.getByRole("button", { name: "Voice", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: "Voice settings" });
  await expect(dialog.getByText("Quality")).toHaveCount(0);
  const slider = dialog.getByRole("slider", { name: "Speaking speed" });
  await expect(slider).toHaveAttribute("min", "0.5");
  await expect(slider).toHaveAttribute("max", "3");
  await expect(slider).toHaveValue("1");
  await slider.focus();
  await slider.press("End");
  await expect(slider).toHaveValue("3");
  await dialog.getByRole("button", { name: "Done" }).click();
  await page.getByRole("button", { name: "Listen", exact: true }).click();
  await expect.poll(() => requests.length).toBe(1);
  expect(requests[0].speed).toBe(3);
  expect(requests[0].quality).toBeUndefined();

  await page.getByRole("button", { name: "Voice", exact: true }).click();
  await dialog.getByLabel("Voice").selectOption("F4");
  await slider.focus();
  await slider.press("Home");
  await expect(slider).toHaveValue("0.5");
  await dialog.getByRole("button", { name: "Done" }).click();
  await page.getByRole("button", { name: "Listen", exact: true }).click();
  await expect.poll(() => requests.length).toBe(2);
  expect(requests[1]).toMatchObject({ speed: 0.5, engine: "supertonic" });
  expect(requests[1].quality).toBeUndefined();
});

test("guest voice and reading defaults persist across books and visits", async ({ page }) => {
  await upload(page, "First default");
  await upload(page, "Second default");
  await page.getByRole("button", { name: /^html First default/ }).click();
  await openControls(page);
  await page.getByRole("button", { name: "Voice", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: "Voice settings" });
  await dialog.getByRole("combobox", { name: "Voice", exact: true }).selectOption("af_river");
  await dialog.getByRole("slider", { name: "Speaking speed" }).focus();
  await dialog.getByRole("slider", { name: "Speaking speed" }).press("ArrowRight");
  await dialog.getByRole("button", { name: "Done" }).click();
  await page.getByRole("button", { name: "Font", exact: true }).click();
  const font = page.getByRole("dialog", { name: "Font settings" });
  await font.getByRole("switch", { name: "OpenDyslexic font" }).check();
  await font.getByRole("switch", { name: "Highlight spoken words" }).uncheck();
  await font.getByRole("button", { name: "Done" }).click();
  await page.getByRole("button", { name: "Increase text size" }).click();
  await page.getByRole("button", { name: "Library", exact: true }).click();
  await page.getByRole("button", { name: /^html Second default/ }).click();
  await openControls(page);
  await page.getByRole("button", { name: "Voice", exact: true }).click();
  await expect(dialog.getByRole("combobox", { name: "Voice", exact: true })).toHaveValue("af_river");
  await expect(dialog.getByRole("slider", { name: "Speaking speed" })).toHaveValue("1.1");
  await expect(dialog.getByRole("switch")).toHaveCount(0);
  await dialog.getByRole("button", { name: "Done" }).click();
  await page.getByRole("button", { name: "Font", exact: true }).click();
  await expect(font.getByRole("switch", { name: "OpenDyslexic font" })).toBeChecked();
  await expect(font.getByRole("switch", { name: "Highlight spoken words" })).not.toBeChecked();
  await expect(font).toContainText("22px");
  await font.getByRole("button", { name: "Done" }).click();
  await page.reload();
  await page.getByRole("button", { name: /^html First default/ }).click();
  await openControls(page);
  await page.getByRole("button", { name: "Voice", exact: true }).click();
  await expect(dialog.getByRole("combobox", { name: "Voice", exact: true })).toHaveValue("af_river");
});

test("font settings preview spacing and tint immediately and retain position across documents", async ({ page }) => {
  await upload(page, "Accessible first", 5);
  await upload(page, "Accessible second", 5);
  await page.getByRole("button", { name: /^html Accessible first/ }).click();
  await openControls(page);
  const defaultLineHeight = await page.locator("article p").first().evaluate((element) => getComputedStyle(element).lineHeight);
  expect(defaultLineHeight).toBe(await page.evaluate(() => innerWidth <= 800 ? "35px" : "37px"));
  const chapter = page.getByLabel("Choose chapter");
  if (await chapter.isVisible()) await chapter.selectOption({ label: "Chapter 3" });
  else await page.locator("aside").getByRole("button", { name: "Chapter 3" }).click();
  await expect(page.locator('article [aria-current="true"]')).toHaveText("Chapter 3");
  await page.getByRole("button", { name: "Font", exact: true }).click();
  const panel = page.getByRole("dialog", { name: "Font settings" });
  await expect(panel.getByRole("slider", { name: "Line spacing" })).toHaveAttribute("min", "1");
  await expect(panel.getByRole("slider", { name: "Line spacing" })).toHaveAttribute("max", "2.5");
  await expect(panel.getByRole("slider", { name: "Word spacing" })).toHaveAttribute("max", "0.3");
  await panel.getByRole("slider", { name: "Line spacing" }).focus();
  await panel.getByRole("slider", { name: "Line spacing" }).press("End");
  await panel.getByRole("slider", { name: "Word spacing" }).focus();
  await panel.getByRole("slider", { name: "Word spacing" }).press("End");
  await panel.getByRole("button", { name: "Dark Mode" }).click();
  const preview = panel.getByLabel("Live reading preview");
  await expect(preview).toHaveCSS("background-color", "rgb(29, 36, 48)");
  await expect(preview).toHaveCSS("word-spacing", "6px");
  await expect(page.locator('article [aria-current="true"]')).toHaveText("Chapter 3");
  await expect(page.locator("article p").first()).toHaveCSS("line-height", "50px");
  await expect(page.locator("article p").first()).toHaveCSS("word-spacing", "6px");
  await panel.getByRole("button", { name: "Done" }).click();
  await page.getByRole("button", { name: "Library", exact: true }).click();
  await page.getByRole("button", { name: /^html Accessible second/ }).click();
  await openControls(page);
  await expect(page.locator("article p").first()).toHaveCSS("line-height", "50px");
  await expect(page.locator('[class*="eReaderViewport"]')).toHaveCSS("background-color", "rgb(29, 36, 48)");
  await page.reload();
  await page.getByRole("button", { name: /^html Accessible first/ }).click();
  await openControls(page);
  await expect(page.locator('article [aria-current="true"]')).toHaveText("Chapter 3");
  await expect(page.locator('[class*="eReaderViewport"]')).toHaveCSS("background-color", "rgb(29, 36, 48)");
});

test("full screen fills the window with the chosen reading background and keeps the current passage", async ({ page }) => {
  await upload(page, "Focus reading", 5);
  await page.getByRole("button", { name: /^html Focus reading/ }).click();
  await openControls(page);
  const chapter = page.getByLabel("Choose chapter");
  if (await chapter.isVisible()) await chapter.selectOption({ label: "Chapter 3" });
  else await page.locator("aside").getByRole("button", { name: "Chapter 3" }).click();
  await expect(page.locator('article [aria-current="true"]')).toHaveText("Chapter 3");
  await page.getByRole("button", { name: "Font", exact: true }).click();
  await page.getByRole("dialog", { name: "Font settings" }).getByRole("button", { name: "Soft Yellow" }).click();
  await page.getByRole("dialog", { name: "Font settings" }).getByRole("button", { name: "Done" }).click();
  await page.getByRole("button", { name: "Full screen" }).click();
  const reader = page.locator("main[data-mobile-reader]");
  await expect(page.getByRole("button", { name: "Exit full screen" })).toBeVisible();
  await expect(page.locator('[class*="readerTop"]')).toBeHidden();
  await expect(page.locator('[class*="chapterRail"]')).toBeHidden();
  await expect(page.locator('main[data-mobile-reader] > div[class*="player"]')).toBeHidden();
  await expect(page.locator("#reader-reading-tools")).toBeHidden();
  await expect(reader).toHaveCSS("background-color", "rgb(255, 248, 206)");
  await expect.poll(() => reader.evaluate((element) => {
    const rect = element.getBoundingClientRect();
    return rect.x === 0 && rect.y === 0 && rect.width === innerWidth && rect.height === innerHeight;
  })).toBe(true);
  await expect(page.locator('article [aria-current="true"]')).toHaveText("Chapter 3");
  await page.keyboard.press("Escape");
  await expect(page.getByRole("button", { name: "Exit full screen" })).toHaveCount(0);
  await expect(page.locator('[class*="readerTop"]')).toBeVisible();
  await expect(page.locator('article [aria-current="true"]')).toHaveText("Chapter 3");
  await page.getByRole("button", { name: "Full screen" }).click();
  await page.getByRole("button", { name: "Exit full screen" }).click();
  await expect(page.locator('article [aria-current="true"]')).toHaveText("Chapter 3");
});

test("free accounts import guest defaults and restore them from account metadata", async ({ page }) => {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  if (!url) test.skip(true, "Supabase frontend URL is needed for browser auth simulation");
  await upload(page, "Free account defaults");
  await page.getByRole("button", { name: /^html Free account defaults/ }).click();
  await openControls(page);
  await page.getByRole("button", { name: "Voice", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: "Voice settings" });
  await dialog.getByRole("combobox", { name: "Voice", exact: true }).selectOption("af_river");
  await dialog.getByRole("button", { name: "Done" }).click();
  await page.getByRole("button", { name: "Font", exact: true }).click();
  const font = page.getByRole("dialog", { name: "Font settings" });
  await font.getByRole("switch", { name: "OpenDyslexic font" }).check();
  await font.getByRole("slider", { name: "Line spacing" }).focus();
  await font.getByRole("slider", { name: "Line spacing" }).press("End");
  await font.getByRole("button", { name: "Soft Green" }).click();
  await font.getByRole("button", { name: "Done" }).click();

  const storageKey = `sb-${new URL(url!).hostname.split(".")[0]}-auth-token`;
  const user = { id: "22222222-2222-4222-8222-222222222222", email: "free@example.com", aud: "authenticated", role: "authenticated",
    app_metadata: { provider: "google", providers: ["google"] }, user_metadata: {} as Record<string, unknown>, created_at: new Date().toISOString() };
  const session = { access_token: "free-test-token", refresh_token: "free-test-refresh", token_type: "bearer", expires_in: 3600,
    expires_at: Math.floor(Date.now() / 1000) + 3600, user };
  const saved: unknown[] = [];
  await page.route("**/auth/v1/user", (route) => {
    if (route.request().method() === "PUT") {
      const update = route.request().postDataJSON() as { data: Record<string, unknown> };
      Object.assign(user.user_metadata, update.data);
      saved.push(update.data.freereader_reader_preferences);
    }
    return route.fulfill({ status: 200, json: user });
  });
  await page.route("**/api/v1/freereader/usage**", (route) => route.fulfill({ status: 200, json: { plan: "free" } }));
  await page.route("**/auth/v1/logout**", (route) => route.fulfill({ status: 204, body: "" }));
  await page.evaluate(([key, value]) => localStorage.setItem(key, value), [storageKey, JSON.stringify(session)]);
  await page.reload();
  await page.getByRole("dialog", { name: "Upgrade to FreeReader Gold" }).getByRole("button", { name: "Close" }).click();
  await expect(page.getByRole("button", { name: "Account settings" })).toBeVisible();
  await expect.poll(() => saved.length).toBeGreaterThan(0);
  expect(saved[0]).toMatchObject({ openDyslexic: true, defaultVoices: { en: "af_river" }, lineSpacing: 2.5, readingBackground: "green" });
  await page.evaluate(() => localStorage.removeItem("freereader-reader-preferences:v1:22222222-2222-4222-8222-222222222222"));
  await page.reload();
  await page.getByRole("button", { name: /^html Free account defaults/ }).click();
  await openControls(page);
  await page.getByRole("button", { name: "Voice", exact: true }).click();
  await expect(dialog.getByRole("combobox", { name: "Voice", exact: true })).toHaveValue("af_river");
  await dialog.getByRole("button", { name: "Done" }).click();
  await page.getByRole("button", { name: "Font", exact: true }).click();
  await expect(font.getByRole("switch", { name: "OpenDyslexic font" })).toBeChecked();
  await expect(page.locator('[class*="eReaderViewport"]')).toHaveCSS("background-color", "rgb(233, 245, 231)");
  await font.getByRole("switch", { name: "OpenDyslexic font" }).uncheck();
  await expect.poll(() => saved.length).toBeGreaterThan(1);
  await font.getByRole("button", { name: "Done" }).click();
  await page.getByRole("button", { name: "Account settings" }).click();
  await page.getByRole("button", { name: "Sign out" }).click();
  await expect(page.getByRole("button", { name: "Account settings" })).toHaveCount(0);
  await page.getByRole("button", { name: "Font", exact: true }).click();
  await expect(font.getByRole("switch", { name: "OpenDyslexic font" })).toBeChecked();
});

test("changing voice during first generation starts the new voice without another Listen click", async ({ page }) => {
  const requests: Array<{ voice: string }> = [];
  let releaseFirst: (() => void) | undefined;
  await page.route("**/api/tts", async (route) => {
    requests.push(route.request().postDataJSON());
    if (requests.length === 1) {
      await new Promise<void>((resolve) => { releaseFirst = resolve; });
    }
    try {
      await route.fulfill({ contentType: "audio/wav", headers: { "X-Audio-Duration": "20" }, body: playableWav() });
    } catch { /* The old request was cancelled. */ }
  });
  try {
    await upload(page, "Change voice while generating");
    await page.getByRole("button", { name: /^html Change voice while generating/ }).click();
    await openControls(page);
    await page.getByRole("button", { name: "Listen", exact: true }).click();
    await expect.poll(() => requests.length).toBe(1);
    await page.getByRole("button", { name: "Voice", exact: true }).click();
    await page.getByRole("dialog", { name: "Voice settings" }).getByLabel("Voice").selectOption("af_river");
    await expect.poll(() => requests.some((request) => request.voice === "af_river")).toBe(true);
    await expect.poll(() => page.locator("audio").evaluate((audio: HTMLAudioElement) => !audio.paused)).toBe(true);
    await expect(page.getByRole("button", { name: "Pause", exact: true })).toBeVisible();
  } finally {
    releaseFirst?.();
  }
});

test("changing language, voice, and speed restarts the current passage automatically with the new settings", async ({ page }) => {
  const requests: Array<{ voice: string; language?: string; engine?: string; speed: number }> = [];
  await page.route("**/api/tts", (route) => {
    requests.push(route.request().postDataJSON());
    return route.fulfill({ contentType: "audio/wav", headers: { "X-Audio-Duration": "20" }, body: playableWav() });
  });
  await upload(page, "Restart settings", 3);
  await page.getByRole("button", { name: /^html Restart settings/ }).click();
  await openControls(page);
  await page.getByRole("button", { name: "Listen", exact: true }).click();
  await expect.poll(() => page.locator("audio").evaluate((audio: HTMLAudioElement) => !audio.paused)).toBe(true);
  const originalSource = await page.locator("audio").evaluate((audio: HTMLAudioElement) => audio.currentSrc);
  await page.getByRole("button", { name: "Voice", exact: true }).click();
  const settings = page.getByRole("dialog", { name: "Voice settings" });
  await settings.getByLabel("Language").selectOption("es");
  // The old audio must stop and the current passage must regenerate and resume by itself.
  await expect.poll(() => requests.some((request) => request.language === "es" && request.voice === "ef_dora" && request.engine === "kokoro")).toBe(true);
  await expect.poll(() => page.locator("audio").evaluate((audio: HTMLAudioElement, previous) => audio.currentSrc && audio.currentSrc !== previous, originalSource)).toBe(true);
  await expect.poll(() => page.locator("audio").evaluate((audio: HTMLAudioElement) => !audio.paused)).toBe(true);
  await settings.getByLabel("Voice").selectOption("em_alex");
  await expect.poll(() => requests.some((request) => request.voice === "em_alex")).toBe(true);
  const slider = settings.getByRole("slider", { name: "Speaking speed" });
  await slider.focus();
  await slider.press("End");
  await expect.poll(() => requests.some((request) => request.voice === "em_alex" && request.speed === 3)).toBe(true);
  await expect.poll(() => page.locator("audio").evaluate((audio: HTMLAudioElement) => !audio.paused)).toBe(true);
  await expect(page.getByRole("button", { name: "Pause", exact: true })).toBeVisible();
  await expect(settings.getByText("~~~")).toHaveCount(0);
});

test("speech errors are visible and listening can be retried", async ({ page }) => {
  let fail = true;
  const sources: string[] = [];
  await page.route("**/api/tts", async (route) => {
    sources.push(JSON.parse(route.request().headers()["x-freereader-context"]).source);
    if (fail) return route.fulfill({ status: 503, json: { error: "Speech temporarily unavailable. Please retry." } });
    const audio = Buffer.alloc(44 + 24000 * 20 * 2);
    audio.write("RIFF", 0); audio.writeUInt32LE(audio.length - 8, 4); audio.write("WAVEfmt ", 8);
    audio.writeUInt32LE(16, 16); audio.writeUInt16LE(1, 20); audio.writeUInt16LE(1, 22);
    audio.writeUInt32LE(24000, 24); audio.writeUInt32LE(48000, 28); audio.writeUInt16LE(2, 32); audio.writeUInt16LE(16, 34);
    audio.write("data", 36); audio.writeUInt32LE(audio.length - 44, 40);
    await route.fulfill({ contentType: "audio/wav", headers: { "X-Audio-Duration": "20" }, body: audio });
  });
  await page.locator('input[type="file"]').setInputFiles({ name: "Listen.txt", mimeType: "text/plain", buffer: Buffer.from(paragraph) });
  await expect(page.locator("article")).toBeVisible();
  await openControls(page);
  await page.getByRole("button", { name: "Listen", exact: true }).click();
  await expect(page.getByRole("status")).toContainText("Speech temporarily unavailable");
  fail = false;
  await page.getByRole("button", { name: "Listen", exact: true }).click();
  await expect.poll(() => page.locator("audio").evaluate((audio: HTMLAudioElement) => !audio.paused)).toBe(true);
  await page.getByRole("button", { name: "Pause", exact: true }).click();
  await expect(page.getByRole("button", { name: "Listen", exact: true })).toBeVisible();
  expect(sources.length).toBeGreaterThan(0);
  expect(sources.every((source) => source === "audiobook")).toBe(true);
});

test("add-content dialog supports keyboard navigation and the file picker", async ({ page }) => {
  const add = page.getByRole("button", { name: "Add content", exact: true });
  await add.click();
  const dialog = page.getByRole("dialog", { name: "Add reading" });
  await expect(dialog.getByRole("button", { name: /^Upload File/ })).toBeFocused();
  await page.keyboard.press("Shift+Tab");
  await expect(dialog.getByRole("button", { name: "Cancel" })).toBeFocused();
  await page.keyboard.press("Tab");
  await expect(dialog.getByRole("button", { name: /^Upload File/ })).toBeFocused();
  await page.keyboard.press("Escape");
  await expect(add).toBeFocused();
  await add.click();
  const chooserPromise = page.waitForEvent("filechooser");
  await dialog.getByRole("button", { name: /^Upload File/ }).click();
  const chooser = await chooserPromise;
  await chooser.setFiles({ name: "My first book.txt", mimeType: "text/plain", buffer: Buffer.from(paragraph) });
  // The new document opens in the reader right away.
  await expect(page.locator("article")).toContainText("Reading gives us a little time");
  await page.getByRole("button", { name: "Library", exact: true }).click();
  await expect(page.getByRole("button", { name: /^txt My first book/ })).toBeVisible();
});
