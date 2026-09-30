"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { authorClient, loadDashboard, publishingError } from "../client";
import { useAuthorSession } from "../useAuthorSession";
import type { AuthorBook, AuthorProfile, AuthorSeries } from "../model";
import AuthorImage from "../AuthorImage";
import { saveAuthorReturn, takeAuthorReturn } from "../oauthReturn";
import styles from "../authors.module.css";

export default function AuthorDashboard() {
  const auth = useAuthorSession();
  const [profile, setProfile] = useState<AuthorProfile | null>(null);
  const [books, setBooks] = useState<AuthorBook[]>([]);
  const [series, setSeries] = useState<AuthorSeries[]>([]);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [revision, setRevision] = useState(0);
  useEffect(() => {
    if (!auth.enabled || !auth.session) return;
    let cancelled = false;
    setLoading(true);
    void loadDashboard(auth.session.user.id).then((data) => {
      if (!cancelled) { setProfile(data.profile); setBooks(data.books); setSeries(data.series); setError(""); }
    }).catch((e) => { if (!cancelled) setError(publishingError(e)); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [auth.enabled, auth.session?.user.id, revision]);

  async function signIn() {
    try {
      saveAuthorReturn("/authors/dashboard");
      const { error } = await authorClient().auth.signInWithOAuth({ provider: "google", options: { redirectTo: `${window.location.origin}/reader/audiobooks` } });
      if (error) throw error;
    } catch (e) { takeAuthorReturn(); setError(publishingError(e)); }
  }

  async function status(book: AuthorBook) {
    setBusy(true); setError("");
    try {
      const next = book.status === "published" ? "draft" : "published";
      const { data, error } = await authorClient().from("author_books").update({ status: next })
        .eq("id", book.id).eq("user_id", auth.session!.user.id).select("id").single();
      if (error || !data) throw error ?? new Error("Book could not be updated.");
      setBooks((current) => current.map((item) => item.id === book.id ? { ...item, status: next } : item));
      setNotice(next === "published" ? "Book published. Your existing share link is live." : "Book unpublished. It is now private; republishing restores the same link.");
    } catch (e) { setError(publishingError(e)); }
    finally { setBusy(false); }
  }

  async function renameSeries(item: AuthorSeries) {
    setBusy(true); setError("");
    try {
      if (!item.name.trim()) throw new Error("A series needs a name.");
      const { error } = await authorClient().from("author_series").update({ name: item.name.trim() })
        .eq("id", item.id).eq("user_id", auth.session!.user.id).select("id").single();
      if (error) throw error;
      setNotice("Series name saved.");
    } catch (e) { setError(publishingError(e)); }
    finally { setBusy(false); }
  }

  async function copy(path: string) {
    try { await navigator.clipboard.writeText(`${window.location.origin}${path}`); setNotice("Share link copied."); }
    catch { setNotice(`Copy this share link: ${window.location.origin}${path}`); }
  }

  if (!auth.ready) return <p role="status">Loading your account…</p>;
  if (!auth.session) return <section className={styles.hero}>
    <h1>Your author dashboard</h1><p>Sign in with your existing FreeReader Google account to manage your books.</p>
    <button type="button" className={styles.primary} onClick={() => void signIn()}>Sign in with Google</button>
    {error && <p className={styles.error} role="alert">{error}</p>}
  </section>;
  if (auth.error) return <div className={styles.error} role="alert">{auth.error} <button onClick={auth.retry}>Retry</button></div>;
  if (!auth.enabled || loading) return <p role="status">Loading your author dashboard…</p>;
  return <>
    <div className={styles.dashboardTitle}><div><span className={styles.eyebrow}>Author dashboard</span><h1>{profile ? `Hello, ${profile.display_name}.` : "Your stories start here."}</h1></div><Link href="/authors" className={styles.primary}>Upload a book</Link></div>
    <div className={styles.actions}>
      <Link className={styles.secondary} href="/authors/profile">Edit author profile</Link>
      {profile && <><Link href={`/authors/${profile.slug}`}>View public profile</Link><button onClick={() => void copy(`/authors/${profile.slug}`)}>Copy profile link</button></>}
      <button onClick={() => void authorClient().auth.signOut()}>Sign out</button>
    </div>
    {error && <p className={styles.error} role="alert">{error} <button onClick={() => setRevision((value) => value + 1)}>Reload</button></p>}
    {notice && <p className={styles.authNotice} role="status">{notice}</p>}
    <h2>Your books</h2>
    {!books.length && <section className={styles.card}><p>Publish your first book and get a shareable read-aloud link in minutes.</p><Link className={styles.primary} href="/authors">Publish your first book</Link></section>}
    <div className={styles.bookList}>{books.map((book) => {
      const bookSeries = series.find((item) => item.id === book.series_id);
      return <article className={styles.bookCard} key={book.id}>
        <AuthorImage path={book.cover_path} alt={`${book.title} cover`} />
        <div className={styles.bookInfo}><span className={styles.badge}>{book.status === "published" ? "Published" : "Private draft"}</span><h3>{book.title}</h3><p>{book.author_name}{bookSeries ? ` · ${bookSeries.name}, book ${book.series_order}` : " · Standalone"}</p></div>
        <div className={styles.bookActions}>
          <Link className={styles.secondary} href={`/authors/edit/${book.id}`}>Edit book & order</Link>
          <button disabled={busy} onClick={() => void status(book)}>{book.status === "published" ? "Unpublish" : "Publish"}</button>
          {book.status === "published" && <><Link href={`/books/${book.slug}`}>Read / listen</Link><button onClick={() => void copy(`/books/${book.slug}`)}>Copy link</button></>}
        </div>
      </article>;
    })}</div>
    {!!series.length && <section className={styles.card} style={{ marginTop: 32 }}>
      <h2>Your series</h2><p className={styles.hint}>Rename a series here. Use “Edit book & order” to assign books or change their numbered order. Each number must be unique within a series.</p>
      {series.map((item) => <div className={styles.seriesRow} key={item.id}>
        <label>Series name<input maxLength={200} value={item.name} onChange={(e) => setSeries((current) => current.map((value) => value.id === item.id ? { ...value, name: e.target.value } : value))} /></label>
        <button disabled={busy} onClick={() => void renameSeries(item)}>Save name</button>
      </div>)}
    </section>}
  </>;
}
