import type { Metadata } from "next";
import Link from "next/link";
import ProCheckoutButton from "../../components/ProCheckoutButton";
import { fetchPlanPrice, formatProPrice, type PaidPlan } from "../../reader/billing";

export const revalidate = 300;

export const metadata: Metadata = {
  title: "Pricing",
  description:
    "YouTube narration pricing: Free includes 1 hour, Pro includes 10 hours with 1 hour of premium voices and voice cloning, and Premium includes 20 hours with 5 hours of premium voices. Audiobook reading is always free.",
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
      "Built-in voices across 31 languages",
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
      "Voice cloning — narrate in your own or a custom voice",
      "Save up to 3 VoxCPM2 cloned voices",
      "1 hour of cloned voice generation each month",
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
      "5 hours of cloned voice generation each month",
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
        <h1>Find your voiceover plan.</h1>
        <p>
          Start creating video narration for free. Choose more hours or your own
          cloned voice when your scripts grow. Audiobook listening stays free, without a monthly limit.
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
        These monthly allowances apply only to the video Narration Studio.
        Cloned-voice audio uses the premium voice allowance:
        1 hour on Pro or 5 hours on Premium, included in each plan&apos;s narration hours.
        Sign in with Google to subscribe.
      </p>

      <section className="pricing-faq" aria-labelledby="pricing-faq-heading">
        <h2 id="pricing-faq-heading">Pricing questions</h2>

        <h3>How is audio generation measured?</h3>
        <p>
          We count the duration of the narration you generate. Reading,
          editing, importing, and exporting text do not use your allowance.
        </p>

        <h3>Does this limit the audiobook reader?</h3>
        <p>
          No. Audiobook listening and generation are free with no monthly limit.
          Only video voiceovers use the allowances shown above.
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
          be tracked. No card is required, and the audiobook reader stays free
          without an account.
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
