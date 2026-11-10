import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Pricing",
  description:
    "Listen for one hour free each day, or get unlimited audiobook audio with FreeReader Gold for $39/year or $5/month.",
  alternates: { canonical: "/pricing" },
};

function CheckIcon() {
  return (
    <svg viewBox="0 0 20 20" aria-hidden="true">
      <path d="m4 10 4 4 8-9" />
    </svg>
  );
}

export default function Pricing() {
  return (
    <main className="wrap pricing">
      <div className="pricing-hero">
        <span className="eyebrow">Pricing</span>
        <h1>FreeReader pricing.</h1>
        <p>
          Listen for one hour free each day, or get FreeReader Gold for unlimited
          audiobook audio.
        </p>
      </div>

      <section aria-labelledby="gold-pricing-heading">
        <h2 id="gold-pricing-heading" className="pricing-section-heading">Audiobook listening</h2>
        <div className="pricing-grid gold-grid">
          <div className="price-card">
            <div className="price-card-head"><h3>Free</h3></div>
            <p className="price-amount"><strong>$0</strong><span>no subscription</span></p>
            <p className="price-summary">One hour of audiobook listening each day.</p>
            <ul className="price-features">
              <li><CheckIcon /> Read EPUBs, PDFs, documents, and articles</li>
              <li><CheckIcon /> Listen on the web, iPhone, and Chrome</li>
            </ul>
            <Link className="button" href="/reader/audiobooks">Start listening</Link>
          </div>
          <div className="price-card">
            <div className="price-card-head"><h3>FreeReader Gold</h3></div>
            <p className="price-amount"><strong>$39</strong><span>per year, or $5 per month</span></p>
            <p className="price-summary">Unlimited audiobook audio and more ways to make reading yours.</p>
            <ul className="price-features">
              <li><CheckIcon /> Unlimited audiobook listening</li>
              <li><CheckIcon /> Sync parsed books and reading progress across devices</li>
              <li><CheckIcon /> Custom voices for signed-in Gold accounts</li>
            </ul>
            <Link className="button" href="/reader/audiobooks">Explore Gold in the reader</Link>
          </div>
        </div>
      </section>

      <section className="pricing-faq" aria-labelledby="pricing-faq-heading">
        <h2 id="pricing-faq-heading">Pricing questions</h2>

        <h3>How much free audiobook listening do I get?</h3>
        <p>FreeReader includes one hour of audiobook audio per day. Gold removes the daily audiobook audio limit for $39 per year or $5 per month.</p>

        <h3>What does FreeReader Gold include?</h3>
        <p>Gold gives you unlimited audiobook listening, device syncing for parsed books and reading progress, and custom voices for signed-in accounts.</p>

        <h3>Do I need an account?</h3>
        <p>You can open the web audiobook reader without an account, but generating new audio requires a free Google sign-in. Gold features require a signed-in Gold account.</p>

        <h3>Can I cancel my subscription?</h3>
        <p>Gold is billed yearly or monthly and can be cancelled at any time. When it ends, you keep everything you have already generated and return to the Free tier.</p>
      </section>
    </main>
  );
}
