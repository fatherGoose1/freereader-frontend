import Link from "next/link";
import CtaButton from "../components/CtaButton";
import HeroDemo from "../components/HeroDemo";
import AppStoreButton from "../components/AppStoreButton";
import { SPEECH_LANGUAGES } from "../languages";

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
            {/* <span className="eyebrow hero-eyebrow"><i /> Audiobooks + video voiceovers</span> */}
            <h1>Make audiobooks <em>from anything.</em></h1>
            <p className="lead">
              Listen to books, documents, and articles in seconds.
              Natural voices, no signup required, always free.
            </p>
            <div className="hero-actions">
              <Link className="button audiobook-cta" href="/reader/audiobooks">Open audiobook reader <ArrowIcon /><span className="always-free-badge">Always free</span></Link>
              <AppStoreButton />
            </div>
            <div className="hero-assurances" aria-label="FreeReader product highlights">
              <span><CheckIcon /> Start free</span>
              <span><CheckIcon /> 32 languages</span>
              <span><CheckIcon /> No signup required</span>
            </div>
          </div>
          <div className="hero-shot" aria-label="FreeReader live speech demo">
            <HeroDemo />
          </div>
        </div>
      </section>

      <section className="compatibility" aria-label="Compatible sources and formats">
        <div className="wrap compatibility-row">
          <p>Bring reading you have the rights to narrate</p>
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
              <div><h3>Start with your words</h3><p>Upload your own work, find a public-domain book, or bring in a script or article you have permission to narrate.</p></div>
            </article>
            <article className="workflow-card">
              <span className="step">02</span>
              <div className="wave-graphic" aria-hidden="true">
                {[18, 34, 52, 28, 66, 44, 24, 58, 36, 20, 48, 30].map((height, index) => <i key={index} style={{ height }} />)}
              </div>
              <div><h3>Find the right voice</h3><p>Choose from 32 languages. Fine-tune speed, pronunciation, and pauses in the narration studio.</p></div>
            </article>
            <article className="workflow-card">
              <span className="step">03</span>
              <div className="progress-graphic" aria-hidden="true"><i /><span>Generating audio</span><strong>62%</strong></div>
              <div><h3>Listen or export</h3><p>Keep your place in an audiobook, or preview and export a finished voiceover as WAV.</p></div>
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
          <p>Listen to books for free in your browser or take VoiceReader with you on iPhone.</p>
          <div className="final-actions">
            <Link className="button" href="/reader/audiobooks">Start listening <ArrowIcon /></Link>
            <AppStoreButton />
          </div>
          <small>Download VoiceReader from the App Store.</small>
        </div>
      </section>
    </main>
  );
}
