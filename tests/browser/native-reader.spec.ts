import { test, expect, type Page } from "@playwright/test";
import JSZip from "jszip";
import { spokenWords } from "../../app/reader/spokenWord";

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
    const { texts, word_timings } = route.request().postDataJSON() as { texts: string[]; word_timings?: boolean };
    if (word_timings) {
      const archive = new JSZip();
      texts.forEach((text, index) => {
        archive.file(`${index}.m4a`, wav());
        const words = spokenWords(text);
        archive.file(`${index}.json`, JSON.stringify(words.map((_, wordIndex) => [wordIndex,
          wordIndex ? 8 + (wordIndex - 1) * 12 / Math.max(1, words.length - 1) : 0,
          wordIndex ? 8 + wordIndex * 12 / Math.max(1, words.length - 1) : 8])));
      });
      return route.fulfill({ contentType: "application/zip", body: await archive.generateAsync({ type: "nodebuffer" }),
        headers: { "X-Audio-Durations": texts.map(() => "20").join(",") } });
    }
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

async function openControls(page: Page, expandPlayer = false) {
  // setInputFiles dispatches change before asynchronous parsing/opening finishes.
  await expect(page.locator("article")).toBeVisible();
  const tools = page.getByRole("button", { name: "Expand reading tools" });
  if (await tools.isVisible()) await tools.click();
  const player = page.getByRole("button", { name: "Expand player controls" });
  if (expandPlayer && await player.isVisible()) await player.click();
}

async function eReaderSpokenWord(page: Page) {
  return page.evaluate(() => Array.from(CSS.highlights.get("freereader-spoken-word") ?? [], (range) => range.toString())[0] ?? "");
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
  const desktopSpread = await page.evaluate(() => window.innerWidth > 800);
  await expect(pages).toContainText(desktopSpread ? "Pages 1–2 of 2" : "Page 1 of 2");
  await expect(page.locator('article [class*="textLayer"]').first()).toContainText("Original PDF page one");
  await expect(page.locator('article [aria-label="Current passage"] span').first()).toBeVisible();
  await page.screenshot({ path: testInfo.outputPath("native-pdf.png") });
  if (desktopSpread) {
    await expect(page.getByLabel("Original PDF page 2", { exact: true })).toBeVisible();
    await page.locator('article [class*="textLayer"] span').filter({ hasText: "Second page text" }).click();
  } else {
    await pages.getByRole("button", { name: "Next", exact: true }).click();
  }
  await expect(pages).toContainText(desktopSpread ? "Pages 1–2 of 2" : "Page 2 of 2");
  await expect(page.locator('article [class*="textLayer"]').filter({ hasText: "Second page text" }).first()).toContainText("Second page text");
  await expect(page.locator('article [aria-label="Current passage"] span').first()).toBeVisible();
  await page.getByRole("button", { name: "Zoom in", exact: true }).click();
  await expect(page.locator('article [aria-label="Current passage"] span').first()).toBeVisible();
  await page.getByRole("button", { name: "E-reader", exact: true }).click();
  await expect(page.locator('article [aria-current="true"]')).toHaveText("Second page text is highlighted in the original PDF.");
  await page.getByRole("button", { name: "Original", exact: true }).click();
  await expect(pages).toContainText(desktopSpread ? "Pages 1–2 of 2" : "Page 2 of 2");
  await expect(page.locator('article [aria-label="Current passage"] span').first()).toBeVisible();
  await expect(page.locator("body")).toHaveJSProperty("scrollWidth", await page.evaluate(() => window.innerWidth));
});

test("clicking text in Original EPUB selects its passage for the E-reader", async ({ page }) => {
  await setup(page);
  await page.locator('input[type="file"]').first().setInputFiles({ name: "original.epub", mimeType: "application/epub+zip", buffer: await epub() });
  const frame = page.frameLocator("article iframe").first();
  await expect(frame.locator("#original-paragraph")).toBeVisible();
  await frame.locator("#original-paragraph").click({ position: { x: 80, y: 12 } });
  await openControls(page);
  await page.getByRole("button", { name: "E-reader", exact: true }).click();
  await expect(page.locator('article p[aria-current="true"]')).toContainText("Once there were four children");
});

