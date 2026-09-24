import { test, expect } from "@playwright/test";

function wavBody(sampleRate = 24_000, toneHz = 0): Buffer {
  const body = Buffer.alloc(44 + sampleRate * 2);
  body.write("RIFF", 0);
  body.writeUInt32LE(body.length - 8, 4);
  body.write("WAVEfmt ", 8);
  body.writeUInt32LE(16, 16);
  body.writeUInt16LE(1, 20);
  body.writeUInt16LE(1, 22);
  body.writeUInt32LE(sampleRate, 24);
  body.writeUInt32LE(sampleRate * 2, 28);
  body.writeUInt16LE(2, 32);
  body.writeUInt16LE(16, 34);
  body.write("data", 36);
  body.writeUInt32LE(body.length - 44, 40);
  if (toneHz) for (let i = 0; i < sampleRate; i++) body.writeInt16LE(Math.round(Math.sin(i * 2 * Math.PI * toneHz / sampleRate) * 20_000), 44 + i * 2);
  return body;
}

test("creator edits a script, generates a voiceover, and refines one passage", async ({ page }) => {
  const requests: Array<Record<string, unknown>> = [];
  const sources: string[] = [];
  await page.route("**/api/tts", async (route) => {
    requests.push(route.request().postDataJSON());
    sources.push(JSON.parse(route.request().headers()["x-freereader-context"]).source);
    await route.fulfill({
      status: 200,
      headers: { "Content-Type": "audio/wav", "X-Audio-Duration": "1" },
      body: wavBody(),
    });
  });

  await page.goto("/reader");
  await expect(page.getByRole("link", { name: /Create an audiobook/ })).toBeVisible();
  await page.getByRole("link", { name: /Create YouTube narration/ }).click();

  await expect(page.getByRole("heading", { name: "Start with your script" })).toBeVisible();
  await page.getByLabel("YouTube script").fill("SQL makes this introduction memorable.\n\nThe second passage keeps its own generated take.");
  await page.getByRole("button", { name: "Add script" }).click();
  await expect(page.getByLabel("Passage 1 text")).toHaveValue("SQL makes this introduction memorable.");
  await expect(page.getByLabel("Passage 2 text")).toHaveValue("The second passage keeps its own generated take.");
  await expect(page.getByLabel("Passage options")).toHaveCount(0);

  await page.getByLabel("Passage 1 text").evaluate((element: HTMLTextAreaElement) => {
    element.focus();
    element.setSelectionRange(0, 3);
    element.dispatchEvent(new Event("select", { bubbles: true }));
  });
  await page.getByRole("button", { name: /Pronunciation/ }).click();
  await expect(page.getByLabel("Written phrase")).toHaveValue("SQL");
  await page.getByRole("region", { name: "Script workspace" }).getByLabel("Say it like").fill("sequel");
  await page.getByRole("region", { name: "Script workspace" }).getByRole("button", { name: "Save pronunciation" }).click();
  const projectVoice = page.getByRole("region", { name: "Voiceover settings" }).getByRole("combobox", { name: "Project voice" });
  await expect(projectVoice.locator("option")).toHaveText([
    "Heart", "Olivia", "Alloy", "Aoede", "Bella", "Jessica", "Kore", "Nicole", "Nova", "River", "Sarah", "Sky",
    "Adam", "Echo", "Eric", "Fenrir", "Liam", "Michael", "Onyx", "Puck", "Santa", "Alice", "Emma", "Isabella", "Lily",
    "Daniel", "Fable", "George", "Lewis", "Alex", "James", "Robert", "Sam", "Daniel", "Sarah", "Lily", "Jessica", "Emily",
  ]);
  await projectVoice.selectOption("F1");
  await page.getByRole("button", { name: "Generate voiceover" }).click();

  await expect(page.getByText("Ready", { exact: true })).toHaveCount(2);
  expect(requests).toHaveLength(2);
  expect(sources).toEqual(["youtube_narration", "youtube_narration"]);
  expect(requests[0]).toMatchObject({ texts: ["sequel makes this introduction memorable."], voice: "F1", engine: "supertonic", speed: 1 });
  expect(requests[1]).toMatchObject({ texts: ["The second passage keeps its own generated take."], voice: "F1", engine: "supertonic", speed: 1 });
  await page.getByRole("button", { name: "Medium" }).click();
  await expect(page.getByLabel("Project voiceover player")).toContainText("0:02");
  const downloadPromise = page.waitForEvent("download");
  await page.getByRole("button", { name: "Export WAV" }).click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toBe("Untitled narration.wav");
  const stream = await download.createReadStream();
  const chunks: Buffer[] = [];
  for await (const chunk of stream) chunks.push(Buffer.from(chunk));
  const exported = Buffer.concat(chunks);
  expect(exported.toString("utf8", 0, 4)).toBe("RIFF");
  expect(exported.length).toBeGreaterThan(120_000);
  expect(exported.readUInt32LE(40)).toBe(exported.length - 44);
  expect(exported.readUInt32LE(24)).toBe(44_100);
  expect(exported.readUInt16LE(34)).toBe(24);
  await page.getByRole("button", { name: "Play voiceover" }).click();
  await expect(page.getByRole("button", { name: "Pause voiceover" })).toBeVisible();
  await expect(page.getByLabel("Passage 2 text")).toHaveAttribute("aria-current", "true");
  await page.getByRole("button", { name: "Pause voiceover" }).click();

  await page.getByRole("button", { name: "Edit passage 1" }).click();
  await page.getByLabel("Passage 1 text").fill("SQL makes the edited introduction memorable.");
  await expect(page.getByText("Needs regeneration")).toHaveCount(1);
  await expect(page.getByText("Ready", { exact: true })).toHaveCount(1);
  await expect(page.getByRole("button", { name: "Export WAV" })).toBeDisabled();
  await page.getByRole("combobox", { name: "Speed override" }).selectOption("1.2");
  await page.getByRole("combobox", { name: "Voice override" }).selectOption("M2");
  await expect(page.getByText("Ready", { exact: true })).toHaveCount(2);
  expect(requests).toHaveLength(3);
  expect(requests[2]).toMatchObject({ texts: ["sequel makes the edited introduction memorable."], voice: "M2", engine: "supertonic", speed: 1.2 });
  await expect(page.getByLabel("Voiceover position")).toBeEnabled();
  await page.getByRole("button", { name: "Replace / import script" }).click();
  await expect(page.getByLabel("Paste a replacement script")).toBeVisible();
  await page.locator('input[type="file"]').setInputFiles({ name: "Revised script.txt", mimeType: "text/plain", buffer: Buffer.from("A fresh opening for the video.") });
  await expect(page.getByLabel("Paste a replacement script")).toHaveValue("A fresh opening for the video.");
  page.once("dialog", (dialog) => dialog.accept());
  await page.getByRole("button", { name: "Replace script", exact: true }).click();
  await expect(page.getByLabel("Passage 1 text")).toHaveValue("A fresh opening for the video.");
  await expect(page.getByLabel("Passage 2 text")).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Export WAV" })).toHaveCount(0);
});

