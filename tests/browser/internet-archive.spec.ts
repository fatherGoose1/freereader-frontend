import { expect, test } from "@playwright/test";

test("Free Books offers Archive import and preserves OCR metadata in the library", async ({ page }) => {
  await page.route("**/api/internet-archive/sample", (route) => route.fulfill({ json: {
    metadata: { title: "Sample archive book", creator: "Sample author", language: "eng" },
    files: [{ name: "sample_djvu.txt", size: "100" }, { name: "sample.pdf", size: "1000" }],
  } }));
  await page.route("**/api/internet-archive/sample/file?*", (route) => route.fulfill({
    contentType: "text/plain", body: "An archived read-\ning passage.\n\nA second paragraph.",
  }));

  await page.goto("/reader/audiobooks");
  await page.getByRole("button", { name: /Free Books/ }).first().click();
  await page.getByRole("dialog", { name: "Choose a free book source" }).getByRole("button", { name: /Internet Archive/ }).click();
  await page.getByRole("dialog", { name: "Import from Internet Archive" }).getByRole("textbox", { name: "Book URL" }).fill("https://archive.org/details/sample");
  await page.getByRole("button", { name: "Add to Library" }).click();
  await expect(page.getByRole("button", { name: /Sample archive book.*Sample author/ })).toBeVisible();
  await page.getByRole("button", { name: /Sample archive book.*Sample author/ }).click();
  await expect(page.getByText("An archived reading passage.")).toBeVisible();
  await expect(page.getByText("A second paragraph.")).toBeVisible();
});
