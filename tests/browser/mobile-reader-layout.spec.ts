import { test, expect, type Page } from "@playwright/test";

function layoutPdf(): Buffer {
  const text = "BT /F1 18 Tf 40 700 Td (Chapter One) Tj /F1 14 Tf 0 -50 Td (A readable passage for checking the reader layout and controls.) Tj ET";
  const objects = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
    "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 5 0 R >> >> /Contents 4 0 R >>",
    `<< /Length ${text.length} >>\nstream\n${text}\nendstream`,
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
  ];
  let pdf = "%PDF-1.4\n";
  const offsets: number[] = [];
  objects.forEach((object, index) => { offsets.push(Buffer.byteLength(pdf)); pdf += `${index + 1} 0 obj\n${object}\nendobj\n`; });
  const xref = Buffer.byteLength(pdf);
  pdf += `xref\n0 6\n0000000000 65535 f \n${offsets.map((offset) => `${String(offset).padStart(10, "0")} 00000 n \n`).join("")}trailer\n<< /Size 6 /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`;
  return Buffer.from(pdf);
}

async function openReader(page: Page) {
  await page.addInitScript(() => localStorage.setItem("freereader-library-reminder-dismissed", "true"));
  await page.route("**/api/telemetry", (route) => route.fulfill({ status: 202, json: {} }));
  await page.goto("/reader/audiobooks");
  await page.locator('input[type="file"]').first().setInputFiles({ name: "Mobile Layout.pdf", mimeType: "application/pdf", buffer: layoutPdf() });
  await expect(page.locator("article canvas")).toBeVisible();
}

test("mobile keeps the PDF wide and collapses the player and all side tools", async ({ page }, testInfo) => {
  test.skip((testInfo.project.use.viewport?.width ?? 1280) > 800, "Mobile layout only");
  await openReader(page);
  const reader = page.locator("main[data-mobile-reader]");
  await expect(reader.locator('[class*="readerTitle"]')).toBeHidden();
  await expect(page.getByLabel("Choose chapter")).toBeVisible();
  await expect(page.locator("#reader-player-details")).toBeHidden();
  await expect(page.getByRole("button", { name: "Listen", exact: true })).toBeVisible();
  const width = await page.evaluate(() => window.innerWidth);
  await expect.poll(() => page.locator("article canvas").evaluate((canvas) => canvas.clientWidth)).toBeGreaterThan(width * 0.9);
  const closedHeight = (await page.locator("article").boundingBox())!.height;
  await page.getByRole("button", { name: "Expand player controls" }).click();
  await expect(page.locator("#reader-player-details")).toBeVisible();
  await expect(page.locator("#reader-player-details").getByRole("button", { name: "Voice", exact: true })).toHaveCount(0);
  const expandedHeight = (await page.locator("article").boundingBox())!.height;
  expect(closedHeight).toBeGreaterThan(expandedHeight + 70);
  await page.getByRole("button", { name: "Collapse player controls" }).click();
  await expect(page.locator("#reader-player-details")).toBeHidden();

  await expect(page.getByRole("link", { name: "Support FreeReader" })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Contact support", exact: true })).toHaveCount(0);
  await expect(page.getByRole("navigation", { name: "Original document pages" })).toHaveCount(0);
  await page.getByRole("button", { name: "Expand reading tools" }).click();
  await expect(page.getByRole("button", { name: "Original", exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Voice", exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Font", exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Zoom in" })).toBeVisible();
  const tools = (await page.locator("#reader-reading-tools").boundingBox())!;
  expect(tools.x).toBeGreaterThan(width - 110);
  await expect.poll(() => page.locator("article canvas").evaluate((canvas) => canvas.clientWidth)).toBeGreaterThan(width * 0.9);
  await page.getByRole("button", { name: "Contact support", exact: true }).click();
  await expect(page.getByRole("dialog", { name: "Contact support" })).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog", { name: "Contact support" })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Contact support", exact: true })).toBeFocused();
  await expect.poll(async () => (await reader.locator('[class*="readerTop"]').boundingBox())!.y).toBeGreaterThanOrEqual(0);
  await page.getByRole("button", { name: "Collapse reading tools" }).click();
  await expect(page.locator("#reader-reading-tools")).toBeHidden();
  await page.screenshot({ path: testInfo.outputPath("compact-mobile-reader.png") });
  await page.getByRole("button", { name: "Library", exact: true }).click();
  await expect(page.getByRole("button", { name: "Contact support", exact: true })).toBeVisible();
});

test("desktop retains its title, full player and existing side controls", async ({ page }, testInfo) => {
  test.skip((testInfo.project.use.viewport?.width ?? 1280) <= 800, "Desktop layout only");
  await openReader(page);
  await expect(page.locator('[class*="readerTitle"]')).toBeVisible();
  await expect(page.getByRole("button", { name: "Expand reading tools" })).toBeHidden();
  await expect(page.getByRole("button", { name: "Expand player controls" })).toBeHidden();
  await expect(page.locator("#reader-reading-tools").getByRole("button", { name: "Voice", exact: true })).toBeVisible();
  await expect(page.locator("#reader-reading-tools").getByRole("button", { name: "Font", exact: true })).toBeVisible();
  await expect(page.getByRole("slider", { name: "Book playback progress" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Original", exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Zoom in" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Contact support", exact: true })).toBeVisible();
  const controls = ["Font", "Voice", "Full screen", "Zoom out", "Zoom in"];
  const boxes = await Promise.all(controls.map((name) => page.getByRole("button", { name, exact: true }).boundingBox()));
  expect(boxes.every((box) => box && Math.abs(box.y - boxes[0]!.y) < 2)).toBe(true);
  expect(boxes.map((box) => box!.x)).toEqual([...boxes.map((box) => box!.x)].sort((a, b) => a - b));
  const background = await page.getByRole("button", { name: "Zoom in" }).evaluate((element) => getComputedStyle(element).backgroundColor);
  for (const name of ["Font", "Voice", "Full screen"]) {
    await expect(page.getByRole("button", { name, exact: true })).toHaveCSS("background-color", background);
  }
  await page.locator('[class*="readingToolbarActions"]').screenshot({ path: testInfo.outputPath("toolbar-controls.png") });
});

test("full screen opens Original PDF without its surrounding chrome", async ({ page }, testInfo) => {
  await openReader(page);
  const tools = page.getByRole("button", { name: "Expand reading tools" });
  if (await tools.isVisible()) await tools.click();
  const before = (await page.locator("article").boundingBox())!;
  await page.getByRole("button", { name: "Full screen" }).click();
  await expect(page.getByRole("button", { name: "Exit full screen" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Contact support", exact: true })).toBeHidden();
  await expect(page.getByRole("navigation", { name: "Original document pages" })).toBeVisible();
  await expect(page.locator("#reader-reading-tools")).toBeHidden();
  const expanded = (await page.locator("article").boundingBox())!;
  expect(expanded.height).toBeGreaterThan(before.height + 40);
  expect(expanded.width).toBeGreaterThan((await page.evaluate(() => innerWidth)) - 2);
  await page.screenshot({ path: testInfo.outputPath("full-screen-reading.png") });
  await page.getByRole("button", { name: "Exit full screen" }).click();
  await expect(page.getByRole("button", { name: "Original", exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Contact support", exact: true })).toBeVisible();
});