test("global pronunciation annotates the script and regenerates only affected passages", async ({ page }) => {
  const requests: Array<{ texts: string[] }> = [];
  await page.route("**/api/tts", async (route) => {
    requests.push(route.request().postDataJSON());
    await route.fulfill({ status: 200, headers: { "Content-Type": "audio/wav", "X-Audio-Duration": "1" }, body: wavBody() });
  });
  await page.goto("/narration");
  await page.getByLabel("YouTube script").fill("SQL opens the video.\n\nSQL returns later.\n\nNo special words here.");
  await page.getByRole("button", { name: "Add script" }).click();
  const global = page.getByRole("region", { name: "Global pronunciations" });
  await global.getByLabel("Search text").fill("SQL");
  await global.getByLabel("Say it like").fill("sequel");
  await global.getByRole("button", { name: "Save pronunciation" }).click();
  await expect(global.getByRole("list", { name: "Global pronunciation rules" }).locator("rt")).toHaveText("sequel");
  await expect(page.getByRole("button", { name: "Edit passage 2" }).locator("s")).toHaveText("SQL");
  await expect(page.getByRole("button", { name: "Edit passage 2" }).locator("rt")).toHaveText("sequel");

  await page.getByRole("button", { name: "Edit passage 1" }).click();
  await page.getByLabel("Passage 1 text").evaluate((field: HTMLTextAreaElement) => {
    field.focus(); field.setSelectionRange(0, 3);
    field.dispatchEvent(new Event("select", { bubbles: true }));
  });
  await page.getByRole("button", { name: "Pronunciation", exact: true }).click();
  await expect(page.getByLabel("Written phrase")).toHaveValue("SQL");
  await page.getByLabel("Say it like").last().fill("structured query");
  await page.getByRole("button", { name: "Save pronunciation" }).last().click();
  await expect(page.getByRole("button", { name: "Edit passage 1" }).locator("rt")).toHaveText("structured query");
  await expect(page.getByRole("button", { name: "Edit passage 2" }).locator("rt")).toHaveText("sequel");

  await page.getByRole("button", { name: "Generate voiceover" }).click();
  await expect(page.getByText("Ready", { exact: true })).toHaveCount(3);
  expect(requests.map((request) => request.texts[0])).toEqual([
    "structured query opens the video.", "sequel returns later.", "No special words here.",
  ]);
  await global.getByLabel("Search text").fill("SQL");
  await global.getByLabel("Say it like").fill("squeal");
  await global.getByRole("button", { name: "Save pronunciation" }).click();
  await expect(page.getByText("Ready", { exact: true })).toHaveCount(2);
  await expect(page.getByText("Needs regeneration")).toHaveCount(1);
  await expect(page.getByRole("button", { name: "Edit passage 1" }).locator("rt")).toHaveText("structured query");
  await expect(page.getByRole("button", { name: "Edit passage 2" }).locator("rt")).toHaveText("squeal");
  await expect(page.getByText("Saved locally")).toHaveCount(1);
  await page.reload();
  await expect(global.getByRole("list", { name: "Global pronunciation rules" }).locator("rt")).toHaveText("squeal");
  await expect(page.getByRole("button", { name: "Edit passage 1" }).locator("rt")).toHaveText("structured query");
  await global.getByRole("button", { name: "Remove global pronunciation for SQL" }).click();
  await expect(global.getByRole("list", { name: "Global pronunciation rules" })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Edit passage 2" })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Edit passage 1" }).locator("rt")).toHaveText("structured query");
});

