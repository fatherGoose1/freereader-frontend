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

      <section className="section audiobook-story" id="how" aria-labelledby="audiobook-story-heading">
        <div className="wrap audiobook-story-layout">
          <div className="audiobook-story-copy">
            <span className="eyebrow">The audiobook reader</span>
            <h2 id="audiobook-story-heading">Turn the page.<br />Or press play.</h2>
            <p className="audiobook-story-intro">Some days you want to sit and read. Other days, you want to take the story with you. FreeReader lets you do both.</p>
            <div className="audiobook-story-moments">
              <div><span className="audiobook-story-number">01</span><div><h3>Bring something to read</h3><p>Pick a free classic, add a book or document, or open an article you want to hear.</p></div></div>
              <div><span className="audiobook-story-number">02</span><div><h3>Listen your way</h3><p>Choose a voice, set the pace, and follow the words on screen as you listen.</p></div></div>
              <div><span className="audiobook-story-number">03</span><div><h3>Come back where you left off</h3><p>Pause when life interrupts. Your place is waiting when you return.</p></div></div>
            </div>
            <Link className="text-link audiobook-story-link" href="/reader/audiobooks">Open the audiobook reader <ArrowIcon /></Link>
          </div>
          <div className="audiobook-story-visual" aria-hidden="true">
            <div className="audiobook-story-book">
              <div className="audiobook-story-book-top"><span>FreeReader</span><span>CHAPTER 04</span></div>
              <div className="audiobook-story-page">
                <span className="audiobook-story-page-label">A little more time</span>
                <p>The afternoon light moved slowly across the floor.</p>
                <p className="audiobook-story-active">Outside, the city went on. Inside, there was time for one more page.</p>
                <p>And then, without quite noticing when it happened, the story carried her somewhere else.</p>
              </div>
              <div className="audiobook-story-player">
                <div className="audiobook-story-player-head"><span>Now listening</span><span>1× speed</span></div>
                <div className="audiobook-story-player-controls">
                  <span className="audiobook-story-play"><svg viewBox="0 0 20 20"><path d="m7 4 9 6-9 6V4Z" fill="currentColor" /></svg></span>
                  <span className="audiobook-story-track"><i /></span>
                  <span className="audiobook-story-time">12:38</span>
                </div>
              </div>
            </div>
            <span className="audiobook-story-note">A story that moves with you.</span>
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
