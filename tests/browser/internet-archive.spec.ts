import { expect, test } from "@playwright/test";

test("Archive imports are paused across the catalog, web link and proxy routes", async ({ page }) => {
  let externalRequests = 0;
  page.on("request", (request) => {
    if (request.url().includes("archive.org")) externalRequests += 1;
  });
  await page.goto("/reader/audiobooks");
  await page.getByRole("button", { name: /Free Books/ }).first().click();
  await expect(page.getByRole("dialog", { name: "Free Books" })).toContainText("Project Gutenberg");
  await expect(page.getByRole("dialog", { name: "Free Books" })).not.toContainText("Internet Archive");
  await page.getByRole("button", { name: "Close" }).click();
  await page.getByRole("button", { name: /Web Link/ }).first().click();
  await page.getByLabel("Article or document URL").fill("https://archive.org/details/sample");
  await page.getByRole("button", { name: "Import link" }).click();
  await expect(page.getByRole("alert")).toContainText("Internet Archive imports are temporarily unavailable");
  expect(externalRequests).toBe(0);

  const metadata = await page.request.get("/api/internet-archive/sample");
  const file = await page.request.get("/api/internet-archive/sample/file?name=sample.pdf");
  const fallback = await page.request.post("/api/import-url", { data: { url: "https://archive.org/details/sample" } });
  expect(metadata.status()).toBe(404);
  expect(file.status()).toBe(404);
  expect(fallback.status()).toBe(400);
});
