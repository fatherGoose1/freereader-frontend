import { test, expect } from "@playwright/test";
import { loadEnvConfig } from "@next/env";

loadEnvConfig(process.cwd());

const prose = "Once upon a time, an author wrote a story for readers to enjoy. The next chapter begins with a little adventure in a familiar place.";

test("anonymous author keeps metadata and selected book file through a reload; publishing stays locked", async ({ page }) => {
  await page.goto("/authors/submissions");
  await expect(page.getByRole("heading", { name: "Submit a book." })).toBeVisible();
  await expect(page.getByRole("navigation", { name: "Author navigation" }).getByRole("link", { name: /Submit a book|Dashboard/ })).toHaveCount(0);
  await expect(page.getByLabel("Book title")).toHaveCount(0);
  await expect(page.getByLabel("Bio")).toBeVisible();
  await page.getByRole("button", { name: "Next", exact: true }).click();
  await expect(page.getByLabel("Book title")).toHaveCount(0);
  await page.getByLabel("Display name").fill("Robin Writer");
  await page.getByRole("button", { name: "Next", exact: true }).click();
  await expect(page.getByLabel("Book title")).toBeVisible();
  await expect(page.getByLabel("Book cover")).toBeVisible();
  await expect(page.getByRole("checkbox", { name: /I confirm that I own or control the rights/ })).toBeVisible();
  await page.getByRole("checkbox", { name: /I confirm that I own or control the rights/ }).check();
  await page.getByLabel("Book title").fill("The River Story");
  await page.locator('input[type="file"][accept*=".epub"]').setInputFiles({ name: "river.txt", mimeType: "text/plain", buffer: Buffer.from(prose) });
  await expect(page.getByRole("button", { name: "Publish & get share link" })).toBeDisabled();
  await expect(page.getByRole("button", { name: "Sign in with Google" }).first()).toBeVisible();
  await expect(page.getByRole("status").filter({ hasText: "Draft saved in this browser." })).toBeVisible();
  await page.reload();
  await expect(page.getByLabel("Book title")).toBeVisible();
  await page.getByRole("button", { name: "Back to author profile" }).click();
  await expect(page.getByLabel("Display name")).toHaveValue("Robin Writer");
  await expect(page.getByLabel("Book title")).toHaveCount(0);
  await page.getByRole("button", { name: "Next", exact: true }).click();
  await expect(page.getByLabel("Book title")).toHaveValue("The River Story");
  await expect(page.getByRole("checkbox", { name: /I confirm that I own or control the rights/ })).toBeChecked();
  await expect(page.getByText("river.txt")).toBeVisible();
  await expect(page.getByRole("button", { name: "Publish & get share link" })).toBeDisabled();
  await expect(page.getByRole("status").filter({ hasText: "Draft saved in this browser." })).toBeVisible();
});

