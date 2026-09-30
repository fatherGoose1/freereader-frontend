import type { LibraryBook, ParsedBook } from "../reader/types";
import type { NarratorVoice } from "../reader/voices";

export type AuthorLink = { label: string; url: string };
export type AuthorProfile = {
  user_id: string; slug: string; display_name: string; bio: string;
  image_path: string | null; links: AuthorLink[];
};
export type AuthorSeries = { id: string; user_id: string; name: string };
export type PublishedDocument = Omit<ParsedBook, "cover"> & { sourceName: string; size: number };
export type AuthorBook = {
  id: string; user_id: string; slug: string; title: string; description: string;
  author_name: string; cover_path: string | null; series_id: string | null;
  series_order: number | null; status: "draft" | "published"; default_voice: NarratorVoice;
  created_at: string; updated_at: string;
};
export type AuthorBookWithDocument = AuthorBook & { document: PublishedDocument };
export const BOOK_COLUMNS = "id,user_id,slug,title,description,author_name,cover_path,series_id,series_order,status,default_voice,created_at,updated_at";
export const PROFILE_COLUMNS = "user_id,slug,display_name,bio,image_path,links";

export function slugify(value: string): string {
  return value.normalize("NFKD").replace(/[\u0300-\u036f]/g, "").toLowerCase()
    .replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 80).replace(/-$/, "");
}

export function bookSlug(title: string, id: string): string {
  return `${slugify(title) || "book"}-${id.slice(0, 8)}`;
}

export function publicShareUrl(path: string): string {
  return `https://freereader.io${path}`;
}

export function validateLinks(links: AuthorLink[]): AuthorLink[] {
  return links.filter((link) => link.url.trim()).map((link) => {
    const url = new URL(link.url.trim());
    if (!["https:", "http:"].includes(url.protocol)) throw new Error("Links must start with https:// or http://.");
    return { label: link.label.trim().slice(0, 80) || url.hostname, url: url.href };
  });
}

export function groupAuthorBooks(books: AuthorBook[], series: AuthorSeries[]) {
  const groups = series.map((item) => ({
    id: item.id, name: item.name,
    books: books.filter((book) => book.series_id === item.id)
      .sort((a, b) => (a.series_order ?? 0) - (b.series_order ?? 0)),
  })).filter((group) => group.books.length).sort((a, b) => a.name.localeCompare(b.name));
  const standalone = books.filter((book) => !book.series_id).sort((a, b) => a.title.localeCompare(b.title));
  if (standalone.length) groups.push({ id: "standalone", name: groups.length ? "Standalone books" : "Books", books: standalone });
  return groups;
}

export function toReaderBook(book: AuthorBookWithDocument, cover?: Blob, existing?: LibraryBook): LibraryBook {
  return {
    ...book.document, id: book.id, title: book.title, author: book.author_name, cover,
    language: existing?.language ?? book.document.language,
    preferredVoice: existing?.preferredVoice ?? book.default_voice ?? "af_heart",
    sourceIdentifier: `author-book:${book.id}`, sourceUrl: `/books/${book.slug}`,
    createdAt: existing?.createdAt ?? book.created_at, updatedAt: book.updated_at,
    position: existing?.position ?? { blockIndex: 0, offsetSeconds: 0, speed: 1 },
  };
}

export function assetUrl(path: string): string {
  return `/api/authors/assets?path=${encodeURIComponent(path)}`;
}
