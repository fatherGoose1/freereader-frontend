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

export const ENHANCED_TRIAL_DAYS = 7;

// The yearly plan is displayed as its monthly equivalent; the billed amount
// always comes from the backend's configured Stripe Price.
export function enhancedPerMonthLabel(amountCents: number, interval: EnhancedInterval): string {
  return interval === "yearly" ? `$${(amountCents / 1200).toFixed(2)}` : enhancedTotalLabel(amountCents);
}

export function enhancedTotalLabel(amountCents: number): string {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD",
    minimumFractionDigits: amountCents % 100 === 0 ? 0 : 2 }).format(amountCents / 100);
}


export interface EnhancedFeature {
  title: string;
}

export const ENHANCED_FEATURES: readonly EnhancedFeature[] = [
  { title: "Unlimited audio" },
  { title: "Device syncing" },
  { title: "Faster generation" },
  { title: "Voice cloning" },
];
