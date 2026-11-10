import { expect, test } from "@playwright/test";

test("landing headline rotates competitors without shifting the layout", async ({ page }) => {
  await page.goto("/");
  const heading = page.getByRole("heading", { level: 1, name: /Faster than Speechify, ElevenReader, or NaturalReader\. Less than half the price/ });
  await expect(heading).toBeVisible();
  await expect(page.locator(".hero-copy .lead")).toHaveText(
    "Listen to books, documents, and articles in seconds, with natural voices and accessibility features to make reading easy.");
  await expect(page.locator(".hero-assurances")).toHaveCount(0);
  await expect(heading.locator(".hero-comparison-punctuation")).toHaveCount(0);
  const appStore = page.locator(".hero-actions .app-store-button--apple");
  const chromeStore = page.locator(".hero-actions .app-store-button--chrome");
  await expect(appStore).toContainText("Download on theApp Store");
  await expect(chromeStore).toContainText("Get it on theChrome Web Store");
  expect(await appStore.evaluate((element) => getComputedStyle(element).backgroundColor)).toBe("rgb(5, 5, 5)");
  expect(await chromeStore.evaluate((element) => getComputedStyle(element).backgroundColor)).toBe("rgb(255, 255, 255)");
  expect(await chromeStore.locator("svg path[fill]").count()).toBe(3);
  const names = heading.locator(".hero-competitor span");
  await expect(names).toHaveText(["Speechify", "ElevenReader", "NaturalReader"]);
  const slot = heading.locator(".hero-competitor");
  const initialWidth = (await slot.boundingBox())!.width;
  await expect.poll(() => names.evaluateAll((items) => items.findIndex((item) => Number(getComputedStyle(item).opacity) > .9)),
    { timeout: 5_000 }).toBe(0);
  await expect.poll(() => names.evaluateAll((items) => items.findIndex((item) => Number(getComputedStyle(item).opacity) > .9)),
    { timeout: 5_000 }).toBe(1);
  expect((await slot.boundingBox())!.width).toBe(initialWidth);
  await expect.poll(() => names.evaluateAll((items) => items.findIndex((item) => Number(getComputedStyle(item).opacity) > .9)),
    { timeout: 5_000 }).toBe(2);
  expect((await slot.boundingBox())!.width).toBe(initialWidth);
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(page.viewportSize()!.width);
  await page.setViewportSize({ width: 320, height: 740 });
  const narrowSlot = await slot.boundingBox();
  expect(narrowSlot!.x).toBeGreaterThanOrEqual(0);
  expect(narrowSlot!.x + narrowSlot!.width).toBeLessThanOrEqual(320);
});

test("reduced motion keeps the comparison still", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/");
  const names = page.locator(".hero-competitor span");
  await expect.poll(() => names.evaluateAll((items) => items.map((item) => getComputedStyle(item).opacity)))
    .toEqual(["1", "0", "0"]);
});
