import Link from "next/link";
import CtaButton from "./components/CtaButton";
import HeroDemo from "./components/HeroDemo";
import { SPEECH_LANGUAGES } from "./languages";

const formats = ["EPUB", "PDF", "DOCX", "TXT", "HTML", "Markdown"];

function ArrowIcon() {
  return (
    <svg viewBox="0 0 20 20" aria-hidden="true">
      <path d="M4 10h11M11 5l5 5-5 5" />
    </svg>
  );
}

function CheckIcon() {
  return (
    <svg viewBox="0 0 20 20" aria-hidden="true">
      <path d="m4 10 4 4 8-9" />
    </svg>
  );
}

export default function Home() {
  return (
    <main className="landing">
      <section className="hero-section">
        <div className="hero wrap">
          <div className="hero-copy">
            <span className="eyebrow hero-eyebrow"><i /> Free to use. No account required.</span>
            <h1>Your reading list, <em>out loud.</em></h1>
            <p className="lead">
              Turn books, documents, and articles into natural speech. Keep your
              place, choose your pace, and listen in 31 languages.
            </p>
            <div className="hero-actions">
              <CtaButton />
              <Link className="text-link" href="#how">
                See how it works <ArrowIcon />
              </Link>
            </div>
            <div className="hero-assurances" aria-label="FreeReader product highlights">
              <span><CheckIcon /> Six file formats</span>
              <span><CheckIcon /> Optional sync</span>
              <span><CheckIcon /> No subscription</span>
            </div>
          </div>
          <div className="hero-shot" aria-label="FreeReader live speech demo">
            <div className="demo-caption"><span>Live voice preview</span><strong>Try any language</strong></div>
            <HeroDemo />
          </div>
        </div>
      </section>

      <section className="proof-strip" aria-label="FreeReader product facts">
        <div className="wrap proof-grid">
          <div><strong>{SPEECH_LANGUAGES.length}</strong><span>narration languages</span></div>
          <div><strong>{formats.length}</strong><span>document formats</span></div>
          <div><strong>$0</strong><span>to start listening</span></div>
          <div><strong>0</strong><span>ads in your library</span></div>
        </div>
      </section>

      <section className="compatibility" aria-label="Compatible sources and formats">
        <div className="wrap compatibility-row">
          <p>Bring the reading you already have</p>
          <div className="format-list">
            <span className="gutenberg-mark">Project Gutenberg</span>
            {formats.map((format) => <span key={format}>{format}</span>)}
            <span>Web articles</span>
          </div>
        </div>
      </section>

      <section className="section workflow" id="how">
        <div className="wrap">
          <div className="section-heading split-heading">
            <div>
              <span className="eyebrow">A quieter way to read</span>
              <h2>From source to speech,<br />without the busywork.</h2>
            </div>
            <p>
              FreeReader handles the tedious parts so you can move between
              reading and listening without losing your place.
            </p>
          </div>
          <div className="workflow-grid">
            <article className="workflow-card featured-card">
              <span className="step">01</span>
              <div className="format-stack" aria-hidden="true">
                <span>EPUB</span><span>PDF</span><span>DOCX</span>
              </div>
              <div><h3>Bring almost anything</h3><p>Upload a document, paste text, import a web article, or browse public-domain books.</p></div>
            </article>
            <article className="workflow-card">
              <span className="step">02</span>
              <div className="wave-graphic" aria-hidden="true">
                {[18, 34, 52, 28, 66, 44, 24, 58, 36, 20, 48, 30].map((height, index) => <i key={index} style={{ height }} />)}
              </div>
              <div><h3>Make the voice yours</h3><p>Choose the language, voice, quality, and playback speed that suit the material.</p></div>
            </article>
            <article className="workflow-card">
              <span className="step">03</span>
              <div className="progress-graphic" aria-hidden="true"><i /><span>Chapter 8</span><strong>62%</strong></div>
              <div><h3>Pick up where you left off</h3><p>FreeReader remembers your book, chapter, position, and pace in one focused library.</p></div>
            </article>
          </div>
        </div>
      </section>

      <section className="section trust-section" id="trust">
        <div className="wrap trust-grid">
          <div className="trust-copy">
            <span className="eyebrow light">Privacy, plainly stated</span>
            <h2>Your library should not be a business model.</h2>
            <p>
              Use FreeReader without an account and your library stays in this
              browser. Sign in only if you want private cross-device sync.
            </p>
            <Link className="light-link" href="/privacy">Read the privacy policy <ArrowIcon /></Link>
          </div>
          <div className="trust-details">
            <article>
              <span className="trust-icon">01</span>
              <div><h3>Local by default</h3><p>Original files, generated audio, and downloaded voice models stay on your device.</p></div>
            </article>
            <article>
              <span className="trust-icon">02</span>
              <div><h3>Sync is an explicit choice</h3><p>Signing in syncs compressed document text, folders, and progress. Sign out or delete cloud copies anytime.</p></div>
            </article>
            <article>
              <span className="trust-icon">03</span>
              <div><h3>No advertising profile</h3><p>No ads, advertising identifiers, or sale of diagnostics. Our policies explain exactly what is handled.</p></div>
            </article>
          </div>
        </div>
      </section>

      <section className="section engineering">
        <div className="wrap">
          <div className="section-heading center-heading">
            <span className="eyebrow">Built for the long read</span>
            <h2>A real reading tool, not a voice gimmick.</h2>
            <p>Every detail is designed around finishing what you started.</p>
          </div>
          <div className="feature-grid">
            <article><span className="feature-icon">Aa</span><h3>Readable and listenable</h3><p>Follow the text on screen and jump to any passage when you want to listen from there.</p></article>
            <article><span className="feature-icon">↗</span><h3>Four ways to import</h3><p>Files, links, pasted text, and Project Gutenberg all land in the same organized library.</p></article>
            <article><span className="feature-icon">◎</span><h3>Precise playback</h3><p>Chapter navigation, ten-second skips, progress seeking, and adjustable speed are always close.</p></article>
            <article><span className="feature-icon">✓</span><h3>Progress that persists</h3><p>Your reading position is saved automatically, locally or across devices when you choose sync.</p></article>
          </div>
        </div>
      </section>

      <section className="section language-section" aria-labelledby="languages-heading">
        <div className="wrap language-layout">
          <div className="language-copy">
            <span className="eyebrow">A wider world of voices</span>
            <h2 id="languages-heading">Listen in {SPEECH_LANGUAGES.length} languages.</h2>
            <p>Choose narration that matches the language on the page. The live demo detects it automatically.</p>
            <CtaButton />
          </div>
          <ul className="language-list">
            {[...SPEECH_LANGUAGES]
              .sort(([, first], [, second]) => first.localeCompare(second, "en"))
              .map(([code, name]) => <li key={code}><span>{code}</span>{name}</li>)}
          </ul>
        </div>
      </section>

      <section className="final-cta">
        <div className="wrap final-cta-inner">
          <span className="eyebrow light">Your next chapter is ready</span>
          <h2>Read less with your eyes.<br />Keep every word.</h2>
          <p>Open the web app and turn your first document into a listening experience.</p>
          <CtaButton />
          <small>No account. No card. No subscription.</small>
        </div>
      </section>
    </main>
  );
}
