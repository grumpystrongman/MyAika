import test from "node:test";
import assert from "node:assert/strict";
import { Emotion } from "@myaika/shared";
import {
  advanceAffectState,
  buildAffectPromptBlock,
  defaultAffectState,
  inferUserAffectFromText,
  normalizeAffectState
} from "../src/aika/affectModel.js";

test("affect model detects distress and shifts to warm supportive reassurance", () => {
  const result = advanceAffectState(
    defaultAffectState(),
    "I'm overwhelmed and honestly not okay right now."
  );

  assert.equal(result.behavior.emotion, Emotion.WARM_SUPPORTIVE);
  assert.equal(result.meta.empathyMode, "co_regulate");
  assert.equal(result.meta.responseMode, "reassure");
  assert.ok(result.state.user.distress > 0.3);
  assert.match(result.state.summary, /reassure/i);
});

test("affect model detects directive analytical turns and becomes executive", () => {
  const result = advanceAffectState(
    defaultAffectState(),
    "Diagnose this thoroughly and give me the next step plan."
  );

  assert.ok(
    [Emotion.ANALYTICAL, Emotion.FOCUSED_EXECUTIVE].includes(result.behavior.emotion),
    `unexpected behavior emotion: ${result.behavior.emotion}`
  );
  assert.equal(result.meta.responseMode, "plan");
  assert.ok(result.state.user.taskFocus > 0.4);
});

test("affect model detects playful turns and shifts into banter", () => {
  const result = advanceAffectState(
    defaultAffectState(),
    "Let's play wizard chess and tease each other a little."
  );

  assert.equal(result.behavior.emotion, Emotion.TEASING);
  assert.equal(result.meta.responseMode, "banter");
  assert.ok(result.state.user.playfulness > 0.25);
});

test("normalizeAffectState clamps invalid persisted values", () => {
  const normalized = normalizeAffectState({
    turnCount: -5,
    rapport: 99,
    user: {
      valence: 99,
      arousal: -1,
      distress: 7
    },
    assistant: {
      intensity: 5
    }
  });

  assert.equal(normalized.turnCount, 0);
  assert.equal(normalized.rapport, 1);
  assert.equal(normalized.user.valence, 1);
  assert.equal(normalized.user.arousal, 0);
  assert.equal(normalized.user.distress, 1);
  assert.equal(normalized.assistant.intensity, 1);
});

test("buildAffectPromptBlock emits usable prompt content", () => {
  const inferred = inferUserAffectFromText("Thank you. I appreciate this, but I'm still anxious.");
  const state = {
    ...defaultAffectState(),
    user: {
      ...defaultAffectState().user,
      ...inferred
    }
  };
  const prompt = buildAffectPromptBlock(state);

  assert.match(prompt, /AFFECT STATE:/);
  assert.match(prompt, /User distress:/);
  assert.match(prompt, /Empathy mode:/);
});
