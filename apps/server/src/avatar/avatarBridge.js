import { Router } from "express";

function validateString(value, fieldName, maxLength = 10000) {
  if (typeof value !== "string") {
    throw new TypeError(`${fieldName} must be a string`);
  }
  if (value.length > maxLength) {
    throw new Error(`${fieldName} exceeds maximum length of ${maxLength}`);
  }
  return value.trim();
}

function validateSessionId(sessionId) {
  if (!sessionId || typeof sessionId !== "string") {
    throw new Error("sessionId is required and must be a string");
  }
  if (!/^[a-zA-Z0-9_-]+$/.test(sessionId)) {
    throw new Error("Invalid sessionId format");
  }
  return sessionId;
}

function validateEmotionOverride(value) {
  if (!value) return null;
  const emotion = String(value).trim().toLowerCase();
  const valid = new Set([
    "joy",
    "sadness",
    "anger",
    "fear",
    "disgust",
    "surprise",
    "curiosity",
    "affection",
    "flirtation",
    "neutral",
    "warm_supportive",
    "witty_playful",
    "analytical",
    "serious",
    "reflective",
    "teasing",
    "focused_executive"
  ]);
  if (!valid.has(emotion)) {
    throw new Error(`Invalid emotion. Must be one of: ${Array.from(valid).join(", ")}`);
  }
  return emotion;
}

const rateLimits = new Map();
function checkRateLimit(identifier, maxRequests = 100, windowMs = 60000) {
  const now = Date.now();
  const key = `${identifier}`;

  if (!rateLimits.has(key)) rateLimits.set(key, []);
  const requests = rateLimits.get(key);
  const recentRequests = requests.filter(t => now - t < windowMs);
  if (recentRequests.length >= maxRequests) return false;

  recentRequests.push(now);
  rateLimits.set(key, recentRequests);
  return true;
}

function getClientIp(req) {
  return req.ip || req.headers["x-forwarded-for"] || "unknown";
}

function extractText(input) {
  if (typeof input === "string") return input;
  if (input && typeof input === "object" && typeof input.text === "string") {
    return input.text;
  }
  return "";
}

