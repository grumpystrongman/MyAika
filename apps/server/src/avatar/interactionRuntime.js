import * as fs from "fs";
import * as path from "path";

export class InteractionRuntime {
  constructor(config = {}) {
    this.emotionController = config.emotionController;
    this.voiceProsody = config.voiceProsody;
    this.ttsProvider = config.ttsProvider;
    this.lipsyncEngine = config.lipsyncEngine;
    this.blendshapeAnimator = config.blendshapeAnimator;
    this.motionController = config.motionController;

    this.isActive = false;
    this.currentSession = null;
    this.conversationContext = [];
    this.listeningState = "idle";
    this.interruptionEnabled = config.interruptionEnabled !== false;
    this.maxContextLength = config.maxContextLength || 20;
    this.maxSessionDuration = config.maxSessionDuration || 3600000; // 1 hour

    this.auditLog = [];
    this.eventQueue = [];
    this.isProcessing = false;
    this.activeSessions = new Map(); // Track multiple sessions
    this.maxActiveSessions = config.maxActiveSessions || 10;
  }

  startSession(sessionId, userId, config = {}) {
    // Validate inputs
    if (typeof sessionId !== "string" || sessionId.length === 0) {
      throw new Error("sessionId must be a non-empty string");
    }
    if (typeof userId !== "string") {
      throw new Error("userId must be a string");
    }
    
    // Check active sessions limit
    if (this.activeSessions.size >= this.maxActiveSessions) {
      throw new Error("Maximum active sessions reached");
    }
    
    // Check for duplicate session
    if (this.activeSessions.has(sessionId)) {
      throw new Error("Session already exists");
    }

    const session = {
      id: sessionId,
      userId,
      startTime: Date.now(),
      conversationCount: 0,
      emotionSequence: [],
      interactionEvents: [],
      audioEvents: [],
      listeningTime: 0,
      speakingTime: 0,
      settings: {
        enableLipsync: config.enableLipsync !== false,
        enableMotion: config.enableMotion !== false,
        enableAuditTrail: config.enableAuditTrail !== false,
        voiceGender: config.voiceGender || "female",
        speakingRate: Math.max(0.5, Math.min(2.0, config.speakingRate || 1.0)),
        emotionIntensity: Math.max(0.0, Math.min(1.0, config.emotionIntensity || 0.7))
      }
    };

    this.currentSession = session;
    this.activeSessions.set(sessionId, session);
    this.isActive = true;
    this.listeningState = "listening";

    // Start with error handling
    try {
      if (this.motionController && typeof this.motionController.start === "function") {
        this.motionController.start();
      }
    } catch (err) {
      console.error("motion_controller_start_error", { error: err.message });
    }

    this._logAuditEntry("session_started", {
      sessionId,
      userId,
      settings: session.settings
    });

    return {
      status: "session_started",
      sessionId,
      timestamp: Date.now()
    };
  }

  endSession(sessionId = null) {
    const session = sessionId 
      ? this.activeSessions.get(sessionId)
      : this.currentSession;
      
    if (!session) {
      return { status: "no_active_session" };
    }

    const sessionDuration = Date.now() - session.startTime;
    
    // Validate session hasn't exceeded max duration
    if (sessionDuration > this.maxSessionDuration) {
      console.warn("session_max_duration_exceeded", { sessionId: session.id, duration: sessionDuration });
    }

    const summary = {
      status: "session_ended",
      sessionId: session.id,
      duration: sessionDuration,
      conversationCount: session.conversationCount,
      emotionSequence: session.emotionSequence,
      totalAudioEvents: session.audioEvents.length,
      listeningTime: session.listeningTime,
      speakingTime: session.speakingTime
    };

    this._logAuditEntry("session_ended", summary);

    // Safe cleanup
    try {
      if (this.motionController && typeof this.motionController.stop === "function") {
        this.motionController.stop();
      }
    } catch (err) {
      console.error("motion_controller_stop_error", { error: err.message });
    }

    // Remove from active sessions
    this.activeSessions.delete(session.id);
    
    // If this was the current session, reset state
    if (this.currentSession?.id === session.id) {
      this.isActive = false;
      this.listeningState = "idle";
      this.conversationContext = [];
      this.currentSession = null;
    }

    return summary;
  }

