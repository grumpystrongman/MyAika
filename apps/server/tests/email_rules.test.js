import test from "node:test";
import assert from "node:assert/strict";
import { matchEmailRule, runEmailRules } from "../src/email/emailRules.js";
import { setProvider } from "../integrations/store.js";

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
