import Link from "next/link";
import CtaButton from "../components/CtaButton";
import HeroDemo from "../components/HeroDemo";
import AppStoreButton from "../components/AppStoreButton";
import LandingDemoVideo from "../components/LandingDemoVideo";
import FeedbackCarousel from "../components/FeedbackCarousel";
import ReadingSupportSection from "../components/ReadingSupportSection";
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

      <section className="reader-feedback" aria-label="What Our Readers Say">
        <FeedbackCarousel />
      </section>

      <section className="section audiobook-story" id="how" aria-labelledby="audiobook-story-heading">
        <div className="wrap audiobook-story-layout">
          <h2 id="audiobook-story-heading">All your documents<br />read aloud.</h2>
          <LandingDemoVideo />
          <div className="format-list demo-formats" aria-label="Compatible sources and formats">
            <span>Free books</span>
            {formats.map((format) => <span key={format}>{format}</span>)}
            <span>Web articles</span>
          </div>
          <Link className="text-link audiobook-story-link" href="/reader/audiobooks">Open the audiobook reader <ArrowIcon /></Link>
        </div>
      </section>

      <ReadingSupportSection />

      <section className="section language-section" aria-labelledby="languages-heading">
        <div className="wrap language-layout">
          <div className="language-copy">
            <h2 id="languages-heading">Listen in {SPEECH_LANGUAGES.length} languages.</h2>
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
        </div>
      </section>
    </main>
  );
}