test("tapping an Original EPUB paragraph outside its glyphs selects that section", async ({ page }) => {
  await setup(page);
  await page.locator('input[type="file"]').first().setInputFiles({ name: "original.epub", mimeType: "application/epub+zip", buffer: await epub() });
  await openControls(page);
  await chooseChapter(page, "Chapter Two");
  const collapse = page.getByRole("button", { name: "Collapse reading tools" });
  if (await collapse.isVisible()) await collapse.click();
  const paragraph = page.frameLocator("article iframe").first().getByText("Another chapter opens with a different paragraph");
  await expect(paragraph).toBeVisible();
  const box = await paragraph.boundingBox();
  await paragraph.click({ position: { x: box!.width - 8, y: box!.height / 2 } });
  await openControls(page);
  await page.getByRole("button", { name: "E-reader", exact: true }).click();
  await expect(page.locator('article p[aria-current="true"]')).toContainText("Another chapter opens");
});

test("clicking text in Original PDF selects its passage for the E-reader", async ({ page }) => {
  await setup(page);
  await page.locator('input[type="file"]').first().setInputFiles({ name: "Original PDF.pdf", mimeType: "application/pdf", buffer: pdf() });
  const secondPage = page.locator('article [class*="textLayer"]').filter({ hasText: "Second page text" });
  await expect(secondPage).toContainText("Second page text");
  await secondPage.getByText("Second page text is highlighted in the original PDF.").click();
  await openControls(page);
  await page.getByRole("button", { name: "E-reader", exact: true }).click();
  await expect(page.locator('article p[aria-current="true"]')).toHaveText("Second page text is highlighted in the original PDF.");
});

test("clicking alongside text in Original PDF selects that line's section", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "desktop-chromium", "Both source pages must be visible in the same spread");
  await setup(page);
  await page.locator('input[type="file"]').first().setInputFiles({ name: "Original PDF.pdf", mimeType: "application/pdf", buffer: pdf() });
  const firstPage = page.locator('article [class*="textLayer"]').filter({ hasText: "Original PDF page one" });
  const secondPage = page.locator('article [class*="textLayer"]').filter({ hasText: "Second page text" });
  await secondPage.getByText("Second page text is highlighted in the original PDF.").click();
  const bounds = await firstPage.boundingBox();
  const line = await firstPage.getByText("Original PDF page one keeps its typography and placement.").boundingBox();
  await firstPage.click({ position: { x: bounds!.width - 20, y: line!.y - bounds!.y + line!.height / 2 } });
  await openControls(page);
  await page.getByRole("button", { name: "E-reader", exact: true }).click();
  await expect(page.locator('article p[aria-current="true"]')).toHaveText("Original PDF page one keeps its typography and placement.");
});

test("the spoken word advances inside the highlighted passage in both native and E-reader views", async ({ page }) => {
  await setup(page);
  await page.locator('input[type="file"]').first().setInputFiles({ name: "original.epub", mimeType: "application/epub+zip", buffer: await epub() });
  await openControls(page);
  const passage = page.locator("article .freereader-highlight");
  await expect(passage).toHaveCount(1);
  await page.getByRole("button", { name: "Listen", exact: true }).click();
  const word = page.locator("article .freereader-spoken-word");
  await expect(word).toHaveCount(1);
  await expect(passage).toHaveCount(1);
  const firstWord = await word.evaluate((element) => element.outerHTML);
  await page.locator("audio").evaluate((audio: HTMLAudioElement) => { audio.currentTime = 3; });
  await expect(word).toHaveCount(1);
  expect(await word.evaluate((element) => element.outerHTML)).toBe(firstWord);
  await page.locator("audio").evaluate((audio: HTMLAudioElement) => { audio.currentTime = audio.duration * 0.7; });
  await expect.poll(() => word.evaluate((element) => element.outerHTML)).not.toBe(firstWord);
  await page.getByRole("button", { name: "E-reader", exact: true }).click();
  await expect.poll(() => page.evaluate(() => Array.from(CSS.highlights.get("freereader-spoken-word") ?? [], (range) => range.toString()).length)).toBe(1);
  await page.getByRole("button", { name: "Pause", exact: true }).click();
  await expect.poll(() => page.evaluate(() => CSS.highlights.has("freereader-spoken-word"))).toBe(false);
  await page.getByRole("button", { name: "Original", exact: true }).click();
  await expect(word).toHaveCount(0);
  await expect(passage).toHaveCount(1);
  await page.getByRole("button", { name: "Library", exact: true }).click();
  await page.getByRole("button", { name: /^epub Original EPUB/ }).click();
  await openControls(page);
  await page.getByRole("button", { name: "Listen", exact: true }).click();
  await expect(word).toHaveCount(1); // Cached audio retains its timing sidecar.
});

