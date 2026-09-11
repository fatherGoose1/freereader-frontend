import { test, expect, type Page } from "@playwright/test";
import JSZip from "jszip";

type ImportEvent = { event_name: string; properties: Record<string, string | number> };
const prose = "This paragraph describes a document that can be imported and read offline, with its original format preserved throughout conversion.";

async function setup(page: Page) {
  const events: ImportEvent[] = [];
  await page.route("**/api/telemetry", (route) => {
    events.push(...route.request().postDataJSON().events);
    return route.fulfill({ status: 202, json: {} });
  });
  await page.goto("/reader");
  return events;
}

async function openWebLink(page: Page) {
  const mobileAdd = page.getByRole("button", { name: "Add reading", exact: true });
  if (await mobileAdd.isVisible()) await mobileAdd.click();
  await page.locator("button:visible").filter({ hasText: "Web Link" }).click();
}

test("Markdown URL imports preserve their format through conversion and storage", async ({ page }) => {
  const events = await setup(page);
  await page.route("https://example.com/chapter.markdown", (route) => route.fulfill({
    headers: { "Content-Type": "text/plain", "Access-Control-Allow-Origin": "*" },
    body: `# A Markdown Chapter\n\n${prose}`,
  }));
  await openWebLink(page);
  await page.getByLabel("Article or document URL").fill("https://example.com/chapter.markdown");
  await page.getByRole("button", { name: "Import link", exact: true }).click();
  await expect(page.getByRole("button", { name: /^md A Markdown Chapter/ })).toBeVisible();
  await expect.poll(() => events.find((event) => event.event_name === "import_completed")?.properties).toMatchObject({
    source: "url", file_type: "md",
  });
});

test("failed links show the error in the modal and report both fetch stages without assuming HTML", async ({ page }) => {
  const events = await setup(page);
  await page.route("https://example.com/download", (route) => route.abort("failed"));
  await page.route("**/api/import-url", (route) => route.fulfill({ status: 502, contentType: "text/html", body: "<html>Bad gateway</html>" }));
  await openWebLink(page);
  await page.getByLabel("Article or document URL").fill("https://example.com/download");
  await page.getByRole("button", { name: "Import link", exact: true }).click();
  await expect(page.locator("form").getByRole("alert")).toBeVisible();
  await expect.poll(() => events.find((event) => event.event_name === "import_failed")?.properties).toMatchObject({
    source: "url", file_type: "unknown", error_category: "network", error_stage: "fallback",
    error_code: "fallback_network", direct_error_category: "network", http_status: 502,
  });
  await expect(page.locator("form").getByRole("alert")).toContainText("article service is unavailable");
});

test("DOCX files use the browser converter and report DOCX", async ({ page }) => {
  const events = await setup(page);
  const zip = new JSZip();
  zip.file("[Content_Types].xml", '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="xml" ContentType="application/xml"/></Types>');
  zip.file("word/document.xml", `<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body><w:p><w:r><w:t>${prose}</w:t></w:r></w:p></w:body></w:document>`);
  await page.locator('input[type="file"]').first().setInputFiles({
    name: "Browser Document.docx", mimeType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    buffer: await zip.generateAsync({ type: "nodebuffer" }),
  });
  const book = page.getByRole("button", { name: /^docx Browser Document/ });
  await expect(book).toBeVisible();
  await expect.poll(() => events.find((event) => event.event_name === "import_completed")?.properties).toMatchObject({
    source: "file", file_type: "docx",
  });
  await book.click();
  await expect(page.locator("article")).toContainText(prose);
});

test("storage failures retain the converted file format and identify the storage stage", async ({ page }) => {
  await page.addInitScript(() => {
    IDBObjectStore.prototype.put = () => { throw new DOMException("The quota has been exceeded.", "QuotaExceededError"); };
  });
  const events = await setup(page);
  await page.locator('input[type="file"]').first().setInputFiles({
    name: "Notes.mdown", mimeType: "text/plain", buffer: Buffer.from(`# Notes\n\n${prose}`),
  });
  await expect.poll(() => events.find((event) => event.event_name === "import_failed")?.properties).toMatchObject({
    source: "file", file_type: "md", error_category: "storage", error_stage: "storage",
  });
  await expect(page.getByRole("button", { name: /^md Notes/ })).toHaveCount(0);
});
