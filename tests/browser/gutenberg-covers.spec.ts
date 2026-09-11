import { test, expect } from "@playwright/test";

// Live Project Gutenberg OPDS feed, matching the existing Free Books flow.
test("Free Books covers load through the same-origin proxy under COEP", async ({ page }) => {
  const blocked: string[] = [];
  const externalCovers: string[] = [];
  page.on("requestfailed", (request) => {
    if (/NotSameOriginAfterDefaultedToSameOriginByCoep/.test(request.failure()?.errorText ?? "")) {
      blocked.push(request.url());
    }
  });
  page.on("request", (request) => {
    if (/gutenberg\.org\/cache\/epub\/.*cover/i.test(request.url())) externalCovers.push(request.url());
  });

  await page.goto("/reader");
  await page.getByRole("button", { name: /Free Books/ }).first().click();
  const covers = page.locator("main article img");
  await expect.poll(() => covers.count(), { timeout: 30_000 }).toBeGreaterThan(0);
  await expect.poll(async () => covers.first().evaluate((image: HTMLImageElement) => image.naturalWidth), { timeout: 30_000 }).toBeGreaterThan(0);

  expect(await page.evaluate(() => crossOriginIsolated)).toBe(true);
  expect(blocked).toEqual([]);
  expect(externalCovers).toEqual([]);
  expect(await covers.first().getAttribute("src")).toMatch(/^\/api\/gutenberg\/cover\/\d+$/);
});
