import type { Metadata } from "next";
import Link from "next/link";
import CtaButton from "../components/CtaButton";
import HeroDemo from "../components/HeroDemo";
import HeroPhoneVideo from "../components/HeroPhoneVideo";
import AppDownloadButtons from "../components/AppDownloadButtons";
import FeedbackCarousel from "../components/FeedbackCarousel";
import ReadingSupportSection from "../components/ReadingSupportSection";
import { SPEECH_LANGUAGES } from "../languages";
import { siteUrl } from "@/lib/site";

export const metadata: Metadata = {
  title: { absolute: "FreeReader — Listen to books, documents, and articles" },
  description: "Listen with FreeReader on the web, iPhone, or Chrome. One hour of free audio each day; Gold offers unlimited audiobook listening for $39/year or $5/month.",
  alternates: { canonical: "/" },
};

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
  const appStructuredData = {
    "@context": "https://schema.org",
    "@type": "SoftwareApplication",
    name: "FreeReader",
    url: siteUrl,
    description: "Text-to-speech reading for books, documents, articles, and Reddit threads.",
    applicationCategory: "EducationalApplication",
    operatingSystem: "Web, iOS, Chrome",
    installUrl: [
      "https://apps.apple.com/app/voicereader-text-to-speech/id6808351587",
      "https://chromewebstore.google.com/detail/freereader-text-to-speech/nkndgadokffoldebphmdphjepcedcakc",
    ],
    offers: [
      { "@type": "Offer", name: "Free", price: "0", priceCurrency: "USD", description: "One hour of free listening per day" },
      { "@type": "Offer", name: "Gold monthly", price: "5", priceCurrency: "USD", description: "Unlimited audiobook audio, billed monthly" },
      { "@type": "Offer", name: "Gold yearly", price: "39", priceCurrency: "USD", description: "Unlimited audiobook audio, billed yearly" },
    ],
  };
  return (
    <main className="landing">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(appStructuredData) }} />
      <section className="hero-section">
        <div className="hero wrap">
          <div className="hero-copy">
            {/* <span className="eyebrow hero-eyebrow"><i /> Audiobooks + video voiceovers</span> */}
            <h1 aria-label="Faster than Speechify, ElevenReader, or NaturalReader, less than half the price.">
              Faster than
              <span className="hero-comparison">
                <em className="hero-competitor" aria-hidden="true">
                  <span>Speechify</span>
                  <span>ElevenReader</span>
                  <span>NaturalReader</span>
                </em><span className="hero-comparison-punctuation">,</span>
              </span>
              less than half the price.
            </h1>
            <p className="lead">
              Listen to books, documents, and articles in seconds.
              Natural voices and one hour of free listening every day.
            </p>
            <div className="hero-actions">
              <AppDownloadButtons />
              <Link className="button audiobook-cta" href="/reader/audiobooks">Open Web App <ArrowIcon /></Link>
            </div>
            <div className="hero-assurances" aria-label="FreeReader product highlights">
              <span><CheckIcon /> Start free</span>
              <span><CheckIcon /> 32 languages</span>
              <span><CheckIcon /> Gold for unlimited listening</span>
            </div>
          </div>
          <div className="hero-shot">
            <HeroPhoneVideo />
          </div>
        </div>
      </section>

      <section className="reader-feedback" aria-label="What Our Readers Say">
        <FeedbackCarousel />
      </section>

      <section className="section audiobook-story" id="how" aria-labelledby="audiobook-story-heading">
        <div className="wrap audiobook-story-layout">
          <h2 id="audiobook-story-heading">Try it with any language</h2>
          <HeroDemo />
        </div>
      </section>

      <ReadingSupportSection />

      <section className="section" aria-labelledby="listening-questions-heading">
        <div className="wrap pricing-faq listening-faq">
          <h2 id="listening-questions-heading">Questions about FreeReader</h2>
          <h3>Is FreeReader free?</h3>
          <p>Yes. Listen for up to one hour a day for free. <Link href="/pricing">FreeReader Gold</Link> gives you unlimited audiobook listening for $39 per year or $5 per month.</p>
          <h3>Can I listen to Reddit threads?</h3>
          <p>Yes. The <a href="https://chromewebstore.google.com/detail/freereader-text-to-speech/nkndgadokffoldebphmdphjepcedcakc">FreeReader Chrome extension</a> reads Reddit threads aloud with a different voice for each user. You can also listen to web pages.</p>
          <h3>Is FreeReader available on iPhone?</h3>
          <p>Yes. <a href="https://apps.apple.com/app/voicereader-text-to-speech/id6808351587">Download FreeReader on the App Store</a>, or use the web reader in your browser.</p>
          <h3>Does FreeReader work for schools?</h3>
          <p>Yes. <Link href="/school">FreeReader EDU</Link> helps students who struggle with reading listen and follow along with assigned materials.</p>
        </div>
      </section>

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
          <p>Listen in your browser, on iPhone, or with the FreeReader Chrome extension. Start with one free hour each day.</p>
          <div className="final-actions">
            <Link className="button" href="/reader/audiobooks">Start listening <ArrowIcon /></Link>
            <AppDownloadButtons />
          </div>
        </div>
      </section>
    </main>
  );
}
