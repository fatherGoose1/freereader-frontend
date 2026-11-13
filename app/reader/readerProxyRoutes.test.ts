import assert from "node:assert/strict";
import test from "node:test";
import { GET as price } from "../api/billing/price/route";
import { POST as billingAction } from "../api/billing/[action]/route";
import { GET as usage } from "../api/reader-usage/route";
import { POST as catalogSpeech } from "../api/phonon-catalog-tts/route";
import { GET as sample } from "../api/phonon-sample/route";
import { phononSampleUrl } from "./phononSamples";

test("same-origin Gold price and checkout proxy to the configured backend", async (t) => {
  const previous = process.env.KOKO_BACKEND_URL;
  process.env.KOKO_BACKEND_URL = "https://backend.example/";
  t.after(() => { if (previous === undefined) delete process.env.KOKO_BACKEND_URL; else process.env.KOKO_BACKEND_URL = previous; });
  const fetch = t.mock.method(globalThis, "fetch", async (url: RequestInfo | URL, init?: RequestInit) => {
    if (String(url).includes("/price?")) {
      assert.equal(String(url), "https://backend.example/api/v1/freereader/billing/price?plan=gold_yearly");
      return Response.json({ amount_cents: 3900, currency: "usd", interval: "year" });
    }
    assert.equal(String(url), "https://backend.example/api/v1/freereader/billing/checkout");
    assert.equal(new Headers(init?.headers).get("Authorization"), "Bearer account-token");
    assert.deepEqual(JSON.parse(String(init?.body)), { plan: "gold_yearly" });
    return Response.json({ url: "https://checkout.stripe.com/c/pay/gold" });
  });
  assert.equal((await (await price(new Request("http://localhost/api/billing/price?plan=gold_yearly"))).json()).amount_cents, 3900);
  assert.equal((await billingAction(new Request("http://localhost/api/billing/checkout", { method: "POST",
    headers: { Authorization: "Bearer account-token", "Content-Type": "application/json" },
    body: JSON.stringify({ plan: "gold_yearly" }) }), { params: Promise.resolve({ action: "checkout" }) })).status, 200);
  assert.equal((await price(new Request("http://localhost/api/billing/price?plan=other"))).status, 400);
  assert.equal(fetch.mock.callCount(), 2);
});

test("the signup offer proxy forwards only the authenticated request", async (t) => {
  const fetch = t.mock.method(globalThis, "fetch", async (url: RequestInfo | URL, init?: RequestInit) => {
    assert.match(String(url), /\/billing\/signup-offer-checkout$/);
    assert.equal(new Headers(init?.headers).get("Authorization"), "Bearer account-token");
    assert.equal(init?.body, undefined);
    return Response.json({ url: "https://checkout.stripe.com/c/pay/gold25" });
  });
  const response = await billingAction(new Request("http://localhost/api/billing/signup-offer-checkout", {
    method: "POST", headers: { Authorization: "Bearer account-token" },
  }), { params: Promise.resolve({ action: "signup-offer-checkout" }) });
  assert.equal(response.status, 200);
  assert.equal(fetch.mock.callCount(), 1);
});

test("usage and catalogue speech remain authenticated through same-origin proxies", async (t) => {
  const fetch = t.mock.method(globalThis, "fetch", async (url: RequestInfo | URL, init?: RequestInit) => {
    if (String(url).includes("/usage?")) {
      assert.equal(new Headers(init?.headers).get("Authorization"), "Bearer account-token");
      return Response.json({ plan: "gold_monthly" });
    }
    assert.match(String(url), /\/phonon\/catalog\/speech$/);
    assert.equal(new Headers(init?.headers).get("Authorization"), "Bearer account-token");
    assert.deepEqual(JSON.parse(String(init?.body)), { voice_id: "NbpkqMVS3CJeq2j8", texts: ["Hello"], speed: 1 });
    return new Response(new Uint8Array([1, 2]), { headers: { "Content-Type": "audio/mp4", "X-Audio-Duration": "2" } });
  });
  const id = "89ad2e6e-d188-47ef-9ecc-b5abebaf6dc8";
  assert.equal((await (await usage(new Request(`http://localhost/api/reader-usage?installation_id=${id}`, {
    headers: { Authorization: "Bearer account-token" },
  }))).json()).plan, "gold_monthly");
  const voiceRequest = () => new Request("http://localhost/api/phonon-catalog-tts", { method: "POST",
    headers: { "X-FreeReader-User-Token": "account-token", "Content-Type": "application/json" },
    body: JSON.stringify({ voice_id: "NbpkqMVS3CJeq2j8", texts: ["Hello"], speed: 1 }) });
  assert.equal((await catalogSpeech(voiceRequest())).headers.get("X-Audio-Duration"), "2");
  assert.equal((await catalogSpeech(new Request("http://localhost/api/phonon-catalog-tts", { method: "POST",
    body: JSON.stringify({ voice_id: "invalid", texts: ["Hello"], speed: 1 }) }))).status, 400);
  assert.equal(fetch.mock.callCount(), 2);
});

test("Phonon samples use an allowlisted same-origin proxy for isolated reader pages", async (t) => {
  const fetch = t.mock.method(globalThis, "fetch", async (url: RequestInfo | URL) => {
    assert.match(String(url), /gradium\/phonon-voices\/resolve\/0ee17205.*1_zoey_NbpkqMVS3CJeq2j8\.ogg/);
    return new Response(new Uint8Array([79, 103, 103, 83]), { headers: { "Content-Type": "audio/ogg" } });
  });
  assert.equal(phononSampleUrl("NbpkqMVS3CJeq2j8"), "/api/phonon-sample?id=NbpkqMVS3CJeq2j8");
  const response = await sample(new Request("http://localhost/api/phonon-sample?id=NbpkqMVS3CJeq2j8"));
  assert.equal(response.status, 200);
  assert.equal(response.headers.get("Cross-Origin-Resource-Policy"), "same-origin");
  assert.equal((await sample(new Request("http://localhost/api/phonon-sample?id=invalid"))).status, 400);
  assert.equal(fetch.mock.callCount(), 1);
});