test("Google session restores the book and unlocks publishing without submitting automatically", async ({ page }) => {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  if (!url) test.skip(true, "Supabase frontend URL is needed for browser auth simulation");
  const userId = "11111111-1111-4111-8111-111111111111";
  const storageKey = `sb-${new URL(url!).hostname.split(".")[0]}-auth-token`;
  const session = {
    access_token: "test-token", refresh_token: "test-refresh", token_type: "bearer", expires_in: 3600,
    expires_at: Math.floor(Date.now() / 1000) + 3600,
    user: { id: userId, email: "robin@example.com", aud: "authenticated", role: "authenticated",
      app_metadata: { provider: "google", providers: ["google"] }, user_metadata: {}, created_at: new Date().toISOString(),
    },
  };
  const saved: Array<Record<string, unknown>> = [];
  let rejectFirstBookSave = true;
  await page.route("**/rest/v1/**", async (route) => {
    const request = route.request();
    const resource = new URL(request.url()).pathname.split("/").at(-1);
    if (request.method() === "GET") return route.fulfill({ status: 200, json: [] });
    if (resource === "author_books") {
      saved.push(request.postDataJSON());
      if (rejectFirstBookSave) {
        rejectFirstBookSave = false;
        return route.fulfill({ status: 503, json: { message: "Please retry this save." } });
      }
    }
    return route.fulfill({ status: 201, json: {} });
  });
  await page.route("**/auth/v1/user", (route) => route.fulfill({ status: 200, json: session.user }));
  await page.route("**/rest/v1/rpc/enroll_author", (route) => route.fulfill({ status: 200, json: null }));
  await page.goto("/authors/submissions");
  await page.getByLabel("Display name").fill("Robin Writer");
  await page.getByRole("button", { name: "Next", exact: true }).click();
  await page.getByLabel("Book title").fill("The River Story");
  await page.getByRole("button", { name: "Choose a voice" }).click();
  const voices = page.getByRole("dialog", { name: "Choose a voice" });
  await expect(voices.getByRole("button", { name: "Preview River" })).toBeVisible();
  await voices.getByRole("button", { name: "River", exact: true }).click();
  await voices.getByRole("button", { name: "Close voice picker" }).click();
  await expect(page.getByText("Starts with River.", { exact: false })).toBeVisible();
  await page.locator('input[type="file"][accept*=".epub"]').setInputFiles({ name: "river.txt", mimeType: "text/plain", buffer: Buffer.from(prose) });
  await expect(page.getByRole("button", { name: "Publish & get share link" })).toBeDisabled();
  await expect(page.getByRole("status").filter({ hasText: "Draft saved in this browser." })).toBeVisible();

  await page.evaluate(([key, data]) => {
    localStorage.setItem(key, data);
    sessionStorage.setItem("freereader-author-oauth-return", JSON.stringify({ path: "/authors/submissions", createdAt: Date.now() }));
  }, [storageKey, JSON.stringify(session)]);
  await page.goto("/reader/audiobooks");
  await expect(page).toHaveURL(/\/authors\/submissions$/);
  await expect(page.getByLabel("Book title")).toHaveValue("The River Story");
  await page.getByRole("button", { name: "Back to author profile" }).click();
  await expect(page.getByLabel("Display name")).toHaveValue("Robin Writer");
  await page.getByRole("button", { name: "Next", exact: true }).click();
  await expect(page.getByText("river.txt")).toBeVisible();
  await expect(page.getByRole("region", { name: "Google sign-in required" })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Publish & get share link" })).toBeEnabled();
  expect(saved).toHaveLength(0);
  await page.getByRole("button", { name: "Publish & get share link" }).click();
  await expect(page.locator("form").getByRole("alert")).toContainText("Confirm your publishing rights");
  expect(saved).toHaveLength(0);
  await page.getByRole("checkbox", { name: /I confirm that I own or control the rights/ }).check();
  await page.getByRole("button", { name: "Publish & get share link" }).click();
  await expect(page.locator("form").getByRole("alert")).toContainText("Please retry this save.");
  await expect(page.getByLabel("Book title")).toHaveValue("The River Story");
  await expect(page.getByText("river.txt")).toBeVisible();
  await page.getByRole("button", { name: "Publish & get share link" }).click();
  await expect(page.getByRole("heading", { name: "Your story. Ready to listen." })).toBeVisible();
  expect(saved).toHaveLength(2);
  expect(saved[0].slug).toBe(saved[1].slug);
  expect(saved[0].slug).toMatch(/^the-river-story-[a-f0-9]{8}$/);
  expect(saved[0]).toMatchObject({ title: "The River Story", author_name: "Robin Writer", status: "published", default_voice: "af_river",
    document: { format: "txt", sourceName: "river.txt" },
  });
  expect(Date.parse(String(saved[0].rights_certified_at))).toBeGreaterThan(0);
  await expect(page.getByRole("link", { name: /^https:\/\/freereader\.io\/books\/the-river-story-[a-f0-9]{8}$/ })).toBeVisible();
});

test("books added from public links reopen on their public page from the reader library", async ({ page }) => {
  const id = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
  await page.goto("/reader/audiobooks");
  await expect(page.getByRole("heading", { name: "Your library" })).toBeVisible();
  await page.evaluate((bookId) => new Promise<void>((resolve, reject) => {
    const open = indexedDB.open("freereader-web");
    open.onsuccess = () => {
      const db = open.result;
      const tx = db.transaction("books", "readwrite");
      const now = new Date().toISOString();
      tx.objectStore("books").put({
        id: bookId, title: "Story title", author: "Robin Writer", format: "txt", sourceName: "story.txt",
        sourceIdentifier: `author-book:${bookId}`, sourceUrl: "/books/story-1234abcd", size: 80,
        createdAt: now, updatedAt: now, chapters: [],
        blocks: [{ index: 0, text: "A published story.", chapterIndex: 0, isHeading: false }],
        position: { blockIndex: 0, offsetSeconds: 0, speed: 1 },
      });
      tx.oncomplete = () => { db.close(); resolve(); };
      tx.onerror = () => reject(tx.error);
    };
    open.onerror = () => reject(open.error);
  }), id);
  await page.route("**/books/story-1234abcd", (route) => route.fulfill({ status: 200, contentType: "text/html", body: "Public book page" }));
  await page.reload();
  await page.getByRole("button", { name: /^txt Story title/ }).click();
  await expect(page).toHaveURL(/\/books\/story-1234abcd$/);
});
