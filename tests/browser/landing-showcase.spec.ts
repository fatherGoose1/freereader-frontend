import { expect, test } from "@playwright/test";

test("landing page shows the iPhone preview and the language demo with rotating feedback", async ({ page, browserName }) => {
  await page.goto("/");

  const feedback = page.getByRole("region", { name: "What Our Readers Say" });
  await expect(feedback.locator(".feedback-card")).toHaveCount(12);
  await feedback.locator(".feedback-card").first().focus();
  await expect.poll(() => feedback.locator(".feedback-track").evaluate((element) => getComputedStyle(element).animationPlayState)).toBe("paused");

  const video = page.locator(".hero-section video");
  await expect(video).toHaveAttribute("src", browserName === "webkit" ? "/iphone-demo.mp4?v=3" : "/iphone-demo.webm?v=3");
  await expect(video).toHaveAttribute("poster", "/iphone-demo-poster.png?v=3");
  await expect.poll(() => video.evaluate((element: HTMLVideoElement) => element.readyState)).toBeGreaterThanOrEqual(1);
  await expect.poll(() => video.evaluate((element: HTMLVideoElement) => element.readyState)).toBeGreaterThanOrEqual(2);
  const alpha = await video.evaluate((element: HTMLVideoElement) => {
    const canvas = document.createElement("canvas");
    canvas.width = element.videoWidth;
    canvas.height = element.videoHeight;
    const context = canvas.getContext("2d")!;
    context.drawImage(element, 0, 0);
    const textArea = context.getImageData(60, 420, 380, 430).data;
    let missingTextPixels = 0;
    for (let index = 3; index < textArea.length; index += 4) {
      if (textArea[index] < 250) missingTextPixels++;
    }
    return { outside: context.getImageData(0, 0, 1, 1).data[3], missingTextPixels };
  });
  expect(alpha.outside).toBe(0);
  expect(alpha.missingTextPixels).toBe(0);
  await expect(video).toHaveJSProperty("muted", true);
  await expect(video).not.toHaveAttribute("controls", "");
  const controls = page.getByRole("group", { name: "iPhone demo playback controls" });
  await expect.poll(() => video.evaluate((element: HTMLVideoElement) => element.paused)).toBe(false);
  await controls.getByRole("button", { name: "Pause preview video" }).click();
  await expect(video).toHaveJSProperty("paused", true);
  await controls.getByRole("button", { name: "Play preview video" }).click();
  await expect(video).toHaveJSProperty("paused", false);
  await controls.getByRole("button", { name: "Unmute preview audio" }).click();
  await expect(video).toHaveJSProperty("muted", false);
  await expect(controls.getByRole("button", { name: "Mute preview audio" })).toHaveAttribute("aria-pressed", "true");
  await controls.getByRole("button", { name: "Mute preview audio" }).click();
  await expect(video).toHaveJSProperty("muted", true);
  const videoBounds = await video.boundingBox();
  const viewport = page.viewportSize()!;
  expect(videoBounds!.x).toBeGreaterThanOrEqual(0);
  expect(videoBounds!.x + videoBounds!.width).toBeLessThanOrEqual(viewport.width);
  expect(videoBounds!.width / videoBounds!.height).toBeCloseTo(502 / 1028, 1);
  expect(await video.evaluate((element) => getComputedStyle(element).backgroundColor)).toBe("rgba(0, 0, 0, 0)");
  const controlsBounds = await controls.boundingBox();
  expect(controlsBounds!.x).toBeGreaterThanOrEqual(0);
  expect(controlsBounds!.x + controlsBounds!.width).toBeLessThanOrEqual(viewport.width);

  const demo = page.getByRole("region", { name: "Try it with any language" });
  await expect(demo.getByLabel("Sample text to narrate")).toBeVisible();
  await expect(demo.locator("video")).toHaveCount(0);
  const demoBounds = await demo.locator(".hero-demo").boundingBox();
  const sectionBounds = await demo.boundingBox();
  expect(demoBounds!.x + demoBounds!.width / 2).toBeCloseTo(sectionBounds!.x + sectionBounds!.width / 2, 0);

  await expect(page.getByText("Bring reading you have the rights to narrate")).toHaveCount(0);
  await expect(page.getByText("A wider world of voices")).toHaveCount(0);
  await expect(page.getByText("The live preview detects the language of your text automatically.")).toHaveCount(0);
  const final = page.locator(".final-actions");
  for (const name of ["Start listening", "Download VoiceReader on the App Store"]) {
    const button = await final.getByRole("link", { name }).boundingBox();
    expect(button).not.toBeNull();
    expect(button!.x).toBeGreaterThanOrEqual(0);
    expect(button!.x + button!.width).toBeLessThanOrEqual(viewport.width);
  }
});
