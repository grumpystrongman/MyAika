"use client";

import React, { useState, useEffect, useRef, useCallback } from "react";
import AvatarRenderer from "./AvatarRenderer";
import useAvatarAudio from "../hooks/avatar/useAvatarAudio";

export default function AvatarUI({
  modelUrl = "/models/aika.glb",
  characterSpec = null,
  expressionMap = null,
  onInteractionStart = null,
  onInteractionEnd = null,
  width = 800,
  height = 600,
  enableMicrophone = true,
  apiBaseUrl = process.env.NEXT_PUBLIC_SERVER_URL || "http://localhost:3512"
}) {
  const [isLive, setIsLive] = useState(false);
  const [currentEmotion, setCurrentEmotion] = useState("neutral");
  const [currentExpression, setCurrentExpression] = useState("neutral");
  const [listeningActive, setListeningActive] = useState(false);
  const [speakingActive, setSpeakingActive] = useState(false);
  const [transcript, setTranscript] = useState("");
  const [sessionId, setSessionId] = useState(null);
  const [error, setError] = useState(null);
  const [stats, setStats] = useState(null);

  const recognitionRef = useRef(null);
  const avatarRef = useRef(null);
  const {
    playAudioURL,
    stopAudio,
    isPlaying,
    isListening,
    volume
  } = useAvatarAudio({
    onAudioStart: () => setSpeakingActive(true),
    onAudioEnd: () => setSpeakingActive(false),
    onVoiceActivityChange: (activity) => setListeningActive(activity.isActive)
  });

  // Initialize speech recognition
  useEffect(() => {
    if (!enableMicrophone) return;

    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognition) {
      setError("Speech Recognition not supported in this browser");
      return;
    }

    const recognition = new SpeechRecognition();
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.lang = "en-US";

    recognition.onstart = () => {
      setListeningActive(true);
    };

    recognition.onresult = (event) => {
      let interim = "";
      let final = "";

      for (let i = event.resultIndex; i < event.results.length; i++) {
        const transcript = event.results[i][0].transcript;
        if (event.results[i].isFinal) {
          final += transcript + " ";
        } else {
          interim += transcript;
        }
      }

      setTranscript(final || interim);

      if (final.trim().length > 0) {
        handleUserInput(final.trim());
      }
    };

    recognition.onerror = (event) => {
      setError(`Speech Recognition Error: ${event.error}`);
    };

    recognition.onend = () => {
      setListeningActive(false);
    };

    recognitionRef.current = recognition;

    return () => {
      recognition.stop();
    };
  }, [enableMicrophone]);

  // Initialize avatar session
  const initializeSession = useCallback(async () => {
    try {
      const newSessionId = `session_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
      setSessionId(newSessionId);

      const response = await fetch(`${apiBaseUrl}/api/avatar/initialize`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sessionId: newSessionId,
          userId: "current_user",
          characterSpec,
          expressionMap
        })
      });

      if (!response.ok) throw new Error("Failed to initialize session");

      const data = await response.json();
      setIsLive(true);
      if (onInteractionStart) onInteractionStart(data);

      // Start listening
      if (recognitionRef.current && enableMicrophone) {
        recognitionRef.current.start();
      }

      return newSessionId;
    } catch (error) {
      setError(error.message);
      console.error("Session initialization failed:", error);
    }
  }, [apiBaseUrl, characterSpec, expressionMap, enableMicrophone, onInteractionStart]);

  // Handle user input
  const handleUserInput = useCallback(
    async (input) => {
      if (!sessionId) return;

      try {
        // Process user input
        const response = await fetch(`${apiBaseUrl}/api/avatar/interaction/user-input`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            userText: input,
            sessionId
          })
        });

        if (!response.ok) throw new Error("Failed to process input");

        const data = await response.json();
        setCurrentEmotion(data.emotion);
        setCurrentExpression(data.expression);
      } catch (error) {
        setError(error.message);
        console.error("Input processing failed:", error);
      }
    },
    [sessionId, apiBaseUrl]
  );

  // Generate and play avatar response
  const generateAvatarResponse = useCallback(
    async (text) => {
      if (!sessionId) return;

      try {
        setSpeakingActive(true);

        const response = await fetch(`${apiBaseUrl}/api/avatar/interaction/agent-output`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            agentOutput: text,
            sessionId
          })
        });

        if (!response.ok) throw new Error("Failed to generate response");

        const data = await response.json();
        setCurrentEmotion(data.emotion);
        setCurrentExpression(data.expression);

        // Play audio if available
        if (data.audio && data.audioUrl) {
          await playAudioURL(data.audioUrl);
        }
      } catch (error) {
        setError(error.message);
        setSpeakingActive(false);
        console.error("Response generation failed:", error);
      }
    },
    [sessionId, apiBaseUrl, playAudioURL]
  );

  // End session
  const endSession = useCallback(async () => {
    try {
      if (recognitionRef.current) {
        recognitionRef.current.stop();
      }
      stopAudio();

      await fetch(`${apiBaseUrl}/api/avatar/session/end`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sessionId })
      });

      setIsLive(false);
      setSessionId(null);
      setTranscript("");
      if (onInteractionEnd) onInteractionEnd();
    } catch (error) {
      setError(error.message);
      console.error("Session end failed:", error);
    }
  }, [sessionId, apiBaseUrl, stopAudio, onInteractionEnd]);

  // Get session stats
  const getStats = useCallback(async () => {
    if (!sessionId) return;

    try {
      const response = await fetch(`${apiBaseUrl}/api/avatar/session/stats`, {
        method: "GET",
        headers: { "Content-Type": "application/json" }
      });

      if (!response.ok) throw new Error("Failed to get stats");

      const data = await response.json();
      setStats(data.stats);
    } catch (error) {
      console.error("Failed to get stats:", error);
    }
  }, [sessionId, apiBaseUrl]);

  // Manual expression test
  const setExpression = useCallback(
    async (expressionName) => {
      if (!sessionId) return;

      try {
        const response = await fetch(`${apiBaseUrl}/api/avatar/expression/set`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            expressionName,
            duration: 500
          })
        });

        if (!response.ok) throw new Error("Failed to set expression");

        setCurrentExpression(expressionName);
      } catch (error) {
        setError(error.message);
      }
    },
    [sessionId, apiBaseUrl]
  );

  return (
    <div className="avatar-ui-container" style={{ fontFamily: "system-ui, -apple-system, sans-serif" }}>
      <div style={{ display: "flex", gap: "20px", marginBottom: "20px" }}>
        {/* Avatar Display */}
        <div style={{ flex: 1 }}>
          <AvatarRenderer
            modelUrl={modelUrl}
            characterSpec={characterSpec}
            expressionMap={expressionMap}
            width={width}
            height={height}
            onError={(error) => setError(error.message)}
          />
        </div>

        {/* Control Panel */}
        <div
          style={{
            width: "300px",
            padding: "20px",
            background: "#1a1a1a",
            borderRadius: "12px",
            color: "#fff"
          }}
        >
          <h3>Avatar Control</h3>

          {error && (
            <div
              style={{
                padding: "10px",
                background: "#ff4444",
                borderRadius: "6px",
                marginBottom: "15px",
                fontSize: "12px"
              }}
            >
              {error}
            </div>
          )}

          <div style={{ marginBottom: "15px" }}>
            <div style={{ fontSize: "12px", color: "#888", marginBottom: "5px" }}>
              Status: {isLive ? "Live" : "Offline"}
            </div>
            {isLive && (
              <div style={{ fontSize: "11px", color: "#888" }}>
                Session: {sessionId?.slice(0, 12)}...
              </div>
            )}
          </div>

          <div style={{ marginBottom: "15px" }}>
            <div style={{ fontSize: "12px", marginBottom: "5px" }}>
              Emotion: <span style={{ color: "#00ff88" }}>{currentEmotion}</span>
            </div>
            <div style={{ fontSize: "12px" }}>
              Expression: <span style={{ color: "#00ff88" }}>{currentExpression}</span>
            </div>
          </div>

          <div style={{ marginBottom: "15px" }}>
            <div style={{ fontSize: "12px", marginBottom: "5px" }}>State:</div>
            <div style={{ fontSize: "11px", display: "flex", gap: "10px", flexWrap: "wrap" }}>
              {listeningActive && (
                <span style={{ background: "#4499ff", padding: "4px 8px", borderRadius: "4px" }}>
                  Listening
                </span>
              )}
              {speakingActive && (
                <span style={{ background: "#ff8844", padding: "4px 8px", borderRadius: "4px" }}>
                  Speaking
                </span>
              )}
              {!listeningActive && !speakingActive && (
                <span style={{ background: "#666", padding: "4px 8px", borderRadius: "4px" }}>
                  Idle
                </span>
              )}
            </div>
          </div>

          <div style={{ marginBottom: "15px" }}>
            <button
              onClick={isLive ? endSession : initializeSession}
              style={{
                width: "100%",
                padding: "10px",
                background: isLive ? "#ff4444" : "#00ff88",
                color: isLive ? "#fff" : "#000",
                border: "none",
                borderRadius: "6px",
                cursor: "pointer",
                fontWeight: "bold",
                marginBottom: "10px"
              }}
            >
              {isLive ? "End Session" : "Start Session"}
            </button>

            {isLive && (
              <>
                <button
                  onClick={() => getStats()}
                  style={{
                    width: "100%",
                    padding: "8px",
                    background: "#444",
                    color: "#fff",
                    border: "none",
                    borderRadius: "6px",
                    cursor: "pointer",
                    fontSize: "12px",
                    marginBottom: "10px"
                  }}
                >
                  Get Stats
                </button>

                <div style={{ fontSize: "11px", color: "#888" }}>
                  Expression Tests:
                </div>
                <select
                  onChange={(e) => setExpression(e.target.value)}
                  style={{
                    width: "100%",
                    padding: "6px",
                    marginTop: "5px",
                    background: "#333",
                    color: "#fff",
                    border: "1px solid #555",
                    borderRadius: "4px"
                  }}
                >
                  <option value="">Select expression...</option>
                  <option value="neutral">Neutral</option>
                  <option value="happy">Happy</option>
                  <option value="mysterious">Mysterious</option>
                  <option value="analytical">Analytical</option>
                  <option value="sad">Sad</option>
                  <option value="excited">Excited</option>
                </select>
              </>
            )}
          </div>

          {stats && (
            <div
              style={{
                fontSize: "11px",
                color: "#888",
                background: "#0a0a0a",
                padding: "10px",
                borderRadius: "6px"
              }}
            >
              <div>Conversations: {stats.conversationCount}</div>
              <div>Duration: {(stats.duration / 1000).toFixed(1)}s</div>
              <div>Listen/Speak: {(stats.listeningRatio * 100).toFixed(0)}% / {(stats.speakingRatio * 100).toFixed(0)}%</div>
            </div>
          )}
        </div>
      </div>

      {/* Transcript Display */}
      {transcript && (
        <div
          style={{
            padding: "15px",
            background: "#1a1a1a",
            borderRadius: "12px",
            color: "#fff",
            fontSize: "14px"
          }}
        >
          <div style={{ color: "#888", fontSize: "12px", marginBottom: "5px" }}>
            {speakingActive ? "Avatar Speaking" : "You said"}
          </div>
          <div>{transcript}</div>
        </div>
      )}
    </div>
  );
}
