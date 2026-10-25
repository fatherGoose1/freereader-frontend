import { expect, test } from "@playwright/test";

function sampleAudio(): Buffer {
  const audio = Buffer.alloc(44 + 24_000 * 2);
  audio.write("RIFF", 0); audio.writeUInt32LE(audio.length - 8, 4); audio.write("WAVEfmt ", 8);
  audio.writeUInt32LE(16, 16); audio.writeUInt16LE(1, 20); audio.writeUInt16LE(1, 22);
  audio.writeUInt32LE(24_000, 24); audio.writeUInt32LE(48_000, 28); audio.writeUInt16LE(2, 32); audio.writeUInt16LE(16, 34);
  audio.write("data", 36); audio.writeUInt32LE(audio.length - 44, 40);
  return audio;
}

test("landing demo lists supported languages and routes non-English speech", async ({ page }) => {
  await page.route("**/api/demo-tts", (route) => route.fulfill({
    status: 200,
    contentType: "audio/wav",
    body: sampleAudio(),
  }));
  await page.goto("/");

  const appStoreLinks = page.getByRole("link", { name: "Download VoiceReader on the App Store" });
  await expect(appStoreLinks).toHaveCount(2);
  await expect(appStoreLinks.first()).toHaveAttribute("href", "https://apps.apple.com/app/voicereader-text-to-speech/id6808351587");
  const canHover = await page.evaluate(() => matchMedia("(hover: hover)").matches);
  const storeLinks = [appStoreLinks.first(), appStoreLinks.last()];
  for (const link of storeLinks) {
    const download = link.locator("..");
    const qr = download.locator(".app-download-qr");
    await expect(qr).toBeHidden();
    await expect(qr.locator("svg path")).toHaveCount(1);
    if (canHover) {
      await link.hover();
      await expect(qr).toBeVisible();
      await page.getByRole("heading", { level: 1 }).hover();
      await expect(qr).toBeHidden();
    }
  }
  if (canHover) {
    await appStoreLinks.first().focus();
    await expect(appStoreLinks.first().locator("..").locator(".app-download-qr")).toBeVisible();
    await page.getByRole("heading", { level: 1 }).click();
  }
  const viewport = page.viewportSize()!;
  for (const link of storeLinks) {
    const bounds = await link.boundingBox();
    expect(bounds).not.toBeNull();
    expect(bounds!.x).toBeGreaterThanOrEqual(0);
    expect(bounds!.x + bounds!.width).toBeLessThanOrEqual(viewport.width);
  }
  await expect(page.getByRole("link", { name: "Create a voiceover" })).toHaveCount(0);
  await expect(page.getByRole("navigation", { name: "Main navigation" }).getByRole("link", { name: "Pricing" })).toHaveCount(0);

  const menu = page.locator(".hero-demo-language-popover");
  const languagesButton = page.getByRole("button", { name: "Supported Languages" });
  await expect(menu).toBeHidden();
  await languagesButton.hover();
  await expect(menu).toBeVisible();
  await page.getByRole("heading", { level: 1 }).hover();
  await expect(menu).toBeHidden();
  await languagesButton.click();
  await expect(menu).toBeVisible();
  // The popover opens below the trigger so the sticky header cannot clip it.
  const menuBox = await menu.boundingBox();
  const buttonBox = await languagesButton.boundingBox();
  expect(menuBox!.y).toBeGreaterThanOrEqual(buttonBox!.y + buttonBox!.height);
  const names = await menu.locator("li").allTextContents();
  expect(names).toHaveLength(32);
  expect(names).toEqual([...names].sort((first, second) => first.localeCompare(second, "en")));
  await languagesButton.click();
  await page.getByRole("heading", { level: 1 }).hover();
  await expect(menu).toBeHidden();

  await page.getByLabel("Sample text to narrate").fill("Bonjour l'ami");
  const requestPromise = page.waitForRequest("**/api/demo-tts");
  await page.getByRole("button", { name: "Play the sample" }).click();
  const body = (await requestPromise).postDataJSON();
  expect(body).toEqual({
    text: "Bonjour l'ami",
  });
  await expect.poll(() => page.locator(".hero-demo audio").evaluate((audio: HTMLAudioElement) => audio.readyState)).toBeGreaterThan(0);
  await expect(page.getByRole("dialog", { name: "Sign in to generate audio" })).toHaveCount(0);
});
