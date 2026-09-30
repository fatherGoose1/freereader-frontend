"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import FreeReaderApp from "../../reader/FreeReaderApp";
import { listBooks, saveBook } from "../../reader/storage";
import type { LibraryBook } from "../../reader/types";
import { assetUrl, toReaderBook, type AuthorBookWithDocument } from "../../authors/model";
import styles from "../../authors/authors.module.css";

export default function PublishedBookReader({ slug, authorSlug, description }: { slug: string; authorSlug?: string; description: string }) {
  const [book, setBook] = useState<LibraryBook | null>(null);
  const [error, setError] = useState("");
  const [attempt, setAttempt] = useState(0);
  const [copied, setCopied] = useState(false);
  useEffect(() => {
    let cancelled = false;
    const controller = new AbortController();
    setError("");
    const load = async () => {
      const response = await fetch(`/api/authors/books/${encodeURIComponent(slug)}`, { cache: "no-store", signal: controller.signal });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || "Could not open this book.");
      const published = payload.book as AuthorBookWithDocument;
      const existing = (await listBooks().catch(() => [])).find((item) => item.id === published.id);
      let cover: Blob | undefined;
      if (published.cover_path) {
        const image = await fetch(assetUrl(published.cover_path), { signal: controller.signal });
        if (image.ok) cover = await image.blob();
      }
      const ready = toReaderBook(published, cover, existing);
      // A replaced manuscript may have fewer blocks; keep the cursor in bounds.
      ready.position = { ...ready.position, blockIndex: Math.max(0, Math.min(ready.position.blockIndex, ready.blocks.length - 1)) };
      if (cancelled) return;
      await saveBook(ready).catch(() => undefined);
      if (!cancelled) setBook(ready);
    };
    void load().catch((e) => { if (!cancelled) setError(e instanceof Error ? e.message : "Could not load this book."); });
    return () => { cancelled = true; controller.abort(); };
  }, [slug, attempt]);

  if (error) return <section className={styles.main}><h1>Could not open this book</h1><p role="alert">{error}</p><button onClick={() => setAttempt((value) => value + 1)}>Try again</button>{authorSlug && <Link href={`/authors/${authorSlug}`}>Visit the author</Link>}</section>;
  if (!book) return <p className={styles.main} role="status">Opening your book…</p>;
  return <>
    <div className={styles.signedIn} style={{ padding: "12px 24px", background: "#e9efff" }}>
      <span>{authorSlug ? <Link href={`/authors/${authorSlug}`}>More by {book.author}</Link> : book.author} · Free to read & listen</span>
      <button onClick={async () => { try { await navigator.clipboard.writeText(window.location.href); setCopied(true); } catch { setCopied(false); } }}>{copied ? "Link copied" : "Share book"}</button>
    </div>
    {description && <details style={{ padding: "12px 24px" }}><summary>About this book</summary><p>{description}</p></details>}
    <FreeReaderApp initialBook={book} />
  </>;
}
