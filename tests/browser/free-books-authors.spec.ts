import { expect, test } from "@playwright/test";

test("Free Books features published indie books ahead of public-domain books", async ({ page }) => {
  await page.route("**/api/authors/books", (route) => route.fulfill({ json: { books: [
    { id: "book-1", slug: "river-story", title: "The River Story", description: "A journey down the river.", author_name: "Robin Writer", cover_path: null, reads: 19 },
    { id: "book-2", slug: "night-story", title: "The Night Story", description: "After dark.", author_name: "Morgan Writer", cover_path: null, reads: 27 },
  ] } }));
  await page.route("**/api/authors/books/river-story", (route) => route.fulfill({ json: { book: { document: { blocks: [
    { isHeading: true, text: "Chapter One" }, { isHeading: false, text: "The river moved quietly past the town." },
  ] } } } }));
  await page.route((url) => url.pathname === "/books/river-story", (route) => route.fulfill({ contentType: "text/html", body: "Published book reader" }));
  await page.route(/https:\/\/www\.gutenberg\.org\/ebooks\/(?:search\.opds|bookshelf\/\d+\.opds)/, (route) => route.fulfill({
    contentType: "application/atom+xml",
    body: `<feed xmlns="http://www.w3.org/2005/Atom"><entry><title>A Classic</title><content>Classic Author</content><link rel="subsection" href="https://www.gutenberg.org/ebooks/123.opds" /></entry></feed>`,
  }));
  await page.goto("/reader/audiobooks");
  const freeBooks = page.getByRole("button", { name: /Free Books New Author Works \+ Public Domain Books New/ });
  await expect(freeBooks.locator(".always-free-badge")).toHaveText("New");
  await freeBooks.click();
  const dialog = page.getByRole("dialog", { name: "Free Books" });
  await expect(dialog.getByRole("heading", { name: "Free Books" })).toBeVisible();
  await expect(dialog.getByText("Browse EPUBs for reading and narration")).toHaveCount(0);
  const items = dialog.locator("article");
  await expect(items).toHaveCount(3);
  await expect(items.nth(0)).toContainText("The River Story");
  await expect(items.nth(0)).toContainText("Indie Author");
  await expect(items.nth(0)).toContainText("19 reads");
  await expect(items.nth(1)).toContainText("27 reads");
  await expect(items.nth(2)).toContainText("A Classic");
  await expect(items.nth(0).getByRole("button", { name: "Add" })).toBeVisible();
  const previewResponse = page.waitForResponse((response) => response.url().endsWith("/api/authors/books/river-story"));
  await items.nth(0).getByRole("button", { name: "Preview The River Story" }).click();
  const response = await previewResponse;
  expect(response.status()).toBe(200);
  expect((await response.json()).book.document.blocks).toHaveLength(2);
  await expect(dialog.getByRole("heading", { name: "The River Story" })).toBeVisible();
  await expect(dialog).toContainText("A journey down the river.");
  await expect(dialog.getByRole("region", { name: "Opening excerpt" })).toContainText("The river moved quietly past the town.");
  await dialog.getByRole("button", { name: "Back", exact: true }).click();
  await dialog.getByRole("button", { name: "Classics" }).click();
  await expect(dialog.getByText("Indie Author")).toHaveCount(0);
  await dialog.getByRole("button", { name: "Popular" }).click();
  await expect(dialog.getByText("Indie Author")).toHaveCount(2);
  await expect(items.nth(0)).toContainText("19 reads");
  await items.nth(0).getByRole("button", { name: "Add" }).click();
  await expect(page).toHaveURL(/\/books\/river-story$/);
});
