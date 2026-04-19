import test from "node:test";
import assert from "node:assert/strict";

import {
  buildCueTargets,
  buildFallbackTalkingTargets,
  buildIdleFaceTargets,
  composeLenoreFaceTargets,
  getLipsyncTargetsAtElapsed,
  getMoodTargets
} from "./lenoreFacialPerformance.js";

test("comfort empathy lifts inner brows and softens cheeks", () => {
  const targets = getMoodTargets({
    mood: "neutral",
    motion: { responseClass: "comfort", empathyMode: "co_regulate", idleState: "listening" }
  });

  assert.ok(targets.Brow_Raise_Inner_Left >= 0.06);
  assert.ok(targets.Cheek_Raise_L >= 0.04);
});

test("executive state tightens mouth and lowers brows", () => {
  const idle = buildIdleFaceTargets({
    isListening: false,
    motion: { responseClass: "executive", empathyMode: "competent", idleState: "speaking" }
  }, 0.5);

  assert.ok(idle.Mouth_Lips_Tight > 0);
  assert.ok(idle.Brow_Drop_Left >= 0.04);
});

test("consonant cluster targets keep jaw tighter than open vowels", () => {
  const plosive = buildCueTargets({ phoneme: "p", duration: 52 }, 0.7);
  const vowel = buildCueTargets({ phoneme: "a", duration: 110 }, 0.7);

  assert.ok((plosive.Mouth_Open || 0) < (vowel.Mouth_Open || 0));
  assert.ok((plosive.Mouth_Lips_Tight || 0) > 0.18);
});

test("lipsync interpolation preserves dental tongue target for th", () => {
  const seq = {
    sequences: [
      { time: 0, duration: 90, phoneme: "th", blendshapes: {} },
      { time: 90, duration: 100, phoneme: "a", blendshapes: {} }
    ]
  };
  const targets = getLipsyncTargetsAtElapsed(seq, 40, 0.65);

  assert.ok((targets.V_Tongue_Out || 0) > 0.12);
  assert.ok((targets.Mouth_Open || 0) < 0.12);
});

test("composeLenoreFaceTargets returns talking mouth targets and blink independently", () => {
  const face = composeLenoreFaceTargets({
    runtime: {
      mood: "neutral",
      isTalking: true,
      isListening: false,
      talkIntensity: 0.6,
      motion: { responseClass: "executive", empathyMode: "competent", idleState: "speaking" }
    },
    t: 0.2,
    blink: 0.4,
    cueTargets: null,
    motionState: { talkHead: 0.2 }
  });

  assert.ok((face.blinkTargets.Eye_Blink_Left || 0) > 0.3);
  assert.ok((face.mouthTargets.Mouth_Open || 0) > 0);
  assert.ok((face.idleTargets.Brow_Drop_Left || 0) > 0);
});

test("fallback talking targets stay below game-rig jaw flap range", () => {
  const fallback = buildFallbackTalkingTargets(0.8, 0.9, { talkHead: 0.4 }, { motion: { responseClass: "neutral" } });
  assert.ok((fallback.Mouth_Open || 0) <= 0.16);
  assert.ok((fallback.Mouth_Lips_Jaw_Adjust || 0) < 0.1);
});
