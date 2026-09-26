import assert from "node:assert/strict";
import test from "node:test";
import { fetchPlanPrice, fetchProPrice, formatProPrice, manageSubscription, startCheckout } from "./billing";

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

test("an existing subscriber is sent to the billing portal to change plans", async (t) => {
  let calls = 0;
  const fetch = t.mock.method(globalThis, "fetch", async () => ++calls === 1
    ? Response.json({ error: "manage_existing_subscription" }, { status: 409 })
    : Response.json({ url: "https://billing.stripe.com/p/session/upgrade" }));
  assert.equal(await startCheckout("access-token", "premium"), "https://billing.stripe.com/p/session/upgrade");
  assert.ok(String(fetch.mock.calls[1].arguments[0]).endsWith("/billing/portal"));
});
