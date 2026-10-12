import { test, expect, type Page, type BrowserContext } from "@playwright/test";
import { gzipSync, gunzipSync } from "node:zlib";
import { createHash } from "node:crypto";

test.skip(process.env.EDU_ENABLED !== "true", "Build and run with EDU_ENABLED=true to test the school offering");
const schoolId = "00000000-0000-4000-8000-000000000001";
const userId = "00000000-0000-4000-8000-000000000002";
const classId = "00000000-0000-4000-8000-000000000003";
const assignmentId = "00000000-0000-4000-8000-000000000004";
const versionId = "00000000-0000-4000-8000-000000000005";
const documentId = "00000000-0000-4000-8000-000000000006";
const assignment = { id: assignmentId, schoolId, title: "Class reading", instructions: "Read or listen to this chapter.", createdBy: userId,
  status: "published", availableAt: "2026-01-01T13:00:00Z", dueAt: "2026-12-01T13:00:00Z", closesAt: null,
  classIds: [classId], versionIds: [versionId], revision: 1, canManage: false };
const document = { id: versionId, documentId, title: "Original school PDF", filename: "school.pdf", format: "pdf", status: "ready", blockCount: 2, createdBy: userId };

function pdf() {
  const passage = "The original school PDF is shared with every enrolled student.";
  const stream = `BT /F1 16 Tf 40 700 Td (${passage}) Tj ET`;
  const objects = ["<< /Type /Catalog /Pages 2 0 R >>", "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
    "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 5 0 R >> >> /Contents 4 0 R >>",
    `<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`, "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>"];
  let output = "%PDF-1.4\n"; const offsets: number[] = [];
  objects.forEach((object, index) => { offsets.push(Buffer.byteLength(output)); output += `${index + 1} 0 obj\n${object}\nendobj\n`; });
  const xref = Buffer.byteLength(output);
  output += `xref\n0 6\n0000000000 65535 f \n${offsets.map((offset) => `${String(offset).padStart(10, "0")} 00000 n \n`).join("")}trailer\n<< /Size 6 /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`;
  return Buffer.from(output);
}

function wav() {
  const bytes = Buffer.alloc(44 + 24_000 * 4 * 2);
  bytes.write("RIFF", 0); bytes.writeUInt32LE(bytes.length - 8, 4); bytes.write("WAVEfmt ", 8); bytes.writeUInt32LE(16, 16);
  bytes.writeUInt16LE(1, 20); bytes.writeUInt16LE(1, 22); bytes.writeUInt32LE(24000, 24); bytes.writeUInt32LE(48000, 28);
  bytes.writeUInt16LE(2, 32); bytes.writeUInt16LE(16, 34); bytes.write("data", 36); bytes.writeUInt32LE(bytes.length - 44, 40);
  return bytes;
}

async function signIn(context: BrowserContext) {
  await context.addInitScript(({ userId }) => {
    const expires = Math.floor(Date.now() / 1000) + 3600;
    const payload = btoa(JSON.stringify({ sub: userId, exp: expires, aud: "authenticated" })).replace(/=/g, "");
    localStorage.setItem("freereader-edu-auth", JSON.stringify({ access_token: `eyJhbGciOiJIUzI1NiJ9.${payload}.test`, refresh_token: "test-refresh", expires_at: expires, expires_in: 3600, token_type: "bearer",
      user: { id: userId, aud: "authenticated", email: "student@school.test", app_metadata: { provider: "google", providers: ["google"] }, user_metadata: {}, created_at: "2026-01-01T00:00:00Z" } }));
  }, { userId });
}

