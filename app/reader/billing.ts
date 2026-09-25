const API_BASE = (process.env.NEXT_PUBLIC_KOKO_BACKEND_URL
  ?? "https://koko-backend-production-c887.up.railway.app").replace(/\/$/, "");

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
