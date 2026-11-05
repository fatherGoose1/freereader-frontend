import type { Metadata } from "next";
import Link from "next/link";
import ProCheckoutButton from "../../components/ProCheckoutButton";
import { fetchPlanPrice, formatProPrice, type PaidPlan } from "../../reader/billing";

export const revalidate = 300;

export const metadata: Metadata = {
  title: "Pricing",
  description:
    "Listen for one hour free each day, or get unlimited audiobook audio with FreeReader Gold for $39/year or $5/month. Separate plans are available for video narration.",
  alternates: { canonical: "/pricing" },
};

function CheckIcon() {
  return (
    <svg viewBox="0 0 20 20" aria-hidden="true">
      <path d="m4 10 4 4 8-9" />
    </svg>
  );
}

type Tier = {
  name: string;
  price: string;
  cadence: string;
  summary: string;
  features: string[];
  cta: { label: string; href: string };
  plan?: PaidPlan;
  badge?: string;
};

const tiers: Tier[] = [
  {
    name: "Free",
    price: "$0",
    cadence: "forever",
    summary: "Make your first video voiceovers at no cost. No card required.",
    features: [
      "1 hour of video narration each month",
      "Script editing and WAV voiceover export",
      "Built-in voices across 32 languages",
      "Pronunciation, pace, and pause control by passage",
      "Projects saved privately in this browser",
      "Free Google sign-in, no card required",
    ],
    cta: { label: "Start free", href: "/narration" },
  },
  {
    name: "Pro",
    price: "$6",
    cadence: "per month",
    summary: "Room for creators and long reads that go well past an hour.",
    features: [
      "Up to 10 hours of video narration each month",
      "Custom voices — narrate in your own voice",
      "Expressive voices with per-passage delivery instructions",
      "1 hour of premium voice generation each month (built-in or custom)",
      "Everything in the Free tier",
      "More room to revise and regenerate your scripts",
    ],
    cta: { label: "Get Pro", href: "/narration" },
    plan: "pro",
    badge: "Most popular",
  },
  {
    name: "Premium",
    price: "—",
    cadence: "per month",
    summary: "More time with your favorite voices for power users and teams.",
    features: [
      "Up to 20 hours of video narration each month",
      "5 hours of premium voice generation each month (built-in or custom)",
      "Everything in the Pro tier",
    ],
    cta: { label: "Get Premium", href: "/reader" },
    plan: "premium",
    badge: "Custom voices",
  },
];

export default async function Pricing() {
  const [proPrice, premiumPrice] = await Promise.all([
    fetchPlanPrice("pro").then(formatProPrice).catch(() => null),
    fetchPlanPrice("premium").then(formatProPrice).catch(() => null),
  ]);
  const premiumUnavailable = !premiumPrice;
  const priceFor = (tier: Tier) =>
    tier.plan === "premium" ? premiumPrice ?? tier.price
      : tier.plan === "pro" ? proPrice ?? tier.price
        : tier.price;

  return (
    <main className="wrap pricing">
      <div className="pricing-hero">
        <span className="eyebrow">Pricing</span>
        <h1>FreeReader pricing.</h1>
        <p>
          Listen for one hour free each day. Choose Gold for unlimited audiobook audio,
          or explore separate plans for video narration.
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

      <h2 className="pricing-section-heading">Video narration plans</h2>
      <p className="pricing-section-intro">Create voiceovers from scripts. These monthly video narration allowances are separate from the audiobook reader&apos;s daily listening allowance.</p>

      <div className="pricing-grid">
        {tiers.map((tier) => (
          <section
            key={tier.name}
            className={`price-card${tier.plan === "premium" && premiumUnavailable ? " inactive" : ""}`}
            aria-labelledby={`plan-${tier.name.toLowerCase()}`}
          >
            <div className="price-card-head">
              <h2 id={`plan-${tier.name.toLowerCase()}`}>{tier.name}</h2>
              {tier.badge && <span className="price-badge">{tier.badge}</span>}
            </div>
            <p className="price-amount">
              <strong>{priceFor(tier)}</strong>
              <span>{tier.cadence}</span>
            </p>
            <p className="price-summary">{tier.summary}</p>
            <ul className="price-features">
              {tier.features.map((feature) => (
                <li key={feature}><CheckIcon />{feature}</li>
              ))}
            </ul>
            {tier.plan ? (
              tier.plan === "premium" && premiumUnavailable
                ? <button className="button" type="button" disabled>Unavailable</button>
                : <ProCheckoutButton plan={tier.plan} />
            ) : (
              <Link className="button" href={tier.cta.href}>{tier.cta.label}</Link>
            )}
          </section>
        ))}
      </div>

      <p className="pricing-note">
        Audio generation is measured by the length of the narration you create.
        These monthly allowances apply only to the video Narration Studio.
        Built-in and custom-voice audio share the premium voice allowance:
        1 hour on Pro or 5 hours on Premium, included in each plan&apos;s narration hours.
        Sign in with Google to subscribe.
      </p>

      <section className="pricing-faq" aria-labelledby="pricing-faq-heading">
        <h2 id="pricing-faq-heading">Pricing questions</h2>

        <h3>How much free audiobook listening do I get?</h3>
        <p>FreeReader includes one hour of audiobook audio per day. Gold removes the daily audiobook audio limit for $39 per year or $5 per month.</p>

        <h3>Do Gold and video narration plans cover the same thing?</h3>
        <p>No. Gold is for audiobook listening and reader features. The Pro and Premium plans below are for creating video voiceovers and have separate monthly allowances.</p>

        <h3>How is audio generation measured?</h3>
        <p>
          We count the duration of the narration you generate. Reading,
          editing, importing, and exporting text do not use your allowance.
        </p>

        <h3>Do the video narration limits apply to the audiobook reader?</h3>
        <p>
          No. The monthly allowances above apply to video voiceovers. Free audiobook
          audio has a separate one-hour-per-day limit; Gold removes that daily limit.
        </p>

        <h3>What happens when I reach my limit?</h3>
        <p>
          Your scripts stay available, but new video narration pauses
          until your allowance resets or you upgrade. When your premium voice hours are used,
          you can still generate with standard voices if you have narration time left.
        </p>

        <h3>Do I need an account?</h3>
        <p>
          Video narration needs a free Google sign-in so your monthly allowance can
          be tracked. No card is required for the free plan. The web audiobook reader
          can be opened without an account, but generating new audio requires free sign-in.
        </p>

        <h3>Can I cancel my subscription?</h3>
        <p>
          Paid plans are month to month and can be cancelled at any time. When they end,
          you keep everything you have already generated and return to the Free
          tier.
        </p>
      </section>
    </main>
  );
}