export function createAvatarBridge(orchestrator, avatarSystem) {
  const router = Router();

  router.get("/profile", (_req, res) => {
    try {
      const characterSpec = avatarSystem.emotionController?.getCharacterSpec?.() || null;
      const expressionMap = avatarSystem.emotionController?.getExpressionMap?.() || null;
      res.json({
        status: "ok",
        profile: {
          characterSpec,
          expressionMap,
          supportedEmotions: Object.keys(expressionMap?.emotionToExpressionMapping || {})
        }
      });
    } catch (error) {
      res.status(500).json({ status: "error", message: error.message });
    }
  });

  router.post("/initialize", async (req, res) => {
    const clientIp = getClientIp(req);
    if (!checkRateLimit(clientIp, 10, 60000)) {
      return res.status(429).json({ status: "error", message: "Too many requests. Please try again later." });
    }

    try {
      const {
        sessionId,
        userId,
        ttsEngine = "piper",
        voiceId = "en_US-amy-medium",
        camera = { framing: "portrait", distance: 0.9 }
      } = req.body || {};

      const validSessionId = validateSessionId(sessionId);
      const validUserId = validateString(userId || "anonymous", "userId", 120);
      const validTtsEngine = validateString(ttsEngine, "ttsEngine", 40).toLowerCase();
      const validVoiceId = validateString(voiceId, "voiceId", 120);

      const allowedEngines = new Set(["piper", "azure", "elevenlabs", "gptsovits", "local"]);
      if (!allowedEngines.has(validTtsEngine)) {
        return res.status(400).json({ status: "error", message: "Invalid ttsEngine." });
      }

      const session = avatarSystem.startSession(validSessionId, validUserId, {
        enableLipsync: true,
        enableMotion: true,
        enableAuditTrail: true,
        voiceGender: "female",
        speakingRate: 1.0,
        emotionIntensity: 0.72,
        ttsEngine: validTtsEngine,
        voiceId: validVoiceId,
        camera
      });

      const characterSpec = avatarSystem.emotionController?.getCharacterSpec?.() || null;
      const expressionMap = avatarSystem.emotionController?.getExpressionMap?.() || null;

      return res.json({
        status: "initialized",
        session,
        runtime: {
          ttsEngine: validTtsEngine,
          voiceId: validVoiceId,
          camera
        },
        character: characterSpec,
        expressions: expressionMap
      });
    } catch (error) {
      console.error("avatar_initialize_error", { error: error.message, ip: clientIp });
      return res.status(400).json({ status: "error", message: error.message });
    }
  });

  router.post("/interaction/user-input", async (req, res) => {
    const clientIp = getClientIp(req);
    if (!checkRateLimit(clientIp, 60, 60000)) {
      return res.status(429).json({ status: "error", message: "Too many requests" });
    }

    try {
      const { userText, sessionId } = req.body || {};
      validateSessionId(sessionId);
      const validText = validateString(userText, "userText", 5000);
      if (!validText) {
        return res.status(400).json({ status: "error", message: "userText cannot be empty" });
      }

      const result = await avatarSystem.processUserInput(validText, { sessionId });
      return res.json({
        status: "processed",
        emotion: result?.emotion || { emotion: "neutral", confidence: 0 },
        expression: result?.selectedExpression || null,
        voiceInstruction: result?.voiceInstruction || null
      });
    } catch (error) {
      console.error("avatar_user_input_error", { error: error.message, sessionId: req.body?.sessionId });
      return res.status(400).json({ status: "error", message: error.message });
    }
  });

  router.post("/interaction/agent-output", async (req, res) => {
    const clientIp = getClientIp(req);
    if (!checkRateLimit(clientIp, 60, 60000)) {
      return res.status(429).json({ status: "error", message: "Too many requests" });
    }

    try {
      const { agentOutput, sessionId, emotionOverride = null } = req.body || {};
      validateSessionId(sessionId);
      const outputText = validateString(extractText(agentOutput), "agentOutput", 5000);
      if (!outputText) {
        return res.status(400).json({ status: "error", message: "agentOutput is required" });
      }

      const validatedEmotion = validateEmotionOverride(emotionOverride);
      const result = await avatarSystem.generateAvatarResponse(outputText, validatedEmotion);

      return res.json({
        status: "response_generated",
        emotion: result?.emotion || "neutral",
        audio: result?.audioData || null,
        audioDuration: result?.audioDuration || 0,
        lipsync: result?.lipsync || null,
        expression: result?.expression || null,
        voiceInstruction: result?.voiceInstruction || null
      });
    } catch (error) {
      console.error("avatar_agent_output_error", { error: error.message, ip: clientIp });
      return res.status(400).json({ status: "error", message: error.message });
    }
  });

  router.post("/interaction/interrupt", async (req, res) => {
    try {
      const { sessionId } = req.body || {};
      validateSessionId(sessionId);
      const state = avatarSystem.updateListeningState("listening");
      return res.json({ status: "interrupted", state });
    } catch (error) {
      return res.status(400).json({ status: "error", message: error.message });
    }
  });

  router.post("/camera/frame", (req, res) => {
    try {
      const { sessionId, framing = "portrait", distance = 0.9, eyeLine = 0.52 } = req.body || {};
      validateSessionId(sessionId);
      if (!avatarSystem.currentSession || avatarSystem.currentSession.id !== sessionId) {
        return res.status(404).json({ status: "error", message: "session_not_found" });
      }
      avatarSystem.currentSession.settings.camera = {
        framing: String(framing || "portrait"),
        distance: Number.isFinite(distance) ? distance : 0.9,
        eyeLine: Number.isFinite(eyeLine) ? eyeLine : 0.52
      };
      return res.json({ status: "camera_updated", camera: avatarSystem.currentSession.settings.camera });
    } catch (error) {
      return res.status(400).json({ status: "error", message: error.message });
    }
  });

  router.post("/lipsync/preview", (req, res) => {
    try {
      const text = validateString(req.body?.text || "", "text", 5000);
      const durationMs = Number(req.body?.durationMs || 1800);
      if (!text) {
        return res.status(400).json({ status: "error", message: "text_required" });
      }
      const sequence = avatarSystem.lipsyncEngine.generateLipsyncSequence(text, durationMs);
      const rendererFormat = avatarSystem.lipsyncEngine.lipsyncFormatForRenderer(sequence);
      return res.json({ status: "ok", lipsync: rendererFormat });
    } catch (error) {
      return res.status(400).json({ status: "error", message: error.message });
    }
  });

  router.get("/session/stats", (_req, res) => {
    try {
      const stats = avatarSystem.getSessionStats();
      return res.json({ status: "stats_retrieved", stats });
    } catch (error) {
      return res.status(500).json({ status: "error", message: error.message });
    }
  });

  router.get("/status", (_req, res) => {
    try {
      const status = {
        isActive: avatarSystem.isActive,
        listeningState: avatarSystem.listeningState,
        currentSession: avatarSystem.currentSession?.id || null,
        blendshapeAnimator: avatarSystem.blendshapeAnimator?.getStatus?.() || null,
        motionController: avatarSystem.motionController?.getMotionStatus?.() || null,
        auditLogLength: avatarSystem.auditLog.length
      };

      return res.json({ status: "ok", avatar: status });
    } catch (error) {
      return res.status(500).json({ status: "error", message: error.message });
    }
  });

  router.get("/audit-log", (req, res) => {
    try {
      const limit = Number.parseInt(req.query.limit, 10) || 50;
      const log = avatarSystem.getAuditLog(limit);
      return res.json({ status: "ok", entries: log.length, log });
    } catch (error) {
      return res.status(500).json({ status: "error", message: error.message });
    }
  });

  router.post("/session/end", (req, res) => {
    try {
      const sessionId = req.body?.sessionId || null;
      if (sessionId) validateSessionId(sessionId);
      const result = avatarSystem.endSession(sessionId);
      return res.json({ status: "session_ended", result });
    } catch (error) {
      return res.status(500).json({ status: "error", message: error.message });
    }
  });

  router.post("/interaction/stream-response", async (req, res) => {
    try {
      const outputText = validateString(extractText(req.body?.agentOutput), "agentOutput", 5000);
      if (!outputText) {
        return res.status(400).json({ status: "error", message: "agentOutput is required" });
      }

      res.setHeader("Content-Type", "text/event-stream");
      res.setHeader("Cache-Control", "no-cache");
      res.setHeader("Connection", "keep-alive");

      res.write(`data: ${JSON.stringify({ type: "emotion_inferred", emotion: "processing" })}\n\n`);

      const result = await avatarSystem.generateAvatarResponse(outputText);

      res.write(`data: ${JSON.stringify({
        type: "response_generated",
        emotion: result?.emotion || "neutral",
        expression: result?.expression || null
      })}\n\n`);

      if (result?.audioData) {
        res.write(`data: ${JSON.stringify({
          type: "audio_ready",
          duration: result.audioDuration || 0
        })}\n\n`);
      }

      if (result?.lipsync) {
        res.write(`data: ${JSON.stringify({
          type: "lipsync_ready",
          sequenceLength: Array.isArray(result.lipsync.sequences) ? result.lipsync.sequences.length : 0
        })}\n\n`);
      }

      res.write("data: [DONE]\\n\\n");
      return res.end();
    } catch (error) {
      res.write(`data: ${JSON.stringify({ type: "error", message: error.message })}\n\n`);
      return res.end();
    }
  });

  return router;
}

export function initializeAvatarBridge(app, orchestrator, avatarSystem, mountPath = "/api/avatar") {
  const bridge = createAvatarBridge(orchestrator, avatarSystem);
  app.use(mountPath, bridge);

  console.log(`Avatar bridge initialized at ${mountPath}`);

  return {
    router: bridge,
    orchestrator,
    avatarSystem,
    mountPath
  };
}