test("word highlighting can be switched off without stopping audio and stays off after reopening", async ({ page }) => {
  await setup(page);
  const mobileAdd = page.getByRole("button", { name: "Add reading", exact: true });
  if (await mobileAdd.isVisible()) await mobileAdd.click();
  await page.locator("button:visible").filter({ hasText: "Insert Text" }).click();
  await page.getByLabel("Title (optional)").fill("Toggle Highlight Test");
  await page.getByLabel("Text", { exact: true }).fill("A short passage about reading a book in the correct order.");
  await page.getByRole("button", { name: "Add to Library", exact: true }).click();
  await openControls(page, true);
  await expect(page.locator('article [aria-current="true"]')).toBeVisible();
  await page.getByRole("button", { name: "Voice", exact: true }).click();
  const toggle = page.getByRole("switch", { name: "Highlight spoken words" });
  await expect(toggle).toBeChecked();
  await page.getByRole("button", { name: "Done" }).click();
  await page.getByRole("button", { name: "Listen", exact: true }).click();
  await expect.poll(() => page.locator("audio").evaluate((audio: HTMLAudioElement) => !audio.paused)).toBe(true);
  await expect.poll(() => eReaderSpokenWord(page)).not.toBe("");
  const source = await page.locator("audio").evaluate((audio: HTMLAudioElement) => audio.currentSrc);
  await page.getByRole("button", { name: "Voice", exact: true }).click();
  await toggle.uncheck();
  await expect.poll(() => eReaderSpokenWord(page)).toBe("");
  await expect(page.locator('article [aria-current="true"]')).toBeVisible();
  await toggle.check();
  await expect.poll(() => eReaderSpokenWord(page)).not.toBe("");
  await toggle.uncheck();
  expect(await page.locator("audio").evaluate((audio: HTMLAudioElement) => audio.currentSrc)).toBe(source);
  await page.getByRole("button", { name: "Done" }).click();
  await page.reload();
  await page.getByRole("button", { name: /^txt Toggle Highlight Test/ }).click();
  await openControls(page, true);
  await page.getByRole("button", { name: "Voice", exact: true }).click();
  await expect(toggle).not.toBeChecked();
});

test("OpenDyslexic switches E-reader and Original EPUB text and persists without changing Original PDF", async ({ page }) => {
  const dyslexicFamily = /^"?FreeReader OpenDyslexic"?, sans-serif$/;
  await setup(page);
  await page.locator('input[type="file"]').first().setInputFiles({ name: "original.epub", mimeType: "application/epub+zip", buffer: await epub() });
  await openControls(page);
  const frame = page.frameLocator("article iframe").first();
  const heading = frame.locator("h1");
  await expect(heading).toHaveCSS("font-family", "Georgia, serif");
  await openControls(page, true);
  await page.getByRole("button", { name: "Voice", exact: true }).click();
  const toggle = page.getByRole("switch", { name: "OpenDyslexic font" });
  await expect(toggle).not.toBeChecked();
  await toggle.check();
  await expect(heading).toHaveCSS("font-family", dyslexicFamily);
  await expect.poll(() => frame.locator("body").evaluate((body) => body.ownerDocument.fonts.check('20px "FreeReader OpenDyslexic"'))).toBe(true);
  await toggle.uncheck();
  await expect(heading).toHaveCSS("font-family", "Georgia, serif");
  await toggle.check();
  await expect(heading).toHaveCSS("font-family", dyslexicFamily);
  await page.getByRole("button", { name: "Done" }).click();
  await chooseChapter(page, "Chapter Two");
  await expect(frame.locator("h1")).toHaveText("Chapter Two");
  await expect(frame.locator("h1")).toHaveCSS("font-family", dyslexicFamily);
  const dyslexicSize = await frame.locator("h1").evaluate((element) => parseFloat(getComputedStyle(element).fontSize));
  await page.getByRole("button", { name: "Voice", exact: true }).click();
  await toggle.uncheck();
  await expect(frame.locator("h1")).toBeVisible();
  const regularSize = await frame.locator("h1").evaluate((element) => parseFloat(getComputedStyle(element).fontSize));
  expect(dyslexicSize / regularSize).toBeCloseTo(0.85, 1);
  await toggle.check();
  await expect(frame.locator("h1")).toBeVisible();
  await page.getByRole("button", { name: "Done" }).click();
  await page.getByRole("button", { name: "Increase text size" }).click();
  await expect(frame.locator("h1")).toBeVisible();
  await page.getByRole("button", { name: "E-reader", exact: true }).click();
  await expect(page.locator('article [aria-current="true"]')).toHaveCSS("font-family", dyslexicFamily);
  await page.getByRole("button", { name: "Voice", exact: true }).click();
  await toggle.uncheck();
  await expect(page.locator('article [aria-current="true"]')).toHaveCSS("font-family", "Georgia, serif");
  await toggle.check();
  await page.getByRole("button", { name: "Done" }).click();
  await page.getByRole("button", { name: "Library", exact: true }).click();
  await page.reload();
  await page.getByRole("button", { name: /^epub Original EPUB/ }).click();
  await openControls(page, true);
  await expect(page.locator('article [aria-current="true"]')).toHaveCSS("font-family", dyslexicFamily);
  await page.getByRole("button", { name: "Original", exact: true }).click();
  await expect(frame.locator("h1")).toHaveText("Chapter Two");
  await expect(frame.locator("h1")).toHaveCSS("font-family", dyslexicFamily);
  await page.getByRole("button", { name: "Library", exact: true }).click();
  await page.locator('input[type="file"]').first().setInputFiles({ name: "original.pdf", mimeType: "application/pdf", buffer: pdf() });
  await expect(page.getByLabel("Original PDF page 1")).toBeVisible();
  await openControls(page, true);
  await page.getByRole("button", { name: "Voice", exact: true }).click();
  await expect(toggle).toBeChecked();
  await expect(page.getByText("Original PDF keeps the font embedded in the document.", { exact: false })).toBeVisible();
  await page.getByRole("button", { name: "Done" }).click();
  await expect(page.getByLabel("Original PDF page 1")).toBeVisible();
  await page.getByRole("button", { name: "E-reader", exact: true }).click();
  await expect(page.locator('article [aria-current="true"]')).toHaveCSS("font-family", dyslexicFamily);
});

