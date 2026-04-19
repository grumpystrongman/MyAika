import test from "node:test";
import assert from "node:assert/strict";

import {
  buildAssistantShellCapabilities,
  summarizePendingApprovals
} from "./assistantShellStatus.js";

test("buildAssistantShellCapabilities marks connected and available capabilities", () => {
  const capabilities = buildAssistantShellCapabilities({
    integrations: {
      gmail: { connected: true },
      telegram: { connected: true },
      messages: { connected: false }
    },
    statusInfo: {
      server: { ok: true },
      tts: { selected: "openai", engines: { openai: { configured: true } } },
      openai: { configured: true }
    }
  });

  const email = capabilities.find((item) => item.id === "email");
  const search = capabilities.find((item) => item.id === "search");
  const telegram = capabilities.find((item) => item.id === "telegram");
  const sms = capabilities.find((item) => item.id === "sms");

  assert.equal(email.state, "ready");
  assert.equal(search.state, "ready");
  assert.equal(telegram.state, "ready");
  assert.equal(sms.state, "attention");
});

test("summarizePendingApprovals keeps actionable approvals and sorts newest first", () => {
  const summary = summarizePendingApprovals([
    { id: "old-approved", status: "approved", createdAt: "2026-04-17T19:00:00.000Z", riskLevel: "high" },
    { id: "older-pending", status: "pending", createdAt: "2026-04-17T18:00:00.000Z", riskLevel: "medium", toolName: "calendar.proposeHold" },
    { id: "newer-pending", status: "pending", createdAt: "2026-04-17T20:00:00.000Z", riskLevel: "high", toolName: "email.send" }
  ]);

  assert.equal(summary.total, 3);
  assert.equal(summary.highRisk, 2);
  assert.equal(summary.mediumRisk, 1);
  assert.equal(summary.items[0].id, "newer-pending");
  assert.equal(summary.items[1].id, "old-approved");
});
