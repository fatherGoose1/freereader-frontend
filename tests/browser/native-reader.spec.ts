import { test, expect, type Page } from "@playwright/test";
import JSZip from "jszip";

const opening = "Once there were four children whose names were Peter, Susan, Edmund and Lucy. ";

async function epub() {
  const zip = new JSZip();
  zip.file("mimetype", "application/epub+zip");
  zip.file("META-INF/container.xml", '<?xml version="1.0"?><container xmlns="urn:oasis:names:tc:opendocument:xmlns:container" version="1.0"><rootfiles><rootfile full-path="OPS/book.opf" media-type="application/oebps-package+xml"/></rootfiles></container>');
  zip.file("OPS/book.opf", '<?xml version="1.0"?><package xmlns="http://www.idpf.org/2007/opf" version="3.0" unique-identifier="id"><metadata xmlns:dc="http://purl.org/dc/elements/1.1/"><dc:identifier id="id">native-test</dc:identifier><dc:title>Original EPUB</dc:title><dc:language>en</dc:language></metadata><manifest><item id="one" href="one.xhtml" media-type="application/xhtml+xml"/><item id="two" href="two.xhtml" media-type="application/xhtml+xml"/><item id="css" href="style.css" media-type="text/css"/><item id="image" href="picture.svg" media-type="image/svg+xml"/></manifest><spine><itemref idref="one"/><itemref idref="two"/></spine></package>');
  zip.file("OPS/style.css", 'body { font-family: Georgia, serif; } h1 { text-align: center; color: rgb(91, 45, 115); } p { text-indent: 1.5em; line-height: 1.6; } .subtitle { font-style: italic; text-align: center; } img { width: 80px; height: 40px; }');
  zip.file("OPS/picture.svg", '<svg xmlns="http://www.w3.org/2000/svg" width="80" height="40"><rect width="80" height="40" fill="#bad4c0"/></svg>');
  zip.file("OPS/one.xhtml", `<html xmlns="http://www.w3.org/1999/xhtml"><head><title>Chapter One</title><link rel="stylesheet" href="style.css"/></head><body><h1>Chapter One</h1><p class="subtitle">Lucy Looks Into a Wardrobe</p><img src="picture.svg" alt="Original illustration"/><p id="original-paragraph">${opening.repeat(12)}<em>The original emphasis stays here.</em></p></body></html>`);
  zip.file("OPS/two.xhtml", `<html xmlns="http://www.w3.org/1999/xhtml"><head><title>Chapter Two</title><link rel="stylesheet" href="style.css"/></head><body><h1>Chapter Two</h1><p>Another chapter opens with a different paragraph and the original layout is preserved.</p></body></html>`);
  return zip.generateAsync({ type: "nodebuffer" });
}

