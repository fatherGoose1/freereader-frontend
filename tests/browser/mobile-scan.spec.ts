import { test, expect } from "@playwright/test";
import { loadEnvConfig } from "@next/env";
import { gzipSync } from "node:zlib";

loadEnvConfig(process.cwd());

const id = "11111111-1111-4111-8111-111111111111";
const linkToken = "a".repeat(43);
const path = `/api/v1/freereader/scans/mobile/${id}`;

test("mobile handoff reviews multiple photos and sends only scoped JPEG uploads", async ({ page }) => {
  let deviceToken = "";
  let uploads = 0;
  let prepared: unknown;
  let submitted = false;
  let claims = 0;
  const expiresAt = new Date(Date.now() + 15 * 60_000).toISOString();
  await page.addInitScript(() => {
    const bytes: number[][] = [];
    (window as unknown as { scanUploadBytes: number[][] }).scanUploadBytes = bytes;
    const original = window.fetch;
    window.fetch = async (input, init) => {
      if (String(input).includes("/pages/") && init?.body instanceof Blob) {
        bytes.push(Array.from(new Uint8Array(await init.body.arrayBuffer()).slice(0, 2)));
      }
      return original(input, init);
    };
  });
  await page.route(`**${path}**`, async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    if (url.pathname.endsWith("/claim")) {
      claims++;
      expect(request.headers().authorization).toBe(`Bearer ${linkToken}`);
      deviceToken = request.postDataJSON().deviceToken;
      expect(deviceToken).toHaveLength(64);
      return route.fulfill({ json: { id, status: "claimed", title: "My notes", expiresAt } });
    }
    expect(request.headers().authorization).toBe(`Bearer ${deviceToken}`);
    expect(request.headers().referer).toBeUndefined();
    if (url.pathname.endsWith("/prepare")) prepared = request.postDataJSON();
    if (/\/pages\/\d$/.test(url.pathname)) {
      expect(request.headers()["content-type"]).toBe("image/jpeg");
      uploads++;
    }
    if (url.pathname.endsWith("/complete")) submitted = true;
    return route.fulfill({ json: { title: "My notes", status: submitted ? "submitted" : "claimed", expiresAt } });
  });
  // Exercise the full-image fallback when edge detection is unavailable.
  await page.route("**/scan-opencv.js", (route) => route.fulfill({ status: 503, body: "Unavailable" }));
  const response = await page.goto(`/scan-mobile#${id}.${linkToken}`);
  expect(response?.headers()["referrer-policy"]).toBe("no-referrer");
  expect(response?.headers()["x-robots-tag"]).toBe("noindex, nofollow");
  const dialog = page.getByRole("dialog", { name: "Scan pages" });
  await expect(dialog).toBeVisible();
  await expect(page).toHaveURL(/\/scan-mobile$/);
  await expect(dialog.getByLabel("Document title")).toHaveValue("My notes");
  await expect(dialog.locator('input[capture="environment"]')).toHaveCount(1);
  expect(await page.evaluate(() => sessionStorage.getItem("freereader-mobile-scan"))).not.toContain(linkToken);
  // Reload resumes the device capability without replaying the link.
  await page.reload();
  await expect(dialog).toBeVisible();
  expect(claims).toBe(1);
  const image = await page.evaluate(() => {
    const canvas = document.createElement("canvas"); canvas.width = 600; canvas.height = 800;
    const context = canvas.getContext("2d")!; context.fillStyle = "white"; context.fillRect(0, 0, 600, 800);
    context.fillStyle = "black"; context.font = "30px sans-serif"; context.fillText("A page of notes", 50, 100);
    return canvas.toDataURL("image/png").split(",")[1];
  });
  await dialog.locator('input[multiple]').setInputFiles([
    { name: "first.png", mimeType: "image/png", buffer: Buffer.from(image, "base64") },
    { name: "second.png", mimeType: "image/png", buffer: Buffer.from(image, "base64") },
  ]);
  await expect(dialog.getByText("1 more photo to review")).toBeVisible();
  await dialog.getByRole("button", { name: "Keep full image" }).click();
  await expect(dialog.getByRole("button", { name: "Keep full image" })).toBeEnabled();
  await dialog.getByRole("button", { name: "Keep full image" }).click();
  await expect(dialog.getByText("2 / 20 pages")).toBeVisible();
  await dialog.getByRole("button", { name: "Move page 2 earlier" }).click();
  await dialog.getByRole("button", { name: "Send to computer" }).click();
  await expect(page.getByRole("heading", { name: "Pages sent to your computer" })).toBeVisible();
  expect(prepared).toEqual({ title: "My notes", pages: 2 });
  expect(uploads).toBe(2);
  expect(await page.evaluate(() => (window as unknown as { scanUploadBytes: number[][] }).scanUploadBytes)).toEqual([[0xff, 0xd8], [0xff, 0xd8]]);
  expect(submitted).toBe(true);
});

