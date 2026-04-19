import test from "node:test";
import assert from "node:assert/strict";

import {
  parseCoreCapabilityRequest,
  executeCoreCapabilityRequest
} from "../src/aika/coreCapabilityRouter.js";

test("parseCoreCapabilityRequest detects combined assistant request", () => {
  const parsed = parseCoreCapabilityRequest(
    "Hey Aika, check my email, calendar, and weather in Raleigh, then do a google search for OpenAI"
  );

  assert.equal(parsed.actionable, true);
  assert.deepEqual(parsed.capabilities, ["email", "calendar", "weather", "search"]);
  assert.equal(parsed.searchQuery, "OpenAI");
});

test("parseCoreCapabilityRequest does not force orchestration for a single plain query", () => {
  const parsed = parseCoreCapabilityRequest("what is the weather in Durham");
  assert.equal(parsed.actionable, false);
  assert.deepEqual(parsed.capabilities, ["weather"]);
});

test("executeCoreCapabilityRequest aggregates sections in stable order", async () => {
  const result = await executeCoreCapabilityRequest({
    text: "Hey Aika, check my inbox and calendar and do a chatgpt search for weather in Paris",
    userId: "local",
    timezone: "America/New_York",
    homeLocation: "Durham, NC",
    deps: {
      handleEmail: async () => ({ text: "Inbox preview line" }),
      handleCalendar: async () => ({ text: "Calendar preview line" }),
      handleWeather: async () => ({ text: "Weather preview line" }),
      searchWeb: async (query) => ({ text: `Search results for ${query}` })
    }
  });

  assert.equal(result.handled, true);
  assert.deepEqual(result.capabilities, ["email", "calendar", "weather", "search"]);
  assert.match(result.reply, /^Inbox\nInbox preview line/);
  assert.match(result.reply, /Calendar\nCalendar preview line/);
  assert.match(result.reply, /Weather\nWeather preview line/);
  assert.match(result.reply, /Web Search\nSearch results for weather in Paris/);
});

test("executeCoreCapabilityRequest returns unhandled for non-orchestrated text", async () => {
  const result = await executeCoreCapabilityRequest({
    text: "what is the weather in Durham",
    deps: {}
  });
  assert.equal(result.handled, false);
});
