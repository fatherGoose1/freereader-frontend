import { test, expect, type Page } from "@playwright/test";

type QueueTest = {
  generated: number[];
  completed: number[];
  played: Array<{ index: number; highlighted: string | null }>;
  release: Record<number, (fail?: boolean) => void>;
  finishPlay?: () => void;
};
declare global { interface Window { queueTest: QueueTest } }

const section = (index: number) => `Section ${index} is a passage about reading a book in order.`;

async function setup(page: Page, held: number[] = [], delayFirstPlay = false) {
  await page.route("**/api/telemetry", (route) => route.fulfill({ status: 202, json: {} }));
  await page.addInitScript(({ held, delayFirstPlay }) => {
    const state: QueueTest = { generated: [], completed: [], played: [], release: {} };
    window.queueTest = state;
    let lastPlayedSource = "";
    document.addEventListener("playing", async (event) => {
      const audio = event.target as HTMLAudioElement;
      // Chromium emits `playing` again after the test seeks near the end of a chunk.
      // Count source handoffs, including a replay of the same chunk via a new URL.
      if (audio.currentSrc === lastPlayedSource) return;
      lastPlayedSource = audio.currentSrc;
      const highlighted = document.querySelector('article [aria-current="true"]')?.textContent ?? null;
      const bytes = await (await fetch(audio.currentSrc)).arrayBuffer();
      state.played.push({ index: new DataView(bytes).getInt16(44, true), highlighted });
    }, true);
    const play = HTMLMediaElement.prototype.play;
    HTMLMediaElement.prototype.play = async function () {
      const delayed = delayFirstPlay;
      delayFirstPlay = false;
      await play.call(this);
      if (delayed) await new Promise<void>((_resolve, reject) => {
        state.finishPlay = () => reject(new DOMException("Old play interrupted", "AbortError"));
      });
    };
    window.Worker = class extends EventTarget {
      onmessage: ((event: MessageEvent) => void) | null = null;
      terminate() {}
      postMessage(request: { kind?: string; text: string }) {
        if (request.kind === "probe") {
          setTimeout(() => this.onmessage?.(new MessageEvent("message", { data: { kind: "ready" } })), 0);
          return;
        }
        const index = Number(request.text.match(/Section (\d+)/)![1]);
        state.generated.push(index);
        const generationStartedAt = performance.timeOrigin + performance.now();
        const finish = (fail = false) => {
          delete state.release[index];
          if (fail) {
            // Simulate a late worker failure; the superseded request must not start fallback.
            this.onmessage?.(new MessageEvent("message", { data: { kind: "error", message: "Old generation failed" } }));
            return;
          }
          const audio = new ArrayBuffer(44 + 24_000 * 8 * 2);
          const view = new DataView(audio);
          for (const [offset, value] of [[0, "RIFF"], [8, "WAVE"], [12, "fmt "], [36, "data"]] as const) {
            for (let i = 0; i < value.length; i += 1) view.setUint8(offset + i, value.charCodeAt(i));
          }
          view.setUint32(4, audio.byteLength - 8, true); view.setUint32(16, 16, true);
          view.setUint16(20, 1, true); view.setUint16(22, 1, true); view.setUint32(24, 24_000, true);
          view.setUint32(28, 48_000, true); view.setUint16(32, 2, true); view.setUint16(34, 16, true);
          view.setUint32(40, audio.byteLength - 44, true);
          view.setInt16(44, index, true); // Identify the actual played blob, independently of highlighting.
          state.completed.push(index);
          const result = { duration: 8, generationSeconds: 0.03, generationStartedAt };
          this.onmessage?.(new MessageEvent("message", { data: request.kind === "synthesize"
            ? { kind: "result", audio, ...result, provider: "WebGPU" }
            : { kind: "result", result: { blob: new Blob([audio], { type: "audio/wav" }), ...result, provider: "WASM" } },
          }));
        };
        if (held.includes(index)) state.release[index] = finish;
        else setTimeout(finish, 30);
      }
    } as unknown as typeof Worker;
  }, { held, delayFirstPlay });
  await page.goto("/reader");
  await page.locator('input[type="file"]').first().setInputFiles({ name: "Queue.html", mimeType: "text/html",
    buffer: Buffer.from(`<html lang="en"><title>Queue</title><body>${Array.from({ length: 12 }, (_, index) => `<p>${section(index)}</p>`).join("")}</body></html>`) });
  await page.getByRole("button", { name: /^html Queue/ }).click();
}

async function jump(page: Page, index: number) {
  await page.locator("article p").filter({ hasText: section(index) }).click();
  await expect(page.locator('article [aria-current="true"]')).toHaveText(section(index));
}

async function expectPlayback(page: Page, indexes: number[]) {
  await expect.poll(() => page.evaluate(() => window.queueTest.played)).toEqual(
    indexes.map((index) => ({ index, highlighted: section(index) })),
  );
}

async function finishSection(page: Page) {
  await page.locator("audio").evaluate((audio: HTMLAudioElement) => { audio.currentTime = audio.duration - 0.03; });
}

test("cached forward/backward jumps play in order and refill only the new queue tail", async ({ page }) => {
  await setup(page);
  await page.getByRole("button", { name: "Listen", exact: true }).click();
  await expect.poll(() => page.evaluate(() => window.queueTest.completed)).toEqual([0, 1, 2, 3, 4]);
  await jump(page, 3);
  await expectPlayback(page, [0, 3]);
  await expect.poll(() => page.evaluate(() => window.queueTest.completed)).toEqual([0, 1, 2, 3, 4, 5, 6, 7]);
  await finishSection(page);
  await expectPlayback(page, [0, 3, 4]);
  await finishSection(page);
  await expectPlayback(page, [0, 3, 4, 5]);
  await jump(page, 1);
  await expectPlayback(page, [0, 3, 4, 5, 1]);
  await finishSection(page);
  await expectPlayback(page, [0, 3, 4, 5, 1, 2]);
  const generated = await page.evaluate(() => window.queueTest.generated);
  expect(new Set(generated).size).toBe(generated.length);
});

