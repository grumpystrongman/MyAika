import test from "node:test";
import assert from "node:assert/strict";
import { evaluateAction } from "../src/safety/evaluator.js";
import { getPolicy, savePolicy } from "../src/safety/policyLoader.js";
import { updateAssistantProfile } from "../storage/assistant_profile.js";
import { initDb } from "../storage/db.js";
import { runMigrations } from "../storage/schema.js";

initDb();
runMigrations();

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

test("policy allows autonomous self email to work address", () => {
  const original = getPolicy();
  try {
    updateAssistantProfile("local", { preferences: { identity: { workEmail: "me@work.com" } } });
    savePolicy({
      ...original,
      allow_actions: ["email.send"],
      requires_approval: ["email.send"]
    });
    const result = evaluateAction({
      actionType: "email.send",
      params: {
        sendTo: ["me@work.com"],
        subject: "Reminder",
        body: "Take out the trash",
        autonomy: "self"
      },
      context: { userId: "local" }
    });
    assert.equal(result.decision, "allow");
    assert.equal(result.reason, "autonomy_self_email");
  } finally {
    savePolicy(original);
  }
});
