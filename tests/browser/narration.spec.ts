import { test, expect } from "@playwright/test";

function wavBody(): Buffer {
  const body = Buffer.alloc(44 + 4_800);
  body.write("RIFF", 0);
  body.writeUInt32LE(body.length - 8, 4);
  body.write("WAVEfmt ", 8);
  body.writeUInt32LE(16, 16);
  body.writeUInt16LE(1, 20);
  body.writeUInt16LE(1, 22);
  body.writeUInt32LE(24_000, 24);
  body.writeUInt32LE(48_000, 28);
  body.writeUInt16LE(2, 32);
  body.writeUInt16LE(16, 34);
  body.write("data", 36);
  body.writeUInt32LE(body.length - 44, 40);
  return body;
}

test("creator workflow segments scripts and regenerates passages independently", async ({ page }) => {
  const requests: Array<Record<string, unknown>> = [];
  await page.route("**/api/tts", async (route) => {
    requests.push(route.request().postDataJSON());
    await route.fulfill({
      status: 200,
      headers: { "Content-Type": "audio/wav", "X-Audio-Duration": "0.1" },
      body: wavBody(),
    });
  });

  await page.goto("/reader");
  await expect(page.getByRole("link", { name: /Create an audiobook/ })).toBeVisible();
  await page.getByRole("link", { name: /Create YouTube narration/ }).click();

  await page.getByLabel("YouTube script").fill("SQL makes this introduction memorable.\n\nThe second passage keeps its own generated take.");
  await page.getByRole("button", { name: "Create segments" }).click();
  await expect(page.getByLabel("Segment 1 text")).toHaveValue("SQL makes this introduction memorable.");
  await expect(page.getByLabel("Segment 2 text")).toHaveValue("The second passage keeps its own generated take.");

  await page.getByLabel("Segment 1 text").evaluate((element: HTMLTextAreaElement) => {
    element.focus();
    element.setSelectionRange(0, 3);
  });
  await page.getByRole("button", { name: "Use selected text" }).click();
  await page.getByLabel("Say it like").fill("sequel");
  await page.getByRole("button", { name: "Add override" }).click();
  await page.getByRole("combobox").first().selectOption("af_bella");
  await page.getByRole("button", { name: "Generate narration" }).click();

  await expect(page.getByText("Audio ready")).toHaveCount(2);
  expect(requests).toHaveLength(2);
  expect(requests[0]).toMatchObject({ texts: ["sequel makes this introduction memorable."], voice: "af_bella", speed: 1 });
  expect(requests[1]).toMatchObject({ texts: ["The second passage keeps its own generated take."], voice: "af_bella", speed: 1 });

  await page.getByLabel("Segment 1 text").fill("SQL makes the edited introduction memorable.");
  await expect(page.getByText("Not generated")).toHaveCount(1);
  await expect(page.getByText("Audio ready")).toHaveCount(1);
});
