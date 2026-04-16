// Avatar System Central Export
// This file aggregates all avatar components for convenient importing

import * as emotionControllerModule from './emotionController.js';
import * as voiceProsodyModule from './voiceProsody.js';
import * as lipsyncEngineModule from './lipsyncEngine.js';
import { MotionController, createMotionController } from './motionController.js';
import { BlendshapeAnimator, createBlendshapeAnimator, validateBlendshapeTarget } from './blendshapeAnimator.js';
import { InteractionRuntime, createInteractionRuntime } from './interactionRuntime.js';
import { TTSProvider, createTTSProvider, detectTTSEngine } from './ttsProvider.js';

// Create singleton instances
const emotionController = {
  inferEmotionFromText: emotionControllerModule.inferEmotionFromText,
  emotionToExpressions: emotionControllerModule.emotionToExpressions,
  selectExpression: emotionControllerModule.selectExpression,
  blendExpressions: emotionControllerModule.blendExpressions,
  emotionIntensityModulation: emotionControllerModule.emotionIntensityModulation,
  scheduleExpression: emotionControllerModule.scheduleExpression,
  createAuditLogEntry: emotionControllerModule.createAuditLogEntry,
  logAvatarAction: emotionControllerModule.logAvatarAction,
  getCharacterSpec: emotionControllerModule.getCharacterSpec,
  getExpressionMap: emotionControllerModule.getExpressionMap
};

const voiceProsody = {
  getVoiceProfile: voiceProsodyModule.getVoiceProfile,
  emotionToProsody: voiceProsodyModule.emotionToProsody,
  applyIntensityModulation: voiceProsodyModule.applyIntensityModulation,
  prosodyToTtsParams: voiceProsodyModule.prosodyToTtsParams,
  createVoiceInstruction: voiceProsodyModule.createVoiceInstruction,
  insertProssodyMarkers: voiceProsodyModule.insertProssodyMarkers,
  blendProsodies: voiceProsodyModule.blendProsodies,
  voiceProfileToDescription: voiceProsodyModule.voiceProfileToDescription
};

const lipsyncEngine = {
  getVisemeForPhoneme: lipsyncEngineModule.getVisemeForPhoneme,
  textToPhonemes: lipsyncEngineModule.textToPhonemes,
  generateLipsyncSequence: lipsyncEngineModule.generateLipsyncSequence,
  blendVisemes: lipsyncEngineModule.blendVisemes,
  interpolateLipsync: lipsyncEngineModule.interpolateLipsync,
  lipsyncFormatForRenderer: lipsyncEngineModule.lipsyncFormatForRenderer,
  validateLipsync: lipsyncEngineModule.validateLipsync,
  estimatePhonemeAccuracy: lipsyncEngineModule.estimatePhonemeAccuracy
};

const motionController = createMotionController();
const defaultExpressionMap = (() => {
  const map = emotionControllerModule.getExpressionMap?.() || {};
  const expressionMaps = map.expressionMaps || {};
  const expressions = {};
  const allTargets = new Set();
  for (const [name, value] of Object.entries(expressionMaps)) {
    const blendshapes = value?.blendshapeValues || {};
    expressions[name] = { blendshapes };
    Object.keys(blendshapes).forEach(target => allTargets.add(target));
  }
  return {
    expressions,
    allBlendshapeTargets: Array.from(allTargets)
  };
})();
const blendshapeAnimator = createBlendshapeAnimator(null, defaultExpressionMap);

export {
  // Singleton Instances
  emotionController,
  voiceProsody,
  lipsyncEngine,
  motionController,
  blendshapeAnimator,
  
  // Classes
  MotionController,
  BlendshapeAnimator,
  InteractionRuntime,
  TTSProvider,
  
  // Factory Functions
  createMotionController,
  createBlendshapeAnimator,
  createInteractionRuntime,
  createTTSProvider,
  detectTTSEngine,
  validateBlendshapeTarget
};
