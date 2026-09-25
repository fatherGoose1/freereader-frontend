import assert from "node:assert/strict";
import test from "node:test";
import { fetchProPrice, formatProPrice, manageSubscription, startCheckout } from "./billing";

test("Pro price is read from the configured Stripe Price instead of the checkout button", async (t) => {
  const fetch = t.mock.method(globalThis, "fetch", async () => Response.json({ amount_cents: 600, currency: "usd", interval: "month" }));
  assert.equal(formatProPrice(await fetchProPrice()), "$6");
  assert.ok(String(fetch.mock.calls[0].arguments[0]).endsWith("/billing/price"));
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
