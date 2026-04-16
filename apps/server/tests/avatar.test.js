import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import {
  emotionController,
  voiceProsody,
  lipsyncEngine,
  createMotionController,
  createBlendshapeAnimator,
  createInteractionRuntime,
  TTSProvider
} from "../src/avatar/index.js";

const characterSpecPath = path.join(process.cwd(), "config", "avatar", "characterSpec.json");
const expressionMapPath = path.join(process.cwd(), "config", "avatar", "expressionMap.json");
const characterSpec = JSON.parse(fs.readFileSync(characterSpecPath, "utf-8"));
const expressionMap = JSON.parse(fs.readFileSync(expressionMapPath, "utf-8"));

test("avatar config is original and complete", () => {
  assert.equal(characterSpec.isOriginalCharacter, true);
  assert.ok(Array.isArray(characterSpec.disclaimers));
  assert.ok(characterSpec.visualIdentity?.hair);
  assert.ok(characterSpec.voiceProfile?.emotionalProfiles?.neutral);
  assert.ok(expressionMap?.expressionMaps?.neutral);
});

test("emotion inference returns typed payload", () => {
  const samples = [
    "Let's analyze this data together.",
    "You got this, breathe.",
    "That is an urgent risk.",
    "Great work, I love this."
  ];
  for (const input of samples) {
    const result = emotionController.inferEmotionFromText(input);
    assert.equal(typeof result.emotion, "string");
    assert.ok(result.confidence >= 0 && result.confidence <= 1);
  }
});

test("voice prosody supports nocturne modes", () => {
  const warm = voiceProsody.emotionToProsody("warm_supportive", 0.8);
  const focused = voiceProsody.emotionToProsody("focused_executive", 0.7);
  assert.ok(warm.rate > 0);
  assert.ok(focused.rate > 0);

  const instruction = voiceProsody.createVoiceInstruction({
    text: "Proceed to the next step.",
    emotion: "focused_executive",
    prosody: focused,
    sessionId: "test_session"
  });
  assert.equal(instruction.emotion, "focused_executive");
  assert.equal(instruction.sessionId, "test_session");
});

test("lipsync generation returns renderable sequence", () => {
  const sequence = lipsyncEngine.generateLipsyncSequence("Hello there", 1200);
  const formatted = lipsyncEngine.lipsyncFormatForRenderer(sequence);
  assert.ok(Array.isArray(formatted.sequences));
  assert.ok(formatted.totalDuration > 0);
});

test("interaction runtime basic conversation flow", async () => {
  const animatorConfig = {
    expressions: Object.fromEntries(
      Object.entries(expressionMap.expressionMaps || {}).map(([name, value]) => [name, { blendshapes: value.blendshapeValues || {} }])
    ),
    allBlendshapeTargets: []
  };

  const runtime = createInteractionRuntime({
    emotionController,
    voiceProsody,
    lipsyncEngine,
    motionController: createMotionController(characterSpec),
    blendshapeAnimator: createBlendshapeAnimator(null, animatorConfig, { transitionDuration: 120 }),
    ttsProvider: new TTSProvider({ engine: "local" })
  });

  const started = runtime.startSession("test_avatar_session", "test-user", {
    enableLipsync: true,
    enableMotion: true
  });
  assert.equal(started.status, "session_started");

  const userStep = await runtime.processUserInput("Can you walk me through the plan?");
  assert.equal(userStep.status, "success");

  const reply = await runtime.generateAvatarResponse("Here is the plan in three clear steps.");
  assert.equal(reply.status, "response_generated");
  assert.ok(reply.lipsync);

  const ended = runtime.endSession("test_avatar_session");
  assert.equal(ended.status, "session_ended");
});