for (const failOldRequest of [false, true]) {
  test(`rapid jumps during generation ignore obsolete results/events (old request fails: ${failOldRequest})`, async ({ page }) => {
    await setup(page, [0]);
    await page.getByRole("button", { name: "Listen", exact: true }).click();
    await expect.poll(() => page.evaluate(() => window.queueTest.generated)).toEqual([0]);
    await jump(page, 5);
    await jump(page, 8);
    await page.locator("audio").evaluate((audio) => {
      audio.dispatchEvent(new Event("ended"));
      audio.dispatchEvent(new Event("timeupdate"));
    });
    await expect(page.locator('article [aria-current="true"]')).toHaveText(section(8));
    await page.evaluate((fail) => window.queueTest.release[0](fail), failOldRequest);
    await expectPlayback(page, [8]);
    await expect.poll(() => page.evaluate(() => window.queueTest.generated)).toEqual([0, 8, 9, 10, 11]);
    // A late ended event for the replaced source must not skip the current section.
    await page.locator("audio").dispatchEvent("ended");
    await expect(page.locator('article [aria-current="true"]')).toHaveText(section(8));
    await finishSection(page);
    await expectPlayback(page, [8, 9]);
  });
}

test("jumping to an in-flight look-ahead chunk adopts it without generating it twice", async ({ page }) => {
  await setup(page, [1]);
  await page.getByRole("button", { name: "Listen", exact: true }).click();
  await expect.poll(() => page.evaluate(() => window.queueTest.generated)).toEqual([0, 1]);
  await jump(page, 1);
  await page.evaluate(() => window.queueTest.release[1]());
  await expectPlayback(page, [0, 1]);
  await expect.poll(() => page.evaluate(() => window.queueTest.completed)).toEqual([0, 1, 2, 3, 4, 5]);
  await finishSection(page);
  await expectPlayback(page, [0, 1, 2]);
});

test("a cached seek wins even when an older uncached selection finishes afterward", async ({ page }) => {
  await setup(page, [8]);
  await page.getByRole("button", { name: "Listen", exact: true }).click();
  await expect.poll(() => page.evaluate(() => window.queueTest.completed)).toEqual([0, 1, 2, 3, 4]);
  await jump(page, 8);
  await expect.poll(() => page.evaluate(() => window.queueTest.generated)).toEqual([0, 1, 2, 3, 4, 8]);
  await jump(page, 2);
  await expectPlayback(page, [0, 2]);
  await page.evaluate(() => window.queueTest.release[8]());
  await expect.poll(() => page.evaluate(() => window.queueTest.completed)).toEqual([0, 1, 2, 3, 4, 8, 5, 6]);
  await expect(page.locator('article [aria-current="true"]')).toHaveText(section(2));
  await finishSection(page);
  await expectPlayback(page, [0, 2, 3]);
});

test("pause and library navigation cancel pending playback without losing the selected position", async ({ page }) => {
  await setup(page, [0, 4]);
  await page.getByRole("button", { name: "Listen", exact: true }).click();
  await expect.poll(() => page.evaluate(() => window.queueTest.generated)).toEqual([0]);
  await page.getByRole("button", { name: "Pause", exact: true }).click();
  await jump(page, 3);
  await page.evaluate(() => window.queueTest.release[0]());
  await expect.poll(() => page.evaluate(() => window.queueTest.completed)).toEqual([0]);
  await expect(page.getByRole("button", { name: "Listen", exact: true })).toBeVisible();
  await expect(page.locator("audio")).not.toHaveAttribute("src");
  await page.getByRole("button", { name: "Listen", exact: true }).click();
  await expectPlayback(page, [3]);
  await expect.poll(() => page.evaluate(() => window.queueTest.generated)).toEqual([0, 3, 4]);
  await jump(page, 8);
  await page.getByRole("button", { name: "Library", exact: true }).click();
  await page.evaluate(() => window.queueTest.release[4]());
  await expect.poll(() => page.evaluate(() => window.queueTest.completed)).toEqual([0, 3, 4]);
  await page.getByRole("button", { name: /^html Queue/ }).click();
  await expect(page.locator('article [aria-current="true"]')).toHaveText(section(8));
  await expect(page.getByRole("button", { name: "Listen", exact: true })).toBeVisible();
  await expectPlayback(page, [3]);
  expect(await page.evaluate(() => window.queueTest.generated)).toEqual([0, 3, 4]);
});

test("a late rejected play promise cannot stop a newer selection or restart its old look-ahead", async ({ page }) => {
  await setup(page, [], true);
  await page.getByRole("button", { name: "Listen", exact: true }).click();
  await expectPlayback(page, [0]);
  await jump(page, 3);
  await expectPlayback(page, [0, 3]);
  await page.evaluate(() => window.queueTest.finishPlay!());
  await expect(page.getByRole("button", { name: "Pause", exact: true })).toBeVisible();
  await expect.poll(() => page.evaluate(() => window.queueTest.generated)).toEqual([0, 3, 4, 5, 6, 7]);
  await finishSection(page);
  await expectPlayback(page, [0, 3, 4]);
});