test("short spoken words are highlighted between sparse audio timeupdate events", async ({ page }) => {
  await setup(page);
  const text = "I am in on at to be or we go.";
  await page.route("**/api/tts", async (route) => {
    const archive = new JSZip();
    archive.file("0.m4a", wav());
    archive.file("0.json", JSON.stringify(spokenWords(text).map((_, index) =>
      [index, 1 + index * .12, 1 + (index + 1) * .12])));
    await route.fulfill({ contentType: "application/zip", body: await archive.generateAsync({ type: "nodebuffer" }),
      headers: { "X-Audio-Durations": "20" } });
  });
  const mobileAdd = page.getByRole("button", { name: "Add reading", exact: true });
  if (await mobileAdd.isVisible()) await mobileAdd.click();
  await page.locator("button:visible").filter({ hasText: "Insert Text" }).click();
  await page.getByLabel("Title (optional)").fill("Short Word Test");
  await page.getByLabel("Text", { exact: true }).fill(text);
  await page.getByRole("button", { name: "Add to Library", exact: true }).click();
  await openControls(page, true);
  await page.locator("article p").filter({ hasText: text }).click();
  await page.getByRole("button", { name: "Listen", exact: true }).click();
  await expect.poll(() => page.locator("audio").evaluate((audio: HTMLAudioElement) => !audio.paused)).toBe(true);
  const highlighted = await page.evaluate(async () => {
    const audio = document.querySelector("audio")!;
    const seen = new Set<string>();
    const observe = () => {
      const word = Array.from(CSS.highlights.get("freereader-spoken-word") ?? [], (range) => range.toString())[0];
      if (word) seen.add(word);
    };
    audio.currentTime = .9;
    const until = performance.now() + 1800;
    while (performance.now() < until) {
      await new Promise(requestAnimationFrame);
      observe();
    }
    return [...seen];
  });
  expect(highlighted).toEqual(expect.arrayContaining(["I", "am", "in", "on", "at", "to", "be", "or", "we", "go"]));
});

