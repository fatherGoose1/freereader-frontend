import Image from "next/image";

export default function Home() {
  return (
    <main>
      <section className="hero wrap">
        <div className="hero-copy">
          <span className="eyebrow">Free, private, and yours</span>
          <h1>Turn any book into an audiobook.</h1>
          <p className="lead">
            Listen to your EPUBs, PDFs, and text files with natural voices. No
            subscriptions. No locked features. Just your books, read aloud.
          </p>
          <span className="button">Coming soon to the App Store</span>
          <small className="subnote">Made for iPhone · iOS 18 or later</small>
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