async function setup(page: Page, role: "teacher" | "student" | "admin" = "student") {
  let progress: Record<string, unknown> | null = null;
  const consumerRequests: string[] = [];
  const original = pdf();
  const reading = gzipSync(JSON.stringify({ schemaVersion: 1, cover: null, document: {
    id: versionId, title: document.title, format: "pdf", sourceName: "school.pdf", size: original.length, language: "en", createdAt: "2026-01-01T00:00:00Z", updatedAt: "2026-01-01T00:00:00Z",
    chapters: [{ title: "Chapter one", startBlockIndex: 0 }], blocks: [{ index: 0, chapterIndex: 0, isHeading: false, page: 1, text: "The original school PDF is shared with every enrolled student." }, { index: 1, chapterIndex: 0, isHeading: false, page: 1, text: "Students can listen from another browser." }] } }));
  const hash = (value: Buffer) => createHash("sha256").update(value).digest("hex");
  page.on("request", (request) => { if (/\/api\/(telemetry|tts)$|\/freereader\/sync|\/ingest(?:\/|\?)/.test(request.url())) consumerRequests.push(request.url()); });
  await page.route("**/api/edu/**", async (route) => {
    const path = new URL(route.request().url()).pathname.replace("/api/edu/", "");
    const method = route.request().method();
    if (path === "session") return route.fulfill({ json: { userId, email: "student@school.test", schools: [{ id: schoolId, name: "Example school", timezone: "America/New_York", role }] } });
    if (path.endsWith("/dashboard")) return route.fulfill({ json: { classes: [{ id: classId, name: "English", term: "Fall" }], assignments: [{ ...assignment, canManage: role === "teacher" }] } });
    if (path.endsWith("/telemetry")) return route.fulfill({ status: 202, json: { accepted: 1 } });
    if (path.endsWith("/speech")) return route.fulfill({ contentType: "audio/wav", body: wav(), headers: { "X-Audio-Duration": "4" } });
    if (path.endsWith("/progress") && method === "PUT") { const payload = route.request().postDataJSON(); progress = { ...payload, completedAt: payload.completed || progress?.completedAt ? new Date().toISOString() : null }; return route.fulfill({ json: { progress } }); }
    if (path === `assignments/${assignmentId}`) return route.fulfill({ json: { assignment: { ...assignment, canManage: role === "teacher" }, available: true, documents: [document] } });
    if (path === `assignments/${assignmentId}/documents/${versionId}`) return route.fulfill({ json: { originalUrl: new URL("/edu-test-original", route.request().url()).href, readingUrl: new URL("/edu-test-reading", route.request().url()).href, originalSha256: hash(original), readingSha256: hash(reading), progress } });
    if (path.endsWith("/documents")) return route.fulfill({ json: { documents: [document] } });
    return route.fulfill({ status: 404, json: { error: "test_unhandled_route" } });
  });
  await page.route("**/edu-test-original", (route) => route.fulfill({ body: original, contentType: "application/pdf" }));
  await page.route("**/edu-test-reading", (route) => route.fulfill({ body: reading, contentType: "application/gzip" }));
  return { consumerRequests, progress: () => progress };
}

test("student opens hosted original PDF, listens, saves position, and reloads without a local library", async ({ page, context }) => {
  await signIn(context);
  const state = await setup(page);
  await page.goto(`/edu/assignments/${assignmentId}`);
  await page.getByRole("link", { name: `Read ${document.title}`, exact: true }).click();
  await openTools(page);
  await expect(page.getByRole("navigation", { name: "Original document pages" })).toContainText("Page 1 of 1");
  await expect(page.locator('[class*="textLayer"]')).toContainText("The original school PDF");
  await page.getByRole("button", { name: "E-reader", exact: true }).click();
  await page.locator("article p").filter({ hasText: "Students can listen" }).click();
  await expect(page.locator('[aria-current="true"]')).toContainText("Students can listen");
  await page.getByRole("button", { name: "Listen", exact: true }).click();
  await expect.poll(() => page.locator("audio").evaluate((element: HTMLAudioElement) => !element.paused)).toBe(true);
  await page.getByRole("button", { name: "Pause", exact: true }).click();
  await expect.poll(() => state.progress()?.blockIndex).toBe(1);
  await page.reload();
  await openTools(page);
  await page.getByRole("button", { name: "E-reader", exact: true }).click();
  await expect(page.locator('article [aria-current="true"]')).toContainText("Students can listen");
  expect(state.consumerRequests).toEqual([]);
  expect(await page.evaluate(() => localStorage.getItem("freereaderTelemetryQueue"))).toBeNull();
});

