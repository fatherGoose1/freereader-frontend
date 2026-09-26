import type { Metadata } from "next";
import Link from "next/link";
import ProCheckoutButton from "../components/ProCheckoutButton";
import { fetchPlanPrice, formatProPrice, type PaidPlan } from "../reader/billing";

export const revalidate = 300;

export const metadata: Metadata = {
  title: "Pricing",
  description:
    "FreeReader pricing: start free with 1 hour of audio generation each month, get 10 hours with Pro, or get 20 hours plus 1 hour of cloned-voice narration with Premium.",
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
    summary: "Both tools, one hour of narration each month, no card required.",
    features: [
      "1 hour of audio generation each month",
      "Audiobook reader for EPUB, PDF, DOCX, TXT, HTML, Markdown, and web articles",
      "YouTube Narration Studio with script editing and voiceover export",
      "All 31 languages and every available voice",
      "Project Gutenberg library and private local storage",
      "Optional Google sign-in for cross-device sync",
    ],
    cta: { label: "Start free", href: "/reader" },
  },
  {
    name: "Pro",
    price: "$6",
    cadence: "per month",
    summary: "Room for creators and long reads that go well past an hour.",
    features: [
      "Up to 10 hours of audio generation each month",
      "Everything in the Free tier",
      "A single monthly allowance shared across both tools",
    ],
    cta: { label: "Get Pro", href: "/reader" },
    plan: "pro",
    badge: "Most popular",
  },
  {
    name: "Premium",
    price: "—",
    cadence: "per month",
    summary: "Cloned voices and the most hours for power users and teams.",
    features: [
      "Up to 20 hours of audio generation each month",
      "Voice cloning — narrate in your own or a custom voice",
      "1 hour of cloned-voice narration each month, included in the 20 hours",
      "Everything in the Pro tier",
    ],
    cta: { label: "Get Premium", href: "/reader" },
    plan: "premium",
    badge: "Voice cloning",
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
        <h1>One account, both tools.</h1>
        <p>
          FreeReader turns your reading and your scripts into narration. Start
          free, and upgrade when an hour a month is not enough. The same
          plan covers the audiobook reader and the YouTube Narration Studio.
        </p>
      </div>

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
        Your monthly narration allowance is shared between the audiobook reader and the
        Narration Studio. Premium cloned-voice audio also draws from its separate 1-hour allowance.
        Sign in with Google to subscribe.
      </p>

      <section className="pricing-faq" aria-labelledby="pricing-faq-heading">
        <h2 id="pricing-faq-heading">Pricing questions</h2>

        <h3>How is audio generation measured?</h3>
        <p>
          We count the duration of the narration you generate. Reading,
          editing, importing, and exporting text do not use your allowance.
        </p>

        <h3>Does one allowance cover both products?</h3>
        <p>
          Yes. The audiobook reader and the YouTube Narration Studio draw from
          the same monthly allowance, so you can split your hours however you
          like. Cloned-voice audio also counts toward Premium’s separate 1-hour limit.
        </p>

        <h3>What happens when I reach my limit?</h3>
        <p>
          Your library and scripts stay available, but new narration pauses
          until your allowance resets or you upgrade. When the Premium voice hour is used,
          you can still generate with standard voices if you have narration time left.
        </p>

        <h3>Do I need an account?</h3>
        <p>
          No. Your library works entirely in the browser without signing in.
          A Google account is only needed for cross-device sync and paid plans.
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
