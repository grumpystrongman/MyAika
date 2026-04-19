import test from "node:test";
import assert from "node:assert/strict";

import {
  blendLenoreConversationPose,
  computeLenoreConversationPose,
  getLenoreTransitionAlpha,
  resolveLenoreConversationState
} from "./lenoreConversationStates.js";

test("resolveLenoreConversationState prioritizes talking and listening", () => {
  assert.equal(resolveLenoreConversationState({ isTalking: true, isListening: true, motion: { idleState: "paused" } }), "speaking");
  assert.equal(resolveLenoreConversationState({ isTalking: false, isListening: true, motion: { idleState: "paused" } }), "listening");
  assert.equal(resolveLenoreConversationState({ isTalking: false, isListening: false, motion: { idleState: "thinking" } }), "thinking");
  assert.equal(resolveLenoreConversationState({ isTalking: false, isListening: false, motion: { idleState: "bogus" } }), "paused");
});

test("computeLenoreConversationPose returns stable authored poses by state", () => {
  const paused = computeLenoreConversationPose({ isTalking: false, isListening: false, appearance: { cameraFrame: "bust" }, motion: { idleState: "paused" } }, {}, 0);
  const listening = computeLenoreConversationPose({ isTalking: false, isListening: true, appearance: { cameraFrame: "bust" }, motion: { idleState: "paused" } }, {}, 0.4);
  const speaking = computeLenoreConversationPose({ isTalking: true, isListening: false, appearance: { cameraFrame: "bust" }, motion: { idleState: "paused", responseClass: "executive", choreographyPreset: "command_presence" } }, {}, 0.7);

  assert.equal(paused.stateName, "paused");
  assert.equal(listening.stateName, "listening");
  assert.equal(speaking.stateName, "speaking");

  assert.ok(paused.pose.leftArm.x < 0);
  assert.equal(paused.pose.leftHand.x, 0);
  assert.ok(listening.pose.head.x > paused.pose.head.x);
  assert.ok(speaking.pose.leftArm.x > paused.pose.leftArm.x);
});

test("blendLenoreConversationPose interpolates pose channels", () => {
  const from = { head: { x: 0, y: 0 }, leftArm: { x: 0.1 } };
  const to = { head: { x: 0.2, y: 0.1 }, leftArm: { x: 0.3 } };
  const blended = blendLenoreConversationPose(from, to, 0.5);

  assert.equal(blended.head.x, 0.1);
  assert.equal(blended.head.y, 0.05);
  assert.equal(blended.leftArm.x, 0.2);
});

test("getLenoreTransitionAlpha changes with state speed", () => {
  const paused = getLenoreTransitionAlpha(0.016, "paused");
  const speaking = getLenoreTransitionAlpha(0.016, "speaking");

  assert.ok(paused > 0 && paused < 1);
  assert.ok(speaking > paused);
});
