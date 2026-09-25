const API_BASE = (process.env.NEXT_PUBLIC_KOKO_BACKEND_URL
  ?? "https://koko-backend-production-c887.up.railway.app").replace(/\/$/, "");

export interface ProPrice {
  amount_cents: number;
  currency: "usd";
  interval: "month";
}

export async function fetchProPrice(): Promise<ProPrice> {
  const response = await fetch(`${API_BASE}/api/v1/freereader/billing/price`);
  if (!response.ok) throw new Error("price_unavailable");
  const price = await response.json() as Partial<ProPrice>;
  if (typeof price.amount_cents !== "number" || !Number.isInteger(price.amount_cents) || price.amount_cents < 0 || price.currency !== "usd" || price.interval !== "month") {
    throw new Error("invalid_pro_price");
  }
  return price as ProPrice;
}

export function formatProPrice(price: ProPrice): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency", currency: price.currency.toUpperCase(),
    minimumFractionDigits: price.amount_cents % 100 === 0 ? 0 : 2,
    maximumFractionDigits: 2,
  }).format(price.amount_cents / 100);
}

async function billingUrl(path: "checkout" | "portal", token: string): Promise<string> {
  const response = await fetch(`${API_BASE}/api/v1/freereader/billing/${path}`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!response.ok) throw new Error("checkout_unavailable");
  const data = await response.json() as { url?: unknown };
  if (typeof data.url !== "string") throw new Error("checkout_unavailable");
  const url = new URL(data.url);
  if (url.protocol !== "https:" || !url.hostname.endsWith(".stripe.com")) throw new Error("checkout_unavailable");
  return url.href;
}

export function startCheckout(token: string): Promise<string> {
  return billingUrl("checkout", token);
}

export function manageSubscription(token: string): Promise<string> {
  return billingUrl("portal", token);
}
