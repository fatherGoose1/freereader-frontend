import assert from "node:assert/strict";
import test from "node:test";
import { isEnhancedPlan } from "./enhanced";

test("only active FreeReader Gold plan IDs receive Gold listening", () => {
  assert.equal(isEnhancedPlan("gold_yearly"), true);
  assert.equal(isEnhancedPlan("gold_monthly"), true);
  for (const plan of ["free", "pro", "premium", "unknown", "", null, undefined]) {
    assert.equal(isEnhancedPlan(plan), false);
  }
});
