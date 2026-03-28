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

test("policy allows assistant task email when allowlisted and auto-approve enabled", () => {
  const original = getPolicy();
  const originalEnv = {
    ASSISTANT_TASK_EMAIL_AUTO_APPROVE: process.env.ASSISTANT_TASK_EMAIL_AUTO_APPROVE,
    ASSISTANT_TASK_EMAIL_AUTO_APPROVE_ALLOWLIST: process.env.ASSISTANT_TASK_EMAIL_AUTO_APPROVE_ALLOWLIST,
    ASSISTANT_TASK_EMAIL_SUBJECT_PREFIX: process.env.ASSISTANT_TASK_EMAIL_SUBJECT_PREFIX,
    ASSISTANT_TASK_EMAIL_AUTO_APPROVE_REQUIRE_PREFIX: process.env.ASSISTANT_TASK_EMAIL_AUTO_APPROVE_REQUIRE_PREFIX
  };
  try {
    process.env.ASSISTANT_TASK_EMAIL_AUTO_APPROVE = "1";
    process.env.ASSISTANT_TASK_EMAIL_AUTO_APPROVE_ALLOWLIST = "tasks@example.com";
    process.env.ASSISTANT_TASK_EMAIL_SUBJECT_PREFIX = "Aika Task";
    process.env.ASSISTANT_TASK_EMAIL_AUTO_APPROVE_REQUIRE_PREFIX = "1";
    savePolicy({
      ...original,
      allow_actions: ["email.send"],
      requires_approval: ["email.send"]
    });
    const result = evaluateAction({
      actionType: "email.send",
      params: {
        sendTo: ["tasks@example.com"],
        subject: "Aika Task: Daily Digest",
        body: "Daily summary",
        autonomy: "assistant_task"
      },
      context: { userId: "local", source: "assistant_task" }
    });
    assert.equal(result.decision, "allow");
    assert.equal(result.reason, "autonomy_assistant_task_email");
  } finally {
    savePolicy(original);
    for (const [key, value] of Object.entries(originalEnv)) {
      if (value === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = value;
      }
    }
  }
});