function pdf() {
  const pages = ["Original PDF page one keeps its typography and placement.", "Second page text is highlighted in the original PDF."];
  const objects = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    "<< /Type /Pages /Kids [3 0 R 5 0 R] /Count 2 >>",
    "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 7 0 R >> >> /Contents 4 0 R >>",
    `<< /Length ${`BT /F1 16 Tf 40 700 Td (${pages[0]}) Tj ET`.length} >>\nstream\nBT /F1 16 Tf 40 700 Td (${pages[0]}) Tj ET\nendstream`,
    "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 7 0 R >> >> /Contents 6 0 R >>",
    `<< /Length ${`BT /F1 16 Tf 40 700 Td (${pages[1]}) Tj ET`.length} >>\nstream\nBT /F1 16 Tf 40 700 Td (${pages[1]}) Tj ET\nendstream`,
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
  ];
  let output = "%PDF-1.4\n";
  const offsets = [0];
  objects.forEach((object, index) => { offsets.push(Buffer.byteLength(output)); output += `${index + 1} 0 obj\n${object}\nendobj\n`; });
  const xref = Buffer.byteLength(output);
  output += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n${offsets.slice(1).map((offset) => `${String(offset).padStart(10, "0")} 00000 n \n`).join("")}trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`;
  return Buffer.from(output);
}

function wav() {
  const audio = Buffer.alloc(44 + 24_000 * 20 * 2);
  audio.write("RIFF", 0); audio.writeUInt32LE(audio.length - 8, 4); audio.write("WAVEfmt ", 8);
  audio.writeUInt32LE(16, 16); audio.writeUInt16LE(1, 20); audio.writeUInt16LE(1, 22);
  audio.writeUInt32LE(24_000, 24); audio.writeUInt32LE(48_000, 28); audio.writeUInt16LE(2, 32); audio.writeUInt16LE(16, 34);
  audio.write("data", 36); audio.writeUInt32LE(audio.length - 44, 40);
  return audio;
}

async function setup(page: Page) {
  await page.route("**/api/telemetry", (route) => route.fulfill({ status: 202, json: {} }));
  await page.route("**/api/tts", async (route) => {
    const { texts } = route.request().postDataJSON() as { texts: string[] };
    if (texts.length === 1) return route.fulfill({ contentType: "audio/wav", body: wav(), headers: { "X-Audio-Duration": "20" } });
    const archive = new JSZip();
    texts.forEach((_, index) => archive.file(`${index}.m4a`, wav()));
    return route.fulfill({ contentType: "application/zip", body: await archive.generateAsync({ type: "nodebuffer" }), headers: { "X-Audio-Durations": texts.map(() => "20").join(",") } });
  });
  await page.goto("/reader/audiobooks");
}

async function chooseChapter(page: Page, title: string) {
  if (await page.getByLabel("Choose chapter").isVisible()) await page.getByLabel("Choose chapter").selectOption({ label: title });
  else await page.locator("aside").getByRole("button", { name: title, exact: true }).click();
}

async function openControls(page: Page) {
  const tools = page.getByRole("button", { name: "Expand reading tools" });
  if (await tools.isVisible()) await tools.click();
  const player = page.getByRole("button", { name: "Expand player controls" });
  if (await player.isVisible()) await player.click();
}

test("EPUB preserves publisher styling and images, follows chapters, and switches views without stopping playback", async ({ page }, testInfo) => {
  await setup(page);
  await page.locator('input[type="file"]').first().setInputFiles({ name: "original.epub", mimeType: "application/epub+zip", buffer: await epub() });
  await openControls(page);
  await expect(page.getByRole("button", { name: "Original", exact: true })).toHaveAttribute("aria-pressed", "true");
  const frame = page.frameLocator("article iframe").first();
  await expect(frame.locator("h1")).toHaveText("Chapter One");
  await expect(frame.locator("h1")).toHaveCSS("text-align", "center");
  await expect(frame.locator("h1")).toHaveCSS("color", "rgb(91, 45, 115)");
  await expect(frame.locator("#original-paragraph")).toHaveCount(1);
  await expect(frame.locator("em")).toHaveText("The original emphasis stays here.");
  await expect.poll(() => frame.locator("img").evaluate((img: HTMLImageElement) => img.complete && img.naturalWidth > 0)).toBe(true);
  await expect(page.locator("article .freereader-highlight")).toHaveCount(1);
  await page.screenshot({ path: testInfo.outputPath("native-epub.png") });
  await chooseChapter(page, "Chapter Two");
  await expect(frame.locator("h1")).toHaveText("Chapter Two");
  await page.getByRole("button", { name: "Listen", exact: true }).click();
  await expect.poll(() => page.locator("audio").evaluate((audio: HTMLAudioElement) => !audio.paused)).toBe(true);
  const currentSource = await page.locator("audio").evaluate((audio: HTMLAudioElement) => audio.currentSrc);
  await page.getByRole("button", { name: "E-reader", exact: true }).click();
  await expect(page.locator('article [aria-current="true"]')).toHaveText("Chapter Two");
  await expect(page.getByRole("button", { name: "Pause", exact: true })).toBeVisible();
  expect(await page.locator("audio").evaluate((audio: HTMLAudioElement) => audio.currentSrc)).toBe(currentSource);
  await page.getByRole("button", { name: "Original", exact: true }).click();
  await expect(frame.locator("h1")).toHaveText("Chapter Two");
  expect(await page.locator("audio").evaluate((audio: HTMLAudioElement) => audio.currentSrc)).toBe(currentSource);
  await page.getByRole("button", { name: "Pause", exact: true }).click();
  await page.getByRole("button", { name: "E-reader", exact: true }).click();
  await page.getByRole("button", { name: "Library", exact: true }).click();
  await page.reload();
  await page.getByRole("button", { name: /^epub Original EPUB/ }).click();
  await openControls(page);
  await expect(page.getByRole("button", { name: "E-reader", exact: true })).toHaveAttribute("aria-pressed", "true");
  await page.getByRole("button", { name: "Original", exact: true }).click();
  await expect(frame.locator("h1")).toHaveText("Chapter Two");
  await expect(page.locator("body")).toHaveJSProperty("scrollWidth", await page.evaluate(() => window.innerWidth));
});

test("PDF renders original pages with selectable text, highlights, navigation and a shared reading cursor", async ({ page }, testInfo) => {
  await setup(page);
  await page.locator('input[type="file"]').first().setInputFiles({ name: "Original PDF.pdf", mimeType: "application/pdf", buffer: pdf() });
  await openControls(page);
  const pages = page.getByRole("navigation", { name: "Original document pages" });
  await expect(pages).toContainText("Page 1 of 2");
  await expect(page.locator('article [class*="textLayer"]')).toContainText("Original PDF page one");
  await expect(page.locator('article [aria-label="Current passage"] span').first()).toBeVisible();
  await page.screenshot({ path: testInfo.outputPath("native-pdf.png") });
  await pages.getByRole("button", { name: "Next", exact: true }).click();
  await expect(pages).toContainText("Page 2 of 2");
  await expect(page.locator('article [class*="textLayer"]')).toContainText("Second page text");
  await expect(page.locator('article [aria-label="Current passage"] span').first()).toBeVisible();
  await page.getByRole("button", { name: "Zoom in", exact: true }).click();
  await expect(page.locator('article [aria-label="Current passage"] span').first()).toBeVisible();
  await page.getByRole("button", { name: "E-reader", exact: true }).click();
  await expect(page.locator('article [aria-current="true"]')).toHaveText("Second page text is highlighted in the original PDF.");
  await page.getByRole("button", { name: "Original", exact: true }).click();
  await expect(pages).toContainText("Page 2 of 2");
  await expect(page.locator('article [aria-label="Current passage"] span').first()).toBeVisible();
  await expect(page.locator("body")).toHaveJSProperty("scrollWidth", await page.evaluate(() => window.innerWidth));
});

test("older imports can attach their original file without replacing reading progress", async ({ page }) => {
  await setup(page);
  const buffer = pdf();
  await page.route("https://example.com/Original.pdf", (route) => route.fulfill({ contentType: "application/pdf", headers: { "Access-Control-Allow-Origin": "*" }, body: buffer }));
  const mobileAdd = page.getByRole("button", { name: "Add reading", exact: true });
  if (await mobileAdd.isVisible()) await mobileAdd.click();
  await page.locator("button:visible").filter({ hasText: "Web Link" }).click();
  await page.getByLabel("Article or document URL").fill("https://example.com/Original.pdf");
  await page.getByRole("button", { name: "Import link", exact: true }).click();
  await openControls(page);
  await expect(page.getByRole("button", { name: "E-reader", exact: true })).toHaveAttribute("aria-pressed", "true");
  await page.locator("article p").filter({ hasText: "Second page text" }).click();
  await page.getByRole("button", { name: "Original", exact: true }).click();
  await expect(page.getByRole("button", { name: "Attach original file", exact: true })).toBeVisible();
  await page.getByLabel("Attach original file", { exact: true }).setInputFiles({ name: "Original.pdf", mimeType: "application/pdf", buffer });
  await expect(page.getByRole("navigation", { name: "Original document pages" })).toContainText("Page 2 of 2");
  await expect(page.locator('article [aria-label="Current passage"] span').first()).toBeVisible();
});

test("full EPUB maps chapter passages and advances highlights with audio playback", async ({ page }, testInfo) => {
  await setup(page);
  await page.locator('input[type="file"]').first().setInputFiles("lewis-lion-the-witch-and-the-wardrobe.epub");
  await openControls(page);
  await expect(page.locator("article iframe")).toHaveCount(1);
  await chooseChapter(page, "Chapter I");
  const frame = page.frameLocator("article iframe");
  await expect(frame.locator("body")).toContainText("Lucy Looks Into a Wardrobe");
  await expect(page.locator("article .freereader-highlight")).toHaveCount(1);
  await page.getByRole("button", { name: "Listen", exact: true }).click();
  await expect.poll(() => page.locator("audio").evaluate((audio: HTMLAudioElement) => !audio.paused && Number.isFinite(audio.duration) && audio.duration > 0)).toBe(true);
  const firstSource = await page.locator("audio").evaluate((audio: HTMLAudioElement) => audio.currentSrc);
  await page.locator("audio").evaluate((audio: HTMLAudioElement) => { audio.currentTime = audio.duration - 0.03; });
  await expect.poll(() => page.locator("audio").evaluate((audio: HTMLAudioElement, source) => audio.currentSrc !== source && audio.currentTime < 5 && !audio.paused, firstSource)).toBe(true);
  await page.getByRole("button", { name: "Pause", exact: true }).click();
  await page.getByRole("button", { name: "E-reader", exact: true }).click();
  await expect(page.locator('article [aria-current="true"]')).toHaveText("Lucy Looks Into a Wardrobe");
  await page.getByRole("button", { name: "Original", exact: true }).click();
  await expect(page.locator("article .freereader-highlight")).toHaveCount(1);
  await chooseChapter(page, "Chapter XVII");
  await expect(frame.locator("body")).toContainText("Chapter XVII");
  await expect(page.locator("article .freereader-highlight")).toHaveCount(1);
  await page.screenshot({ path: testInfo.outputPath("full-epub.png") });
  const pages = page.getByRole("navigation", { name: "Original document pages" });
  await expect(pages.getByRole("button", { name: "Next", exact: true })).toBeVisible();
  const previousPage = await pages.textContent();
  await pages.getByRole("button", { name: "Next", exact: true }).click();
  await expect(pages).not.toHaveText(previousPage!);
  await expect(page.locator("article .freereader-highlight")).toHaveCount(1);
  await page.getByRole("button", { name: "E-reader", exact: true }).click();
  await expect(page.locator('article [aria-current="true"]')).not.toHaveText("Chapter XVII");
});

test("full PDF highlights a resumed passage on its source page", async ({ page }, testInfo) => {
  await setup(page);
  await page.locator('input[type="file"]').first().setInputFiles("119-2014-04-09-Jane Eyre.pdf");
  await openControls(page);
  const progress = page.getByRole("slider", { name: "Book playback progress" });
  await progress.fill("0.5");
  const pages = page.getByRole("navigation", { name: "Original document pages" });
  await expect(pages).not.toContainText("Page 1 of");
  await expect(page.locator('article [aria-label="Current passage"] span').first()).toBeVisible();
  const nativePage = await pages.textContent();
  await page.getByRole("button", { name: "E-reader", exact: true }).click();
  const passage = await page.locator('article [aria-current="true"]').textContent();
  expect(passage!.length).toBeGreaterThan(30);
  await page.getByRole("button", { name: "Original", exact: true }).click();
  await expect(pages).toHaveText(nativePage!);
  await expect(page.locator('article [aria-label="Current passage"] span').first()).toBeVisible();
  await page.screenshot({ path: testInfo.outputPath("full-pdf.png") });
});
