import assert from "node:assert/strict";
import test from "node:test";
import { fetchPlanPrice, fetchProPrice, formatProPrice, manageSubscription, startCheckout, startGoldOfferCheckout } from "./billing";

test("Pro price is read from the configured Stripe Price instead of the checkout button", async (t) => {
  const fetch = t.mock.method(globalThis, "fetch", async () => Response.json({ amount_cents: 600, currency: "usd", interval: "month" }));
  assert.equal(formatProPrice(await fetchProPrice()), "$6");
  assert.ok(String(fetch.mock.calls[0].arguments[0]).endsWith("/billing/price?plan=pro"));
});

test("Premium displays the Stripe price and requests Premium checkout", async (t) => {
  const calls: Array<{ url: string; body: string | undefined }> = [];
  t.mock.method(globalThis, "fetch", async (input: RequestInfo | URL, init?: RequestInit) => {
    calls.push({ url: String(input), body: init?.body as string | undefined });
    return calls.length === 1
      ? Response.json({ amount_cents: 1000, currency: "usd", interval: "month" })
      : Response.json({ url: "https://checkout.stripe.com/c/pay/premium" });
  });
  assert.equal(formatProPrice(await fetchPlanPrice("premium")), "$10");
  assert.ok(calls[0].url.endsWith("/billing/price?plan=premium"));
  assert.equal(await startCheckout("access-token", "premium"), "https://checkout.stripe.com/c/pay/premium");
  assert.deepEqual(JSON.parse(calls[1].body ?? ""), { plan: "premium" });
});

test("Gold yearly and monthly checkout use their own plan ids", async (t) => {
  const calls: Array<{ url: string; body?: string }> = [];
  t.mock.method(globalThis, "fetch", async (input: RequestInfo | URL, init?: RequestInit) => {
    calls.push({ url: String(input), body: init?.body as string | undefined });
    return calls.length === 1
      ? Response.json({ amount_cents: 1200, currency: "usd", interval: "year" })
      : Response.json({ url: "https://checkout.stripe.com/c/pay/gold" });
  });
  assert.equal((await fetchPlanPrice("gold_yearly")).interval, "year");
  assert.ok(calls[0].url.endsWith("/billing/price?plan=gold_yearly"));
  assert.equal(await startCheckout("access-token", "gold_monthly"), "https://checkout.stripe.com/c/pay/gold");
  assert.deepEqual(JSON.parse(calls[1].body ?? ""), { plan: "gold_monthly" });
});

test("billing actions request a hosted Stripe URL for the signed-in user", async (t) => {
  const requests: Array<{ path: string; authorization: string | null }> = [];
  t.mock.method(globalThis, "fetch", async (input: RequestInfo | URL, init?: RequestInit) => {
    requests.push({ path: String(input), authorization: new Headers(init?.headers).get("Authorization") });
    return Response.json({ url: requests.length === 1
      ? "https://checkout.stripe.com/c/pay/test"
      : "https://billing.stripe.com/p/session/test" });
  });
  assert.equal(await startCheckout("access-token"), "https://checkout.stripe.com/c/pay/test");
  assert.equal(await manageSubscription("access-token"), "https://billing.stripe.com/p/session/test");
  assert.ok(requests[0].path.endsWith("/billing/checkout"));
  assert.ok(requests[1].path.endsWith("/billing/portal"));
  assert.deepEqual(requests.map((request) => request.authorization), ["Bearer access-token", "Bearer access-token"]);
});

test("billing refuses non-Stripe redirect URLs", async (t) => {
  t.mock.method(globalThis, "fetch", async () => Response.json({ url: "https://stripe.com.attacker.example/steal" }));
  await assert.rejects(startCheckout("access-token"), /checkout_unavailable/);
});

test("the email offer uses its own authenticated checkout without passing a client coupon", async (t) => {
  const fetch = t.mock.method(globalThis, "fetch", async () => Response.json({ url: "https://checkout.stripe.com/c/pay/gold50" }));
  assert.equal(await startGoldOfferCheckout("offer-token"), "https://checkout.stripe.com/c/pay/gold50");
  assert.ok(String(fetch.mock.calls[0].arguments[0]).endsWith("/billing/gold-offer-checkout"));
  assert.equal(new Headers(fetch.mock.calls[0].arguments[1]?.headers).get("Authorization"), "Bearer offer-token");
  assert.equal(fetch.mock.calls[0].arguments[1]?.body, undefined);
});

test("ineligible email offers do not fall back to full-price checkout", async (t) => {
  const fetch = t.mock.method(globalThis, "fetch", async () => Response.json({ error: "gold_offer_ineligible" }, { status: 403 }));
  await assert.rejects(startGoldOfferCheckout("offer-token"), /gold_offer_ineligible/);
  assert.equal(fetch.mock.callCount(), 1);
});

test("an existing subscriber is sent to the billing portal to change plans", async (t) => {
  let calls = 0;
  const fetch = t.mock.method(globalThis, "fetch", async () => ++calls === 1
    ? Response.json({ error: "manage_existing_subscription" }, { status: 409 })
    : Response.json({ url: "https://billing.stripe.com/p/session/upgrade" }));
  assert.equal(await startCheckout("access-token", "premium"), "https://billing.stripe.com/p/session/upgrade");
  assert.ok(String(fetch.mock.calls[1].arguments[0]).endsWith("/billing/portal"));
});

test("Apple subscriptions are not sent to a Stripe portal without a customer", async (t) => {
  const fetch = t.mock.method(globalThis, "fetch", async () =>
    Response.json({ error: "manage_apple_subscription" }, { status: 409 }));
  await assert.rejects(startCheckout("access-token", "gold_yearly"), /manage_apple_subscription/);
  assert.equal(fetch.mock.callCount(), 1);
});
