import test from "node:test";
import assert from "node:assert/strict";
import {
  matchEmailRule,
  runEmailRules,
  getEmailRulesConfig,
  saveEmailRulesConfig,
  listEmailRuleTemplates,
  saveEmailRuleTemplate,
  deleteEmailRuleTemplate
} from "../src/email/emailRules.js";
import { getProvider, setProvider } from "../integrations/store.js";

const baseConfig = {
  enabled: true,
  lookbackDays: 7,
  limit: 10,
  followUpDays: 1,
  followUpHours: 0,
  reminderOffsetHours: 2,
  dedupHours: 72,
  maxProcessed: 200,
  priority: "medium",
  listId: "",
  tags: ["team"],
  providers: {
    gmail: { senders: ["ceo@example.com"], labelIds: ["IMPORTANT"] },
    outlook: { senders: ["@example.com"], folderIds: ["inbox"] }
  }
};

test("matchEmailRule checks sender + label", () => {
  const email = { from: "CEO <ceo@example.com>", labelIds: ["IMPORTANT"] };
  assert.equal(matchEmailRule("gmail", email, baseConfig), true);
  const mismatch = { from: "ceo@example.com", labelIds: ["OTHER"] };
  assert.equal(matchEmailRule("gmail", mismatch, baseConfig), false);
});

test("runEmailRules creates follow-ups and dedups", async () => {
  const userId = "test-email-rules";
  setProvider("email_rules", null, userId);
  let created = 0;
  const scheduleFollowUpFn = async () => {
    created += 1;
    return { todo: { id: `todo-${created}` } };
  };
  const fetchers = {
    gmail: async () => ([
      { id: "msg-1", from: "ceo@example.com", subject: "Q1", receivedAt: "2026-02-19T12:00:00Z", labelIds: ["IMPORTANT"] }
    ])
  };
  const result = await runEmailRules({ userId, providers: ["gmail"], config: baseConfig, fetchers, scheduleFollowUpFn });
  assert.equal(result.created, 1);
  assert.equal(created, 1);

  const result2 = await runEmailRules({ userId, providers: ["gmail"], config: baseConfig, fetchers, scheduleFollowUpFn });
  assert.equal(result2.created, 0);
  assert.equal(created, 1);

  setProvider("email_rules", null, userId);
});

test("runEmailRules dry run previews matches without creating", async () => {
  const userId = "email-rules-preview";
  setProvider("email_rules", null, userId);
  let created = 0;
  const scheduleFollowUpFn = async () => {
    created += 1;
    return { todo: { id: `todo-${created}` } };
  };
  const fetchers = {
    gmail: async () => ([
      { id: "msg-preview-1", from: "ceo@example.com", subject: "Preview", receivedAt: "2026-02-19T12:00:00Z", labelIds: ["IMPORTANT"] }
    ])
  };
  const result = await runEmailRules({ userId, providers: ["gmail"], config: baseConfig, fetchers, scheduleFollowUpFn, dryRun: true });
  assert.equal(result.dryRun, true);
  assert.equal(result.wouldCreate, 1);
  assert.equal(created, 0);
  assert.equal(result.preview.length, 1);
  assert.equal(result.preview[0].listId, baseConfig.listId || null);
  assert.equal(result.preview[0].priority, baseConfig.priority);
  assert.ok(result.preview[0].tags.includes("auto-followup"));
  const state = getProvider("email_rules", userId);
  assert.equal(state, null);
});

test("email rules config saves and loads", () => {
  const userId = "email-rules-config";
  setProvider("email_rules_config", null, userId);
  const saved = saveEmailRulesConfig({
    enabled: true,
    intervalMinutes: 15,
    runOnStartup: true,
    lookbackDays: 3,
    providers: { gmail: { senders: ["vip@example.com"] } }
  }, userId);
  assert.equal(saved.enabled, true);
  assert.equal(saved.intervalMinutes, 15);
  assert.equal(saved.runOnStartup, true);
  const loaded = getEmailRulesConfig(userId);
  assert.equal(loaded.enabled, true);
  assert.equal(loaded.intervalMinutes, 15);
  assert.equal(loaded.runOnStartup, true);
  assert.ok(loaded.providers.gmail.senders.includes("vip@example.com"));
  setProvider("email_rules_config", null, userId);
});

test("email rules templates save, list, and delete", () => {
  const userId = "email-rules-templates";
  setProvider("email_rules_templates", null, userId);
  const template = saveEmailRuleTemplate({ name: "Default Follow-ups", config: baseConfig }, userId);
  assert.ok(template.id);
  assert.equal(template.name, "Default Follow-ups");
  const list = listEmailRuleTemplates(userId);
  assert.equal(list.length, 1);
  assert.equal(list[0].id, template.id);
  const deleted = deleteEmailRuleTemplate(template.id, userId);
  assert.equal(deleted, true);
  const after = listEmailRuleTemplates(userId);
  assert.equal(after.length, 0);
});