test("spoken words remain highlighted across punctuation joined by an em dash", async ({ page }) => {
  await setup(page);
  const text = "But at any rate he might answer questions.—How am I to get in?” she repeated, aloud.";
  const mobileAdd = page.getByRole("button", { name: "Add reading", exact: true });
  if (await mobileAdd.isVisible()) await mobileAdd.click();
  await page.locator("button:visible").filter({ hasText: "Insert Text" }).click();
  await page.getByLabel("Title (optional)").fill("Alice Highlight Test");
  await page.getByLabel("Text", { exact: true }).fill(text);
  await page.getByRole("button", { name: "Add to Library", exact: true }).click();
  await expect(page.locator("article p").filter({ hasText: "questions.—How" })).toBeVisible();
  await openControls(page, true);
  const speechRequest = page.waitForRequest((request) => request.url().endsWith("/api/tts") && request.postDataJSON()?.word_timings === true);
  await page.getByRole("button", { name: "Listen", exact: true }).click();
  const { texts } = (await speechRequest).postDataJSON() as { texts: string[] };
  const words = spokenWords(texts[0]);
  const how = words.findIndex((word) => texts[0].slice(word.start, word.start + word.length).startsWith("How"));
  expect(how).toBeGreaterThan(0);
  await expect.poll(() => page.locator("audio").evaluate((audio: HTMLAudioElement) => !audio.paused)).toBe(true);
  await page.locator("audio").evaluate((audio: HTMLAudioElement, { index, count }) => {
    audio.currentTime = 8 + (index - 1) * 12 / Math.max(1, count - 1) + .02;
  }, { index: how, count: words.length });
  await expect.poll(() => eReaderSpokenWord(page)).toBe("How");
});

test("a different model plays with passage highlighting only", async ({ page }) => {
  await setup(page);
  await page.locator('input[type="file"]').first().setInputFiles({ name: "Original PDF.pdf", mimeType: "application/pdf", buffer: pdf() });
  await openControls(page, true);
  await page.getByRole("button", { name: "Voice", exact: true }).click();
  await page.getByRole("dialog", { name: "Voice settings" }).getByLabel("Voice").selectOption("F1");
  await page.getByRole("button", { name: "Done" }).click();
  await page.getByRole("button", { name: "Listen", exact: true }).click();
  await expect.poll(() => page.locator("audio").evaluate((audio: HTMLAudioElement) => !audio.paused)).toBe(true);
  await expect(page.locator('article [aria-label="Current passage"] span').first()).toBeVisible();
  await expect(page.locator('article [class*="wordHighlights"] span')).toHaveCount(0);
  await page.locator("audio").evaluate((audio: HTMLAudioElement) => { audio.currentTime = 10; });
  await expect(page.locator('article [class*="wordHighlights"] span')).toHaveCount(0);
});

test("non-English Kokoro keeps passage-only highlighting", async ({ page }) => {
  await setup(page);
  await page.locator('input[type="file"]').first().setInputFiles({ name: "original.epub", mimeType: "application/epub+zip", buffer: await epub() });
  await openControls(page, true);
  await page.getByRole("button", { name: "Voice", exact: true }).click();
  await page.getByRole("dialog", { name: "Voice settings" }).getByLabel("Language").selectOption("fr");
  await page.getByRole("button", { name: "Done" }).click();
  await page.getByRole("button", { name: "E-reader", exact: true }).click();
  await page.getByRole("button", { name: "Listen", exact: true }).click();
  await expect.poll(() => page.locator("audio").evaluate((audio: HTMLAudioElement) => !audio.paused)).toBe(true);
  await expect(page.locator('article [aria-current="true"]')).toBeVisible();
  await expect.poll(() => eReaderSpokenWord(page)).toBe("");
});

