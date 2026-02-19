import Head from "next/head";
import { useEffect, useRef, useState } from "react";

function resolveServerUrl() {
  if (process.env.NEXT_PUBLIC_SERVER_URL) return process.env.NEXT_PUBLIC_SERVER_URL;
  return "";
}

const SERVER_URL = resolveServerUrl();
const SILENCE_MS = 1200;
const MAX_BUFFER_CHUNKS = 70;
const MIN_BLOB_BYTES = 800;

const DEFAULT_TTS_SETTINGS = {
  style: "brat_baddy",
  format: "wav",
  rate: 1.05,
  pitch: 0,
  energy: 1.0,
  pause: 1.1,
  engine: "",
  voice: { reference_wav_path: "", name: "", prompt_text: "" }
};

function isLowSignalUtterance(text) {
  const normalized = String(text || "").toLowerCase().trim();
  if (!normalized) return true;
  const words = normalized.split(/\s+/).filter(Boolean);
  const filler = new Set(["you", "yeah", "yep", "yup", "uh", "um", "hmm", "huh", "sigh", "ah", "oh"]);
  if (words.length === 1 && filler.has(words[0])) return true;
  if (words.length < 2 && normalized.length < 10) return true;
  return false;
}

function getMicUnavailableReason() {
  if (typeof window === "undefined") return "Microphone unavailable.";
  if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) return "Microphone API unavailable.";
  const isLocalhost = ["localhost", "127.0.0.1"].includes(window.location.hostname);
  if (window.location.protocol !== "https:" && !isLocalhost) {
    return "Microphone requires HTTPS.";
  }
  return "";
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

