import { useEffect, useRef, useState } from "react";
import { Emotion } from "@myaika/shared";
import AikaAvatar from "../src/components/AikaAvatar";

const SERVER_URL = "http://localhost:8790";

const THINKING_CUES = [
  "Hold on?I'm thinking.",
  "Give me a second.",
  "Hmm, let me think.",
  "Okay, thinking?",
  "One sec, love.",
  "Let me piece this together.",
  "Mmm?processing that.",
  "Stay there, I'm on it.",
  "Got it?thinking now.",
  "Hang tight.",
  "Let me check that.",
  "Alright, give me a beat.",
  "Thinking? don't rush me.",
  "Okay, okay, I'm thinking.",
  "One moment.",
  "Let me work this out.",
  "Hold still?brain running.",
  "Give me a blink.",
  "Thinking, thinking.",
  "Let me get this right."
];

function pickThinkingCue() {
  return THINKING_CUES[Math.floor(Math.random() * THINKING_CUES.length)];
}

function applyEmotionTuning(settings, behavior) {
  const mood = behavior?.emotion || "neutral";
  const intensity = Number.isFinite(behavior?.intensity) ? behavior.intensity : 0.35;
  let rate = settings.rate ?? 1.05;
  let pitch = settings.pitch ?? 0;
  let energy = settings.energy ?? 1.0;
  let pause = settings.pause ?? 1.1;

  const scale = 0.6 + intensity * 0.8;

  switch (mood) {
    case "happy":
      rate += 0.08 * scale;
      pitch += 0.6 * scale;
      energy += 0.15 * scale;
      pause -= 0.08 * scale;
      break;
    case "shy":
      rate -= 0.05 * scale;
      pitch += 0.4 * scale;
      energy -= 0.1 * scale;
      pause += 0.1 * scale;
      break;
    case "sad":
      rate -= 0.12 * scale;
      pitch -= 0.5 * scale;
      energy -= 0.2 * scale;
      pause += 0.18 * scale;
      break;
    case "angry":
      rate += 0.06 * scale;
      pitch -= 0.2 * scale;
      energy += 0.2 * scale;
      pause -= 0.05 * scale;
      break;
    case "surprised":
      rate += 0.1 * scale;
      pitch += 0.8 * scale;
      energy += 0.1 * scale;
      pause -= 0.06 * scale;
      break;
    case "sleepy":
      rate -= 0.18 * scale;
      pitch -= 0.8 * scale;
      energy -= 0.3 * scale;
      pause += 0.25 * scale;
      break;
    default:
      break;
  }

  return {
    ...settings,
    rate: Number(rate.toFixed(2)),
    pitch: Number(pitch.toFixed(2)),
    energy: Number(energy.toFixed(2)),
    pause: Number(pause.toFixed(2))
  };
}

async function unlockAudio() {
  const AudioCtx = window.AudioContext || window.webkitAudioContext;
  if (!AudioCtx) return false;
  const ctx = new AudioCtx();
  const buffer = ctx.createBuffer(1, 1, 22050);
  const source = ctx.createBufferSource();
  source.buffer = buffer;
  source.connect(ctx.destination);
  source.start(0);
  await ctx.close();
  return true;
}

