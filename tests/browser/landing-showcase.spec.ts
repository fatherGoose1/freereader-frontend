import { expect, test } from "@playwright/test";

test("landing page shows the reader demo with audio and rotating feedback", async ({ page }) => {
  await page.goto("/");

  const feedback = page.getByRole("region", { name: "What Our Readers Say" });
  await expect(feedback.locator(".feedback-card")).toHaveCount(12);
  await feedback.locator(".feedback-card").first().hover();
  await expect.poll(() => feedback.locator(".feedback-track").evaluate((element) => getComputedStyle(element).animationPlayState)).toBe("paused");

  const demo = page.getByRole("region", { name: /All your documents read aloud/ });
  const video = demo.getByLabel("Audiobook reader demo");
  await expect(video).toHaveAttribute("src", "/landing-page-demo.mp4?v=2");
  await expect.poll(() => video.evaluate((element: HTMLVideoElement) => element.readyState)).toBeGreaterThanOrEqual(1);
  await expect(video).toHaveJSProperty("muted", true);
  await demo.getByRole("button", { name: "Unmute audio" }).click();
  await expect(video).toHaveJSProperty("muted", false);
  await demo.getByRole("button", { name: "Mute audio" }).click();
  await expect(video).toHaveJSProperty("muted", true);
  await expect(demo.getByRole("slider", { name: "Seek demo" })).toBeVisible();
  await expect(video).not.toHaveAttribute("controls", "");
  await expect(demo.getByLabel("Compatible sources and formats")).toContainText("Free books");
  const videoBounds = await video.boundingBox();
  const viewport = page.viewportSize()!;
  expect(videoBounds!.x).toBeGreaterThanOrEqual(0);
  expect(videoBounds!.x + videoBounds!.width).toBeLessThanOrEqual(viewport.width);
  if (viewport.width <= 460) expect(videoBounds!.width / videoBounds!.height).toBeCloseTo(1, 1);
  else if (viewport.width <= 760) expect(videoBounds!.width / videoBounds!.height).toBeCloseTo(4 / 3, 1);

  await expect(page.getByText("Bring reading you have the rights to narrate")).toHaveCount(0);
  await expect(page.getByText("A wider world of voices")).toHaveCount(0);
  await expect(page.getByText("The live preview detects the language of your text automatically.")).toHaveCount(0);
  const final = page.locator(".final-actions");
  const webButton = await final.getByRole("link", { name: "Start listening" }).boundingBox();
  const appButton = await final.getByRole("link", { name: "Download VoiceReader on the App Store" }).boundingBox();
  if (Math.abs(webButton!.y - appButton!.y) < 2) {
    expect(Math.abs((webButton!.y + webButton!.height / 2) - (appButton!.y + appButton!.height / 2))).toBeLessThan(2);
  } else {
    expect(Math.abs((webButton!.x + webButton!.width / 2) - (appButton!.x + appButton!.width / 2))).toBeLessThan(2);
  }
});
