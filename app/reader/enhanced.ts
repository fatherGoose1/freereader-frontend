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
}

// The yearly plan is displayed as $1/month but billed $12 for the full year.
export const ENHANCED_PRICES: Record<EnhancedInterval, EnhancedPrice> = {
  yearly: { interval: "yearly", perMonth: 1, total: 12, cadence: "per month, billed $12 yearly" },
  monthly: { interval: "monthly", perMonth: 4, total: 4, cadence: "per month, billed monthly" },
};

export interface EnhancedFeature {
  title: string;
  detail: string;
}

export const ENHANCED_FEATURES: readonly EnhancedFeature[] = [
  { title: "Faster generation", detail: "A reserved Gold slot when shared generation is busy" },
  { title: "Enhanced audio", detail: "Better-quality audio" },
  { title: "Device syncing", detail: "Keep your books and progress synced between devices" },
];
