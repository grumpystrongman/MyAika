import test from "node:test";
import assert from "node:assert/strict";

import {
  parseExecutionCapabilityRequest,
  executeExecutionCapabilityRequest
} from "../src/aika/executionCapabilityRouter.js";

test("execution router parses combined email and telegram request", () => {
  const parsed = parseExecutionCapabilityRequest(
    `Hey Aika, email "Project update" to my work address and send telegram "Ship it" chat 12345`
  );
  assert.equal(parsed.actionable, true);
  assert.equal(parsed.intents.length, 2);
  assert.deepEqual(
    parsed.intents.map(item => item.intent.action.type),
    ["email.send", "messaging.telegramSend"]
  );
});

test("execution router parses calendar hold and sms request", () => {
  const parsed = parseExecutionCapabilityRequest(
    `Aika, create calendar hold "Review" tomorrow at 3pm for 30 minutes and text +15555550123: running five minutes late`
  );
  assert.equal(parsed.actionable, true);
  assert.deepEqual(
    parsed.intents.map(item => item.intent.action.type),
    ["calendar.proposeHold", "messaging.sms.send"]
  );
});

test("execution router aggregates approval-aware action replies", async () => {
  const result = await executeExecutionCapabilityRequest({
    text: `Email "Reminder" to my work address and send telegram "Ping" chat 12345`,
    context: { userId: "local" },
    deps: {
      runIntent: async ({ text }) => {
        if (/telegram/i.test(text)) {
          return {
            handled: true,
            status: "approval_required",
            reply: "I need approval to proceed. Approval ID: ap2 Open the Approvals panel to continue.",
            action: { type: "messaging.telegramSend" },
            approval: { id: "ap2" }
          };
        }
        return {
          handled: true,
          status: "approval_required",
          reply: "I need approval to proceed. Approval ID: ap1 Open the Approvals panel to continue.",
          action: { type: "email.send" },
          approval: { id: "ap1" }
        };
      }
    }
  });

  assert.equal(result.handled, true);
  assert.equal(result.approvals.length, 2);
  assert.match(result.reply, /Email/i);
  assert.match(result.reply, /Telegram/i);
});

test("execution router ignores single-action requests so generic action flow can handle them", async () => {
  const parsed = parseExecutionCapabilityRequest(`Email my work address about the update`);
  assert.equal(parsed.actionable, false);

  const result = await executeExecutionCapabilityRequest({
    text: `Email my work address about the update`,
    context: { userId: "local" },
    deps: {
      runIntent: async () => {
        throw new Error("should_not_run");
      }
    }
  });
  assert.deepEqual(result, { handled: false });
});

