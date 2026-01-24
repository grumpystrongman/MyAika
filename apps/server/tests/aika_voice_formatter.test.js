import test from "node:test";
import assert from "node:assert/strict";
import { formatAikaVoice } from "../aika_voice/formatter.js";

test("formatAikaVoice preserves key tokens", () => {
  const input = "Set a timer for 5 minutes, then play music.";
  const output = formatAikaVoice(input, { style: "brat_baddy", pause: 1.2 });

  assert.ok(output.includes("timer"));
  assert.ok(output.includes("5"));
  assert.ok(output.toLowerCase().includes("music"));
  assert.ok(output.length >= input.length - 5);
});

test("formatAikaVoice inserts cadence pauses", () => {
  const input = "First do this. Then do that.";
  const output = formatAikaVoice(input, { style: "brat_soft", pause: 1.4 });
  assert.ok(output.includes("..."));
});