export default function TelegramCall() {
  const [mounted, setMounted] = useState(false);
  const [callActive, setCallActive] = useState(false);
  const [callStatus, setCallStatus] = useState("idle");
  const [micError, setMicError] = useState("");
  const [threadId, setThreadId] = useState("");
  const [lastUserText, setLastUserText] = useState("");
  const [lastAssistantText, setLastAssistantText] = useState("");
  const [micLevel, setMicLevel] = useState(0);
  const [muted, setMuted] = useState(false);
  const [outputMuted, setOutputMuted] = useState(false);
  const [audioUnlocked, setAudioUnlocked] = useState(false);
  const [ttsSettings, setTtsSettings] = useState(DEFAULT_TTS_SETTINGS);
  const [manualInput, setManualInput] = useState("");

  const callActiveRef = useRef(false);
  const metaRef = useRef({ channel: "telegram", senderId: "", senderName: "", chatId: "" });
  const streamRef = useRef(null);
  const recorderRef = useRef(null);
  const analyserRef = useRef(null);
  const audioCtxRef = useRef(null);
  const rafRef = useRef(null);
  const rmsRef = useRef(0);
  const noiseFloorRef = useRef(0.01);
  const thresholdRef = useRef(0.02);
  const lastSpeechRef = useRef(0);
  const speechActiveRef = useRef(false);
  const requestInFlightRef = useRef(false);
  const sttBufferRef = useRef([]);
  const sttInitChunkRef = useRef(null);
  const mimeTypeRef = useRef("");
  const audioRef = useRef(null);
  const ttsActiveRef = useRef(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const params = new URLSearchParams(window.location.search);
    metaRef.current = {
      channel: params.get("channel") || "telegram",
      senderId: params.get("senderId") || "",
      senderName: params.get("senderName") || "",
      chatId: params.get("chatId") || ""
    };
  }, []);

  useEffect(() => {
    const loadConfig = async () => {
      try {
        const r = await fetch(`${SERVER_URL}/api/aika/config`);
        const data = await r.json().catch(() => ({}));
        if (data?.voice?.default_reference_wav) {
          setTtsSettings(s => ({
            ...s,
            voice: {
              ...s.voice,
              reference_wav_path: data.voice.default_reference_wav
            }
          }));
        }
        if (data?.voice?.prompt_text) {
          setTtsSettings(s => ({
            ...s,
            voice: {
              ...s.voice,
              prompt_text: data.voice.prompt_text
            }
          }));
        }
      } catch {
        // ignore config load failures
      }
    };
    loadConfig();
  }, []);

  useEffect(() => {
    return () => {
      stopCall().catch(() => {});
    };
  }, []);

  function stopLevelMeter() {
    if (rafRef.current) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    }
    if (audioCtxRef.current) {
      audioCtxRef.current.close().catch(() => {});
      audioCtxRef.current = null;
    }
    analyserRef.current = null;
    setMicLevel(0);
  }

  async function startLevelMeter(stream) {
    const AudioCtx = window.AudioContext || window.webkitAudioContext;
    if (!AudioCtx) return;
    const audioCtx = new AudioCtx();
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
      rmsRef.current = rms;
      noiseFloorRef.current = noiseFloorRef.current * 0.96 + rms * 0.04;
      thresholdRef.current = Math.max(0.006, Math.min(0.05, noiseFloorRef.current * 1.8));
      if (rms > thresholdRef.current) lastSpeechRef.current = Date.now();
      setMicLevel(Math.min(1, rms * 2.2));
      if (ttsActiveRef.current && audioRef.current) {
        const duck = rms > thresholdRef.current;
        audioRef.current.volume = duck ? 0.25 : 1;
      }
      rafRef.current = requestAnimationFrame(tick);
    };
    tick();
  }

  function stopAudio() {
    const audio = audioRef.current;
    if (audio) {
      try {
        audio.pause();
        audio.currentTime = 0;
      } catch {}
    }
    ttsActiveRef.current = false;
  }

  async function speak(text) {
    const cleaned = String(text || "").trim();
    if (!cleaned) return;
    if (outputMuted) {
      setCallStatus("listening");
      return;
    }
    if (!audioUnlocked) {
      const ok = await unlockAudio();
      setAudioUnlocked(ok);
      if (!ok) {
        setCallStatus("listening");
        return;
      }
    }
    stopAudio();
    setCallStatus("speaking");
    ttsActiveRef.current = true;
    try {
      const r = await fetch(`${SERVER_URL}/api/aika/voice/inline`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          text: cleaned,
          settings: { ...ttsSettings, fast: true, use_raw_text: true }
        })
      });
      if (!r.ok) {
        setCallStatus("listening");
        ttsActiveRef.current = false;
        return;
      }
      const blob = await r.blob();
      if (!blob || blob.size < 64) {
        setCallStatus("listening");
        ttsActiveRef.current = false;
        return;
      }
      const objectUrl = URL.createObjectURL(blob);
      const audio = audioRef.current || new Audio();
      audioRef.current = audio;
      audio.src = objectUrl;
      audio.preload = "auto";
      audio.volume = 1;
      audio.onended = () => {
        URL.revokeObjectURL(objectUrl);
        ttsActiveRef.current = false;
        setCallStatus("listening");
      };
      audio.onerror = () => {
        URL.revokeObjectURL(objectUrl);
        ttsActiveRef.current = false;
        setCallStatus("listening");
      };
      await audio.play().catch(() => audio.onerror());
    } catch {
      ttsActiveRef.current = false;
      setCallStatus("listening");
    }
  }

  async function sendToChat(text) {
    const cleaned = String(text || "").trim();
    if (!cleaned) return;
    setLastUserText(cleaned);
    setCallStatus("thinking");
    const payload = {
      userText: cleaned,
      threadId: threadId || null,
      channel: metaRef.current.channel || "call",
      senderId: metaRef.current.senderId || "caller",
      senderName: metaRef.current.senderName || "Caller"
    };
    try {
      const r = await fetch(`${SERVER_URL}/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
      });
      const data = await r.json().catch(() => ({}));
      if (data?.text) {
        setLastAssistantText(String(data.text || "").trim());
        await speak(data.text);
      } else {
        setCallStatus("listening");
      }
    } catch {
      setCallStatus("listening");
    }
  }

  async function sendBufferedUtterance() {
    if (requestInFlightRef.current) return;
    const parts = sttBufferRef.current;
    if (!parts || !parts.length) return;
    const initChunk = sttInitChunkRef.current;
    const payloadParts =
      initChunk && parts[0] !== initChunk
        ? [initChunk, ...parts]
        : parts;
    const utteranceBlob = new Blob(payloadParts, { type: mimeTypeRef.current || "audio/webm" });
    sttBufferRef.current = [];
    lastSpeechRef.current = 0;
    speechActiveRef.current = false;
    if (!utteranceBlob || utteranceBlob.size < MIN_BLOB_BYTES) return;
    requestInFlightRef.current = true;
    try {
      const form = new FormData();
      const ext = mimeTypeRef.current.includes("ogg") ? "ogg" : "webm";
      form.append("audio", utteranceBlob, `call-${Date.now()}.${ext}`);
      const r = await fetch(`${SERVER_URL}/api/stt/transcribe`, { method: "POST", body: form });
      const data = await r.json().catch(() => ({}));
      if (!r.ok) return;
      const text = String(data?.text || "").trim();
      if (!text || isLowSignalUtterance(text)) return;
      await sendToChat(text);
    } catch {
      // ignore
    } finally {
      requestInFlightRef.current = false;
    }
  }

  async function startRecorder() {
    const micReason = getMicUnavailableReason();
    if (micReason) {
      setMicError(micReason);
      return;
    }
    const stream = await navigator.mediaDevices.getUserMedia({
      audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true }
    });
    streamRef.current = stream;
    await startLevelMeter(stream);
    const mimeType = MediaRecorder.isTypeSupported("audio/webm")
      ? "audio/webm"
      : MediaRecorder.isTypeSupported("audio/ogg")
        ? "audio/ogg"
        : "";
    if (!mimeType) {
      setMicError("Audio format unsupported.");
      return;
    }
    mimeTypeRef.current = mimeType;
    const recorder = new MediaRecorder(stream, mimeType ? { mimeType } : undefined);
    recorderRef.current = recorder;
    recorder.onerror = () => {
      setMicError("Recorder error.");
      setCallStatus("idle");
    };
    recorder.ondataavailable = async (evt) => {
      if (!callActiveRef.current || muted) return;
      if (!evt.data || evt.data.size < 256) return;
      if (!sttInitChunkRef.current) sttInitChunkRef.current = evt.data;
      sttBufferRef.current.push(evt.data);
      if (sttBufferRef.current.length > MAX_BUFFER_CHUNKS) {
        sttBufferRef.current.shift();
      }
      if (rmsRef.current > thresholdRef.current) {
        speechActiveRef.current = true;
        lastSpeechRef.current = Date.now();
      }
      const now = Date.now();
      const quietFor = lastSpeechRef.current ? now - lastSpeechRef.current : 0;
      if (speechActiveRef.current && quietFor >= SILENCE_MS) {
        await sendBufferedUtterance();
      }
    };
    recorder.onstop = () => {
      if (streamRef.current) {
        streamRef.current.getTracks().forEach(t => t.stop());
        streamRef.current = null;
      }
      setCallStatus("idle");
    };
    recorder.start(400);
    setCallStatus("listening");
  }

  async function ensureThread() {
    if (threadId) return threadId;
    const payload = {
      channel: metaRef.current.channel || "call",
      senderId: metaRef.current.senderId || "caller",
      senderName: metaRef.current.senderName || "Caller",
      chatId: metaRef.current.chatId || "call",
      ragModel: "auto"
    };
    const r = await fetch(`${SERVER_URL}/api/call/start`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    });
    const data = await r.json().catch(() => ({}));
    if (data?.threadId) {
      setThreadId(data.threadId);
      return data.threadId;
    }
    throw new Error("thread_start_failed");
  }

  async function startCall() {
    if (callActiveRef.current) return;
    setMicError("");
    const ok = await unlockAudio();
    setAudioUnlocked(ok);
    callActiveRef.current = true;
    setCallActive(true);
    try {
      await ensureThread();
      await startRecorder();
    } catch (err) {
      setMicError(err?.message || "call_start_failed");
      callActiveRef.current = false;
      setCallActive(false);
      stopLevelMeter();
    }
  }

  async function stopCall() {
    callActiveRef.current = false;
    setCallActive(false);
    stopAudio();
    if (recorderRef.current) {
      try { recorderRef.current.stop(); } catch {}
      recorderRef.current = null;
    }
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(t => t.stop());
      streamRef.current = null;
    }
    stopLevelMeter();
    sttBufferRef.current = [];
    sttInitChunkRef.current = null;
    speechActiveRef.current = false;
    lastSpeechRef.current = 0;
    requestInFlightRef.current = false;
    setCallStatus("idle");
    if (threadId) {
      try {
        await fetch(`${SERVER_URL}/api/call/stop`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ threadId })
        });
      } catch {
        // ignore
      }
    }
  }

  async function handleManualSubmit(e) {
    e.preventDefault();
    const text = manualInput.trim();
    if (!text) return;
    setManualInput("");
    await sendToChat(text);
  }

  if (!mounted) {
    return <div style={{ minHeight: "100vh", background: "#0a0f17" }} />;
  }

  return (
    <>
      <Head>
        <title>Aika Duplex Call</title>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link
          href="https://fonts.googleapis.com/css2?family=IBM+Plex+Sans:wght@400;600&family=IBM+Plex+Mono:wght@500&display=swap"
          rel="stylesheet"
        />
      </Head>
      <div className="call-page">
        <div className="call-card">
          <div className="header">
            <div className="title">Aika Duplex Call</div>
            <div className="subtitle">Full-duplex voice. Talk anytime. Headphones recommended.</div>
          </div>
          <div className="controls">
            <button className="primary" onClick={startCall} disabled={callActive}>Start Call</button>
            <button className="ghost" onClick={stopCall} disabled={!callActive}>End Call</button>
            <button className="ghost" onClick={() => setMuted(v => !v)} disabled={!callActive}>
              {muted ? "Unmute Mic" : "Mute Mic"}
            </button>
            <button className="ghost" onClick={() => setOutputMuted(v => !v)}>
              {outputMuted ? "Unmute Aika" : "Mute Aika"}
            </button>
          </div>
          <div className="status">
            <div>Status: <span>{callStatus}</span></div>
            <div>Mic: <span>{callActive ? (muted ? "muted" : "live") : "off"}</span></div>
          </div>
          <div className="meter">
            <div className="meter-bar" style={{ width: `${Math.round(micLevel * 100)}%` }} />
          </div>
          {micError && <div className="error">Mic error: {micError}</div>}
          <div className="transcripts">
            <div className="line"><span>You:</span> {lastUserText || "-"}</div>
            <div className="line"><span>Aika:</span> {lastAssistantText || "-"}</div>
          </div>
          <form className="manual" onSubmit={handleManualSubmit}>
            <input
              value={manualInput}
              onChange={(e) => setManualInput(e.target.value)}
              placeholder="Type to send (fallback)"
            />
            <button type="submit" className="ghost">Send</button>
          </form>
          <div className="footer">
            Audio: {audioUnlocked ? "unlocked" : "locked"} - Thread: {threadId ? threadId.slice(0, 8) : "pending"}
          </div>
        </div>
      </div>
      <style jsx>{`
        .call-page {
          min-height: 100vh;
          display: flex;
          align-items: center;
          justify-content: center;
          padding: 32px;
          background: radial-gradient(circle at top, #101829, #0a0f17 55%, #080b12);
          color: #e8f0ff;
          font-family: "IBM Plex Sans", "Segoe UI", sans-serif;
        }
        .call-card {
          width: min(720px, 94vw);
          background: rgba(13, 20, 32, 0.92);
          border: 1px solid rgba(80, 110, 160, 0.4);
          border-radius: 18px;
          padding: 28px 28px 22px;
          box-shadow: 0 20px 60px rgba(7, 10, 18, 0.6);
          backdrop-filter: blur(8px);
        }
        .header {
          margin-bottom: 18px;
        }
        .title {
          font-family: "IBM Plex Mono", "Consolas", monospace;
          font-size: 22px;
          letter-spacing: 0.04em;
          text-transform: uppercase;
          margin-bottom: 6px;
        }
        .subtitle {
          color: rgba(216, 230, 255, 0.75);
          font-size: 14px;
        }
        .controls {
          display: flex;
          flex-wrap: wrap;
          gap: 10px;
          margin-bottom: 16px;
        }
        button {
          border-radius: 10px;
          padding: 10px 16px;
          border: 1px solid transparent;
          font-size: 14px;
          cursor: pointer;
          transition: all 0.2s ease;
        }
        button:disabled {
          opacity: 0.5;
          cursor: not-allowed;
        }
        .primary {
          background: linear-gradient(135deg, #2dd4bf, #22c55e);
          color: #081318;
          border-color: rgba(45, 212, 191, 0.6);
          font-weight: 600;
        }
        .ghost {
          background: rgba(255, 255, 255, 0.04);
          color: #e8f0ff;
          border-color: rgba(148, 163, 184, 0.4);
        }
        .status {
          display: flex;
          justify-content: space-between;
          font-size: 13px;
          color: rgba(214, 225, 245, 0.8);
          margin-bottom: 10px;
        }
        .status span {
          color: #fff;
        }
        .meter {
          height: 10px;
          border-radius: 999px;
          background: rgba(255, 255, 255, 0.08);
          overflow: hidden;
          margin-bottom: 14px;
        }
        .meter-bar {
          height: 100%;
          background: linear-gradient(90deg, #60a5fa, #22d3ee);
          transition: width 0.08s ease-out;
        }
        .error {
          color: #fca5a5;
          font-size: 13px;
          margin-bottom: 10px;
        }
        .transcripts {
          background: rgba(9, 13, 22, 0.6);
          border-radius: 12px;
          padding: 12px 14px;
          font-size: 14px;
          margin-bottom: 12px;
        }
        .line {
          margin-bottom: 6px;
        }
        .line span {
          font-weight: 600;
          color: #93c5fd;
        }
        .manual {
          display: flex;
          gap: 8px;
          margin-bottom: 12px;
        }
        .manual input {
          flex: 1;
          background: rgba(255, 255, 255, 0.06);
          border: 1px solid rgba(148, 163, 184, 0.4);
          border-radius: 10px;
          padding: 10px 12px;
          color: #e8f0ff;
          font-size: 14px;
        }
        .manual input::placeholder {
          color: rgba(226, 232, 240, 0.6);
        }
        .footer {
          font-size: 12px;
          color: rgba(186, 204, 230, 0.6);
          text-align: right;
        }
        @media (max-width: 640px) {
          .call-card {
            padding: 20px;
          }
          .status {
            flex-direction: column;
            gap: 4px;
          }
        }
      `}</style>
    </>
  );
}

