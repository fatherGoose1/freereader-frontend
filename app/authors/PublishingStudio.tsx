"use client";

import Link from "next/link";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { parseFile, parsePastedText } from "../reader/importers";
import { IMPORT_ACCEPT } from "../reader/importFormats";
import { authorClient, loadDashboard, loadAuthorBook, publishingError, uploadAuthorImage } from "./client";
import { clearDraft, emptyDraft, loadDraft, saveDraft, type PublishingDraft } from "./draft";
import { bookSlug, publicShareUrl, slugify, validateLinks, type AuthorSeries, type PublishedDocument } from "./model";
import { useAuthorSession } from "./useAuthorSession";
import AuthorImage from "./AuthorImage";
import AuthorVoicePicker from "./AuthorVoicePicker";
import { saveAuthorReturn, takeAuthorReturn } from "./oauthReturn";
import styles from "./authors.module.css";

export default function PublishingStudio({ bookId, profileOnly = false }: { bookId?: string; profileOnly?: boolean }) {
  const auth = useAuthorSession();
  const [draft, setDraft] = useState<PublishingDraft | null>(null);
  const [series, setSeries] = useState<AuthorSeries[]>([]);
  const [accountLoaded, setAccountLoaded] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [storageError, setStorageError] = useState("");
  const [draftSaved, setDraftSaved] = useState(false);
  const [saved, setSaved] = useState<{ slug: string; profileSlug: string; status: string } | null>(null);
  const [copied, setCopied] = useState(false);
  const [loadAttempt, setLoadAttempt] = useState(0);
  const draftRef = useRef<PublishingDraft | null>(null);
  const formRef = useRef<HTMLFormElement>(null);
  const bookTitleRef = useRef<HTMLInputElement>(null);
  const key = profileOnly ? "profile" : bookId ? `book:${bookId}` : "first-book";

  useEffect(() => {
    let cancelled = false;
    setDraft(null);
    void loadDraft(key).then((value) => {
      if (!cancelled) setDraft({ ...(value ?? emptyDraft()), step: value?.step ?? (bookId ? "book" : "profile") });
    }).catch(() => {
      if (!cancelled) { setDraft({ ...emptyDraft(), step: bookId ? "book" : "profile" }); setStorageError("Browser draft storage is unavailable. Google sign-in will not start until your draft can be saved; allow browser storage and retry."); }
    });
    return () => { cancelled = true; };
  }, [key, bookId]);

  useEffect(() => {
    if (draft?.step === "book" && !profileOnly) bookTitleRef.current?.focus();
  }, [draft?.step, profileOnly]);

  useEffect(() => {
    draftRef.current = draft;
    if (!draft || saved || busy) return;
    setDraftSaved(false);
    void saveDraft(key, draft).then(() => {
      if (draftRef.current === draft) { setStorageError(""); setDraftSaved(true); }
    }).catch(() => setStorageError("Your draft could not be saved in this browser. Allow browser storage before signing in."));
  }, [draft, key, saved, busy]);

  useEffect(() => {
    setAccountLoaded(false);
    if (!auth.enabled || !auth.session || !draft) return;
    let cancelled = false;
    const userId = auth.session.user.id;
    const load = async () => {
      const data = await loadDashboard(userId);
      const local = draftRef.current;
      if (local?.ownerId && local.ownerId !== userId) throw new Error("This saved draft belongs to another account. Sign in with the account that started it.");
      const book = bookId && !local?.document ? await loadAuthorBook(bookId, userId) : null;
      if (cancelled) return;
      setSeries(data.series);
      setDraft((current) => {
        if (!current) return current;
        let next = current;
        if (data.profile && !current.ownerId) next = { ...next,
          displayName: current.displayName || data.profile.display_name,
          profileSlug: current.profileSlug || data.profile.slug, bio: current.bio || data.profile.bio,
          links: current.links.length ? current.links : data.profile.links,
          profileImagePath: current.profileImagePath ?? data.profile.image_path,
          ownerId: userId,
        };
        if (!data.profile && !next.displayName) next = { ...next,
          displayName: String(auth.session?.user.user_metadata?.full_name ?? auth.session?.user.user_metadata?.name ?? "").slice(0, 120),
        };
        if (book) next = { ...next, id: book.id, ownerId: userId, slug: book.slug,
          title: book.title, description: book.description, authorName: book.author_name,
          coverPath: book.cover_path, seriesId: book.series_id ?? "", seriesOrder: String(book.series_order ?? 1),
          defaultVoice: book.default_voice ?? "af_heart",
          document: book.document,
        };
        if (!next.ownerId) next = { ...next, ownerId: userId };
        return next;
      });
      setAccountLoaded(true);
    };
    void load().catch((e) => { if (!cancelled) setError(publishingError(e)); });
    return () => { cancelled = true; };
    // Load account defaults once the locally persisted form has been restored.
  }, [auth.enabled, auth.session?.user.id, !!draft, bookId, loadAttempt]);

  function update(patch: Partial<PublishingDraft>) {
    setDraftSaved(false);
    setDraft((current) => current ? { ...current, ...patch } : current);
    setError("");
  }

  function nextStep() {
    if (!draft || !formRef.current?.reportValidity()) return;
    try {
      if (!draft.displayName.trim()) throw new Error("Add your author display name.");
      if (["submissions", "dashboard", "profile", "edit"].includes(draft.profileSlug.trim())) {
        throw new Error("That profile slug is reserved. Choose another or leave it blank.");
      }
      validateLinks(draft.links);
      update({ step: "book" });
    } catch (e) { setError(publishingError(e)); }
  }

  async function signIn() {
    if (!draft) return;
    setBusy(true); setError("");
    try {
      // Commit files, image Blobs, metadata, and text before leaving for Google.
      await saveDraft(key, draft);
      saveAuthorReturn(window.location.pathname);
      const { error: signInError } = await authorClient().auth.signInWithOAuth({
        provider: "google", options: { redirectTo: `${window.location.origin}/reader/audiobooks` },
      });
      if (signInError) throw signInError;
    } catch (e) { takeAuthorReturn(); setError(publishingError(e)); }
    finally { setBusy(false); }
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!auth.session || !auth.enabled || !accountLoaded || !draft || busy || (!profileOnly && draft.step !== "book")) return;
    const status = (event.nativeEvent as SubmitEvent).submitter?.getAttribute("value") === "draft" ? "draft" : "published";
    setBusy(true); setError("");
    try {
      const userId = auth.session.user.id;
      if (draft.ownerId && draft.ownerId !== userId) throw new Error("Sign in with the account that owns this draft.");
      const client = authorClient();
      const displayName = draft.displayName.trim();
      if (!displayName) throw new Error("Add your author display name.");
      const profileSlug = draft.profileSlug.trim() || `${slugify(displayName) || "author"}-${userId.slice(0, 8)}`;
      if (["submissions", "dashboard", "profile", "edit"].includes(profileSlug)) throw new Error("That profile slug is reserved. Choose another or leave it blank.");
      if (!/^[a-z0-9]+(-[a-z0-9]+)*$/.test(profileSlug) || profileSlug.length < 3) throw new Error("Use at least 3 lowercase letters, numbers, or hyphens for your public profile slug.");
      const links = validateLinks(draft.links);
      let document: PublishedDocument | undefined = draft.document;
      let cover = draft.cover;
      if (!profileOnly) {
        if (status === "published" && !draft.rightsCertified) throw new Error("Confirm your publishing rights before publishing.");
        if (!draft.title.trim()) throw new Error("Add a book title.");
        if (draft.sourceMode === "text" && draft.rawText.trim()) {
          const parsed = parsePastedText(draft.rawText, draft.title);
          const { cover: _cover, ...content } = parsed;
          document = { ...content, sourceName: "Pasted text", size: new Blob([draft.rawText]).size };
        } else if (draft.file) {
          const parsed = await parseFile(draft.file);
          const { cover: parsedCover, ...content } = parsed;
          document = { ...content, sourceName: draft.file.name, size: draft.file.size };
          cover ??= draft.coverPath ? undefined : parsedCover;
        }
        if (document && draft.voiceLanguage) document = { ...document, language: draft.voiceLanguage };
        if (!document?.blocks.some((block) => !block.isHeading && block.text.trim())) throw new Error("Upload a book or paste readable book text first. Scanned PDFs need OCR before upload.");
        if (new Blob([JSON.stringify(document)]).size > 10 * 1024 * 1024) throw new Error("Extracted book text must be under 10 MB. Try a smaller book file.");
      }
      const imagePath = draft.profileImage ? await uploadAuthorImage(draft.profileImage, userId) : draft.profileImagePath ?? null;
      const { error: profileError } = await client.from("author_profiles").upsert({
        user_id: userId, display_name: displayName, slug: profileSlug, bio: draft.bio.trim(),
        image_path: imagePath, links, updated_at: new Date().toISOString(),
      });
      if (profileError) throw profileError;
      if (profileOnly) {
        await clearDraft(key);
        setSaved({ slug: "", profileSlug, status: "profile" });
        return;
      }
      let seriesId: string | null = draft.seriesId && draft.seriesId !== "new" ? draft.seriesId : null;
      if (draft.seriesId === "new") {
        if (!draft.seriesName.trim()) throw new Error("Add a series name.");
        const { data, error: seriesError } = await client.from("author_series")
          .upsert({ user_id: userId, name: draft.seriesName.trim() }, { onConflict: "user_id,name" }).select("id").single();
        if (seriesError) throw seriesError;
        seriesId = data.id;
      }
      const order = seriesId ? Number(draft.seriesOrder) : null;
      if (seriesId && (!Number.isInteger(order) || order! <= 0)) throw new Error("Set a positive whole-number book order for this series.");
      const coverPath = cover ? await uploadAuthorImage(cover, userId) : draft.coverPath ?? null;
      // Generate once, then persist before the write so retries keep the same URL.
      const slug = draft.slug || bookSlug(draft.id);
      let prepared = { ...draft, ownerId: userId, slug, document, profileSlug, profileImagePath: imagePath,
        profileImage: undefined, coverPath, cover: undefined, file: undefined, rawText: "",
      };
      await saveDraft(key, prepared);
      setDraft(prepared);
      for (let attempt = 0; attempt < 3; attempt += 1) {
        const { error: bookError } = await client.from("author_books").upsert({
          id: prepared.id, user_id: userId, slug: prepared.slug, title: draft.title.trim(), description: draft.description.trim(),
          author_name: draft.authorName.trim() || displayName, cover_path: coverPath,
          series_id: seriesId, series_order: order, status, document,
          default_voice: draft.defaultVoice ?? "af_heart",
          rights_certified_at: draft.rightsCertified ? new Date().toISOString() : null,
        });
        if (!bookError) break;
        if (bookId || attempt === 2 || bookError.code !== "23505"
          || !/author_books_slug_key|Key \(slug\)/i.test(`${bookError.message} ${bookError.details}`)) throw bookError;
        const id = crypto.randomUUID();
        prepared = { ...prepared, id, slug: bookSlug(id) };
        await saveDraft(key, prepared);
        setDraft(prepared);
      }
      await clearDraft(key);
      setSaved({ slug: prepared.slug, profileSlug, status });
    } catch (e) { setError(publishingError(e)); }
    finally { setBusy(false); }
  }

  async function copyLink(path: string) {
    try { await navigator.clipboard.writeText(publicShareUrl(path)); setCopied(true); }
    catch { setError("Could not copy automatically. Copy the link shown below."); }
  }

  if (!draft) return <p role="status">Restoring your publishing form…</p>;
  if (saved) return <section className={styles.success}>
    <span className={styles.eyebrow}>{saved.status === "published" ? "Your book is live" : "Saved successfully"}</span>
    <h1>{saved.status === "published" ? "Your story. Ready to listen." : saved.status === "profile" ? "Your author profile is ready." : "Your book draft is saved."}</h1>
    <p>{saved.status === "published" ? "Anyone with this link can read or listen in their browser. No download or sign-in needed." : "Keep everything organized in your author dashboard."}</p>
    {saved.status !== "draft" && <div className={styles.shareBox}>
      <a href={saved.slug ? `/books/${saved.slug}` : `/authors/${saved.profileSlug}`}>{publicShareUrl(saved.slug ? `/books/${saved.slug}` : `/authors/${saved.profileSlug}`)}</a>
      <button type="button" className={styles.primary} onClick={() => void copyLink(saved.slug ? `/books/${saved.slug}` : `/authors/${saved.profileSlug}`)}>{copied ? "Copied!" : "Copy share link"}</button>
    </div>}
    {error && <p role="alert">{error}</p>}
    <div className={styles.actions}>
      {saved.status === "published" && <Link className={styles.primary} href={`/books/${saved.slug}`}>Open book & listen</Link>}
      <Link className={styles.secondary} href="/authors/dashboard">Go to dashboard</Link>
      <Link href={`/authors/${saved.profileSlug}`}>View author profile</Link>
    </div>
  </section>;

  const canSubmit = auth.enabled && accountLoaded && !busy;
  return <>
    <section className={styles.hero}>
      <h1>{profileOnly ? "Edit your author profile." : bookId ? "Update your book." : "Submit a book."}</h1>
      {!profileOnly && <ol className={styles.steps}><li>Sign in</li><li>Add your book and details</li><li>Publish and share</li></ol>}
    </section>
    <form ref={formRef} onSubmit={(event) => void submit(event)} className={styles.form}>
      {!auth.session && <section className={styles.authNotice} aria-label="Google sign-in required">
        <div><strong>Sign in to publish</strong><p>Your progress is saved when you sign in with Google.</p></div>
        <button className={styles.primary} type="button" disabled={!auth.ready || busy} onClick={() => void signIn()}>{busy ? "Please wait…" : "Sign in with Google"}</button>
      </section>}
      {auth.session && <div className={styles.signedIn} role="status">
        <span>{auth.enabled ? `Signed in as ${auth.session.user.email ?? "your Google account"}` : "Enabling author publishing…"}</span>
        <button type="button" onClick={async () => { await saveDraft(key, draft); await authorClient().auth.signOut(); }}>Sign out</button>
      </div>}
      {auth.error && <div className={styles.error} role="alert">{auth.error} <button type="button" onClick={auth.retry}>Retry</button></div>}
      {error && <p className={styles.error} role="alert">{error}{auth.enabled && !accountLoaded && <button type="button" onClick={() => setLoadAttempt((value) => value + 1)}>Retry loading account</button>}</p>}
      {storageError && <p className={styles.error} role="alert">{storageError}</p>}
      {(profileOnly || draft.step !== "book") && <fieldset disabled={busy} className={styles.card}>
        <legend>Author profile</legend>
        <div className={styles.grid}>
          <label>Display name<input required maxLength={120} autoComplete="name" value={draft.displayName} onChange={(e) => update({ displayName: e.target.value })} placeholder="Your name or pen name" /></label>
          <label>Public profile slug <span>(optional)</span><input maxLength={100} pattern="[a-z0-9]+(-[a-z0-9]+)*" value={draft.profileSlug} onChange={(e) => update({ profileSlug: e.target.value })} placeholder="Generated from your name" /><small>/authors/{draft.profileSlug || (auth.session ? `${slugify(draft.displayName) || "author"}-${auth.session.user.id.slice(0, 8)}` : "generated-after-sign-in")}</small></label>
        </div>
        <details open><summary>Bio, profile image & links <span>(optional)</span></summary>
          <label>Bio<textarea maxLength={5000} rows={3} value={draft.bio} onChange={(e) => update({ bio: e.target.value })} placeholder="Introduce yourself to your readers" /></label>
          <label>Profile image<input type="file" accept="image/jpeg,image/png,image/webp" onChange={(e) => update({ profileImage: e.target.files?.[0] })} /></label>
          <div className={styles.imagePreview}><AuthorImage blob={draft.profileImage} path={draft.profileImagePath} alt="Profile preview" /></div>
          {(draft.profileImage || draft.profileImagePath) && <button type="button" onClick={() => update({ profileImage: undefined, profileImagePath: null })}>Remove profile image</button>}
          {draft.links.map((link, index) => <div className={styles.linkRow} key={index}>
            <label>Link label<input maxLength={80} value={link.label} onChange={(e) => update({ links: draft.links.map((item, i) => i === index ? { ...item, label: e.target.value } : item) })} placeholder="Website, Instagram…" /></label>
            <label>URL<input type="url" value={link.url} onChange={(e) => update({ links: draft.links.map((item, i) => i === index ? { ...item, url: e.target.value } : item) })} placeholder="https://" /></label>
            <button type="button" aria-label={`Remove link ${index + 1}`} onClick={() => update({ links: draft.links.filter((_, i) => i !== index) })}>Remove</button>
          </div>)}
          <button type="button" className={styles.secondary} disabled={draft.links.length >= 20} onClick={() => update({ links: [...draft.links, { label: "", url: "" }] })}>Add website / social link</button>
        </details>
      </fieldset>}
      {!profileOnly && draft.step !== "book" && <div className={styles.stepActions}>
        <button type="button" className={styles.primary} disabled={busy} onClick={nextStep}>Next</button>
      </div>}
      {!profileOnly && draft.step === "book" && <>
        <div className={styles.stepBack}><button type="button" className={styles.secondary} onClick={() => update({ step: "profile" })}>Back to author profile</button><span>{draft.displayName}</span></div>
        <fieldset disabled={busy} className={styles.card}>
        <legend>{bookId ? "Book details" : "Your book"}</legend>
        <div className={styles.grid}>
          <label>Book title<input ref={bookTitleRef} required maxLength={300} value={draft.title} onChange={(e) => update({ title: e.target.value })} placeholder="The title of your book" /></label>
          <label>Author name <span>(optional)</span><input maxLength={120} value={draft.authorName} onChange={(e) => update({ authorName: e.target.value })} placeholder={draft.displayName || "Uses your display name"} /></label>
        </div>
        <label>Description <span>(optional)</span><textarea rows={3} maxLength={10000} value={draft.description} onChange={(e) => update({ description: e.target.value })} placeholder="What will readers discover?" /></label>
        <div className={styles.sourceTabs} aria-label="Book source">
          <button type="button" aria-pressed={draft.sourceMode === "file"} onClick={() => update({ sourceMode: "file" })}>Upload a file</button>
          <button type="button" aria-pressed={draft.sourceMode === "text"} onClick={() => update({ sourceMode: "text" })}>Paste text</button>
        </div>
        {draft.sourceMode === "file" ? <label className={styles.upload}>
          <strong>{draft.file?.name || draft.document?.sourceName || "Choose your book file"}</strong>
          <span>PDF, EPUB, TXT, DOCX, HTML or Markdown · up to 100 MB</span>
          <input type="file" accept={IMPORT_ACCEPT} onChange={(e) => { const file = e.target.files?.[0]; if (file) update({ file, title: draft.title || file.name.replace(/\.[^.]+$/, "") }); }} />
          {draft.file && <small>Your selected file is kept through Google sign-in.</small>}
          {draft.document && !draft.file && <small>Book text is saved. Choose a file to replace it.</small>}
        </label> : <label>Book text<textarea rows={9} value={draft.rawText} onChange={(e) => update({ rawText: e.target.value })} placeholder={draft.document ? "Paste here to replace the saved book text" : "Paste your book here…"} /></label>}
        <details open><summary>Cover & series <span>(optional)</span></summary>
          <label>Book cover<input type="file" accept="image/jpeg,image/png,image/webp" onChange={(e) => update({ cover: e.target.files?.[0] })} /><small>JPG, PNG or WebP, up to 5 MB. EPUB covers are used automatically.</small></label>
          <div className={styles.imagePreview}><AuthorImage blob={draft.cover} path={draft.coverPath} alt="Book cover preview" /></div>
          {(draft.cover || draft.coverPath) && <button type="button" onClick={() => update({ cover: undefined, coverPath: null })}>Remove cover</button>}
          <div className={styles.grid}>
            <label>Series<select value={draft.seriesId} onChange={(e) => update({ seriesId: e.target.value })}><option value="">Standalone book</option>{series.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}<option value="new">Create a series</option></select></label>
            {draft.seriesId && <label>Book order<input type="number" min={1} step={1} required value={draft.seriesOrder} onChange={(e) => update({ seriesOrder: e.target.value })} /></label>}
            {draft.seriesId === "new" && <label>Series name<input required maxLength={200} value={draft.seriesName} onChange={(e) => update({ seriesName: e.target.value })} /></label>}
          </div>
        </details>
        <AuthorVoicePicker voice={draft.defaultVoice ?? "af_heart"} language={draft.voiceLanguage}
          onChange={(defaultVoice, voiceLanguage) => update({ defaultVoice, voiceLanguage })} />
        <section className={styles.rightsSection} aria-label="Publishing rights">
          <strong>Publishing rights</strong>
          <label className={styles.rightsCheck}>
            <input type="checkbox" checked={!!draft.rightsCertified} onChange={(event) => update({ rightsCertified: event.target.checked })} />
            <span>I confirm that I own or control the rights necessary to distribute this book through FreeReader, and that the book is not currently subject to an exclusive digital publishing agreement, including KDP Select/Kindle Unlimited.</span>
          </label>
        </section>
        {draft.slug && <p className={styles.hint}>Permanent book link: /books/{draft.slug}</p>}
        </fieldset>
      </>}
      {(profileOnly || draft.step === "book") && <div className={styles.submitBar}>
        <p role="status">{draftSaved ? "Draft saved in this browser." : "Saving your draft in this browser…"} {auth.session ? "" : "Sign in with Google to unlock publishing."}</p>
        <div className={styles.actions}>
          {!profileOnly && <button type="submit" value="draft" className={styles.secondary} disabled={!canSubmit}>Save draft</button>}
          <button type="submit" value="published" className={styles.primary} disabled={!canSubmit}>{busy ? "Saving your story…" : profileOnly ? "Save profile" : bookId ? "Save & publish" : "Publish & get share link"}</button>
        </div>
        {!auth.session && <button type="button" disabled={!auth.ready || busy} onClick={() => void signIn()}>Sign in with Google</button>}
      </div>}
    </form>
  </>;
}
