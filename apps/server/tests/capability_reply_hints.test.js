import test from "node:test";
import assert from "node:assert/strict";

import {
  deriveReplyCapabilities,
  buildReplyCapabilityHints,
  appendCapabilityHintsToReply
} from "../src/aika/capabilityReplyHints.js";

test("deriveReplyCapabilities collects core and execution capabilities from orchestration", () => {
  const capabilities = deriveReplyCapabilities({
    orchestration: {
      capabilities: ["weather"],
      items: [
        { kind: "core", capabilities: ["weather"] },
        { kind: "execution", actionType: "messaging.telegramSend" }
      ],
      actions: [{ actionType: "messaging.telegramSend" }]
    },
    approvals: [{ toolName: "messaging.telegramSend" }]
  });

  assert.deepEqual(capabilities, ["weather", "telegram"]);
});

test("buildReplyCapabilityHints reports connected vs unavailable messaging legs", () => {
  const hints = buildReplyCapabilityHints(["weather", "telegram"], {
    weatherReady: true,
    telegramReady: false
  });

  assert.equal(hints[0].ready, true);
  assert.match(hints[0].line, /Weather is available/i);
  assert.equal(hints[1].ready, false);
  assert.match(hints[1].line, /Telegram is not connected yet/i);
});

test("appendCapabilityHintsToReply appends status block for mixed request", () => {
  const result = appendCapabilityHintsToReply(
    "Weather\nCurrent weather line.\n\nTelegram\nI need approval to proceed.",
    {
      orchestration: {
        capabilities: ["weather"],
        actions: [{ actionType: "messaging.telegramSend" }]
      }
    },
    {
      weatherReady: true,
      telegramReady: false
    }
  );

  assert.match(result.text, /Capability status/);
  assert.match(result.text, /Weather is available/);
  assert.match(result.text, /Telegram is not connected yet/);
  assert.equal(result.capabilityHints.length, 2);
});
