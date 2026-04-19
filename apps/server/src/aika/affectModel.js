import { Emotion, makeBehavior } from "@myaika/shared";

const AFFECT_VERSION = 1;

function clamp(value, min = 0, max = 1) {
  const n = Number(value);
  if (!Number.isFinite(n)) return min;
  return Math.min(max, Math.max(min, n));
}

function signedClamp(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return 0;
  return Math.min(1, Math.max(-1, n));
}

function smooth(previous, target, carry = 0.64) {
  return previous * carry + target * (1 - carry);
}

function intensityFromLabels(labels = []) {
  if (labels.includes("distress")) return 0.68;
  if (labels.includes("frustrated")) return 0.58;
  if (labels.includes("playful")) return 0.58;
  if (labels.includes("analytical")) return 0.48;
  if (labels.includes("directive")) return 0.5;
  if (labels.includes("warm")) return 0.48;
  return 0.4;
}

function includesAny(text, patterns) {
  return patterns.some((pattern) => pattern.test(text));
}

export function defaultAffectState() {
  return {
    version: AFFECT_VERSION,
    turnCount: 0,
    rapport: 0.44,
    user: {
      valence: 0,
      arousal: 0.34,
      distress: 0,
      frustration: 0,
      warmth: 0.18,
      trust: 0.44,
      playfulness: 0.1,
      taskFocus: 0.24,
      confidence: 0.4
    },
    assistant: {
      empathyMode: "steady",
      responseMode: "balanced",
      emotion: Emotion.NEUTRAL,
      intensity: 0.38
    },
    labels: [],
    summary: "steady neutral",
    updatedAt: null
  };
}

export function normalizeAffectState(input) {
  const base = defaultAffectState();
  const state = {
    ...base,
    ...(input || {}),
    user: {
      ...base.user,
      ...(input?.user || {})
    },
    assistant: {
      ...base.assistant,
      ...(input?.assistant || {})
    }
  };

  state.version = AFFECT_VERSION;
  state.turnCount = Math.max(0, Math.floor(Number(state.turnCount) || 0));
  state.rapport = clamp(state.rapport, 0, 1);
  state.user.valence = signedClamp(state.user.valence);
  state.user.arousal = clamp(state.user.arousal, 0, 1);
  state.user.distress = clamp(state.user.distress, 0, 1);
  state.user.frustration = clamp(state.user.frustration, 0, 1);
  state.user.warmth = clamp(state.user.warmth, 0, 1);
  state.user.trust = clamp(state.user.trust, 0, 1);
  state.user.playfulness = clamp(state.user.playfulness, 0, 1);
  state.user.taskFocus = clamp(state.user.taskFocus, 0, 1);
  state.user.confidence = clamp(state.user.confidence, 0, 1);
  state.assistant.intensity = clamp(state.assistant.intensity, 0, 1);
  state.labels = Array.isArray(state.labels) ? state.labels.filter(Boolean).slice(0, 8) : [];
  state.summary = String(state.summary || base.summary);
  state.updatedAt = state.updatedAt || null;
  return state;
}

