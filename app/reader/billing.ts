import { recordTelemetry } from "./telemetry";
import { isEnhancedPlan, type EnhancedPlanId } from "./enhanced";

const API_BASE = (process.env.NEXT_PUBLIC_KOKO_BACKEND_URL
  ?? "https://koko-backend-production-c887.up.railway.app").replace(/\/$/, "");

export type PaidPlan = "pro" | "premium" | EnhancedPlanId;

export interface PlanPrice {
  amount_cents: number;
  currency: "usd";
  interval: "month" | "year";
}

export async function fetchPlanPrice(plan: PaidPlan): Promise<PlanPrice> {
  const response = await fetch(`${API_BASE}/api/v1/freereader/billing/price?plan=${plan}`);
  if (!response.ok) throw new Error("price_unavailable");
  const price = await response.json() as Partial<PlanPrice>;
  if (typeof price.amount_cents !== "number" || !Number.isInteger(price.amount_cents) || price.amount_cents < 0 || price.currency !== "usd" || !["month", "year"].includes(price.interval ?? "")) {
    throw new Error("invalid_plan_price");
  }
  return price as PlanPrice;
}

export const fetchProPrice = () => fetchPlanPrice("pro");

export function formatProPrice(price: PlanPrice): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency", currency: price.currency.toUpperCase(),
    minimumFractionDigits: price.amount_cents % 100 === 0 ? 0 : 2,
    maximumFractionDigits: 2,
  }).format(price.amount_cents / 100);
}

async function billingUrl(path: "checkout" | "portal" | "gold-offer-checkout", token: string, plan?: PaidPlan): Promise<string> {
  const response = await fetch(`${API_BASE}/api/v1/freereader/billing/${path}`, {
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
  if (path !== "portal") recordTelemetry("checkout_viewed", { plan: plan ?? "pro" }, isEnhancedPlan(plan) ? "audiobook" : "youtube_narration");
  return url.href;
}

export function startCheckout(token: string, plan: PaidPlan = "pro"): Promise<string> {
  return billingUrl("checkout", token, plan);
}

export function startGoldOfferCheckout(token: string): Promise<string> {
  return billingUrl("gold-offer-checkout", token, "gold_yearly");
}

export function manageSubscription(token: string): Promise<string> {
  return billingUrl("portal", token);
}