async function playBlobWithAudioContext(blob) {
  const arrayBuffer = await blob.arrayBuffer();
  const AudioCtx = window.AudioContext || window.webkitAudioContext;
  if (!AudioCtx) throw new Error("audio_context_unavailable");
  const ctx = new AudioCtx();
  const buffer = await ctx.decodeAudioData(arrayBuffer.slice(0));
  const source = ctx.createBufferSource();
  source.buffer = buffer;
  source.connect(ctx.destination);
  source.start();
  return new Promise(resolve => {
    source.onended = () => {
      ctx.close();
      resolve();
    };
  });
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

export default function Home() {
  const [userText, setUserText] = useState("");
  const [log, setLog] = useState([{ role: "assistant", text: "Hi. I???m Aika. Ready to become real? ????" }]);
  const [behavior, setBehavior] = useState({ emotion: Emotion.NEUTRAL, intensity: 0.35, speaking: false });
  const [micState, setMicState] = useState("idle"); // idle | listening | error | unsupported
  const [micError, setMicError] = useState("");
  const [micLevel, setMicLevel] = useState(0);
  const [micStatus, setMicStatus] = useState("Mic idle");
  const [chatError, setChatError] = useState("");
  const [autoSpeak, setAutoSpeak] = useState(true);
  const [textOnly, setTextOnly] = useState(false);
  const [voiceMode, setVoiceMode] = useState(false);
  const [fastReplies, setFastReplies] = useState(true);
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [ttsEngineOnline, setTtsEngineOnline] = useState(null);
  const [voicePromptText, setVoicePromptText] = useState("");
  const [ttsStatus, setTtsStatus] = useState("idle");
  const [ttsError, setTtsError] = useState("");
  const [ttsWarnings, setTtsWarnings] = useState([]);
  const [audioUnlocked, setAudioUnlocked] = useState(false);
  const [pendingSpeak, setPendingSpeak] = useState(null);
  const [lastAssistantText, setLastAssistantText] = useState("");
  const [ttsSettings, setTtsSettings] = useState({
    style: "brat_baddy",
    format: "wav",
    rate: 1.05,
    pitch: 0,
    energy: 1.0,
    pause: 1.1,
    voice: { reference_wav_path: "riko_sample.wav", name: "", prompt_text: "" }
  });
  const recognizerRef = useRef(null);
  const audioRef = useRef(null);
  const prefTimerRef = useRef(null);
  const lastPrefRef = useRef("");
  const promptTimerRef = useRef(null);
  const inputRef = useRef(null);
  const mediaStreamRef = useRef(null);
  const audioCtxRef = useRef(null);
  const analyserRef = useRef(null);
  const rafRef = useRef(null);
  const silenceTimerRef = useRef(null);
  const latestTranscriptRef = useRef("");

  async function send(overrideText) {
    const raw = typeof overrideText === "string" ? overrideText : userText;
    const text = raw.trim();
    if (!text) return;

    stopMic();
    if (voiceMode && autoSpeak && !textOnly) {
      speak(pickThinkingCue(), { ...ttsSettings, style: "brat_soft" });
    }
    setLog(l => [...l, { role: "user", text }]);
    setUserText("");

    setChatError("");
    let r;
    try {
      r = await fetch(`${SERVER_URL}/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userText: text, maxOutputTokens: fastReplies ? 140 : 260 })
      });
    } catch (err) {
      setChatError("chat_unreachable");
      setLog(l => [...l, { role: "assistant", text: "(no reply)" }]);
      return;
    }

    let data = {};
    try {
      data = await r.json();
    } catch {
      data = {};
    }
    if (!r.ok) {
      const detail = data.detail ? ` (${data.detail})` : "";
      setChatError(`${data.error || "chat_failed"}${detail}`);
    }
    const reply = data.text || "";
    if (!reply) {
      setChatError(data.error || "empty_reply");
    }
    const b = data.behavior || behavior;

    setBehavior({ ...b, speaking: false });
    setLog(l => [...l, { role: "assistant", text: reply || "(no reply)" }]);
    setLastAssistantText(reply);

    if (autoSpeak && !textOnly && reply) {
      speak(reply);
    }
  }

  async function stopAudio(fadeMs = 160) {
    const audio = audioRef.current;
    if (audio) {
      const start = Number.isFinite(audio.volume) ? audio.volume : 1;
      const steps = 6;
      const stepMs = Math.max(20, Math.floor(fadeMs / steps));
      for (let i = 1; i <= steps; i++) {
        audio.volume = Math.max(0, start * (1 - i / steps));
        await sleep(stepMs);
      }
      audio.pause();
      audio.currentTime = 0;
      audio.volume = start;
    }
    if ("speechSynthesis" in window) {
      window.speechSynthesis.cancel();
    }
    setTtsStatus("idle");
    setBehavior(prev => ({ ...prev, speaking: false }));
  }

  async function testVoice() {
    try {
      if (!audioUnlocked) {
        setTtsError("audio_locked_click_enable");
        return;
      }
      await stopAudio();
      setTtsError("");
      setTtsStatus("loading");
      const r = await fetch(`${SERVER_URL}/api/aika/voice/inline`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          text: "Testing Aika Voice. If you hear this, audio output is working.",
          settings: applyEmotionTuning(ttsSettings, behavior)
        })
      });
      if (!r.ok) {
        let errText = "voice_test_failed";
        try {
          const data = await r.json();
          errText = data.error || errText;
        } catch {
          errText = await r.text();
        }
        throw new Error(errText || "voice_test_failed");
      }

      const warningsHeader = r.headers.get("x-tts-warnings");
      if (warningsHeader) {
        setTtsWarnings(warningsHeader.split(",").map(s => s.trim()).filter(Boolean));
      }
      const blob = await r.blob();
      if (!blob || blob.size < 64) throw new Error("audio_blob_invalid");

      const objectUrl = URL.createObjectURL(blob);
      const audio = audioRef.current || new Audio();
      audioRef.current = audio;
      audio.src = objectUrl;
      audio.preload = "auto";
      audio.volume = 1;
      audio.onended = () => {
        URL.revokeObjectURL(objectUrl);
        setTtsStatus("idle");
        setBehavior(prev => ({ ...prev, speaking: false }));
        if (voiceMode && !textOnly) {
          setTimeout(() => startMic(), 200);
        }
      };
      audio.onerror = async () => {
        URL.revokeObjectURL(objectUrl);
        try {
          setTtsStatus("playing");
          await playBlobWithAudioContext(blob);
          setTtsStatus("idle");
          setBehavior(prev => ({ ...prev, speaking: false }));
          if (voiceMode && !textOnly) {
            setTimeout(() => startMic(), 200);
          }
        } catch (e) {
          setTtsStatus("error");
          setTtsError(e?.message || "audio_play_failed");
          setBehavior(prev => ({ ...prev, speaking: false }));
        }
      };

      setBehavior(prev => ({ ...prev, speaking: true }));
      setTtsStatus("playing");
      try {
        try {
        await audio.play();
      } catch (e) {
        await audio.onerror();
      }
      } catch (e) {
        await audio.onerror();
      }
    } catch (e) {
      setTtsStatus("error");
      setTtsError(e?.message || "voice_test_failed");
    }
  }

  async function speak(textToSpeak, settingsOverride) {
    if (textOnly) return;
    if (!audioUnlocked) {
      setPendingSpeak({ text: textToSpeak, settings: settingsOverride });
      setTtsError("audio_locked_click_enable");
      return;
    }
    const text = String(textToSpeak || "").trim();
    if (!text) return;

    try {
      stopMic();
      await stopAudio();
      setTtsError("");
      setTtsStatus("loading");
      const r = await fetch(`${SERVER_URL}/api/aika/voice/inline`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text, settings: applyEmotionTuning(settingsOverride || ttsSettings, behavior) })
      });
      if (!r.ok) {
        let errText = "tts_failed";
        try {
          const data = await r.json();
          errText = data.error || errText;
        } catch {
          errText = await r.text();
        }
        setTtsError(errText || "tts_failed");
        throw new Error(errText || "tts_failed");
      }

      const warningsHeader = r.headers.get("x-tts-warnings");
      if (warningsHeader) {
        setTtsWarnings(warningsHeader.split(",").map(s => s.trim()).filter(Boolean));
      }
      const blob = await r.blob();
      if (!blob || blob.size < 64) throw new Error("audio_blob_invalid");

      const objectUrl = URL.createObjectURL(blob);
      const audio = audioRef.current || new Audio();
      audioRef.current = audio;
      audio.src = objectUrl;
      audio.preload = "auto";
      audio.volume = 1;
      audio.onended = () => {
        URL.revokeObjectURL(objectUrl);
        setTtsStatus("idle");
        setBehavior(prev => ({ ...prev, speaking: false }));
        if (voiceMode && !textOnly) {
          setTimeout(() => startMic(), 200);
        }
      };
      audio.onerror = async () => {
        URL.revokeObjectURL(objectUrl);
        try {
          setTtsStatus("playing");
          await playBlobWithAudioContext(blob);
          setTtsStatus("idle");
          setBehavior(prev => ({ ...prev, speaking: false }));
          if (voiceMode && !textOnly) {
            setTimeout(() => startMic(), 200);
          }
        } catch (e) {
          setTtsStatus("error");
          setTtsError(e?.message || "audio_play_failed");
          setBehavior(prev => ({ ...prev, speaking: false }));
        }
      };

      setBehavior(prev => ({ ...prev, speaking: true }));
      setTtsStatus("playing");
      try {
        await audio.play();
      } catch (e) {
        await audio.onerror();
      }
    } catch (e) {
      setTtsStatus("error");
      setTtsError(e?.message || "tts_failed");
      setBehavior(prev => ({ ...prev, speaking: false }));
    }
  }

  function ensureRecognizer() {
    if (recognizerRef.current) return recognizerRef.current;

    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognition) {
      setMicState("unsupported");
      setMicError("Speech recognition not supported in this browser.");
      return null;
    }

    const r = new SpeechRecognition();
    r.lang = "en-US";
    r.continuous = true;
    r.interimResults = true;

    r.onstart = () => {
      console.log("[mic] recognition start");
      setMicState("listening");
      setMicError("");
      setMicStatus("Listening? speak now");
    };

    r.onerror = (e) => {
      console.log("[mic] recognition error", e);
      setMicState("error");
      setMicError(e?.error || "Microphone error.");
      setMicStatus("Mic error");
      stopLevelMeter();
    };

    r.onend = () => {
      console.log("[mic] recognition end");
      setMicState("idle");
      setMicStatus("Mic idle");
      if (silenceTimerRef.current) {
        clearTimeout(silenceTimerRef.current);
        silenceTimerRef.current = null;
      }
      stopLevelMeter();
    };

    r.onresult = (e) => {
      let interim = "";
      let finalText = "";
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const res = e.results[i];
        if (res.isFinal) finalText += res[0].transcript;
        else interim += res[0].transcript;
      }
      const combined = `${finalText}${interim}`.trim();
      setMicStatus(combined ? `Heard: ${combined}` : "Listening?");
      if (combined) {
        latestTranscriptRef.current = combined;
        setUserText(combined);
      }

      if (silenceTimerRef.current) clearTimeout(silenceTimerRef.current);
      silenceTimerRef.current = setTimeout(() => {
        const toSend = latestTranscriptRef.current.trim();
        if (toSend) {
          setMicStatus(`Sending: ${toSend}`);
          latestTranscriptRef.current = "";
          setUserText("");
          send(toSend);
        }
      }, 2000);
    };

    recognizerRef.current = r;
    return r;
  }

  async function startLevelMeter() {
    try {
      if (mediaStreamRef.current) return;
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      mediaStreamRef.current = stream;

      const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
      audioCtxRef.current = audioCtx;

      const source = audioCtx.createMediaStreamSource(stream);
      const analyser = audioCtx.createAnalyser();
      analyser.fftSize = 512;
      analyserRef.current = analyser;
      source.connect(analyser);

      const data = new Uint8Array(analyser.fftSize);
      const tick = () => {
        analyser.getByteTimeDomainData(data);
        let sum = 0;
        for (let i = 0; i < data.length; i++) {
          const v = (data[i] - 128) / 128;
          sum += v * v;
        }
        const rms = Math.sqrt(sum / data.length);
        setMicLevel(Math.min(1, rms * 2.2));
        rafRef.current = requestAnimationFrame(tick);
      };
      tick();
    } catch (e) {
      setMicState("error");
      setMicError(e?.message || "Microphone error.");
    }
  }

  function stopLevelMeter() {
    if (rafRef.current) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    }
    if (mediaStreamRef.current) {
      mediaStreamRef.current.getTracks().forEach(t => t.stop());
      mediaStreamRef.current = null;
    }
    if (audioCtxRef.current) {
      audioCtxRef.current.close();
      audioCtxRef.current = null;
    }
    analyserRef.current = null;
    setMicLevel(0);
  }

  async function startMic() {
    const r = ensureRecognizer();
    if (!r) return;
    await stopAudio(200);
    await sleep(120);
    await startLevelMeter();
    r.start();
  }

  function stopMic() {
    const r = ensureRecognizer();
    if (r) r.stop();
    if (silenceTimerRef.current) {
      clearTimeout(silenceTimerRef.current);
      silenceTimerRef.current = null;
    }
    stopLevelMeter();
  }

  function toggleMic() {
    if (micState === "listening") stopMic();
    else startMic();
  }

  useEffect(() => {
    if (!audioUnlocked || !pendingSpeak) return;
    const { text, settings } = pendingSpeak;
    setPendingSpeak(null);
    speak(text, settings);
  }, [audioUnlocked, pendingSpeak]);

  useEffect(() => {
    async function checkTtsEngine() {
      try {
        const r = await fetch(`${SERVER_URL}/api/aika/tts/health`);
        const data = await r.json();
        if (data?.engine === "gptsovits") {
          setTtsEngineOnline(Boolean(data.online));
        } else if (data?.engine) {
          setTtsEngineOnline(false);
        } else {
          setTtsEngineOnline(null);
        }
      } catch {
        setTtsEngineOnline(null);
      }
    }
    checkTtsEngine();
    const id = setInterval(checkTtsEngine, 5000);
    return () => clearInterval(id);
  }, []);

  useEffect(() => {
    async function loadConfig() {
      try {
        const r = await fetch(`${SERVER_URL}/api/aika/config`);
        const cfg = await r.json();
        if (cfg?.voice?.default_reference_wav) {
          setTtsSettings(s => ({ ...s, voice: { ...s.voice, reference_wav_path: cfg.voice.default_reference_wav } }));
        }
        if (cfg?.voice?.prompt_text) {
          setVoicePromptText(cfg.voice.prompt_text);
          setTtsSettings(s => ({ ...s, voice: { ...s.voice, prompt_text: cfg.voice.prompt_text } }));
        }
      } catch {
        // ignore
      }
    }
    loadConfig();
  }, []);


  useEffect(() => {
    const ref = ttsSettings.voice?.reference_wav_path || "";
    const key = ref ? `ref:${ref}` : "";
    if (!key || key === lastPrefRef.current) return;

    if (prefTimerRef.current) clearTimeout(prefTimerRef.current);
    prefTimerRef.current = setTimeout(async () => {
      try {
        await fetch(`${SERVER_URL}/api/aika/voice/preference`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ reference_wav_path: ref })
        });
        lastPrefRef.current = key;
      } catch {
        // ignore
      }
    }, 600);
  }, [ttsSettings.voice?.reference_wav_path]);

  useEffect(() => {
    if (!voicePromptText) return;
    if (promptTimerRef.current) clearTimeout(promptTimerRef.current);
    promptTimerRef.current = setTimeout(async () => {
      try {
        await fetch(`${SERVER_URL}/api/aika/voice/prompt`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ prompt_text: voicePromptText })
        });
      } catch {
        // ignore
      }
    }, 800);
  }, [voicePromptText]);

  useEffect(() => {
    function onKeyDown(e) {
      if (e.code !== "Space" || e.repeat) return;
      const tag = e.target?.tagName?.toLowerCase();
      if (tag === "input" || tag === "textarea" || e.target?.isContentEditable) return;
      e.preventDefault();
      toggleMic();
    }

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [micState]);

  return (
    <div style={{ display: "grid", gridTemplateColumns: "1.15fr 0.85fr", height: "100vh" }}>
      <div style={{ position: "relative" }}>
        <AikaAvatar
          mood={behavior?.emotion || Emotion.NEUTRAL}
          isTalking={behavior?.speaking}
          talkIntensity={behavior?.intensity ?? 0.35}
          isListening={micState === "listening"}
        />
      </div>

      <div style={{ padding: 16, display: "flex", flexDirection: "column", gap: 12 }}>
        <div style={{ flex: 1, overflow: "auto", border: "1px solid #ddd", borderRadius: 14, padding: 12, background: "white" }}>
          {log.map((m, i) => (
            <div key={i} style={{ marginBottom: 10 }}>
              <b>{m.role === "user" ? "You" : "Aika"}:</b> {m.text}
            </div>
          ))}
        </div>

        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          <input
            ref={inputRef}
            value={userText}
            onChange={(e) => setUserText(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && send()}
            placeholder="Say something???"
            style={{ flex: 1, padding: 12, borderRadius: 12, border: "1px solid #ccc" }}
          />
          <div style={{
            width: 10,
            height: 36,
            borderRadius: 8,
            background: "#eef2ff",
            border: "1px solid #c7d2fe",
            display: "flex",
            alignItems: "flex-end",
            padding: 2
          }}>
            <div style={{
              width: "100%",
              height: `${Math.max(0.08, micLevel) * 100}%`,
              borderRadius: 6,
              background: micState === "listening" ? "#4f46e5" : "#9ca3af",
              transition: "height 60ms linear"
            }} />
          </div>

          <div style={{
            display: "flex",
            alignItems: "center",
            gap: 6,
            padding: "6px 10px",
            borderRadius: 999,
            border: "1px solid #ddd",
            background: micState === "listening" ? "#ecfdf3" : "#f3f4f6",
            color: micState === "listening" ? "#047857" : "#6b7280",
            fontSize: 12
          }}>
            <span style={{
              width: 8,
              height: 8,
              borderRadius: "50%",
              background: micState === "listening" ? "#10b981" : "#9ca3af",
              display: "inline-block"
            }} />
            {micState === "listening" ? "Mic active" : "Mic idle"}
          </div>
          <button
            onClick={toggleMic}
            style={{
              padding: "12px 16px",
              borderRadius: 12,
              border: micState === "listening" ? "2px solid #2b6cb0" : "1px solid #ccc",
              background: micState === "listening" ? "#e6f0ff" : "white"
            }}
            title={micState === "listening" ? "Stop listening (Space)" : "Start listening (Space)"}
          >
            {micState === "listening" ? "Listening???" : "Mic"}
          </button>
          <button onClick={() => send()} style={{ padding: "12px 16px", borderRadius: 12 }}>
            Send
          </button>
        </div>
        {showAdvanced && (
        <div style={{
          display: "grid",
          gridTemplateColumns: "repeat(2, minmax(0, 1fr))",
          gap: 8,
          padding: 10,
          border: "1px solid #e5e7eb",
          borderRadius: 10,
          background: "#fafafa"
        }}>
          <div style={{ gridColumn: "1 / -1", fontSize: 12, fontWeight: 600, color: "#374151" }}>
            Aika Voice Settings
          </div>
          <label style={{ display: "flex", flexDirection: "column", gap: 4, fontSize: 12, color: "#374151", gridColumn: "1 / -1" }}>
            Voice prompt text
            <textarea
              rows={3}
              value={voicePromptText}
              onChange={(e) => {
                setVoicePromptText(e.target.value);
                setTtsSettings(s => ({ ...s, voice: { ...s.voice, prompt_text: e.target.value } }));
              }}
              placeholder="Describe Aika's voice/persona..."
              style={{ padding: 6, borderRadius: 6, border: "1px solid #d1d5db" }}
            />
          </label>
          <div style={{ gridColumn: "1 / -1", display: "flex", gap: 8 }}>
            <button
              onClick={testVoice}
              style={{ padding: "8px 12px", borderRadius: 8 }}
            >
              Test Voice
            </button>
            <button
              onClick={() => speak(lastAssistantText)}
              style={{ padding: "8px 12px", borderRadius: 8 }}
              disabled={!lastAssistantText}
            >
              Manual Speak
            </button>
          </div>
          <label style={{ display: "flex", flexDirection: "column", gap: 4, fontSize: 12, color: "#374151" }}>
            Style
            <select
              value={ttsSettings.style}
              onChange={(e) => setTtsSettings(s => ({ ...s, style: e.target.value }))}
              style={{ padding: 6, borderRadius: 6, border: "1px solid #d1d5db" }}
            >
              <option value="brat_baddy">brat_baddy</option>
              <option value="brat_soft">brat_soft</option>
              <option value="brat_firm">brat_firm</option>
            </select>
          </label>
          <label style={{ display: "flex", flexDirection: "column", gap: 4, fontSize: 12, color: "#374151" }}>
            Format
            <select
              value={ttsSettings.format}
              onChange={(e) => setTtsSettings(s => ({ ...s, format: e.target.value }))}
              style={{ padding: 6, borderRadius: 6, border: "1px solid #d1d5db" }}
            >
              <option value="wav">wav</option>
              <option value="mp3">mp3</option>
            </select>
          </label>
          <label style={{ display: "flex", flexDirection: "column", gap: 4, fontSize: 12, color: "#374151" }}>
            Rate
            <input
              type="number"
              step="0.05"
              min="0.8"
              max="1.3"
              value={ttsSettings.rate}
              onChange={(e) => setTtsSettings(s => ({ ...s, rate: Number(e.target.value) }))}
              style={{ padding: 6, borderRadius: 6, border: "1px solid #d1d5db" }}
            />
          </label>
          <label style={{ display: "flex", flexDirection: "column", gap: 4, fontSize: 12, color: "#374151" }}>
            Pitch
            <input
              type="number"
              step="0.5"
              min="-5"
              max="5"
              value={ttsSettings.pitch}
              onChange={(e) => setTtsSettings(s => ({ ...s, pitch: Number(e.target.value) }))}
              style={{ padding: 6, borderRadius: 6, border: "1px solid #d1d5db" }}
            />
          </label>
          <label style={{ display: "flex", flexDirection: "column", gap: 4, fontSize: 12, color: "#374151" }}>
            Energy
            <input
              type="number"
              step="0.1"
              min="0.5"
              max="1.5"
              value={ttsSettings.energy}
              onChange={(e) => setTtsSettings(s => ({ ...s, energy: Number(e.target.value) }))}
              style={{ padding: 6, borderRadius: 6, border: "1px solid #d1d5db" }}
            />
          </label>
          <label style={{ display: "flex", flexDirection: "column", gap: 4, fontSize: 12, color: "#374151" }}>
            Pause
            <input
              type="number"
              step="0.1"
              min="0.8"
              max="1.8"
              value={ttsSettings.pause}
              onChange={(e) => setTtsSettings(s => ({ ...s, pause: Number(e.target.value) }))}
              style={{ padding: 6, borderRadius: 6, border: "1px solid #d1d5db" }}
            />
          </label>
          <label style={{ display: "flex", flexDirection: "column", gap: 4, fontSize: 12, color: "#374151" }}>
            Reference WAV (apps/server/voices)
            <input
              type="text"
              placeholder="example.wav"
              value={ttsSettings.voice.reference_wav_path}
              onChange={(e) => setTtsSettings(s => ({ ...s, voice: { reference_wav_path: e.target.value } }))}
              style={{ padding: 6, borderRadius: 6, border: "1px solid #d1d5db" }}
            />
          </label>
          <div style={{ gridColumn: "1 / -1", fontSize: 11, color: "#6b7280" }}>
            Reference file must be inside apps/server/voices. Leave blank for default voice.
          </div>
          <div style={{ gridColumn: "1 / -1", fontSize: 11, color: "#6b7280" }}>
            For a more feminine voice, add a speaker WAV and set it above.
          </div>
        </div>
        )}
        {micState === "unsupported" && (
          <div style={{ color: "#b45309", fontSize: 12 }}>
            Mic not supported in this browser. Try Chrome/Edge.
          </div>
        )}
        {micState === "error" && (
          <div style={{ color: "#b91c1c", fontSize: 12 }}>
            Mic error: {micError}
          </div>
        )}
        <div style={{ color: "#374151", fontSize: 12 }}>
          {micStatus}
        </div>
        <label style={{ display: "flex", gap: 8, alignItems: "center", fontSize: 12, color: "#374151" }}>
          <input
            type="checkbox"
            checked={voiceMode}
            onChange={(e) => {
              const v = e.target.checked;
              setVoiceMode(v);
              if (v) {
                setAutoSpeak(true);
                setTextOnly(false);
                startMic();
              } else {
                stopMic();
              }
            }}
          />
          Voice Mode (listen + auto speak)
        </label>
        <label style={{ display: "flex", gap: 8, alignItems: "center", fontSize: 12, color: "#374151" }}>
          <input
            type="checkbox"
            checked={autoSpeak}
            onChange={(e) => {
              const v = e.target.checked;
              setAutoSpeak(v);
              if (v) setTextOnly(false);
            }}
          />
          Auto Speak
        </label>
        <label style={{ display: "flex", gap: 8, alignItems: "center", fontSize: 12, color: "#374151" }}>
          <input
            type="checkbox"
            checked={fastReplies}
            onChange={(e) => setFastReplies(e.target.checked)}
          />
          Fast replies (shorter, quicker)
        </label>
        <label style={{ display: "flex", gap: 8, alignItems: "center", fontSize: 12, color: "#374151" }}>
          <input
            type="checkbox"
            checked={textOnly}
            onChange={(e) => {
              const v = e.target.checked;
              setTextOnly(v);
              if (v) setAutoSpeak(false);
            }}
          />
          Text only (no voice)
        </label>
        <div style={{ color: "#6b7280", fontSize: 12 }}>
          Voice: {ttsStatus}
        </div>
        <div style={{ color: "#6b7280", fontSize: 12 }}>{ttsEngineOnline === true ? "GPT-SoVITS: online" : ttsEngineOnline === false ? "GPT-SoVITS: offline" : "GPT-SoVITS: unknown"}</div>
        <button
          onClick={async () => {
            const ok = await unlockAudio();
            setAudioUnlocked(Boolean(ok));
            if (ok) setTtsError("");
          }}
          style={{ padding: "6px 10px", borderRadius: 8, width: "fit-content" }}
        >
          {audioUnlocked ? "Audio Enabled" : "Enable Audio"}
        </button>
        {ttsError && (
          <div style={{ color: "#b91c1c", fontSize: 12 }}>
            TTS error: {ttsError}
          </div>
        )}
        {chatError && (
          <div style={{ color: "#b91c1c", fontSize: 12 }}>
            Chat error: {chatError}
          </div>
        )}
        {ttsWarnings.length > 0 && (
          <div style={{ color: "#92400e", fontSize: 12 }}>
            TTS warnings: {ttsWarnings.join(", ")}
          </div>
        )}
        {micState === "idle" && (
          <div style={{ color: "#1f2937", fontSize: 12, fontWeight: 600 }}>
            Click Mic to continue
          </div>
        )}
        <div style={{ color: "#6b7280", fontSize: 12 }}>
          Hotkey: Space (when not typing)
        </div>
      </div>
    </div>
  );
}
