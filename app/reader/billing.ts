import { recordTelemetry } from "./telemetry";
import { isEnhancedPlan, type EnhancedPlanId } from "./enhanced";

// Pro and Premium were retired. Only the Gold intervals can be purchased.
export type PaidPlan = EnhancedPlanId;

export interface PlanPrice {
  amount_cents: number;
  currency: "usd";
  interval: "month" | "year";
}

export async function fetchPlanPrice(plan: PaidPlan): Promise<PlanPrice> {
  // The pricing page renders on the server (including at build time); the
  // browser uses the same-origin proxy so local ports do not depend on CORS.
  const endpoint = typeof window === "undefined"
    ? `${(process.env.KOKO_BACKEND_URL ?? "https://koko-backend-production-c887.up.railway.app").replace(/\/$/, "")}/api/v1/freereader/billing/price?plan=${plan}`
    : `/api/billing/price?plan=${plan}`;
  const response = await fetch(endpoint);
  if (!response.ok) throw new Error("price_unavailable");
  const price = await response.json() as Partial<PlanPrice>;
  if (typeof price.amount_cents !== "number" || !Number.isInteger(price.amount_cents) || price.amount_cents < 0 || price.currency !== "usd" || !["month", "year"].includes(price.interval ?? "")) {
    throw new Error("invalid_plan_price");
  }
  return price as PlanPrice;
}

async function billingUrl(path: "checkout" | "portal" | "gold-offer-checkout", token: string, plan?: PaidPlan): Promise<string> {
  const response = await fetch(`/api/billing/${path}`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, ...(path === "checkout" && plan ? { "Content-Type": "application/json" } : {}) },
    ...(path === "checkout" && plan ? { body: JSON.stringify({ plan }) } : {}),
  });
  if (!response.ok) {
    if (path === "gold-offer-checkout") throw new Error(response.status === 403 ? "gold_offer_ineligible" : "gold_offer_unavailable");
    if (path === "checkout" && response.status === 409) {
      const detail = await response.json().catch(() => null) as { error?: string } | null;
      if (detail?.error === "manage_existing_subscription") return billingUrl("portal", token);
      if (detail?.error === "manage_apple_subscription") throw new Error("manage_apple_subscription");
    }
    throw new Error("checkout_unavailable");
  }
  const data = await response.json() as { url?: unknown };
  if (typeof data.url !== "string") throw new Error("checkout_unavailable");
  const url = new URL(data.url);
  if (url.protocol !== "https:" || !url.hostname.endsWith(".stripe.com")) throw new Error("checkout_unavailable");
  if (path !== "portal") recordTelemetry("checkout_viewed", { plan: plan ?? "gold_monthly" }, isEnhancedPlan(plan) ? "audiobook" : "youtube_narration");
  return url.href;
}

export function startCheckout(token: string, plan: PaidPlan = "gold_monthly"): Promise<string> {
  return billingUrl("checkout", token, plan);
}

export function startGoldOfferCheckout(token: string): Promise<string> {
  return billingUrl("gold-offer-checkout", token, "gold_yearly");
}

export function manageSubscription(token: string): Promise<string> {
  return billingUrl("portal", token);
}