test("e-reader word highlighting never changes line wrapping", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "desktop-chromium", "Reproduces a Chromium wrap change at a fixed paragraph width");
  await setup(page);
  const text = "Office files often include fields, difficult ligatures, apostrophes, and punctuation.—Perhaps that changes where words land. ".repeat(3);
  await page.locator("button:visible").filter({ hasText: "Insert Text" }).click();
  await page.getByLabel("Title (optional)").fill("Stable e-reader layout");
  await page.getByLabel("Text", { exact: true }).fill(text);
  await page.getByRole("button", { name: "Add to Library", exact: true }).click();
  const passage = page.locator('article p[aria-current="true"]');
  await expect(passage).toBeVisible();
  await passage.evaluate((element: HTMLElement) => { element.style.width = "372px"; });
  const wordPosition = () => passage.evaluate((element) => {
    const node = element.firstChild!;
    const start = node.textContent!.indexOf("land.");
    if (node.nodeType !== Node.TEXT_NODE || start < 0) return null;
    const range = document.createRange();
    range.setStart(node, start);
    range.setEnd(node, start + 4);
    const rect = range.getBoundingClientRect();
    const origin = element.getBoundingClientRect();
    return { left: rect.left - origin.left, top: rect.top - origin.top, children: element.childNodes.length };
  });
  const before = await wordPosition();
  expect(before).not.toBeNull();

  const speechRequest = page.waitForRequest((request) => request.url().endsWith("/api/tts") && request.postDataJSON()?.word_timings === true);
  await openControls(page, true);
  await page.getByRole("button", { name: "Listen", exact: true }).click();
  const { texts } = (await speechRequest).postDataJSON() as { texts: string[] };
  const words = spokenWords(texts[0]);
  const perhaps = words.findIndex((word) => texts[0].slice(word.start, word.start + word.length).startsWith("Perhaps"));
  expect(perhaps).toBeGreaterThan(0);
  await expect.poll(() => page.locator("audio").evaluate((audio: HTMLAudioElement) => !audio.paused)).toBe(true);
  await page.locator("audio").evaluate((audio: HTMLAudioElement, { index, count }) => {
    audio.currentTime = 8 + (index - 1) * 12 / Math.max(1, count - 1) + .02;
  }, { index: perhaps, count: words.length });
  await expect.poll(() => eReaderSpokenWord(page)).toBe("Perhaps");
  expect(await passage.evaluate((element) => getComputedStyle(element, "::highlight(freereader-spoken-word)").backgroundColor)).toBe("rgb(170, 186, 255)");
  const painted = await page.evaluate(() => (Array.from(CSS.highlights.get("freereader-spoken-word") ?? [])[0] as Range).getBoundingClientRect().toJSON());
  const textRect = await passage.evaluate((element) => {
    const start = element.firstChild!.textContent!.indexOf("Perhaps");
    const range = document.createRange();
    range.setStart(element.firstChild!, start);
    range.setEnd(element.firstChild!, start + "Perhaps".length);
    const rect = range.getBoundingClientRect();
    return { x: rect.x, y: rect.y };
  });
  expect(Math.abs(painted.x - textRect.x)).toBeLessThan(1);
  expect(Math.abs(painted.y - textRect.y)).toBeLessThan(1);
  expect(await wordPosition()).toEqual(before);
  await page.getByRole("button", { name: "Pause", exact: true }).click();
  expect(await wordPosition()).toEqual(before);
});

test("PDF shows a stronger word overlay only while speaking", async ({ page }) => {
  await setup(page);
  await page.locator('input[type="file"]').first().setInputFiles({ name: "Original PDF.pdf", mimeType: "application/pdf", buffer: pdf() });
  await openControls(page);
  await page.getByRole("button", { name: "Listen", exact: true }).click();
  const word = page.locator('article [class*="wordHighlights"] span');
  await expect(word.first()).toBeVisible();
  await expect(page.locator('article [aria-label="Current passage"] span').first()).toBeVisible();
  const first = await word.first().evaluate((element) => (element as HTMLElement).style.left);
  await page.locator("audio").evaluate((audio: HTMLAudioElement) => { audio.currentTime = audio.duration * 0.7; });
  await expect.poll(() => word.first().evaluate((element) => (element as HTMLElement).style.left)).not.toBe(first);
  await page.getByRole("button", { name: "Pause", exact: true }).click();
  await expect(word).toHaveCount(0);
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
  const desktopSpread = await page.evaluate(() => window.innerWidth > 800);
  await expect(page.getByRole("navigation", { name: "Original document pages" })).toContainText(desktopSpread ? "Pages 1–2 of 2" : "Page 2 of 2");
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
  await openControls(page, true);
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

test("embedded EPUB chapter links navigate within the book rather than requesting a website XHTML route", async ({ page }) => {
  await setup(page);
  const book = await JSZip.loadAsync(await epub());
  const chapter = await book.file("OPS/one.xhtml")!.async("string");
  book.file("OPS/one.xhtml", chapter.replace("<h1>Chapter One</h1>", '<h1>Chapter One</h1><a id="chapter-link" href="two.xhtml">Read Chapter Two</a><script>window.parent.epubScriptRan=true;</script>'));
  const requests: string[] = [];
  page.on("request", (request) => { if (new URL(request.url()).pathname.endsWith("two.xhtml")) requests.push(request.url()); });
  await page.locator('input[type="file"]').first().setInputFiles({ name: "linked.epub", mimeType: "application/epub+zip", buffer: await book.generateAsync({ type: "nodebuffer" }) });
  await openControls(page);
  const frame = page.frameLocator("article iframe").first();
  await expect(frame.locator("h1")).toHaveText("Chapter One");
  await frame.locator("#chapter-link").click();
  await expect(frame.locator("h1")).toHaveText("Chapter Two");
  expect(await page.evaluate(() => (window as unknown as { epubScriptRan?: boolean }).epubScriptRan)).toBeUndefined();
  expect(requests).toEqual([]);
});
