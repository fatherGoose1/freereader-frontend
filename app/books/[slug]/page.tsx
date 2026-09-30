import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { publicAuthorClient } from "../../../lib/author-public";
import { BOOK_COLUMNS, assetUrl, type AuthorBook } from "../../authors/model";
import PublishedBookReader from "./PublishedBookReader";

export const dynamic = "force-dynamic";

async function bookDetails(slug: string) {
  const client = publicAuthorClient();
  const { data, error } = await client.from("author_books").select(BOOK_COLUMNS).eq("slug", slug).eq("status", "published").maybeSingle();
  if (error) throw error;
  return data as AuthorBook | null;
}

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const book = await bookDetails((await params).slug);
  if (!book) return { title: "Book not available", robots: { index: false } };
  return {
    title: `${book.title} by ${book.author_name}`, description: book.description || `Read or listen to ${book.title} for free in your browser.`,
    alternates: { canonical: `/books/${book.slug}` },
    openGraph: { title: book.title, description: book.description || `Read or listen to ${book.title} by ${book.author_name}.`,
      ...(book.cover_path ? { images: [assetUrl(book.cover_path)] } : {}),
    },
  };
}

export default async function PublishedBookPage({ params }: { params: Promise<{ slug: string }> }) {
  const book = await bookDetails((await params).slug);
  if (!book) notFound();
  const { data: author } = await publicAuthorClient().from("author_profiles").select("slug").eq("user_id", book.user_id).single();
  return <div className="reader-app-route"><PublishedBookReader slug={book.slug} authorSlug={author?.slug} description={book.description} /></div>;
}
