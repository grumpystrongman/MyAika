import fs from "node:fs";
import path from "node:path";

let charSpec = null;
let prosodyRules = null;

function ensureLoaded() {
  if (!charSpec) {
    const specPath = path.join(process.cwd(), "config", "avatar", "characterSpec.json");
    charSpec = JSON.parse(fs.readFileSync(specPath, "utf-8"));
  }
  if (!prosodyRules) {
    const rulesPath = path.join(process.cwd(), "config", "avatar", "prosodyRules.json");
    if (fs.existsSync(rulesPath)) {
      prosodyRules = JSON.parse(fs.readFileSync(rulesPath, "utf-8"));
    } else {
      prosodyRules = charSpec.voiceProfile?.emotionalProfiles || {};
    }
  }
  return { charSpec, prosodyRules };
}

const EMOTION_ALIAS = {
  joy: "witty_playful",
  sadness: "sadness",
  anger: "anger",
  fear: "serious",
  disgust: "serious",
  surprise: "surprised",
  curiosity: "curiosity",
  affection: "warm_supportive",
  flirtation: "teasing"
};

function normalizeEmotion(emotion = "neutral") {
  const key = String(emotion || "neutral").toLowerCase().trim();
  return EMOTION_ALIAS[key] || key || "neutral";
}

function clamp(value, min, max, fallback) {
  const numeric = Number.isFinite(value) ? value : fallback;
  return Math.max(min, Math.min(max, numeric));
}

export function getVoiceProfile(emotion = "neutral") {
  const { prosodyRules } = ensureLoaded();
  const normalized = normalizeEmotion(emotion);
  const profiles = prosodyRules || {};
  return profiles[normalized] || profiles.neutral || {
    pitch: 0.9,
    rate: 1.0,
    energy: 0.55,
    breathiness: 0.18,
    pauseFrequency: 0.42
  };
}

export function emotionToProsody(emotion, intensity = 1.0) {
  const profile = getVoiceProfile(emotion);
  const i = clamp(intensity, 0, 1.5, 1.0);

  return {
    pitch: clamp(profile.pitch * (0.95 + i * 0.08), 0.5, 2.0, 0.9),
    rate: clamp(profile.rate * (0.92 + i * 0.15), 0.5, 2.0, 1.0),
    energy: clamp(profile.energy * (0.88 + i * 0.2), 0.0, 1.0, 0.55),
    breathiness: clamp(profile.breathiness + i * 0.08, 0.0, 1.0, 0.18),
    pauseFrequency: clamp(profile.pauseFrequency * (1.1 - i * 0.12), 0.0, 1.0, 0.42)
  };
}

export function applyIntensityModulation(prosody, intensity = 1.0) {
  const i = clamp(intensity, 0, 1.5, 1.0);
  return {
    pitch: clamp((prosody?.pitch || 1.0) * (0.9 + i * 0.2), 0.5, 2.0, 1.0),
    rate: clamp((prosody?.rate || 1.0) * (0.85 + i * 0.35), 0.5, 2.0, 1.0),
    energy: clamp((prosody?.energy || 0.5) * (0.8 + i * 0.4), 0.0, 1.0, 0.5),
    breathiness: clamp((prosody?.breathiness || 0.1) + i * 0.18, 0.0, 1.0, 0.1),
    pauseFrequency: clamp((prosody?.pauseFrequency || 0.3) * (1.0 - i * 0.3), 0.0, 1.0, 0.3)
  };
}

export function prosodyToTtsParams(prosody = {}) {
  return {
    rate: clamp(prosody.rate, 0.5, 2.0, 1.0),
    pitch: Math.round((clamp(prosody.pitch, 0.5, 2.0, 1.0) - 1.0) * 100),
    volume: clamp(prosody.energy, 0.4, 1.0, 0.9),
    pre_phoneme_silence: 45,
    post_phoneme_silence: 45,
    filler_silence: Math.round(clamp(prosody.pauseFrequency, 0, 1, 0.4) * 200)
  };
}

export function createVoiceInstruction(input, emotion = "neutral", speakerId = "aika_nocturne") {
  if (typeof input === "object" && input !== null) {
    const resolvedEmotion = normalizeEmotion(input.emotion || emotion || "neutral");
    const resolvedProsody = input.prosody || emotionToProsody(resolvedEmotion, input.intensity ?? 1.0);
    return {
      speakerId: input.speakerId || speakerId,
      text: String(input.text || "").trim(),
      emotion: resolvedEmotion,
      prosody: resolvedProsody,
      ttsParams: prosodyToTtsParams(resolvedProsody),
      timestamp: new Date().toISOString(),
      requestId: input.requestId || `voice_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`,
      sessionId: input.sessionId || null
    };
  }

  const text = String(input || "").trim();
  const resolvedEmotion = normalizeEmotion(emotion);
  const prosody = emotionToProsody(resolvedEmotion, 1.0);
  return {
    speakerId,
    text,
    emotion: resolvedEmotion,
    prosody,
    ttsParams: prosodyToTtsParams(prosody),
    timestamp: new Date().toISOString(),
    requestId: `voice_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`,
    sessionId: null
  };
}

export function insertProsodyMarkers(text, emotion) {
  const prosody = emotionToProsody(emotion);
  let marked = String(text || "");

  if (prosody.pauseFrequency > 0.62) {
    marked = marked
      .split(". ")
      .join(". <break time='500ms'/> ");
  }

  if (prosody.breathiness > 0.28) {
    marked = marked.replace(/"/g, "<amazon:breath confidence='medium'/> ");
  }

  return marked;
}

// Keep backwards compatibility with legacy misspelled export.
export const insertProssodyMarkers = insertProsodyMarkers;

export function estimatePhonemeCount(text) {
  const estimatePerWord = 4.5;
  const words = String(text || "").trim().split(/\s+/).filter(Boolean).length;
  return Math.round(words * estimatePerWord);
}

export function adjustSpeechRate(baseRate, contentDensity) {
  const slowdownFactor = 1.0 + Number(contentDensity || 0) * 0.2;
  return clamp(baseRate / slowdownFactor, 0.5, 2.0, 1.0);
}

export function blendProsodies(prosody1, prosody2, weight) {
  const w = clamp(weight, 0, 1, 0.5);
  return {
    pitch: (prosody1.pitch || 1.0) + ((prosody2.pitch || 1.0) - (prosody1.pitch || 1.0)) * w,
    rate: (prosody1.rate || 1.0) + ((prosody2.rate || 1.0) - (prosody1.rate || 1.0)) * w,
    energy: (prosody1.energy || 0.5) + ((prosody2.energy || 0.5) - (prosody1.energy || 0.5)) * w,
    breathiness: (prosody1.breathiness || 0.1) + ((prosody2.breathiness || 0.1) - (prosody1.breathiness || 0.1)) * w,
    pauseFrequency: (prosody1.pauseFrequency || 0.4) + ((prosody2.pauseFrequency || 0.4) - (prosody1.pauseFrequency || 0.4)) * w
  };
}

export function voiceProfileToDescription(emotion) {
  const key = normalizeEmotion(emotion);
  const descriptions = {
    warm_supportive: "Warm and grounding delivery with reassuring pacing.",
    witty_playful: "Lively timing with playful articulation and bright cadence.",
    analytical: "Precise, measured, and technical delivery.",
    serious: "Lower register with restrained emotional color.",
    reflective: "Measured and introspective with longer phrase spacing.",
    teasing: "Coy rhythm with playful pauses and softer consonants.",
    focused_executive: "Direct, concise, and command-forward speaking style."
  };

  return descriptions[key] || "Balanced nocturne delivery with cinematic confidence.";
}