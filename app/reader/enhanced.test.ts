import assert from "node:assert/strict";
import test from "node:test";
import { ENHANCED_FEATURES, isEnhancedPlan } from "./enhanced";

test("Gold features lead with unlimited audio, premium voices, and highest quality audio", () => {
  assert.deepEqual(ENHANCED_FEATURES.map((feature) => feature.title), [
    "Unlimited audio",
    "Premium voices",
    "Highest quality audio",
    "Device syncing",
    "Faster generation",
    "Custom voices",
  ]);
});

test("only active FreeReader Gold plan IDs receive Gold listening", () => {
  assert.equal(isEnhancedPlan("gold_yearly"), true);
  assert.equal(isEnhancedPlan("gold_monthly"), true);
  for (const plan of ["free", "pro", "premium", "unknown", "", null, undefined]) {
    assert.equal(isEnhancedPlan(plan), false);
  }
});