  async processUserInput(userText, metadata = {}) {
    if (!this.currentSession) {
      return { status: "error", reason: "no_active_session" };
    }
    
    // Input validation
    if (typeof userText !== "string") {
      return { status: "error", reason: "invalid_input_type" };
    }
    
    const trimmedText = userText.trim();
    if (trimmedText.length === 0) {
      return { status: "error", reason: "empty_input" };
    }
    
    if (trimmedText.length > 5000) {
      return { status: "error", reason: "input_too_long" };
    }

    try {
      // Infer emotion with error handling
      let emotion = { emotion: "neutral", confidence: 0.0 };
      if (this.emotionController && typeof this.emotionController.inferEmotionFromText === "function") {
        emotion = this.emotionController.inferEmotionFromText(trimmedText);
      }

      // Select expression
      let selectedExpression = null;
      if (this.emotionController && typeof this.emotionController.selectExpression === "function") {
        selectedExpression = await this.emotionController.selectExpression(emotion.emotion);
      }

      // Generate voice instruction
      let voiceInstruction = null;
      if (this.voiceProsody && typeof this.voiceProsody.emotionToProsody === "function") {
        const prosody = this.voiceProsody.emotionToProsody(emotion.emotion);
        voiceInstruction = this.voiceProsody.createVoiceInstruction({
          text: trimmedText,
          emotion: emotion.emotion,
          prosody,
          sessionId: this.currentSession.id
        });
      }

      // Update conversation context (limit size)
      this.conversationContext.push({
        text: trimmedText,
        emotion: emotion.emotion,
        timestamp: Date.now()
      });
      
      if (this.conversationContext.length > this.maxContextLength) {
        this.conversationContext.shift();
      }

      // Log to session
      this.currentSession.conversationCount++;
      this.currentSession.emotionSequence.push(emotion.emotion);

      this._logAuditEntry("user_input_processed", {
        emotion: emotion.emotion,
        confidence: emotion.confidence,
        textLength: trimmedText.length
      });

      return {
        status: "success",
        emotion,
        selectedExpression,
        voiceInstruction
      };
    } catch (err) {
      console.error("process_user_input_error", { error: err.message, text: trimmedText.substring(0, 50) });
      return { status: "error", reason: "processing_failed", message: err.message };
    }
  }

  async generateAvatarResponse(responseText, emotionOverride = null) {
    if (!this.currentSession) {
      return { status: "error", reason: "no_active_session" };
    }

    try {
      // Step 1: Infer emotion from avatar response
      const inferredEmotion = emotionOverride ||
        this.emotionController.inferEmotionFromText(responseText);
      const emotion = typeof inferredEmotion === "string"
        ? inferredEmotion
        : inferredEmotion.emotion;

      // Step 2: Get expressions for avatar emotion
      const expressions = this.emotionController.emotionToExpressions(emotion);
      const selectedExpression = await this.emotionController.selectExpression(emotion);

      // Step 3: Apply intensity
      const intensity = this.currentSession.settings.emotionIntensity;
      const modulatedExpression = this.emotionController.emotionIntensityModulation(selectedExpression, intensity);

      // Step 4: Generate voice with prosody
      const prosody = this.voiceProsody.emotionToProsody(emotion, intensity);
      const voiceInstruction = this.voiceProsody.createVoiceInstruction({
        emotion,
        prosody,
        text: responseText,
        sessionId: this.currentSession.id
      });

      // Step 5: Synthesize audio
      let audioData = null;
      let audioDuration = 0;

      if (this.ttsProvider) {
        try {
          const ttsResult = await this.ttsProvider.synthesize(responseText, {
            emotion,
            prosody,
            speakerId: this.currentSession.settings.voiceGender
          });

          audioData = ttsResult.audioData;
          audioDuration = ttsResult.duration;

          this.currentSession.audioEvents.push({
            timestamp: Date.now(),
            type: "synthesis",
            duration: audioDuration,
            emotion
          });
        } catch (error) {
          console.error("TTS synthesis failed:", error);
        }
      }

      // Step 6: Generate lipsync if enabled
      let lipsyncData = null;
      if (this.currentSession.settings.enableLipsync && this.lipsyncEngine) {
        const lipsyncSequence = this.lipsyncEngine.generateLipsyncSequence(
          responseText,
          audioDuration || 3000
        );
        lipsyncData = this.lipsyncEngine.lipsyncFormatForRenderer(lipsyncSequence);
      }

      // Step 7: Schedule expression animation
      if (this.blendshapeAnimator) {
        this.blendshapeAnimator.setTarget(modulatedExpression.blendshapeValues || {}, 300);
      }

      // Step 8: Log to audit trail
      this.currentSession.speakingTime += audioDuration / 1000;
      this.currentSession.emotionSequence.push({
        timestamp: Date.now(),
        emotion,
        confidence: 1.0,
        source: "avatar_response"
      });

      const result = {
        status: "response_generated",
        emotion,
        text: responseText,
        expression: selectedExpression,
        audioData: audioData ? "audio_buffer" : null,
        audioDuration,
        lipsync: lipsyncData || null,
        voiceInstruction,
        eventId: `response_${Date.now()}`
      };

      this._logAuditEntry("avatar_response_generated", result);
      return result;
    } catch (error) {
      this._logAuditEntry("response_generation_failed", { error: error.message });
      return {
        status: "error",
        reason: "response_generation_failed",
        message: error.message
      };
    }
  }

