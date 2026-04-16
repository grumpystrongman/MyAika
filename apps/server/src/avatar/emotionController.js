import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

let characterSpec = null;
let expressionMap = null;
let voiceProfiles = null;
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const avatarConfigDir = path.resolve(__dirname, "../../../../config/avatar");

function ensureLoaded() {
  if (!characterSpec) {
    const specPath = path.join(avatarConfigDir, "characterSpec.json");
    characterSpec = JSON.parse(fs.readFileSync(specPath, "utf-8"));
  }
  if (!expressionMap) {
    const exprPath = path.join(avatarConfigDir, "expressionMap.json");
    expressionMap = JSON.parse(fs.readFileSync(exprPath, "utf-8"));
  }
  return { characterSpec, expressionMap };
}

export function getCharacterSpec() {
  ensureLoaded();
  return characterSpec;
}

export function getExpressionMap() {
  ensureLoaded();
  return expressionMap;
}

export function inferEmotionFromText(text) {
  // Input validation
  if (typeof text !== "string" && text !== null && text !== undefined) {
    throw new TypeError(`Expected string or null, got ${typeof text}`);
  }
  
  const lower = String(text || "").toLowerCase().trim();
  if (lower.length === 0) {
    return {
      emotion: "neutral",
      confidence: 0.0,
      keywords: []
    };
  }
  
  const emotionKeywords = {
    joy: ["happy", "excited", "great", "wonderful", "amazing", "love", "joy", "delighted", "thrilled", "fantastic"],
    sadness: ["sad", "sorry", "terrible", "awful", "hate", "lonely", "depressed", "down", "blue"],
    anger: ["angry", "furious", "hate", "outrageous", "unacceptable", "mad", "rage"],
    fear: ["scared", "afraid", "terrified", "nervous", "anxious", "worried", "panic"],
    disgust: ["disgusting", "gross", "yuck", "horrible", "ew", "nasty"],
    surprise: ["surprised", "wow", "shocking", "unexpected", "amazed", "astonished"],
    curiosity: ["how", "what", "why", "interesting", "wonder", "curious", "intrigued", "analyze", "details"],
    affection: ["love", "care", "dear", "sweet", "kind", "adore", "cherish"],
    flirtation: ["wink", "playful", "tease", "flirt", "cheeky"],
    warm_supportive: ["you got this", "i am here", "support", "breathe", "take your time", "steady"],
    witty_playful: ["funny", "joke", "banter", "playful", "hehe", "lol"],
    analytical: ["analyze", "compare", "breakdown", "metrics", "data", "evidence"],
    serious: ["urgent", "critical", "serious", "risk", "warning"],
    reflective: ["reflect", "consider", "thoughtful", "pause"],
    teasing: ["tease", "mischief", "naughty", "you know you want to"],
    focused_executive: ["execute", "next step", "decision", "plan", "objective"]
  };

  let detectedEmotion = "neutral";
  let maxMatches = 0;

  for (const [emotion, keywords] of Object.entries(emotionKeywords)) {
    const matches = keywords.filter(kw => lower.includes(kw)).length;
    if (matches > maxMatches) {
      detectedEmotion = emotion;
      maxMatches = matches;
    }
  }

  // Ensure minimum confidence for detected emotions
  const confidence = detectedEmotion === "neutral" 
    ? 0.3 
    : Math.max(0.5, Math.min(1, maxMatches / 3));

  return {
    emotion: detectedEmotion,
    confidence: Number.isFinite(confidence) ? confidence : 0.0,
    keywords: emotionKeywords[detectedEmotion] || []
  };
}

export function emotionToExpressions(emotion) {
  // Input validation
  if (typeof emotion !== "string") {
    throw new TypeError(`Expected emotion as string, got ${typeof emotion}`);
  }
  
  ensureLoaded();
  const mapping = expressionMap?.emotionToExpressionMapping || {};
  const expressions = mapping[emotion] || ["neutral"];
  
  // Validate expression names are strings
  if (!Array.isArray(expressions)) {
    return ["neutral"];
  }
  
  return expressions.filter(e => typeof e === "string");
}

export async function selectExpression(emotion, context = {}) {
  const expressions = emotionToExpressions(emotion);
  const selected = expressions[Math.floor(Math.random() * expressions.length)];
  
  ensureLoaded();
  const exprData = expressionMap.expressionMaps[selected];
  
  return {
    expressionId: selected,
    blendshapeValues: exprData?.blendshapeValues || {},
    duration: exprData?.duration || 400,
    emotion,
    timestamp: new Date().toISOString()
  };
}

export function blendExpressions(expr1, expr2, weight) {
  if (weight <= 0) return expr1;
  if (weight >= 1) return expr2;
  
  const blended = { ...expr1 };
  for (const key in expr2.blendshapeValues) {
    const v1 = expr1.blendshapeValues?.[key] || 0;
    const v2 = expr2.blendshapeValues?.[key] || 0;
    blended.blendshapeValues = blended.blendshapeValues || {};
    blended.blendshapeValues[key] = v1 + (v2 - v1) * weight;
  }
  
  return blended;
}

export function emotionIntensityModulation(expression, intensityFactor = 1.0) {
  const modulated = { ...expression };
  modulated.blendshapeValues = {};
  
  for (const [key, value] of Object.entries(expression.blendshapeValues)) {
    modulated.blendshapeValues[key] = value * intensityFactor;
  }
  
  return modulated;
}

export function expressionToString(expr) {
  const emotion = String(expr?.emotion || "neutral").toLowerCase();
  const id = String(expr?.expressionId || "neutral");
  const duration = Number(expr?.duration || 0);
  return `${id}_${emotion}_${duration}ms`;
}

export function scheduleExpression(expr, delayMs = 0) {
  return {
    ...expr,
    scheduledAt: new Date(),
    executeAt: new Date(Date.now() + delayMs),
    status: "scheduled"
  };
}

export function createAuditLogEntry(avatarAction) {
  return {
    id: `audit_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`,
    timestamp: new Date().toISOString(),
    action: avatarAction.type,
    emotion: avatarAction.emotion || null,
    expression: avatarAction.expression || null,
    voiceProfile: avatarAction.voiceProfile || null,
    inputText: avatarAction.inputText || null,
    userId: avatarAction.userId || "anonymous",
    sessionId: avatarAction.sessionId || null,
    ipHash: avatarAction.ipHash || null,
    metadata: avatarAction.metadata || {}
  };
}

export function logAvatarAction(action, logPath) {
  const entry = createAuditLogEntry(action);
  try {
    if (!fs.existsSync(logPath)) {
      fs.writeFileSync(logPath, JSON.stringify({ entries: [] }, null, 2));
    }
    const content = JSON.parse(fs.readFileSync(logPath, "utf-8"));
    content.entries = content.entries || [];
    content.entries.push(entry);
    fs.writeFileSync(logPath, JSON.stringify(content, null, 2));
  } catch (err) {
    console.error("audit_log_write_failed:", err.message);
  }
  return entry;
}