test("expired or reused links cannot open the mobile scanner", async ({ page }) => {
  await page.route(`**${path}/claim`, (route) => route.fulfill({ status: 410, json: { error: "mobile_scan_expired" } }));
  await page.goto(`/scan-mobile#${id}.${linkToken}`);
  await expect(page.locator("main").getByRole("alert")).toContainText("expired or has already been used");
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(page).toHaveURL(/\/scan-mobile$/);
});

test("computer displays a QR link and automatically imports the completed phone scan", async ({ page }) => {
  const supabase = process.env.NEXT_PUBLIC_SUPABASE_URL;
  test.skip(!supabase, "Supabase frontend URL is needed for browser auth simulation");
  const user = { id, email: "scanner@example.com", aud: "authenticated", role: "authenticated",
    app_metadata: { provider: "google", providers: ["google"] }, user_metadata: {}, created_at: new Date().toISOString() };
  const auth = { access_token: "scan-owner-test-token", refresh_token: "scan-refresh", token_type: "bearer", expires_in: 3600,
    expires_at: Math.floor(Date.now() / 1000) + 3600, user };
  await page.addInitScript(({ key, session, owner }) => {
    localStorage.setItem(key, session);
    localStorage.setItem(`freereader-first-login-gold:${owner}`, "shown");
  }, {
    key: `sb-${new URL(supabase!).hostname.split(".")[0]}-auth-token`, session: JSON.stringify(auth), owner: id,
  });
  await page.route("**/auth/v1/user", (route) => route.fulfill({ json: user }));
  await page.route("**/api/reader-usage**", (route) => route.fulfill({ json: { plan: "free", gold_offer_opted_in: false } }));
  await page.route("**/api/telemetry", (route) => route.fulfill({ status: 202, json: {} }));
  let status = "pending";
  const scanId = "22222222-2222-4222-8222-222222222222";
  const expiresAt = new Date(Date.now() + 300_000).toISOString();
  await page.route("**/api/v1/freereader/scans/mobile-sessions**", (route) => {
    expect(route.request().headers().authorization).toBe("Bearer scan-owner-test-token");
    if (route.request().method() === "DELETE") return route.fulfill({ status: 204 });
    return route.fulfill({ json: { id, status, expiresAt, title: "Phone notes", scanId: status === "submitted" ? scanId : null,
      ...(route.request().method() === "POST" ? { token: linkToken } : {}) } });
  });
  await page.route(`**/api/v1/freereader/scans/${scanId}`, (route) => route.fulfill({ json: {
    id: scanId, status: "ready", pages: 1, processedPages: 1,
    originalUrl: "https://scan-storage.test/original.pdf", readingUrl: "https://scan-storage.test/reading.json.gz",
  } }));
  const book = { id: scanId, title: "Phone notes", format: "txt", sourceName: "Phone notes.pdf", sourceIdentifier: `scan:${scanId}`,
    size: 100, language: "en", createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
    chapters: [{ title: "Page 1", startBlockIndex: 0 }], blocks: [{ index: 0, chapterIndex: 0, isHeading: false, text: "Recognized text from the phone scan." }] };
  await page.route("https://scan-storage.test/original.pdf", (route) => route.fulfill({ contentType: "application/pdf", body: "%PDF-1.7 test" }));
  await page.route("https://scan-storage.test/reading.json.gz", (route) => route.fulfill({ contentType: "application/gzip",
    body: gzipSync(JSON.stringify({ schemaVersion: 1, document: book, cover: null })) }));
  await page.goto("/reader/audiobooks");
  await page.getByRole("button", { name: /^Scan Pages/ }).click();
  const dialog = page.getByRole("dialog", { name: "Scan pages" });
  await dialog.getByLabel("Document title").fill("Phone notes");
  await dialog.getByRole("button", { name: "Scan with phone" }).click();
  await expect(dialog.getByRole("img", { name: "QR code for the secure mobile scan link" })).toBeVisible();
  await expect(dialog.getByLabel("Secure scan link")).toHaveValue(new RegExp(`/scan-mobile#${id}\\.${linkToken}$`));
  status = "claimed";
  await expect(dialog.getByText("Phone connected.", { exact: false })).toBeVisible({ timeout: 10_000 });
  await expect(dialog.getByLabel("Secure scan link")).toHaveCount(0);
  status = "submitted";
  await expect(dialog).toHaveCount(0, { timeout: 10_000 });
  await expect(page.locator("article")).toContainText("Recognized text from the phone scan.");
});
