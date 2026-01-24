import { useEffect, useMemo, useRef, useState } from "react";
import { Emotion } from "@myaika/shared";

const SERVER_URL = "http://localhost:8787";

function Stage2D({ behavior }) {
  const mood = behavior?.emotion || Emotion.NEUTRAL;
  const intensity = behavior?.intensity ?? 0.4;

  const face = useMemo(() => {
    switch (mood) {
      case Emotion.HAPPY: return "????";
      case Emotion.SHY: return "????";
      case Emotion.SAD: return "????";
      case Emotion.ANGRY: return "????";
      case Emotion.SURPRISED: return "????";
      case Emotion.SLEEPY: return "????";
      default: return "????";
    }
  }, [mood]);

  const scale = 1 + intensity * 0.15;
  const glow = Math.floor(80 + intensity * 140);

  return (
    <div style={{
      height: "100%",
      display: "grid",
      placeItems: "center",
      background: `radial-gradient(circle at 50% 40%, rgb(${glow}, ${glow}, 255), #f7f5ff 70%)`
    }}>
      <div style={{
        fontSize: 140,
        transform: `scale(${scale})`,
        transition: "transform 150ms ease",
        filter: behavior?.speaking ? "drop-shadow(0 0 14px rgba(120,120,255,0.65))" : "none"
      }}>
        {face}
      </div>
      <div style={{ position: "absolute", bottom: 18, opacity: 0.7, fontSize: 14 }}>
        2D Body Placeholder (next: Inochi2D)
      </div>
    </div>
  );
}

export default function Home() {
  const [userText, setUserText] = useState("");
  const [log, setLog] = useState([{ role: "assistant", text: "Hi. I???m Aika. Ready to become real? ????" }]);
  const [behavior, setBehavior] = useState({ emotion: Emotion.NEUTRAL, intensity: 0.35, speaking: false });
  const [micState, setMicState] = useState("idle"); // idle | listening | error | unsupported
  const [micError, setMicError] = useState("");
  const [micLevel, setMicLevel] = useState(0);
  const [micStatus, setMicStatus] = useState("Mic idle");
  const [autoSpeak, setAutoSpeak] = useState(false);
  const [ttsStatus, setTtsStatus] = useState("idle");
  const [lastAssistantText, setLastAssistantText] = useState("");
  const [ttsSettings, setTtsSettings] = useState({
    style: "brat_baddy",
    format: "wav",
    rate: 1.05,
    pitch: 0,
    energy: 1.0,
    pause: 1.1,
    voice: { reference_wav_path: "fem_aika.wav", name: "" }
  });
  const recognizerRef = useRef(null);
  const audioRef = useRef(null);
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
    setLog(l => [...l, { role: "user", text }]);
    setUserText("");

    const r = await fetch(`${SERVER_URL}/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ userText: text })
    });

    const data = await r.json();
    const reply = data.text || "(no reply)";
    const b = data.behavior || behavior;

    setBehavior({ ...b, speaking: false });
    setLog(l => [...l, { role: "assistant", text: reply }]);
    setLastAssistantText(reply);

    if (autoSpeak) {
      speak(reply);
    }
  }

  function stopAudio() {
    const audio = audioRef.current;
    if (audio) {
      audio.pause();
      audio.currentTime = 0;
    }
    if ("speechSynthesis" in window) {
      window.speechSynthesis.cancel();
    }
    setTtsStatus("idle");
    setBehavior(prev => ({ ...prev, speaking: false }));
  }

  async function speak(textToSpeak, settingsOverride) {
    const text = String(textToSpeak || "").trim();
    if (!text) return;

    try {
      stopMic();
      stopAudio();
      setTtsStatus("loading");
      const r = await fetch(`${SERVER_URL}/api/aika/voice`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text, settings: settingsOverride || ttsSettings })
      });
      const data = await r.json();
      if (!r.ok) throw new Error(data.error || "tts_failed");

      const audioUrl = `${SERVER_URL}${data.audioUrl}`;
      const audio = audioRef.current || new Audio();
      audioRef.current = audio;
      audio.src = audioUrl;
      audio.onended = () => {
        setTtsStatus("idle");
        setBehavior(prev => ({ ...prev, speaking: false }));
      };
      audio.onerror = () => {
        setTtsStatus("error");
        setBehavior(prev => ({ ...prev, speaking: false }));
      };

      setBehavior(prev => ({ ...prev, speaking: true }));
      setTtsStatus("playing");
      await audio.play();
    } catch (e) {
      setTtsStatus("error");
      if ("speechSynthesis" in window) {
        const u = new SpeechSynthesisUtterance(text);
        u.onend = () => setBehavior(prev => ({ ...prev, speaking: false }));
        window.speechSynthesis.speak(u);
      } else {
        setBehavior(prev => ({ ...prev, speaking: false }));
      }
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
    stopAudio();
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
        <Stage2D behavior={behavior} />
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
          <button
            onClick={() => speak(lastAssistantText)}
            style={{ padding: "12px 16px", borderRadius: 12 }}
            disabled={!lastAssistantText}
          >
            Speak
          </button>
        </div>
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
            Voice name (Windows SAPI)
            <input
              type="text"
              placeholder="Microsoft Zira Desktop"
              value={ttsSettings.voice.name || ""}
              onChange={(e) => setTtsSettings(s => ({ ...s, voice: { ...s.voice, name: e.target.value } }))}
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
            If using TTS_ENGINE=sapi, set a Windows voice name instead.
          </div>
          <div style={{ gridColumn: "1 / -1", fontSize: 11, color: "#6b7280" }}>
            For a more feminine voice, add a speaker WAV and set it above.
          </div>
        </div>
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
            checked={autoSpeak}
            onChange={(e) => setAutoSpeak(e.target.checked)}
          />
          Auto Speak
        </label>
        <div style={{ color: "#6b7280", fontSize: 12 }}>
          Voice: {ttsStatus}
        </div>
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
