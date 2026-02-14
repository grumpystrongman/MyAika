import test from "node:test";
import assert from "node:assert/strict";
import { evaluateAction } from "../src/safety/evaluator.js";
import { getPolicy, savePolicy } from "../src/safety/policyLoader.js";

test("policy denies non-allowlisted actions", () => {
  const original = getPolicy();
  try {
    savePolicy({ ...original, allow_actions: [] });
    const result = evaluateAction({ actionType: "notes.create", params: {} });
    assert.equal(result.decision, "deny");
    assert.equal(result.reason, "action_not_allowlisted");
  } finally {
    savePolicy(original);
  }
});

test("policy requires approval for high-risk actions", () => {
  const original = getPolicy();
  try {
    savePolicy({
      ...original,
      allow_actions: ["email.send"],
      requires_approval: ["email.send"]
    });
    const result = evaluateAction({ actionType: "email.send", params: { to: ["a@example.com"] } });
    assert.equal(result.decision, "require_approval");
  } finally {
    savePolicy(original);
  }
});

test("policy blocks tier4 memory writes", () => {
  const original = getPolicy();
  try {
    savePolicy({
      ...original,
      allow_actions: ["memory.write"]
    });
    const result = evaluateAction({ actionType: "memory.write", params: { tier: 4, content: "phi data" } });
    assert.equal(result.decision, "deny");
    assert.equal(result.reason, "memory_tier_policy");
  } finally {
    savePolicy(original);
  }
});
