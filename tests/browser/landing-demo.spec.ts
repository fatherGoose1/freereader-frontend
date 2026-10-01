import { expect, test } from "@playwright/test";

test("landing demo lists supported languages and routes non-English speech", async ({ page }) => {
  await page.route("**/api/tts", (route) => route.fulfill({
    status: 200,
    contentType: "audio/mp4",
    body: "mock audio",
  }));
  await page.goto("/");

  const appStoreLinks = page.getByRole("link", { name: "Download VoiceReader on the App Store" });
  await expect(appStoreLinks).toHaveCount(2);
  await expect(appStoreLinks.first()).toHaveAttribute("href", "https://apps.apple.com/app/voicereader-text-to-speech/id6808351587");
  await expect(page.getByRole("link", { name: "Create a voiceover" })).toHaveCount(0);

  const menu = page.locator(".hero-demo-language-popover");
  const languagesButton = page.getByRole("button", { name: "Supported Languages" });
  await expect(menu).toBeHidden();
  await languagesButton.hover();
  await expect(menu).toBeVisible();
  await page.getByRole("heading", { level: 1 }).hover();
  await expect(menu).toBeHidden();
  await languagesButton.click();
  await expect(menu).toBeVisible();
  const names = await menu.locator("li").allTextContents();
  expect(names).toHaveLength(31);
  expect(names).toEqual([...names].sort((first, second) => first.localeCompare(second, "en")));

  await page.getByLabel("Sample text to narrate").fill("Bonjour l'ami");
  const requestPromise = page.waitForRequest("**/api/tts");
  await page.getByRole("button", { name: "Play the sample" }).click();
  const body = (await requestPromise).postDataJSON();
  expect(body).toEqual({
    text: "Bonjour l'ami",
    speed: 1,
    detectLanguage: true,
    steps: 12,
  });
});
