import type { GutenbergBook } from "./types";

export type GutenbergDetails = {
  title: string; authors: string[]; languages: string[];
  summary?: string; subjects: string[]; rights?: string; epubSize?: number;
};

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

// getElementsByTagNameNS("*", ...) misses prefixed nodes in some DOM
// implementations (for example linkedom's dcterms:language), so match every
// descendant by its local name instead.
function descendants(root: Element | Document, name: string): Element[] {
  const found: Element[] = [];
  const start = (root as Document).documentElement ?? root;
  const walk = (element: Element) => {
    for (const child of Array.from(element.children ?? [])) {
      const localName = child.localName ?? child.nodeName;
      if (localName === name || localName.split(":").pop() === name) found.push(child);
      walk(child);
    }
  };
  walk(start as Element);
  return found;
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
    return [{
      id,
      title: elementText(entry, "title"),
      author: elementText(entry, "content") || undefined,
      detailUrl: normalizedDetail,
      // Same-origin proxy; Gutenberg image responses lack CORS/CORP and would
      // otherwise be blocked by the document's COEP require-corp policy.
      coverUrl: `/api/gutenberg/cover/${id}`,
    }];
  });
}

export async function gutenbergDetails(book: GutenbergBook, signal?: AbortSignal): Promise<GutenbergDetails> {
  const response = await fetch(book.detailUrl, { signal });
  if (!response.ok) throw new Error("This Gutenberg book is unavailable.");
  const xml = new DOMParser().parseFromString(await response.text(), "application/xml");
  const entries = descendants(xml, "entry");
  if (!entries.length) throw new Error("Book details are unavailable.");
  const unique = (values: string[]) => [...new Set(values.filter(Boolean))];
  const authors = unique(entries.flatMap((entry) => descendants(entry, "author").map((author) => elementText(author, "name"))));
  const languages = unique(entries.flatMap((entry) => descendants(entry, "language").map((language) => language.textContent?.trim() ?? "")));
  const subjects = unique(entries.flatMap((entry) => descendants(entry, "category").map((category) => category.getAttribute("term")?.trim() ?? "")));
  const summary = entries.map((entry) => {
    const content = descendants(entry, "content")[0];
    if (!content) return "";
    const paragraphs = descendants(content, "p");
    const lines = (paragraphs.length ? paragraphs.map((item) => item.textContent ?? "")
      : (content.textContent ?? "").split(/\r?\n/)).map((line) => line.replace(/\s+/g, " ").trim());
    const start = lines.findIndex((line) => /^Summary:/i.test(line));
    if (start < 0) return "";
    const values = lines.slice(start);
    const end = values.findIndex((line) => /^Reading Level:/i.test(line));
    return (end < 0 ? values : values.slice(0, end))
      .map((line, index) => index === 0 ? line.replace(/^Summary:\s*/i, "") : line)
      .filter(Boolean).join(" ").trim();
  }).find(Boolean);
  const epubLink = entries.flatMap((entry) => descendants(entry, "link"))
    .find((link) => link.getAttribute("rel") === "http://opds-spec.org/acquisition"
      && link.getAttribute("type") === "application/epub+zip");
  const size = Number(epubLink?.getAttribute("length"));
  return {
    title: elementText(entries[0], "title") || book.title,
    authors, languages, subjects, summary: summary || undefined,
    rights: entries.map((entry) => elementText(entry, "rights")).find(Boolean),
    epubSize: Number.isFinite(size) && size > 0 ? size : undefined,
  };
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
    const rank = (element: Element) => /\.images/i.test(element.getAttribute("href") ?? "") ? 0 : 1;
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
