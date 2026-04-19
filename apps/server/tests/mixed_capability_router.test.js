import test from "node:test";
import assert from "node:assert/strict";

import {
  parseMixedCapabilityRequest,
  executeMixedCapabilityRequest
} from "../src/aika/mixedCapabilityRouter.js";

test("mixed router parses read plus execute clauses", () => {
  const parsed = parseMixedCapabilityRequest(
    "Hey Aika, check my email and calendar, then text +15555550123: running five minutes late"
  );

  assert.equal(parsed.actionable, true);
  assert.equal(parsed.items.length, 3);
  assert.equal(parsed.items[0].kind, "core");
  assert.equal(parsed.items[1].kind, "core");
  assert.equal(parsed.items[2].kind, "execution");
  assert.deepEqual(parsed.items[0].core.capabilities, ["email"]);
  assert.deepEqual(parsed.items[1].core.capabilities, ["calendar"]);
  assert.equal(parsed.items[2].intent.action.type, "messaging.sms.send");
});

test("mixed router aggregates core results with approval-aware execution", async () => {
  const result = await executeMixedCapabilityRequest({
    text: "Check my weather in Raleigh and send telegram \"Ping me\" chat 12345",
    context: {
      userId: "local",
      timezone: "America/New_York",
      homeLocation: "Durham, NC"
    },
    deps: {
      handleEmail: async () => ({ text: "Inbox preview line" }),
      handleCalendar: async () => ({ text: "Calendar preview line" }),
      handleWeather: async () => ({ text: "Weather preview line" }),
      searchWeb: async (query) => ({ text: `Search results for ${query}` }),
      runIntent: async () => ({
        handled: true,
        status: "approval_required",
        reply: "I need approval to proceed. Approval ID: ap-1 Open the Approvals panel to continue.",
        action: { type: "messaging.telegramSend" },
        approval: { id: "ap-1" }
      })
    }
  });

  assert.equal(result.handled, true);
  assert.match(result.reply, /Weather\nWeather preview line/);
  assert.match(result.reply, /Approval ID: ap-1/);
  assert.equal(result.approvals.length, 1);
  assert.deepEqual(result.data.capabilities, ["weather"]);
  assert.equal(result.data.actions[0].actionType, "messaging.telegramSend");
});

test("mixed router returns unhandled when request is read-only or execute-only", async () => {
  assert.equal(parseMixedCapabilityRequest("check my email and calendar").actionable, false);
  assert.equal(parseMixedCapabilityRequest("email my work address about the update and text me when done").actionable, false);

  const result = await executeMixedCapabilityRequest({
    text: "check my email and calendar",
    context: { userId: "local" },
    deps: {}
  });
  assert.deepEqual(result, { handled: false });
});
