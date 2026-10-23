// The enhanced listening membership. Not "Pro" or "Premium" — those names were
// retired with the Narration Studio tiers. This is a single product with two
// billing intervals, sold from the reader upgrade notice.
export const ENHANCED_TIER_NAME = "FreeReader Gold";

export const ENHANCED_PLANS = {
  yearly: "gold_yearly",
  monthly: "gold_monthly",
} as const;

export type EnhancedInterval = keyof typeof ENHANCED_PLANS;
export type EnhancedPlanId = (typeof ENHANCED_PLANS)[EnhancedInterval];

export const ENHANCED_PLAN_IDS: readonly string[] = [ENHANCED_PLANS.yearly, ENHANCED_PLANS.monthly];

export function isEnhancedPlan(plan: string | null | undefined): plan is EnhancedPlanId {
  return typeof plan === "string" && ENHANCED_PLAN_IDS.includes(plan);
}

export interface EnhancedPrice {
  interval: EnhancedInterval;
  perMonth: number;
  total: number;
  cadence: string;
  // Free trial length in days; yearly is the only interval with a trial.
  trialDays: number;
}

// The yearly plan is displayed as its monthly-equivalent price rounded to cents,
// but the full amount is billed once for the year.
export const ENHANCED_PRICES: Record<EnhancedInterval, EnhancedPrice> = {
  yearly: { interval: "yearly", perMonth: 1, total: 12, cadence: "per month, billed $12.00 yearly", trialDays: 7 },
  monthly: { interval: "monthly", perMonth: 4, total: 4, cadence: "per month, billed monthly", trialDays: 0 },
};

// Yearly shows its monthly-equivalent to two decimals; monthly shows whole dollars.
export function enhancedPerMonthLabel(price: EnhancedPrice): string {
  return `$${price.perMonth.toFixed(price.interval === "yearly" ? 2 : 0)}`;
}

export function enhancedTotalLabel(price: EnhancedPrice): string {
  return `$${price.total.toFixed(price.interval === "yearly" ? 2 : 0)}`;
}


export interface EnhancedFeature {
  title: string;
  detail: string;
}

export const ENHANCED_FEATURES: readonly EnhancedFeature[] = [
  { title: "Device syncing", detail: "Keep your books and progress synced between devices." },
  { title: "Highest-quality audio", detail: "Hear your books and documents in clear, studio-level quality." },
  { title: "Faster generation", detail: "Dedicated servers so you never have to wait for audio generation." },
];