test("teacher dashboard exposes authoring while students see only assigned reading", async ({ page, context }) => {
  await signIn(context);
  await setup(page, "teacher");
  await page.goto("/edu");
  await expect(page.getByRole("heading", { name: "Example school" })).toBeVisible();
  await expect(page.getByRole("link", { name: "New assignment" })).toBeVisible();
  await page.getByRole("link", { name: "New assignment" }).click();
  await expect(page.getByRole("heading", { name: "Create reading assignment" })).toBeVisible();
  await expect(page.getByLabel("Upload documents")).toBeVisible();
  await expect(page.getByText("All times are in America/New_York.", { exact: false })).toBeVisible();
});

test("teacher uploads original plus parsed reading copy and publishes an assignment with verified version references", async ({ page, context }) => {
  await signIn(context);
  const state = await setup(page, "teacher");
  const uploadedId = "00000000-0000-4000-8000-000000000007";
  const file = Buffer.from("Students can listen to their teacher's reading assignment. This original document is retained for every class.");
  const uploaded = { ...document, id: uploadedId, title: "lesson", filename: "lesson.txt", format: "txt" };
  await page.addInitScript(() => {
    const uploads: Record<string, number[]> = {};
    (window as unknown as { eduUploads: Record<string, number[]> }).eduUploads = uploads;
    const fetch = window.fetch;
    window.fetch = async (input, init) => {
      if (typeof input === "string" && input.includes("/edu-test-upload-") && init?.body instanceof Blob) {
        uploads[input.split("/").pop()!] = [...new Uint8Array(await init.body.arrayBuffer())];
      }
      return fetch(input, init);
    };
  });
  let originalBytes: Buffer | null = null, readingBytes: Buffer | null = null;
  let published: Record<string, unknown> | null = null;
  const publishedAssignment = () => published;
  await page.route("**/edu-test-upload-original", async (route) => { originalBytes = route.request().postDataBuffer(); await route.fulfill({ status: 200, json: {} }); });
  await page.route("**/edu-test-upload-reading", async (route) => { readingBytes = route.request().postDataBuffer(); await route.fulfill({ status: 200, json: {} }); });
  await page.route(`**/api/edu/schools/${schoolId}/documents`, async (route) => {
    if (route.request().method() === "GET") return route.fulfill({ json: { documents: [] } });
    const payload = route.request().postDataJSON();
    expect(payload.format).toBe("txt"); expect(payload.originalBytes).toBe(file.length);
    const origin = new URL(route.request().url()).origin;
    return route.fulfill({ status: 201, json: { id: uploadedId, originalUploadUrl: `${origin}/edu-test-upload-original`, readingUploadUrl: `${origin}/edu-test-upload-reading` } });
  });
  await page.route(`**/api/edu/documents/${uploadedId}/complete`, async (route) => {
    // WebKit does not expose File/Blob bodies through Playwright's request API.
    // Inspect the exact bytes passed to fetch when that transport field is absent.
    const uploads = await page.evaluate(() => (window as unknown as { eduUploads: Record<string, number[]> }).eduUploads);
    originalBytes ??= Buffer.from(uploads["edu-test-upload-original"]);
    readingBytes ??= Buffer.from(uploads["edu-test-upload-reading"]);
    expect(originalBytes).toEqual(file); expect(readingBytes).not.toBeNull();
    const content = JSON.parse(gunzipSync(readingBytes!).toString()).document;
    expect(content.blocks.map((block: { text: string }) => block.text).join(" ")).toContain("This original document is retained");
    expect(content.speechTexts.length).toBe(content.blocks.length);
    return route.fulfill({ json: { document: uploaded } });
  });
  await page.route(`**/api/edu/schools/${schoolId}/assignments`, async (route) => {
    published = route.request().postDataJSON();
    return route.fulfill({ status: 201, json: { assignment: { ...assignment, ...published } } });
  });
  await page.goto("/edu/assignments/new");
  await page.getByLabel("Title", { exact: true }).fill("Week one");
  await page.getByRole("checkbox", { name: "English", exact: true }).check();
  await page.getByLabel("Upload documents").setInputFiles({ name: "lesson.txt", mimeType: "text/plain", buffer: file });
  await expect(page.getByText("Documents uploaded and verified.")).toBeVisible();
  await page.getByRole("button", { name: "Publish assignment", exact: true }).click();
  await expect.poll(() => published?.status).toBe("published");
  expect(publishedAssignment()?.versionIds).toEqual([uploadedId]); expect(publishedAssignment()?.classIds).toEqual([classId]);
  expect(state.consumerRequests).toEqual([]);
});

