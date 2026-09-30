import { test, expect } from "@playwright/test";
import { loadEnvConfig } from "@next/env";

loadEnvConfig(process.cwd());

const prose = "Once upon a time, an author wrote a story for readers to enjoy. The next chapter begins with a little adventure in a familiar place.";

test("anonymous author keeps metadata and selected book file through a reload; publishing stays locked", async ({ page }) => {
  await page.goto("/authors");
  await page.getByLabel("Display name").fill("Robin Writer");
  await page.getByLabel("Book title").fill("The River Story");
  await page.locator('input[type="file"][accept*=".epub"]').setInputFiles({ name: "river.txt", mimeType: "text/plain", buffer: Buffer.from(prose) });
  await expect(page.getByRole("button", { name: "Publish & get share link" })).toBeDisabled();
  await expect(page.getByRole("button", { name: "Sign in with Google" }).first()).toBeVisible();
  await expect(page.getByRole("status").filter({ hasText: "Draft saved in this browser." })).toBeVisible();
  await page.reload();
  await expect(page.getByLabel("Display name")).toHaveValue("Robin Writer");
  await expect(page.getByLabel("Book title")).toHaveValue("The River Story");
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
  await page.goto("/authors");
  await page.getByLabel("Display name").fill("Robin Writer");
  await page.getByLabel("Book title").fill("The River Story");
  await page.locator('input[type="file"][accept*=".epub"]').setInputFiles({ name: "river.txt", mimeType: "text/plain", buffer: Buffer.from(prose) });
  await expect(page.getByRole("button", { name: "Publish & get share link" })).toBeDisabled();

  await page.evaluate(([key, data]) => {
    localStorage.setItem(key, data);
    sessionStorage.setItem("freereader-author-oauth-return", JSON.stringify({ path: "/authors", createdAt: Date.now() }));
  }, [storageKey, JSON.stringify(session)]);
  await page.goto("/reader/audiobooks");
  await expect(page).toHaveURL(/\/authors$/);
  await expect(page.getByLabel("Display name")).toHaveValue("Robin Writer");
  await expect(page.getByText("river.txt")).toBeVisible();
  await expect(page.getByRole("region", { name: "Google sign-in required" })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Publish & get share link" })).toBeEnabled();
  expect(saved).toHaveLength(0);
  await page.getByRole("button", { name: "Publish & get share link" }).click();
  await expect(page.locator("form").getByRole("alert")).toContainText("Please retry this save.");
  await expect(page.getByLabel("Book title")).toHaveValue("The River Story");
  await expect(page.getByText("river.txt")).toBeVisible();
  await page.getByRole("button", { name: "Publish & get share link" }).click();
  await expect(page.getByRole("heading", { name: "Your story. Ready to listen." })).toBeVisible();
  expect(saved).toHaveLength(2);
  expect(saved[0].slug).toBe(saved[1].slug);
  expect(saved[0]).toMatchObject({ title: "The River Story", author_name: "Robin Writer", status: "published",
    document: { format: "txt", sourceName: "river.txt" },
  });
  await expect(page.getByRole("link", { name: /books\/the-river-story-/ })).toBeVisible();
});