export function inferUserAffectFromText(text) {
  const lower = String(text || "").toLowerCase();
  const labels = new Set();

  const distress = includesAny(lower, [
    /\b(overwhelmed|panic|anxious|anxiety|scared|afraid|hurt|lonely|empty|depressed|spiraling|shaken)\b/,
    /\b(i can't do this|i cannot do this|i'm not okay|im not okay|not okay)\b/
  ]);
  const frustration = includesAny(lower, [
    /\b(frustrated|annoyed|angry|mad|pissed|furious|fed up|this sucks|hate this)\b/,
    /\b(still broken|still not working|why is this)\b/
  ]);
  const warmth = includesAny(lower, [
    /\b(thank you|thanks|appreciate|love|miss you|sweet|darling)\b/
  ]);
  const playful = includesAny(lower, [
    /\b(play|tease|flirt|banter|joke|funny|wizard chess|mischief)\b/
  ]);
  const analytical = includesAny(lower, [
    /\b(analyze|compare|metrics|evidence|data|diagnose|audit|thorough|debug)\b/
  ]);
  const directive = includesAny(lower, [
    /\b(do this|fix this|build this|continue next phase|in order|commercial grade|ship it|make it happen)\b/
  ]);
  const reflective = includesAny(lower, [
    /\b(think|reflect|wonder|maybe|i feel|i'm feeling|im feeling)\b/
  ]);
  const excited = includesAny(lower, [
    /\b(excited|amazing|awesome|great|perfect|let's go|lets go)\b/
  ]);
  const uncertain = includesAny(lower, [
    /\b(i guess|not sure|maybe|perhaps|confused|unclear)\b/
  ]);

  let valence = 0;
  let arousal = 0.34;
  let taskFocus = analytical || directive ? 0.76 : 0.24;
  let confidence = directive ? 0.72 : uncertain ? 0.28 : 0.44;
  let trust = warmth ? 0.68 : 0.44;
  let playfulness = playful ? 0.72 : 0.1;
  let warmthScore = warmth ? 0.7 : 0.18;
  let distressScore = distress ? 0.82 : 0;
  let frustrationScore = frustration ? 0.78 : 0;

  if (distress) {
    labels.add("distress");
    valence -= 0.64;
    arousal = 0.76;
  }
  if (frustration) {
    labels.add("frustrated");
    valence -= 0.46;
    arousal = Math.max(arousal, 0.7);
  }
  if (warmth) {
    labels.add("warm");
    valence += 0.26;
  }
  if (playful) {
    labels.add("playful");
    valence += 0.18;
    arousal = Math.max(arousal, 0.56);
  }
  if (analytical) {
    labels.add("analytical");
  }
  if (directive) {
    labels.add("directive");
    arousal = Math.max(arousal, 0.52);
  }
  if (reflective) {
    labels.add("reflective");
  }
  if (excited) {
    labels.add("energized");
    valence += 0.3;
    arousal = Math.max(arousal, 0.68);
  }
  if (uncertain) {
    labels.add("uncertain");
    confidence = Math.min(confidence, 0.32);
  }

  return {
    labels: [...labels],
    valence: signedClamp(valence),
    arousal: clamp(arousal),
    distress: distressScore,
    frustration: frustrationScore,
    warmth: warmthScore,
    trust,
    playfulness,
    taskFocus,
    confidence
  };
}

function deriveAssistantState(nextUser, rapport, labels) {
  let empathyMode = "steady";
  let responseMode = "balanced";
  let emotion = Emotion.NEUTRAL;

  if (labels.includes("distress") || nextUser.distress >= 0.58) {
    empathyMode = "co_regulate";
    responseMode = "reassure";
    emotion = Emotion.WARM_SUPPORTIVE;
  } else if (labels.includes("frustrated") || nextUser.frustration >= 0.52) {
    empathyMode = "de_escalate";
    responseMode = nextUser.taskFocus >= 0.55 ? "clarify" : "steady";
    emotion = rapport >= 0.42 ? Emotion.SERIOUS : Emotion.WARM_SUPPORTIVE;
  } else if (labels.includes("analytical") || labels.includes("directive") || (nextUser.taskFocus >= 0.68 && nextUser.confidence >= 0.45)) {
    empathyMode = "competent";
    responseMode = "plan";
    emotion = labels.includes("analytical") ? Emotion.ANALYTICAL : Emotion.FOCUSED_EXECUTIVE;
  } else if (labels.includes("playful") || (nextUser.playfulness >= 0.56 && nextUser.distress < 0.28)) {
    empathyMode = "play";
    responseMode = "banter";
    emotion = Emotion.TEASING;
  } else if (labels.includes("reflective")) {
    empathyMode = "reflect";
    responseMode = "reflect";
    emotion = Emotion.REFLECTIVE;
  } else if (nextUser.warmth >= 0.54) {
    empathyMode = "warm";
    responseMode = "affirm";
    emotion = Emotion.WARM_SUPPORTIVE;
  }

  return {
    empathyMode,
    responseMode,
    emotion,
    intensity: clamp(
      Math.max(
        intensityFromLabels(labels),
        nextUser.distress * 0.7,
        nextUser.frustration * 0.62,
        nextUser.playfulness * 0.6,
        nextUser.taskFocus * 0.48
      ),
      0.28,
      0.84
    )
  };
}

function describeState(user, assistant, labels) {
  const userTone = labels[0] || (user.valence >= 0.2 ? "positive" : user.valence <= -0.2 ? "strained" : "neutral");
  return `${userTone} user, ${assistant.responseMode} response, ${assistant.empathyMode} empathy`;
}

export function advanceAffectState(previousState, userText) {
  const current = normalizeAffectState(previousState);
  const inferred = inferUserAffectFromText(userText);

  const nextUser = {
    valence: signedClamp(smooth(current.user.valence, inferred.valence, 0.56)),
    arousal: clamp(smooth(current.user.arousal, inferred.arousal, 0.52)),
    distress: clamp(smooth(current.user.distress, inferred.distress, 0.44)),
    frustration: clamp(smooth(current.user.frustration, inferred.frustration, 0.48)),
    warmth: clamp(smooth(current.user.warmth, inferred.warmth, 0.58)),
    trust: clamp(smooth(current.user.trust, inferred.trust, 0.72)),
    playfulness: clamp(smooth(current.user.playfulness, inferred.playfulness, 0.54)),
    taskFocus: clamp(smooth(current.user.taskFocus, inferred.taskFocus, 0.44)),
    confidence: clamp(smooth(current.user.confidence, inferred.confidence, 0.58))
  };

  let rapport = current.rapport;
  rapport = clamp(
    rapport +
      nextUser.warmth * 0.04 +
      nextUser.trust * 0.03 -
      nextUser.frustration * 0.03 -
      nextUser.distress * 0.02,
    0.18,
    0.92
  );

  const assistant = deriveAssistantState(nextUser, rapport, inferred.labels);
  const summary = describeState(nextUser, assistant, inferred.labels);
  const state = {
    version: AFFECT_VERSION,
    turnCount: current.turnCount + 1,
    rapport,
    user: nextUser,
    assistant,
    labels: inferred.labels,
    summary,
    updatedAt: new Date().toISOString()
  };

  return {
    state,
    behavior: makeBehavior({
      emotion: assistant.emotion,
      intensity: assistant.intensity,
      speaking: false
    }),
    meta: {
      empathyMode: assistant.empathyMode,
      responseMode: assistant.responseMode,
      rapport: Number(rapport.toFixed(2)),
      summary,
      labels: inferred.labels
    }
  };
}

export function buildAffectPromptBlock(affectState) {
  const state = normalizeAffectState(affectState);
  return [
    "AFFECT STATE:",
    `- User valence: ${state.user.valence.toFixed(2)} (-1 low to 1 high)`,
    `- User arousal: ${state.user.arousal.toFixed(2)}`,
    `- User distress: ${state.user.distress.toFixed(2)}`,
    `- User frustration: ${state.user.frustration.toFixed(2)}`,
    `- User warmth: ${state.user.warmth.toFixed(2)}`,
    `- User task focus: ${state.user.taskFocus.toFixed(2)}`,
    `- Rapport: ${state.rapport.toFixed(2)}`,
    `- Empathy mode: ${state.assistant.empathyMode}`,
    `- Response mode: ${state.assistant.responseMode}`,
    `- Emotional summary: ${state.summary}`,
    "- Adapt tone and pacing to this state without sounding clinical or naming the framework."
  ].join("\n");
}