test("generate button shows passage count and percent before revealing WAV download", async ({ page }) => {
  const release: Array<() => void> = [];
  await page.route("**/api/tts", async (route) => {
    await new Promise<void>((resolve) => { release.push(resolve); });
    await route.fulfill({ status: 200, headers: { "Content-Type": "audio/wav", "X-Audio-Duration": "1" }, body: wavBody() });
  });
  await page.goto("/narration");
  await page.getByLabel("YouTube script").fill("First passage.\n\nSecond passage.");
  await page.getByRole("button", { name: "Add script" }).click();
  await page.getByRole("button", { name: "Generate voiceover" }).click();
  await expect(page.getByRole("button", { name: /Generating 1 of 2 · 0%/ })).toBeVisible();
  await expect.poll(() => release.length).toBe(1);
  release[0]();
  await expect(page.getByRole("button", { name: /Generating 2 of 2 · 50%/ })).toBeVisible();
  await expect.poll(() => release.length).toBe(2);
  release[1]();
  await expect(page.getByRole("button", { name: "Download WAV voiceover" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Export WAV" })).toBeVisible();
});

for (const { name, voices, sampleRate } of [
  { name: "Kokoro", voices: ["af_heart", "af_heart"], sampleRate: 24_000 },
  { name: "Supertonic", voices: ["F1", "F1"], sampleRate: 44_100 },
  { name: "mixed voices", voices: ["af_heart", "M2"], sampleRate: 44_100 },
]) {
  test(`${name} WAV export preserves the highest source rate and audible samples`, async ({ page }) => {
    await page.route("**/api/tts", (route) => {
      const request = route.request().postDataJSON() as { voice: string };
      const sourceRate = request.voice === "af_heart" ? 24_000 : 44_100;
      return route.fulfill({ status: 200, headers: { "Content-Type": "audio/wav", "X-Audio-Duration": "1" },
        body: wavBody(sourceRate, sourceRate === 44_100 ? 16_000 : 6_000) });
    });
    await page.goto("/narration");
    await page.getByLabel("YouTube script").fill("First take.\n\nSecond take.");
    await page.getByRole("button", { name: "Add script" }).click();
    if (voices[0] !== "af_heart") await page.getByRole("region", { name: "Voiceover settings" }).getByRole("combobox", { name: "Project voice" }).selectOption(voices[0]);
    if (voices[1] !== voices[0]) {
      await page.getByLabel("Passage 2 text").focus();
      await page.getByRole("combobox", { name: "Voice override" }).selectOption(voices[1]);
      await expect(page.getByText("Ready", { exact: true })).toHaveCount(1);
    }
    await page.getByRole("button", { name: "Generate voiceover" }).click();
    await expect(page.getByText("Ready", { exact: true })).toHaveCount(2);
    const downloadPromise = page.waitForEvent("download");
    await page.getByRole("button", { name: "Export WAV" }).click();
    const stream = await (await downloadPromise).createReadStream();
    const chunks: Buffer[] = [];
    for await (const chunk of stream) chunks.push(Buffer.from(chunk));
    const output = Buffer.concat(chunks);
    expect(output.toString("ascii", 0, 4)).toBe("RIFF");
    expect(output.readUInt32LE(24)).toBe(sampleRate);
    expect(output.readUInt32LE(28)).toBe(sampleRate * 3);
    expect(output.readUInt16LE(22)).toBe(1);
    expect(output.readUInt16LE(34)).toBe(24);
    expect(output.readUInt32LE(40)).toBe(output.length - 44);
    const peak = (start: number) => Math.max(...Array.from({ length: 100 }, (_, offset) => {
      const position = 44 + (start + offset) * 3;
      const sample = output[position] | (output[position + 1] << 8) | (output[position + 2] << 16);
      return Math.abs((sample << 8) >> 8) / 8388607;
    }));
    expect(peak(100)).toBeGreaterThan(0.4);
    expect(peak(sampleRate + Math.round(sampleRate * .25) + 100)).toBeGreaterThan(0.4);
  });
}

test("creator can reorder, split, and merge passages without losing unrelated audio", async ({ page }) => {
  const requests: unknown[] = [];
  await page.route("**/api/tts", async (route) => {
    requests.push(route.request().postDataJSON());
    await route.fulfill({ status: 200, headers: { "Content-Type": "audio/wav", "X-Audio-Duration": "1" }, body: wavBody() });
  });
  await page.goto("/narration");
  await page.getByLabel("YouTube script").fill("First sentence. Another sentence.\n\nSecond passage.\n\nThird passage.");
  await page.getByRole("button", { name: "Add script" }).click();
  await page.getByRole("button", { name: "Generate voiceover" }).click();
  await expect(page.getByText("Ready", { exact: true })).toHaveCount(3);

  await page.getByRole("combobox", { name: "Move passage 1 to position" }).selectOption("3");
  await expect(page.getByLabel("Passage 1 text")).toHaveValue("Second passage.");
  await expect(page.getByLabel("Passage 3 text")).toHaveValue("First sentence. Another sentence.");
  await expect(page.getByText("Ready", { exact: true })).toHaveCount(3);
  expect(requests).toHaveLength(3);

  await page.getByLabel("Passage 3 text").evaluate((field: HTMLTextAreaElement) => {
    field.focus();
    field.setSelectionRange("First sentence.".length, "First sentence.".length);
  });
  await page.getByRole("button", { name: "Split at cursor" }).click();
  await expect(page.getByLabel("Passage 3 text")).toHaveValue("First sentence.");
  await expect(page.getByLabel("Passage 4 text")).toHaveValue("Another sentence.");
  await expect(page.getByText("Needs regeneration")).toHaveCount(2);
  await expect(page.getByText("Ready", { exact: true })).toHaveCount(2);

  await page.getByRole("button", { name: "Merge with previous" }).click();
  await expect(page.getByLabel("Passage 3 text")).toHaveValue("First sentence. Another sentence.");
  await expect(page.getByLabel("Passage 4 text")).toHaveCount(0);
  await expect(page.getByText("Needs regeneration")).toHaveCount(1);
  await expect(page.getByText("Ready", { exact: true })).toHaveCount(2);
});
