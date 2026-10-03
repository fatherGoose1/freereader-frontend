import { expect, test } from "@playwright/test";

test("support is available without signing in and preserves an unsent message", async ({ page }) => {
  const submissions: Array<{ email: string; message: string }> = [];
  await page.route("**/api/support-requests", (route) => {
    submissions.push(route.request().postDataJSON());
    return route.fulfill({ status: 201, json: { received: true } });
  });
  await page.goto("/");
  const launcher = page.getByRole("button", { name: "Contact support" });
  await expect(launcher).toBeVisible();
  await launcher.click();
  const dialog = page.getByRole("dialog", { name: "Contact support" });
  await expect(dialog).toBeVisible();
  await dialog.getByLabel("Email address").fill("reader@example.com");
  await dialog.getByLabel("How can we help?").fill("I need help with an audiobook.");
  await page.keyboard.press("Escape");
  await expect(dialog).toHaveCount(0);
  await launcher.click();
  await expect(dialog.getByLabel("How can we help?")).toHaveValue("I need help with an audiobook.");
  await dialog.getByRole("button", { name: "Send request" }).click();
  await expect(dialog).toContainText("Request received.");
  expect(submissions).toEqual([{ email: "reader@example.com", message: "I need help with an audiobook." }]);
  await dialog.getByRole("button", { name: "Close support" }).click();

  await page.goto("/reader/audiobooks");
  await expect(page.getByRole("button", { name: "Contact support" })).toBeVisible();
});

test("support dialog fills the mobile viewport", async ({ page, isMobile }) => {
  if (!isMobile) test.skip();
  await page.goto("/authors/submissions");
  await page.getByRole("button", { name: "Contact support" }).click();
  const rect = await page.getByRole("dialog", { name: "Contact support" }).boundingBox();
  const viewport = await page.evaluate(() => ({ width: innerWidth, height: innerHeight }));
  expect(rect!.x).toBe(0);
  expect(rect!.y).toBe(0);
  expect(rect!.width).toBe(viewport.width);
  expect(Math.abs(rect!.height - viewport.height)).toBeLessThan(2);
});
