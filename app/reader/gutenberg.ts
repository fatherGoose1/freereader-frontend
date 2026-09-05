import type { GutenbergBook } from "./types";

const GUTENBERG = "https://www.gutenberg.org";

function safeUrl(value: string, base = GUTENBERG): string | undefined {
  try {
    const url = new URL(value, base);
    if (url.protocol !== "https:" || !["gutenberg.org", "www.gutenberg.org"].includes(url.hostname)) return;
    url.hostname = "www.gutenberg.org";
    return url.toString();
  } catch {
    return;
  }
}

function elementText(element: Element, name: string): string {
  return element.getElementsByTagNameNS("*", name)[0]?.textContent?.replace(/\s+/g, " ").trim() ?? "";
}

export async function browseGutenberg(query = "", bookshelfId?: number): Promise<GutenbergBook[]> {
  const url = new URL(bookshelfId ? `/ebooks/bookshelf/${bookshelfId}.opds` : "/ebooks/search.opds/", GUTENBERG);
  if (query.trim()) url.searchParams.set("query", query.trim());
  else url.searchParams.set("sort_order", "downloads");
  const response = await fetch(url);
  if (!response.ok) throw new Error("Project Gutenberg could not be reached.");
  const xml = new DOMParser().parseFromString(await response.text(), "application/xml");
  return Array.from(xml.getElementsByTagNameNS("*", "entry")).flatMap((entry) => {
    const links = Array.from(entry.getElementsByTagNameNS("*", "link"));
    const detailUrl = links.find((link) => link.getAttribute("rel") === "subsection")?.getAttribute("href");
    const normalizedDetail = detailUrl && safeUrl(detailUrl, response.url);
    const id = normalizedDetail?.match(/\/(\d+)\.opds/)?.[1];
    if (!id || !normalizedDetail) return [];
    const thumbnail = links.find((link) => link.getAttribute("rel")?.endsWith("/thumbnail"))?.getAttribute("href");
    return [{
      id,
      title: elementText(entry, "title"),
      author: elementText(entry, "content") || undefined,
      detailUrl: normalizedDetail,
      coverUrl: thumbnail ? safeUrl(thumbnail, response.url) : undefined,
    }];
  });
}

export async function downloadGutenbergBook(book: GutenbergBook): Promise<File> {
  const detailResponse = await fetch(book.detailUrl);
  if (!detailResponse.ok) throw new Error("This Gutenberg book is unavailable.");
  const xml = new DOMParser().parseFromString(await detailResponse.text(), "application/xml");
  const links = Array.from(xml.getElementsByTagNameNS("*", "link"));
  const candidates = links.filter((link) =>
    link.getAttribute("rel") === "http://opds-spec.org/acquisition"
      && link.getAttribute("type") === "application/epub+zip",
  );
  candidates.sort((a, b) => {
    const rank = (element: Element) => /noimages/i.test(element.getAttribute("href") ?? "") ? 0 : 1;
    return rank(a) - rank(b);
  });
  const epubUrl = candidates[0]?.getAttribute("href");
  const normalized = epubUrl && safeUrl(epubUrl, detailResponse.url);
  if (!normalized) throw new Error("This title does not provide an EPUB.");
  const response = await fetch(`/api/gutenberg/${book.id}`);
  if (!response.ok) throw new Error("The EPUB download failed.");
  const blob = await response.blob();
  if (blob.size > 100_000_000) throw new Error("This EPUB is larger than the 100 MB import limit.");
  return new File([blob], `${book.title.replace(/[^a-z0-9]+/gi, "-")}.epub`, { type: "application/epub+zip" });
}