test("untrusted school reading text cannot execute markup and consumer capture/support are excluded", async ({ page, context }) => {
  await signIn(context);
  const state = await setup(page);
  const payload = '<img src="https://evil.test/steal" onerror="window.eduSecurityLeak=true"><script>window.eduSecurityLeak=true</script>';
  const original = pdf();
  const reading = gzipSync(JSON.stringify({ schemaVersion: 1, cover: null, document: { id: versionId, title: document.title,
    format: "pdf", sourceName: "school.pdf", size: original.length, language: "en", createdAt: "2026-01-01T00:00:00Z", updatedAt: "2026-01-01T00:00:00Z",
    chapters: [{ title: "Reading", startBlockIndex: 0 }], blocks: [{ index: 0, chapterIndex: 0, isHeading: false, page: 1, text: payload }] } }));
  const hash = (value: Buffer) => createHash("sha256").update(value).digest("hex");
  await page.route("**/edu-test-reading", (route) => route.fulfill({ body: reading, contentType: "application/gzip" }));
  await page.route(`**/api/edu/assignments/${assignmentId}/documents/${versionId}`, (route) => route.fulfill({ json: {
    originalUrl: new URL("/edu-test-original", route.request().url()).href, readingUrl: new URL("/edu-test-reading", route.request().url()).href,
    originalSha256: hash(original), readingSha256: hash(reading), progress: null } }));
  await page.goto(`/edu/assignments/${assignmentId}`);
  await page.getByRole("link", { name: `Read ${document.title}`, exact: true }).click();
  await openTools(page);
  await page.getByRole("button", { name: "E-reader", exact: true }).click();
  await expect(page.locator('article [aria-current="true"]')).toHaveText(payload);
  await expect(page.locator('img[src="https://evil.test/steal"]')).toHaveCount(0);
  expect(await page.evaluate(() => (window as unknown as { eduSecurityLeak?: boolean }).eduSecurityLeak)).toBeUndefined();
  await expect(page.getByRole("button", { name: "Contact support", exact: true })).toHaveCount(0);
  expect(state.consumerRequests).toEqual([]);
});

async function openTools(page: Page) {
  await expect(page.locator("article")).toBeVisible();
  const toggle = page.getByRole("button", { name: "Expand reading tools" });
  if (await toggle.isVisible()) await toggle.click();
}

test("staff grid reviews pasted/imported rows and creates one named invitation per recipient", async ({ page, context }) => {
  await signIn(context); await setup(page, "admin");
  let submitted: { records: { name: string; email: string }[]; role: string } | null = null;
  const result = () => submitted;
  await page.route(`**/api/edu/schools/${schoolId}/members`, (route) => route.fulfill({ json: { members: [], invitations: [] } }));
  await page.route(`**/api/edu/schools/${schoolId}/invitations/bulk`, (route) => {
    submitted = route.request().postDataJSON();
    return route.fulfill({ status: 201, json: { invitations: submitted!.records.map((record, index) => ({ ...record, id: String(index), url: `https://school.test/invite/${index}`, status: "pending", expiresAt: "2026-10-20T00:00:00Z" })) } });
  });
  await page.goto("/edu/admin");
  await page.getByLabel("Staff name 1", { exact: true }).evaluate((input) => {
    const clipboard = new DataTransfer(); clipboard.setData("text/plain", "Alice Smith\talice@school.test\nBob Jones\tbob@school.test");
    input.dispatchEvent(new ClipboardEvent("paste", { clipboardData: clipboard, bubbles: true, cancelable: true }));
  });
  await expect(page.getByLabel("Staff name 2", { exact: true })).toHaveValue("Bob Jones");
  await page.getByLabel("Import staff file", { exact: true }).setInputFiles({ name: "staff.csv", mimeType: "text/csv", buffer: Buffer.from('Email Address,Full Name\ncarol@school.test,"Carol, Jones"') });
  await expect(page.getByLabel("Staff name 3", { exact: true })).toHaveValue("Carol, Jones");
  await page.getByRole("button", { name: "Create 3 invitations", exact: true }).click();
  await expect(page.getByRole("heading", { name: "3 invitations created" })).toBeVisible();
  expect(result()?.records).toHaveLength(3); expect(result()?.role).toBe("teacher");
  await expect(page.getByLabel("Invitation link for Alice Smith")).toBeVisible();
});

