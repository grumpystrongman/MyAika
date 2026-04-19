import test from "node:test";
import assert from "node:assert/strict";

import {
  summarizeAssistantOrchestration,
  formatApprovalStatusLabel,
  summarizeApprovalExecution
} from "./assistantOrchestration.js";

test("summarizeAssistantOrchestration returns mixed item summary", () => {
  const summary = summarizeAssistantOrchestration({
    items: [
      { kind: "core", clause: "check my weather in Raleigh", capabilities: ["weather"] },
      { kind: "execution", clause: "send telegram ping", actionType: "messaging.telegramSend" }
    ],
    actions: [{ actionType: "messaging.telegramSend", status: "approval_required" }],
    capabilities: ["weather"]
  });

  assert.equal(summary.capabilityCount, 1);
  assert.equal(summary.actionCount, 1);
  assert.equal(summary.summaryItems[0].label, "weather");
  assert.equal(summary.summaryItems[1].label, "messaging.telegramSend");
  assert.equal(summary.reads.length, 1);
  assert.equal(summary.executions.length, 1);
});

test("formatApprovalStatusLabel normalizes live approval labels", () => {
  assert.equal(formatApprovalStatusLabel("pending"), "Pending");
  assert.equal(formatApprovalStatusLabel("approved"), "Approved");
  assert.equal(formatApprovalStatusLabel("executed"), "Executed");
  assert.equal(formatApprovalStatusLabel("denied"), "Denied");
});

test("summarizeApprovalExecution normalizes execute payloads", () => {
  const summary = summarizeApprovalExecution({
    status: "ok",
    data: {
      status: "ok",
      data: {
        message: "Telegram message sent.",
        chatId: "12345"
      }
    }
  });

  assert.equal(summary.status, "ok");
  assert.equal(summary.message, "Telegram message sent.");
  assert.equal(summary.payload.chatId, "12345");
});
