import Link from "next/link";
import styles from "./modeChooser.module.css";

function BookIcon() {
  return <svg viewBox="0 0 48 48" aria-hidden="true"><path d="M8 10.5c7-2.7 12.3-1.2 16 2.7v25.3c-3.7-3.9-9-5.4-16-2.7V10.5Zm32 0c-7-2.7-12.3-1.2-16 2.7v25.3c3.7-3.9 9-5.4 16-2.7V10.5Z" /></svg>;
}

function MicIcon() {
  return <svg viewBox="0 0 48 48" aria-hidden="true"><rect x="17" y="6" width="14" height="25" rx="7" /><path d="M11 23c0 7.2 5.8 13 13 13s13-5.8 13-13M24 36v7M18 43h12" /></svg>;
}

export default function ModeChooser() {
  return (
    <main className={styles.shell}>
      <header className={styles.header}>
        <Link href="/" className={styles.brand}><img src="/icon.svg" alt="" />FreeReader</Link>
        <span>Free text to speech, two ways</span>
      </header>
      <section className={styles.intro}>
        <span className={styles.kicker}>Choose your workspace</span>
        <h1>What do you want to bring to life?</h1>
        <p>Listen to something you are reading, or shape a script into narration you can use in a video.</p>
      </section>
      <section className={styles.choices} aria-label="FreeReader workspaces">
        <Link href="/reader/audiobooks" className={styles.choice}>
          <span className={`${styles.icon} ${styles.bookIcon}`}><BookIcon /></span>
          <span className={styles.choiceLabel}>For readers</span>
          <h2>Create an audiobook</h2>
          <p>Upload a book, document, or article and listen while FreeReader keeps your place.</p>
          <span className={styles.features}>EPUB, PDF, DOCX, links, and pasted text</span>
          <strong>Open your library <i>→</i></strong>
        </Link>
        <Link href="/narration" className={`${styles.choice} ${styles.creatorChoice}`}>
          <span className={`${styles.icon} ${styles.micIcon}`}><MicIcon /></span>
          <span className={styles.choiceLabel}>For creators · New</span>
          <h2>Create YouTube narration</h2>
          <p>Paste a script, tune each passage, and regenerate only the lines that need another take.</p>
          <span className={styles.features}>Voice, pronunciation, pace, and pause control</span>
          <strong>Open narration studio <i>→</i></strong>
        </Link>
      </section>
      <p className={styles.note}>Both workspaces use the same FreeReader voices. Your projects and generated audio stay in this browser.</p>
    </main>
  );
}
