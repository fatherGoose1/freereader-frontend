import assert from "node:assert/strict";
import test from "node:test";
import { MONTHLY_OFFER_END, offerCountdown } from "./monthlyOffer";

test("the Black Friday $1 first-month countdown ends after December 4 Pacific", () => {
  assert.equal(new Date(MONTHLY_OFFER_END).toISOString(), "2026-12-05T08:00:00.000Z");
  assert.equal(offerCountdown(MONTHLY_OFFER_END - 90_061_000), "1d 01h 01m 01s");
  assert.equal(offerCountdown(MONTHLY_OFFER_END), "0d 00h 00m 00s");
  assert.equal(offerCountdown(MONTHLY_OFFER_END + 1_000), "0d 00h 00m 00s");
});
