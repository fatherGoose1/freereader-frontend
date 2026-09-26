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

function YouTubeIcon() {
  return (
    <svg className="platform-icon" viewBox="0 0 24 18" aria-hidden="true">
      <rect y="1" width="24" height="16" rx="5" fill="#ff0033" />
      <path d="m10 5 6 4-6 4V5Z" fill="#fff" />
    </svg>
  );
}

function TikTokIcon() {
  return (
    <svg className="platform-icon" viewBox="0 0 24 18" aria-hidden="true">
      <rect y="1" width="24" height="16" rx="5" fill="#010101" />
      <g transform="translate(6.27 3.5) scale(0.458)">
        <path fill="#fff" d="M12.53.02C13.84 0 15.14.01 16.44 0c.08 1.53.63 3.09 1.75 4.17 1.12 1.11 2.7 1.62 4.24 1.79v4.03c-1.44-.05-2.89-.35-4.2-.97-.57-.26-1.1-.59-1.62-.93-.01 2.92.01 5.84-.02 8.75-.08 1.4-.54 2.79-1.35 3.94-1.31 1.92-3.58 3.17-5.91 3.21-1.43.08-2.86-.31-4.08-1.03-2.02-1.19-3.44-3.37-3.65-5.71-.02-.5-.03-1-.01-1.49.18-1.9 1.12-3.72 2.58-4.96 1.66-1.44 3.98-2.13 6.15-1.72.02 1.48-.04 2.96-.04 4.44-.99-.32-2.15-.23-3.02.37-.63.41-1.11 1.04-1.36 1.75-.21.51-.15 1.07-.14 1.61.24 1.64 1.82 3.02 3.5 2.87 1.12-.01 2.19-.66 2.77-1.61.19-.33.4-.67.41-1.06.1-1.79.06-3.57.07-5.36.01-4.03-.01-8.05.02-12.07z" />
      </g>
    </svg>
  );
}

function InstagramIcon({ gradientId }: { gradientId: string }) {
  return (
    <svg className="platform-icon" viewBox="0 0 24 18" aria-hidden="true">
      <defs>
        <linearGradient id={gradientId} x1="0" y1="0" x2="24" y2="18" gradientUnits="userSpaceOnUse">
          <stop offset="0" stopColor="#feda75" />
          <stop offset="0.35" stopColor="#fa7e1e" />
          <stop offset="0.6" stopColor="#d62976" />
          <stop offset="0.85" stopColor="#962fbf" />
          <stop offset="1" stopColor="#4f5bd5" />
        </linearGradient>
      </defs>
      <rect y="1" width="24" height="16" rx="5" fill={`url(#${gradientId})`} />
      <g transform="translate(6.5 3.5) scale(0.458)">
        <path fill="#fff" d="M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zM12 0C8.741 0 8.333.014 7.053.072 2.695.272.273 2.69.073 7.052.014 8.333 0 8.741 0 12c0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98C8.333 23.986 8.741 24 12 24c3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98C15.668.014 15.259 0 12 0zm0 5.838a6.162 6.162 0 100 12.324 6.162 6.162 0 000-12.324zM12 16a4 4 0 110-8 4 4 0 010 8zm6.406-11.845a1.44 1.44 0 100 2.881 1.44 1.44 0 000-2.881z" />
      </g>
    </svg>
  );
}

