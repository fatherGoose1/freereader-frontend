import Image from "next/image";
import Link from "next/link";
import CtaButton from "./components/CtaButton";

export default function Home() {
  return (
    <main>
      <section className="hero wrap">
        <div className="hero-copy">
          <span className="eyebrow">Free, private, and yours</span>
          <h1>Turn any book into an audiobook.</h1>
          <p className="lead">
            Listen to your EPUBs, PDFs, and text files with natural voices.
            Completely free.
          </p>
          <div className="hero-actions">
            <CtaButton />
            <span className="store-badge" aria-disabled="true" title="Not available yet — coming soon to the App Store">
  <svg viewBox="0 0 24 24" width="22" height="22" fill="currentColor" aria-hidden="true">
    <path d="M12.152 6.896c-.948 0-2.415-1.078-3.96-1.04-2.04.027-3.91 1.173-4.961 3.014-2.117 3.675-.546 9.103 1.519 12.09 1.013 1.454 2.208 3.09 3.792 3.039 1.52-.065 2.09-.987 3.935-.987 1.831 0 2.35.987 3.96.948 1.637-.026 2.676-1.48 3.676-2.948 1.156-1.688 1.636-3.325 1.662-3.415-.039-.013-3.182-1.221-3.22-4.857-.026-3.04 2.48-4.494 2.597-4.559-1.429-2.09-3.623-2.324-4.39-2.376-2-.156-3.675 1.09-4.61 1.09zM15.53 3.83c.843-1.012 1.4-2.427 1.245-3.83-1.207.052-2.662.805-3.532 1.818-.78.896-1.454 2.338-1.273 3.714 1.338.104 2.715-.688 3.56-1.702" />
  </svg>
  <span className="store-badge-label"><small>Download on the</small><strong>App Store</strong></span>
</span>
          </div>
          <small className="subnote">Web app is live · iPhone app coming soon</small>
        </div>
        <div className="hero-shot" aria-label="FreeReader app preview">
          <Image
            src="/hero-image.png"
            alt="FreeReader reading Alice's Adventures in Wonderland aloud, with playback controls at 42% book progress"
            width={724}
            height={1470}
            priority
            sizes="(max-width: 760px) 88vw, 400px"
          />
        </div>
      </section>

      <section className="section tint" id="how">
        <div className="wrap">
          <div className="center">
            <span className="eyebrow">Simple by design</span>
            <h2>From page to play in moments.</h2>
            <p className="lead">
              No accounts, complicated setup, or audiobook conversion fees.
            </p>
          </div>
          <div className="grid">
            <article className="card">
              <span className="num">01</span>
              <h3>Import</h3>
              <p>Choose an EPUB, PDF, or TXT file from your device.</p>
            </article>
            <article className="card">
              <span className="num">02</span>
              <h3>Pick a voice</h3>
              <p>
                Select a voice and language that feels right for your book.
              </p>
            </article>
            <article className="card">
              <span className="num">03</span>
              <h3>Press play</h3>
              <p>
                Listen while FreeReader prepares the next passage locally.
              </p>
            </article>
          </div>
        </div>
      </section>

      <section className="section">
        <div className="wrap privacy">
          <div className="shield" aria-hidden="true">
            ⌂
          </div>
          <div>
            <span className="eyebrow">Your library stays yours</span>
            <h2>Built for private listening.</h2>
            <p className="lead">
              Your documents, their text, and generated audio stay on your
              device. FreeReader does not require an account.
            </p>
            <ul className="checks">
              <li>On-device speech generation</li>
              <li>No document uploads</li>
              <li>No ads or subscriptions</li>
              <li>31 supported languages</li>
            </ul>
          </div>
        </div>
      </section>
    </main>
  );
}