test("student share link opens the actual FreeReader interface without an account and plays audio", async ({ page }) => {
  // CI uses WAV; deployment verification supplies real backend AAC in memory.
  const audio = process.env.EDU_TEST_AUDIO_BASE64
    ? { audio: process.env.EDU_TEST_AUDIO_BASE64, type: process.env.EDU_TEST_AUDIO_TYPE!, duration: process.env.EDU_TEST_AUDIO_DURATION! }
    : { audio: wav().toString("base64"), type: "audio/wav", duration: "4" };
  const token = "public-assignment-capability-token";
  const original = pdf();
  const reading = gzipSync(JSON.stringify({ schemaVersion: 1, cover: null, document: { id: versionId, title: document.title, format: "pdf", size: original.length,
    sourceName: "school.pdf", language: "en", createdAt: "2026-01-01T00:00:00Z", updatedAt: "2026-01-01T00:00:00Z",
    chapters: [{ title: "Chapter", startBlockIndex: 0 }], blocks: [{ index: 0, chapterIndex: 0, isHeading: false, page: 1, text: "The original school PDF is shared with every enrolled student." }] } }));
  const hash = (value: Buffer) => createHash("sha256").update(value).digest("hex");
  let authenticated = false;
  await page.route("**/api/edu/**", (route) => {
    if (route.request().headers().authorization) authenticated = true;
    const path = new URL(route.request().url()).pathname;
    if (path.endsWith("/speech")) return route.fulfill({ body: Buffer.from(audio.audio, "base64"), contentType: audio.type, headers: { "X-Audio-Duration": audio.duration } });
    if (path.endsWith("/telemetry")) return route.fulfill({ status: 202, json: {} });
    if (path.endsWith(`/documents/${versionId}`)) return route.fulfill({ json: { originalUrl: new URL("/shared-test-original", route.request().url()).href,
      readingUrl: new URL("/shared-test-reading", route.request().url()).href, originalSha256: hash(original), readingSha256: hash(reading), progress: null } });
    if (path.endsWith(`/shared/${token}`)) return route.fulfill({ json: { assignment, documents: [document], school: { name: "Hummingbird Academy" } } });
    return route.fulfill({ status: 401, json: { error: "sign_in_required" } });
  });
  await page.route("**/shared-test-original", (route) => route.fulfill({ body: original, contentType: "application/pdf" }));
  await page.route("**/shared-test-reading", (route) => route.fulfill({ body: reading, contentType: "application/gzip" }));
  await page.goto(`/edu/shared/${token}`);
  await expect(page.getByRole("button", { name: "Sign in with Google" })).toHaveCount(0);
  await expect(page.getByRole("navigation", { name: "School navigation" })).toHaveCount(0);
  await expect(page.locator("article canvas")).toBeVisible();
  await page.getByRole("button", { name: "Listen", exact: true }).click();
  await expect.poll(() => page.locator("audio").evaluate((element: HTMLAudioElement) => !element.paused && element.currentTime > .1)).toBe(true);
  expect(authenticated).toBe(false);
});
