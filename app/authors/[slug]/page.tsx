import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { getPublicAuthor } from "../../../lib/author-public";
import { assetUrl, groupAuthorBooks, validateLinks } from "../model";
import styles from "../authors.module.css";

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const data = await getPublicAuthor((await params).slug);
  return data ? { title: `${data.profile.display_name} — Books`, description: data.profile.bio || `Read or listen to books by ${data.profile.display_name} for free in your browser.` } : { title: "Author not found" };
}

export default async function AuthorProfilePage({ params }: { params: Promise<{ slug: string }> }) {
  const data = await getPublicAuthor((await params).slug);
  if (!data) notFound();
  const { profile, books, series } = data;
  let links: ReturnType<typeof validateLinks> = [];
  // Public rows may be written by other clients; never render non-HTTP links.
  for (const link of profile.links) {
    try { links.push(...validateLinks([link])); } catch { /* Ignore invalid public links. */ }
  }
  return <>
    <section className={styles.profileHero}>
      {profile.image_path && <img src={assetUrl(profile.image_path)} alt={profile.display_name} />}
      <h1>{profile.display_name}</h1>
      {profile.bio && <p>{profile.bio}</p>}
      <div className={styles.actions}>{links.map((link, index) => <a className={styles.secondary} href={link.url} key={index} target="_blank" rel="noopener noreferrer">{link.label}</a>)}</div>
      <p>Read or listen for free, right in your browser.</p>
    </section>
    {!books.length && <p>This author’s books are coming soon.</p>}
    {groupAuthorBooks(books, series).map((group) => <section key={group.id}>
      <h2>{group.name}</h2>
      <div className={styles.publicBooks}>{group.books.map((book) => <article className={styles.bookCard} key={book.id}>
        {book.cover_path && <img src={assetUrl(book.cover_path)} alt={`${book.title} cover`} loading="lazy" />}
        <div className={styles.bookInfo}>
          {book.series_order && <span className={styles.badge}>Book {book.series_order}</span>}
          <h3><Link href={`/books/${book.slug}`}>{book.title}</Link></h3>
          <p>{book.description}</p>
          <div className={styles.actions}><Link className={styles.primary} href={`/books/${book.slug}`}>Read / listen</Link></div>
        </div>
      </article>)}</div>
    </section>)}
  </>;
}
