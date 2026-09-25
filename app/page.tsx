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
            <span className="eyebrow hero-eyebrow"><i /> Audiobooks + video voiceovers</span>
            <h1>Text to speech for <em>stories and screens.</em></h1>
            <p className="lead">
              Listen to books, documents, and articles in a dedicated audiobook reader.
              Or turn your video script into a voiceover you can edit, preview, and export.
            </p>
            <div className="hero-actions">
              <Link className="button" href="/reader/audiobooks">Open audiobook reader <ArrowIcon /></Link>
              <Link className="secondary-link" href="/narration">
                Create a voiceover <ArrowIcon />
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

      <section className="proof-strip" aria-label="FreeReader product facts">
        <div className="wrap proof-grid">
          <div><strong>2</strong><span>dedicated workspaces</span></div>
          <div><strong>{SPEECH_LANGUAGES.length}</strong><span>narration languages</span></div>
          <div><strong>{formats.length}</strong><span>document formats</span></div>
          <div><strong>1</strong><span>shared voice platform</span></div>
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
            <Link className="secondary-link" href="/narration">Create a voiceover <ArrowIcon /></Link>
          </div>
          <small>One free monthly audio allowance shared across both workspaces.</small>
        </div>
      </section>
    </main>
  );
}
