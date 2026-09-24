import { test, expect, type Page } from "@playwright/test";

const paragraph = "Reading gives us a little time to pause and discover a different perspective. A good book can turn an ordinary afternoon into something memorable. ";

async function upload(page: Page, title: string, chapters = 1) {
  await page.locator('input[type="file"]').setInputFiles({
    name: `${title}.html`, mimeType: "text/html",
    buffer: Buffer.from(`<html lang="en"><title>${title}</title><body>${Array.from({ length: chapters }, (_, i) => `<h1>Chapter ${i + 1}</h1><p>${paragraph.repeat(7)}</p>`).join("")}</body></html>`),
  });
  await expect(page.getByRole("button", { name: new RegExp(`^html ${title}`) })).toBeVisible();
}

test.beforeEach(async ({ page }) => {
  await page.route("**/api/telemetry", (route) => route.fulfill({ status: 202, json: {} }));
  await page.goto("/reader/audiobooks");
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

test("page navigation, text sizing, settings and resume preserve the reading position", async ({ page }, testInfo) => {
  await upload(page, "A Quiet Afternoon", 4);
  await page.getByRole("button", { name: /^html A Quiet Afternoon/ }).click();
  const pages = page.getByRole("navigation", { name: "Reading pages" });
  await expect(pages.getByRole("button", { name: "Previous" })).toBeDisabled();
  await pages.getByRole("button", { name: "Next", exact: true }).click();
  await expect(pages).toContainText("Page 2 of");
  const position = await page.locator('article [aria-current="true"]').textContent();
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
  await expect(page.locator('article [aria-current="true"]')).toHaveText(position!);
  await expect(pages).toContainText("Page 2 of");
  await expect(page.locator("body")).toHaveJSProperty("scrollWidth", await page.evaluate(() => window.innerWidth));
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
  await page.getByRole("button", { name: /^txt Listen/ }).click();
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
  await expect(page.getByRole("button", { name: /^txt My first book/ })).toBeVisible();
});