export default function Home() {
  return (
    <main className="landing">
      <section className="hero-section">
        <div className="hero wrap">
          <div className="hero-copy">
            <span className="eyebrow hero-eyebrow"><i /> Audiobooks + video voiceovers</span>
            <h1>Text to speech for <em>stories and screens.</em></h1>
            <p className="lead">
              Listen to books, documents, and articles in a dedicated audiobook reader.
              Or turn your video script into a voiceover you can edit, preview, and export.
            </p>
            <div className="hero-actions">
              <Link className="button" href="/reader/audiobooks">Open audiobook reader <ArrowIcon /></Link>
              <Link className="secondary-link" href="/narration">
                <span className="platform-icons"><YouTubeIcon /><TikTokIcon /><InstagramIcon gradientId="ig-hero" /></span> Create a voiceover <ArrowIcon />
              </Link>
            </div>
            <div className="hero-assurances" aria-label="FreeReader product highlights">
              <span><CheckIcon /> Start free</span>
              <span><CheckIcon /> 31 languages</span>
              <span><CheckIcon /> No account required</span>
            </div>
          </div>
          <div className="hero-shot" aria-label="FreeReader live speech demo">
            <div className="demo-caption"><span>Try the voice engine</span><strong>Live preview</strong></div>
            <HeroDemo />
          </div>
        </div>
      </section>

      <section className="section paths-section" id="how" aria-labelledby="paths-heading">
        <div className="wrap">
          <div className="section-heading paths-heading">
            <span className="eyebrow">Choose your workspace</span>
            <h2 id="paths-heading">Listen to a book. Narrate a video.</h2>
            <p>From long-form reading to finished voiceovers, FreeReader gives you the right tools for the job.</p>
          </div>
          <div className="paths-grid">
            <article className="path-card">
              <span className="path-icon" aria-hidden="true">Aa</span>
              <span className="kicker">For readers</span>
              <h3>Your own audiobook library</h3>
              <p>Import EPUBs, PDFs, articles, or pasted text. Follow along on the page, move between chapters, and pick up right where you left off.</p>
              <Link href="/reader/audiobooks">Open audiobook reader <ArrowIcon /></Link>
            </article>
            <article className="path-card">
              <span className="path-icon" aria-hidden="true">▶</span>
              <span className="kicker">For video creators</span>
              <h3>A voiceover studio for scripts</h3>
              <p>Paste a script, set voices and pacing by passage, fix pronunciations, then download a WAV voiceover for your video.</p>
              <Link href="/narration">Open narration studio <ArrowIcon /></Link>
            </article>
          </div>
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

      <section className="section workflow">
        <div className="wrap">
          <div className="section-heading split-heading">
            <div>
              <span className="eyebrow">How FreeReader works</span>
              <h2>From words to audio,<br />on your terms.</h2>
            </div>
            <p>
              Bring your reading or your script. Shape the sound, then listen in
              the app or take your finished narration into your video.
            </p>
          </div>
          <div className="workflow-grid">
            <article className="workflow-card featured-card">
              <span className="step">01</span>
              <div className="format-stack" aria-hidden="true">
                <span>EPUB</span><span>PDF</span><span>DOCX</span>
              </div>
              <div><h3>Start with your words</h3><p>Upload a document, find a public-domain book, paste a video script, or bring in a web article.</p></div>
            </article>
            <article className="workflow-card">
              <span className="step">02</span>
              <div className="wave-graphic" aria-hidden="true">
                {[18, 34, 52, 28, 66, 44, 24, 58, 36, 20, 48, 30].map((height, index) => <i key={index} style={{ height }} />)}
              </div>
              <div><h3>Find the right voice</h3><p>Choose from 31 languages. Fine-tune speed, pronunciation, and pauses in the narration studio.</p></div>
            </article>
            <article className="workflow-card">
              <span className="step">03</span>
              <div className="progress-graphic" aria-hidden="true"><i /><span>Generating audio</span><strong>62%</strong></div>
              <div><h3>Listen or export</h3><p>Keep your place in an audiobook, or preview and export a finished voiceover as WAV.</p></div>
            </article>
          </div>
        </div>
      </section>

      <section className="section trust-section" id="trust">
        <div className="wrap trust-grid">
          <div className="trust-copy">
            <span className="eyebrow light">Privacy, plainly stated</span>
            <h2>Your words stay yours.</h2>
            <p>
              Use either workspace without an account. Your library and narration
              projects are saved in your browser; sign in if you want library sync.
            </p>
            <Link className="light-link" href="/privacy">Read the privacy policy <ArrowIcon /></Link>
          </div>
          <div className="trust-details">
            <article>
              <span className="trust-icon">01</span>
              <div><h3>Local by default</h3><p>Your imported library, narration projects, and generated audio are stored in your browser.</p></div>
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
            <span className="eyebrow">Built for the whole workflow</span>
            <h2>More than a play button.</h2>
            <p>Tools for listening all the way through and getting every line right.</p>
          </div>
          <div className="feature-grid">
            <article><span className="feature-icon">Aa</span><h3>Readable and listenable</h3><p>Follow the text on screen and jump to any passage when you want to listen from there.</p></article>
            <article><span className="feature-icon">↗</span><h3>Script-level control</h3><p>Split, reorder, and regenerate individual passages without remaking the whole voiceover.</p></article>
            <article><span className="feature-icon">◎</span><h3>Precise playback</h3><p>Chapter navigation, ten-second skips, progress seeking, and adjustable speed are always close.</p></article>
            <article><span className="feature-icon">✓</span><h3>Audio you can use</h3><p>Return to your place in a book or download a voiceover ready for your video editor.</p></article>
          </div>
        </div>
      </section>

      <section className="section language-section" aria-labelledby="languages-heading">
        <div className="wrap language-layout">
          <div className="language-copy">
            <span className="eyebrow">A wider world of voices</span>
            <h2 id="languages-heading">Listen in {SPEECH_LANGUAGES.length} languages.</h2>
            <p>Find a voice for a book or a video script. The live preview detects the language of your text automatically.</p>
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
          <span className="eyebrow">Ready when you are</span>
          <h2>Give your words a voice.</h2>
          <p>Open a book or start a script. Both workspaces are free to try, with no account required.</p>
          <div className="final-actions">
            <Link className="button" href="/reader/audiobooks">Start listening <ArrowIcon /></Link>
            <Link className="secondary-link" href="/narration"><span className="platform-icons"><YouTubeIcon /><TikTokIcon /><InstagramIcon gradientId="ig-cta" /></span> Create a voiceover <ArrowIcon /></Link>
          </div>
          <small>One free monthly audio allowance shared across both workspaces.</small>
        </div>
      </section>
    </main>
  );
}