  updateListeningState(state) {
    const validStates = ["listening", "processing", "speaking", "idle"];
    if (!validStates.includes(state)) {
      return { status: "error", reason: "invalid_state" };
    }

    const previousState = this.listeningState;
    this.listeningState = state;

    if (previousState === "listening" && state !== "listening") {
      this.currentSession.listeningTime += Date.now() - (this._listeningStartTime || Date.now());
    } else if (previousState !== "listening" && state === "listening") {
      this._listeningStartTime = Date.now();
    }

    this._logAuditEntry("listening_state_updated", {
      previousState,
      newState: state
    });

    return { status: "state_updated", state };
  }

  addContextMessage(role, content) {
    if (!this.currentSession) return;

    this.conversationContext.push({
      role,
      content,
      timestamp: Date.now()
    });

    if (this.conversationContext.length > this.maxContextLength) {
      this.conversationContext.shift();
    }
  }

  getConversationContext() {
    return [...this.conversationContext];
  }

  _selectGestureForEmotion(emotion) {
    const emotionGestures = {
      joy: "nod",
      sadness: "look_down",
      anger: "shake",
      fear: "look_right",
      disgust: "shake",
      surprise: "look_up",
      curiosity: "tilt_left",
      affection: "nod",
      flirtation: "tilt_right"
    };

    return emotionGestures[emotion] || null;
  }

  _logAuditEntry(action, details) {
    const entry = {
      timestamp: Date.now(),
      action,
      details,
      sessionId: this.currentSession?.id || null,
      userId: this.currentSession?.userId || null
    };

    this.auditLog.push(entry);

    if (this.auditLog.length > 1000) {
      this.auditLog.shift();
    }

    if (this.currentSession?.settings.enableAuditTrail) {
      this._persistAuditEntry(entry);
    }
  }

  _persistAuditEntry(entry) {
    try {
      const auditDir = path.join(process.cwd(), "logs", "avatar-audit");
      if (!fs.existsSync(auditDir)) {
        fs.mkdirSync(auditDir, { recursive: true });
      }

      const logFile = path.join(auditDir, `${this.currentSession.id}.jsonl`);
      fs.appendFileSync(logFile, JSON.stringify(entry) + "\n");
    } catch (error) {
      console.warn("Failed to persist audit entry:", error);
    }
  }

  getSessionStats() {
    if (!this.currentSession) return null;

    const duration = Date.now() - this.currentSession.startTime;
    return {
      sessionId: this.currentSession.id,
      duration,
      conversationCount: this.currentSession.conversationCount,
      emotionSequence: this.currentSession.emotionSequence,
      listeningTime: this.currentSession.listeningTime,
      speakingTime: this.currentSession.speakingTime,
      listeningRatio: this.currentSession.listeningTime / (duration / 1000),
      speakingRatio: this.currentSession.speakingTime / (duration / 1000)
    };
  }

  getAuditLog(limit = 100) {
    return this.auditLog.slice(-limit);
  }
}

export function createInteractionRuntime(config) {
  return new InteractionRuntime(config);
}
