import { useEffect, useRef, useState } from "react";
import { Emotion } from "@myaika/shared";
import AikaAvatar from "../src/components/AikaAvatar";
import AikaToolsWorkbench from "../src/components/AikaToolsWorkbench";
import MeetingCopilot from "../src/components/MeetingCopilot";
import ActionRunnerPanel from "../src/components/ActionRunnerPanel";
import ConnectionsPanel from "../src/components/ConnectionsPanel";
import TeachModePanel from "../src/components/TeachModePanel";
import CanvasPanel from "../src/components/CanvasPanel";

function resolveServerUrl() {
  if (process.env.NEXT_PUBLIC_SERVER_URL) return process.env.NEXT_PUBLIC_SERVER_URL;
  return "";
}

const SERVER_URL = resolveServerUrl();
const ALWAYS_SERVER_STT = true;
const REQUIRE_GOOGLE_AUTH = process.env.NEXT_PUBLIC_REQUIRE_GOOGLE_AUTH !== "false";

const THINKING_CUES = [
  "Hold on, I'm thinking.",
  "Give me a second.",
  "Hmm... let me think.",
  "Okay, thinking.",
  "One sec, love.",
  "Let me piece this together.",
  "Mmm... processing that.",
  "Stay there, I'm on it.",
  "Got it. Thinking now.",
  "Hang tight.",
  "Let me check that.",
  "Alright, give me a beat.",
  "Thinking... don't rush me.",
  "Okay, okay, I'm thinking.",
  "One moment.",
  "Let me work this out.",
  "Hold still, brain running.",
  "Give me a blink.",
  "Thinking, thinking.",
  "Let me get this right."
];

const THEMES = [
  {
    id: "light",
    label: "Light",
    vars: {
      "--app-bg": "#f4f6fb",
      "--panel-bg": "#ffffff",
      "--panel-border": "#e5e7eb",
      "--text-primary": "#111827",
      "--text-muted": "#6b7280",
      "--accent": "#2563eb",
      "--button-bg": "#f3f4f6"
    }
  },
  {
    id: "dracula",
    label: "Dracula",
    vars: {
      "--app-bg": "#0f1117",
      "--panel-bg": "#1b1f2a",
      "--panel-border": "#2b3140",
      "--text-primary": "#f8f8f2",
      "--text-muted": "#b0b8d3",
      "--accent": "#bd93f9",
      "--button-bg": "#2c3142"
    }
  },
  {
    id: "one-dark",
    label: "One Dark",
    vars: {
      "--app-bg": "#0f141b",
      "--panel-bg": "#1a212b",
      "--panel-border": "#2b3442",
      "--text-primary": "#e6edf7",
      "--text-muted": "#9aa7bd",
      "--accent": "#61afef",
      "--button-bg": "#2b3442"
    }
  },
  {
    id: "nord",
    label: "Nord",
    vars: {
      "--app-bg": "#2e3440",
      "--panel-bg": "#3b4252",
      "--panel-border": "#4c566a",
      "--text-primary": "#eceff4",
      "--text-muted": "#cbd5e1",
      "--accent": "#88c0d0",
      "--button-bg": "#434c5e"
    }
  },
  {
    id: "catppuccin-mocha",
    label: "Catppuccin Mocha",
    vars: {
      "--app-bg": "#1e1e2e",
      "--panel-bg": "#24273a",
      "--panel-border": "#363a4f",
      "--text-primary": "#f4f4f6",
      "--text-muted": "#b8c0e0",
      "--accent": "#c6a0f6",
      "--button-bg": "#303446"
    }
  }
];

const AVATAR_BACKGROUNDS = [
  { id: "none", label: "None", src: "" },
  { id: "heaven", label: "Heaven (clouds)", src: "/assets/aika/backgrounds/heaven.gif" },
  { id: "hell", label: "Hell (fire)", src: "/assets/aika/backgrounds/hell.gif" },
  { id: "office", label: "Office", src: "/assets/aika/backgrounds/office.gif" },
  { id: "gamer", label: "Gamer (neon)", src: "/assets/aika/backgrounds/gamer.gif" },
  ...Array.from({ length: 30 }, (_, idx) => {
    const n = String(idx + 1).padStart(2, "0");
    return {
      id: `pixabay-fantasy-${n}`,
      label: `Pixabay Fantasy ${n}`,
      src: `/assets/aika/backgrounds/pixabay/pixabay-fantasy-${n}.mp4`
    };
  })
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

function splitSpeechText(text, maxChars = 180) {
  const cleaned = String(text || "").trim();
  if (!cleaned) return [];
  const sentences = cleaned.match(/[^.!?]+[.!?]+|[^.!?]+$/g) || [cleaned];
  const chunks = [];
  let current = "";
  for (const sentence of sentences) {
    const part = sentence.trim();
    if (!part) continue;
    if ((current + " " + part).trim().length <= maxChars) {
      current = current ? `${current} ${part}` : part;
    } else {
      if (current) chunks.push(current);
      current = part;
    }
  }
  if (current) chunks.push(current);
  const merged = [];
  for (const chunk of chunks) {
    if (merged.length === 0) {
      merged.push(chunk);
      continue;
    }
    if (chunk.length < 40) {
      merged[merged.length - 1] = `${merged[merged.length - 1]} ${chunk}`.trim();
    } else {
      merged.push(chunk);
    }
  }
  return merged;
}

function stripEmotionTags(text) {
  let cleaned = String(text || "");
  cleaned = cleaned.replace(/```json[\s\S]*?```/gi, "");
  cleaned = cleaned.replace(/```[\s\S]*?"emotion"[\s\S]*?```/gi, "");
  cleaned = cleaned.replace(/\{[^}]*"emotion"[^}]*\}/gi, "");
  cleaned = cleaned.replace(/<[^>]+>/g, "");
  const ipaChars = /[ˈˌːˑæɑɔəɜʊʌɪʃʒθðŋɡ]/;
  cleaned = cleaned.replace(/\/([^/]+)\//g, (m, inner) => (ipaChars.test(inner) ? "" : m));
  cleaned = cleaned.replace(/\[([^\]]+)\]/g, (m, inner) => (ipaChars.test(inner) ? "" : m));
  return cleaned.replace(/\s+/g, " ").trim();
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

function makeMessageId() {
  if (typeof crypto !== "undefined" && crypto.randomUUID) return crypto.randomUUID();
  return `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function isLowSignalUtterance(text) {
  const normalized = String(text || "").toLowerCase().trim();
  if (!normalized) return true;
  const words = normalized.split(/\s+/).filter(Boolean);
  const filler = new Set(["you", "yeah", "yep", "yup", "uh", "um", "hmm", "huh", "sigh", "ah", "oh"]);
  if (words.length === 1 && filler.has(words[0])) return true;
  if (words.length < 2 && normalized.length < 10) return true;
  return false;
}

function buildGreeting(user) {
  const name = user?.name || user?.email || "there";
  return `Hello ${name}, Aika is here to serve. How may I assist you today?`;
}

export default function Home() {
  const [activeTab, setActiveTab] = useState("chat");
  const [integrations, setIntegrations] = useState({});
  const [statusInfo, setStatusInfo] = useState(null);
  const [logLines, setLogLines] = useState([]);
  const [logFilter, setLogFilter] = useState("");
  const [lastTtsMetrics, setLastTtsMetrics] = useState(null);
  const [ttsDiagnostics, setTtsDiagnostics] = useState(null);
  const [ttsDiagError, setTtsDiagError] = useState("");
  const [voiceFullTest, setVoiceFullTest] = useState(null);
  const [voiceFullTestRunning, setVoiceFullTestRunning] = useState(false);
  const [voiceFullTestError, setVoiceFullTestError] = useState("");
  const [skills, setSkills] = useState([]);
  const [skillEvents, setSkillEvents] = useState([]);
  const [skillsError, setSkillsError] = useState("");
  const [skillVault, setSkillVault] = useState([]);
  const [skillVaultError, setSkillVaultError] = useState("");
  const [skillVaultResult, setSkillVaultResult] = useState("");
  const [skillVaultInput, setSkillVaultInput] = useState("");
  const [webhooks, setWebhooks] = useState([]);
  const [webhookForm, setWebhookForm] = useState({ name: "", url: "" });
  const [scenes, setScenes] = useState([]);
  const [sceneForm, setSceneForm] = useState({ name: "", hooks: "" });
  const [skillToasts, setSkillToasts] = useState([]);
  const [reminderAudioCue, setReminderAudioCue] = useState(true);
  const [reminderPush, setReminderPush] = useState(false);
  const [userText, setUserText] = useState("");
  const [toolsList, setToolsList] = useState([]);
  const [toolsError, setToolsError] = useState("");
  const [toolCallName, setToolCallName] = useState("");
  const [toolCallParams, setToolCallParams] = useState("{}");
  const [toolCallResult, setToolCallResult] = useState("");
  const [approvals, setApprovals] = useState([]);
  const [approvalsError, setApprovalsError] = useState("");
  const [toolHistory, setToolHistory] = useState([]);
  const [toolHistoryError, setToolHistoryError] = useState("");
  const [featuresServices, setFeaturesServices] = useState([]);
  const [featuresSelected, setFeaturesSelected] = useState("");
  const [featuresError, setFeaturesError] = useState("");
  const [featuresLastDiscovery, setFeaturesLastDiscovery] = useState(null);
  const [featuresDiagnostics, setFeaturesDiagnostics] = useState(null);
  const [featuresView, setFeaturesView] = useState("mcp");
  const [connectModal, setConnectModal] = useState(null);
  const [avatarModels, setAvatarModels] = useState([]);
  const [avatarModelId, setAvatarModelId] = useState("miku");
  const [showAvatarPicker, setShowAvatarPicker] = useState(false);
  const [avatarImporting, setAvatarImporting] = useState(false);
  const [avatarImportError, setAvatarImportError] = useState("");
  const [avatarImportNotice, setAvatarImportNotice] = useState("");
  const [avatarCoreInfo, setAvatarCoreInfo] = useState({ coreJs: false, coreWasm: false });
  const [avatarCoreError, setAvatarCoreError] = useState("");
  const [integrationActionResult, setIntegrationActionResult] = useState("");
  const [integrationActionError, setIntegrationActionError] = useState("");
  const [amazonQuery, setAmazonQuery] = useState("");
  const [productResearch, setProductResearch] = useState(null);
  const [productResearchOpen, setProductResearchOpen] = useState(false);
  const [productResearchBusy, setProductResearchBusy] = useState(false);
  const [productResearchNotice, setProductResearchNotice] = useState("");
  const [cartBusyAsin, setCartBusyAsin] = useState("");
  const [currentUser, setCurrentUser] = useState(null);
  const [authChecked, setAuthChecked] = useState(false);
  const meetingCopilotRef = useRef({ start: null, stop: null });
  const meetingRecRef = useRef(null);
  const [meetingRecording, setMeetingRecording] = useState(false);
  const [meetingTranscript, setMeetingTranscript] = useState("");
  const [meetingTitle, setMeetingTitle] = useState("Meeting Notes");
  const [meetingDocUrl, setMeetingDocUrl] = useState("");
  const [meetingStatus, setMeetingStatus] = useState("");
  const [log, setLog] = useState([
    {
      role: "assistant",
      text: "Hello Jeff, Aika is here to serve. How may I assist you today?"
    }
  ]);
  const [behavior, setBehavior] = useState({ emotion: Emotion.NEUTRAL, intensity: 0.35, speaking: false });
  const [micState, setMicState] = useState("idle"); // idle | listening | error | unsupported
  const [micError, setMicError] = useState("");
  const [micLevel, setMicLevel] = useState(0);
  const [micStatus, setMicStatus] = useState("Mic idle");
  const [sttDebug, setSttDebug] = useState({ mode: "server", chunks: 0, sent: 0, lastTextAt: 0 });
  const [chatError, setChatError] = useState("");
  const [feedbackError, setFeedbackError] = useState("");
  const [feedbackState, setFeedbackState] = useState({});
  const [autoSpeak, setAutoSpeak] = useState(true);
  const [textOnly, setTextOnly] = useState(false);
  const [voiceMode, setVoiceMode] = useState(true);
  const [micEnabled, setMicEnabled] = useState(true);
  const [fastReplies, setFastReplies] = useState(true);
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [settingsTab, setSettingsTab] = useState("integrations");
  const [themeId, setThemeId] = useState("light");
  const [appBackground, setAppBackground] = useState("");
  const [avatarBackground, setAvatarBackground] = useState("none");
  const [meetingCommandListening, setMeetingCommandListening] = useState(false);
  const [sttSilenceMs, setSttSilenceMs] = useState(1400);
  const [ttsEngineOnline, setTtsEngineOnline] = useState(null);
  const [voicePromptText, setVoicePromptText] = useState("");
  const [ttsStatus, setTtsStatus] = useState("idle");
  const [ttsError, setTtsError] = useState("");
  const [ttsWarnings, setTtsWarnings] = useState([]);
  const [ttsLevel, setTtsLevel] = useState(0);
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
    engine: "piper",
    voice: { reference_wav_path: "riko_sample.wav", name: "en_GB-semaine-medium", prompt_text: "" }
  });
  const [meetingLock, setMeetingLock] = useState(false);
  const previousChatState = useRef(null);

  function registerMeetingCopilotControls(controls) {
    meetingCopilotRef.current = controls || {};
  }

  function setMeetingRecordingActive(active) {
    setMeetingLock(Boolean(active));
  }

  useEffect(() => {
    if (typeof window === "undefined") return;
    const savedTheme = window.localStorage.getItem("aika_theme");
    const savedBg = window.localStorage.getItem("aika_app_bg") || "";
    const savedAvatarBg = window.localStorage.getItem("aika_avatar_bg") || "none";
    const savedMeetingCommands = window.localStorage.getItem("aika_meeting_commands") || "";
    const savedSilenceMs = Number(window.localStorage.getItem("aika_stt_silence_ms") || "1400");
    if (savedTheme) setThemeId(savedTheme);
    if (savedBg) setAppBackground(savedBg);
    if (savedAvatarBg) setAvatarBackground(savedAvatarBg);
    if (savedMeetingCommands) setMeetingCommandListening(savedMeetingCommands === "true");
    if (Number.isFinite(savedSilenceMs)) {
      setSttSilenceMs(Math.max(800, Math.min(3000, savedSilenceMs)));
    }
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const theme = THEMES.find(t => t.id === themeId) || THEMES[0];
    Object.entries(theme.vars).forEach(([key, value]) => {
      document.documentElement.style.setProperty(key, value);
    });
    document.body.style.backgroundColor = theme.vars["--app-bg"];
    if (appBackground) {
      document.body.style.backgroundImage = `url(${appBackground})`;
      document.body.style.backgroundSize = "cover";
      document.body.style.backgroundPosition = "center";
      document.body.style.backgroundAttachment = "fixed";
    } else {
      document.body.style.backgroundImage = "none";
    }
    window.localStorage.setItem("aika_theme", theme.id);
    if (appBackground) {
      window.localStorage.setItem("aika_app_bg", appBackground);
    } else {
      window.localStorage.removeItem("aika_app_bg");
    }
    window.localStorage.setItem("aika_avatar_bg", avatarBackground);
  }, [themeId, appBackground, avatarBackground]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    window.localStorage.setItem("aika_meeting_commands", String(meetingCommandListening));
  }, [meetingCommandListening]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    window.localStorage.setItem("aika_stt_silence_ms", String(sttSilenceMs));
  }, [sttSilenceMs]);

  useEffect(() => {
    if (activeTab === "settings" && settingsTab === "voice") {
      setShowSettings(true);
    }
  }, [activeTab, settingsTab]);

  useEffect(() => {
    const shouldMute = activeTab === "recordings" || meetingLock;
    if (shouldMute) {
      if (!previousChatState.current) {
        previousChatState.current = { voiceMode, autoSpeak, micEnabled, textOnly };
      }
      setVoiceMode(false);
      setAutoSpeak(false);
      setMicEnabled(false);
      setTextOnly(true);
      stopMic();
      stopAudio();
    } else if (previousChatState.current) {
      const prev = previousChatState.current;
      setVoiceMode(prev.voiceMode);
      setAutoSpeak(prev.autoSpeak);
      setMicEnabled(prev.micEnabled);
      setTextOnly(prev.textOnly);
      previousChatState.current = null;
    }
  }, [activeTab, meetingLock]);
  const [availableVoices, setAvailableVoices] = useState([]);
  const recognizerRef = useRef(null);
  const audioRef = useRef(null);
  const ttsAudioCtxRef = useRef(null);
  const ttsAnalyserRef = useRef(null);
  const sttRecorderRef = useRef(null);
  const sttActiveRef = useRef(false);
  const sttModeRef = useRef("browser");
  const sttLastDataRef = useRef(0);
  const sttTranscriptRef = useRef("");
  const sttChunkCountRef = useRef(0);
  const sttLastSpeechRef = useRef(0);
  const sttBlobPartsRef = useRef([]);
  const sttInitChunkRef = useRef(null);
  const sttSpeechActiveRef = useRef(false);
  const sttRequestInFlightRef = useRef(false);
  const sttRmsRef = useRef(0);
  const sttNoiseFloorRef = useRef(0.0035);
  const sttThresholdRef = useRef(0.012);
  const micFailCountRef = useRef(0);
  const lastMicStartRef = useRef(0);
  const forceServerSttRef = useRef(false);
  const ttsSourceRef = useRef(null);
  const ttsRafRef = useRef(null);
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
  const micStartingRef = useRef(false);
  const ttsActiveRef = useRef(false);

  async function send(overrideText) {
    if (activeTab === "recordings" || meetingLock) {
      setChatError("chat_paused_recording");
      return;
    }
    const raw = typeof overrideText === "string" ? overrideText : userText;
    const text = raw.trim();
    if (!text) return;
    if (/^transcription failed\b/i.test(text) || /^transcription pending\b/i.test(text)) {
      setMicError("stt_provider_unavailable");
      return;
    }

    stopMic();
    if (voiceMode && autoSpeak && !textOnly) {
      speak(pickThinkingCue(), { ...ttsSettings, style: "brat_soft", fast: true, use_raw_text: true }, { restartMicOnEnd: false });
    }
    const userMessageId = makeMessageId();
    setLog(l => [...l, { id: userMessageId, role: "user", text }]);
    setUserText("");

    setChatError("");
    let r;
    try {
      r = await fetch(`${SERVER_URL}/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userText: text, maxOutputTokens: fastReplies ? 200 : 320 })
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
    if (data.productResearch) {
      setProductResearch(data.productResearch);
      setProductResearchOpen(true);
      setProductResearchNotice("");
    }
    const reply = data.text || "";
    if (!reply) {
      setChatError(data.error || "empty_reply");
    }
    const b = data.behavior || behavior;

      setBehavior({ ...b, speaking: false });
      const displayReply = stripEmotionTags(reply);
      const replyMessageId = makeMessageId();
      const replyCitations = Array.isArray(data.citations) ? data.citations : [];
      setLog(l => [
        ...l,
        {
          id: replyMessageId,
          role: "assistant",
          text: displayReply || "(no reply)",
          prompt: text,
          source: "chat",
          citations: replyCitations
        }
      ]);
      setLastAssistantText(displayReply);

      if (autoSpeak && !textOnly && displayReply) {
        const spoken = displayReply;
        if (spoken) speakChunks(spoken, { use_raw_text: true });
      }
  }

  async function submitFeedback(message, rating) {
    if (!message || message.role !== "assistant") return;
    if (!message.id) return;
    setFeedbackError("");
    setFeedbackState(prev => ({ ...prev, [message.id]: rating }));
    try {
      const payload = {
        source: message.source || "chat",
        rating,
        question: message.prompt || "",
        answer: message.text || "",
        messageId: message.id,
        citations: Array.isArray(message.citations) ? message.citations : []
      };
      const resp = await fetch(`${SERVER_URL}/api/feedback`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
      });
      const data = await resp.json();
      if (!resp.ok) throw new Error(data?.error || "feedback_failed");
    } catch (err) {
      setFeedbackError(err?.message || "feedback_failed");
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
      audio.muted = false;
    }
    stopLipSync();
    if ("speechSynthesis" in window) {
      window.speechSynthesis.cancel();
    }
    setTtsStatus("idle");
    setBehavior(prev => ({ ...prev, speaking: false }));
  }

  function stopLipSync() {
    if (ttsRafRef.current) cancelAnimationFrame(ttsRafRef.current);
    ttsRafRef.current = null;
    setTtsLevel(0);
  }

  async function startLipSync(audio) {
    try {
      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      if (!AudioCtx || !audio) return;
      const ctx = ttsAudioCtxRef.current || new AudioCtx();
      ttsAudioCtxRef.current = ctx;
      if (ctx.state === "suspended") await ctx.resume();
      if (!ttsSourceRef.current) {
        ttsSourceRef.current = ctx.createMediaElementSource(audio);
      }
      if (!ttsAnalyserRef.current) {
        const analyser = ctx.createAnalyser();
        analyser.fftSize = 512;
        ttsAnalyserRef.current = analyser;
        ttsSourceRef.current.connect(analyser);
        analyser.connect(ctx.destination);
      }
      audio.muted = false;
      audio.volume = 1;
      const analyser = ttsAnalyserRef.current;
      const data = new Uint8Array(analyser.fftSize);
      const loop = () => {
        analyser.getByteTimeDomainData(data);
        let sum = 0;
        for (let i = 0; i < data.length; i++) {
          const v = (data[i] - 128) / 128;
          sum += v * v;
        }
        const rms = Math.sqrt(sum / data.length);
        const level = Math.min(1, Math.max(0, rms * 3.2));
        setTtsLevel(prev => prev * 0.6 + level * 0.4);
        ttsRafRef.current = requestAnimationFrame(loop);
      };
      if (!ttsRafRef.current) loop();
    } catch {
      // ignore lip sync failures
    }
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
      startLipSync(audio);
      audio.onended = () => {
        URL.revokeObjectURL(objectUrl);
        setTtsStatus("idle");
        setBehavior(prev => ({ ...prev, speaking: false }));
        stopLipSync();
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
          stopLipSync();
          if (voiceMode && !textOnly) {
            setTimeout(() => startMic(), 200);
          }
        } catch (e) {
          setTtsStatus("error");
          setTtsError(e?.message || "audio_play_failed");
          setBehavior(prev => ({ ...prev, speaking: false }));
          stopLipSync();
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

  async function speak(textToSpeak, settingsOverride, options = {}) {
    if (textOnly) return;
    if (!audioUnlocked) {
      setPendingSpeak({ text: textToSpeak, settings: settingsOverride });
      setTtsError("audio_locked_click_enable");
      return;
    }
    const text = String(textToSpeak || "").trim();
    if (!text) return;

    try {
      const { skipStop = false, restartMicOnEnd = true } = options;
      const useFast = settingsOverride?.fast ?? fastReplies;
      if (!skipStop) {
        stopMic();
        await stopAudio();
      }
      ttsActiveRef.current = true;
      setTtsError("");
      setTtsStatus("loading");
      const tuned = applyEmotionTuning(settingsOverride || ttsSettings, behavior);
      const requestSettings = { ...tuned, fast: useFast, use_raw_text: true };
      const t0 = performance.now();
      const r = await fetch(`${SERVER_URL}/api/aika/voice/inline`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text, settings: requestSettings })
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
      const t1 = performance.now();
      setLastTtsMetrics({
        ms: Math.round(t1 - t0),
        bytes: blob?.size || 0,
        status: r.status
      });
      if (!blob || blob.size < 64) throw new Error("audio_blob_invalid");

      return await new Promise(resolve => {
        const objectUrl = URL.createObjectURL(blob);
        const audio = audioRef.current || new Audio();
        audioRef.current = audio;
        audio.src = objectUrl;
        audio.preload = "auto";
        audio.volume = 1;
        startLipSync(audio);
        audio.onended = () => {
          URL.revokeObjectURL(objectUrl);
          setTtsStatus("idle");
          setBehavior(prev => ({ ...prev, speaking: false }));
          ttsActiveRef.current = false;
          stopLipSync();
          if (restartMicOnEnd && voiceMode && !textOnly) {
            setTimeout(() => startMic(), 600);
          }
          resolve();
        };
        audio.onerror = async () => {
          URL.revokeObjectURL(objectUrl);
          try {
            setTtsStatus("playing");
            await playBlobWithAudioContext(blob);
            setTtsStatus("idle");
            setBehavior(prev => ({ ...prev, speaking: false }));
            ttsActiveRef.current = false;
            stopLipSync();
            if (restartMicOnEnd && voiceMode && !textOnly) {
              setTimeout(() => startMic(), 600);
            }
          } catch (e) {
            setTtsStatus("error");
            setTtsError(e?.message || "audio_play_failed");
            setBehavior(prev => ({ ...prev, speaking: false }));
            ttsActiveRef.current = false;
            stopLipSync();
          }
          resolve();
        };

        setBehavior(prev => ({ ...prev, speaking: true }));
        setTtsStatus("playing");
        audio.play().catch(() => audio.onerror());
      });
    } catch (e) {
      setTtsStatus("error");
      setTtsError(e?.message || "tts_failed");
      setBehavior(prev => ({ ...prev, speaking: false }));
      ttsActiveRef.current = false;
    }
  }

  async function speakChunks(textToSpeak, settingsOverride) {
    const cleaned = String(textToSpeak || "").trim();
    if (!cleaned) return;
    const maxLen = fastReplies ? 200 : 280;
    if (cleaned.length <= maxLen) {
      await speak(cleaned, settingsOverride, { restartMicOnEnd: true });
      return;
    }
    const chunks = splitSpeechText(cleaned, maxLen);
    if (!chunks.length) return;
    stopMic();
    await stopAudio();
    for (const chunk of chunks) {
      await speak(chunk, settingsOverride, { skipStop: true, restartMicOnEnd: false });
    }
    if (voiceMode && !textOnly) {
      setTimeout(() => startMic(), 600);
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
      lastMicStartRef.current = Date.now();
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
      startServerStt();
    };

    r.onend = () => {
      console.log("[mic] recognition end");
      const elapsed = Date.now() - (lastMicStartRef.current || 0);
      if (elapsed && elapsed < 1500) {
        micFailCountRef.current += 1;
      } else {
        micFailCountRef.current = 0;
      }
      setMicState("idle");
      setMicStatus("Mic idle");
      if (silenceTimerRef.current) {
        clearTimeout(silenceTimerRef.current);
        silenceTimerRef.current = null;
      }
      stopLevelMeter();
      if (micFailCountRef.current >= 1) {
        forceServerSttRef.current = true;
        setMicStatus("Switching to server STT...");
        startServerStt();
        return;
      }
      if (sttActiveRef.current || forceServerSttRef.current) return;
      if (micEnabled && voiceMode && !textOnly && !ttsActiveRef.current) {
        setTimeout(() => startMic(), 300);
      }
    };

    r.onresult = (e) => {
      if (ttsActiveRef.current) return;
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
      const stream = await requestMicStream({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true
        }
      });
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
        sttRmsRef.current = rms;
        sttNoiseFloorRef.current = sttNoiseFloorRef.current * 0.96 + rms * 0.04;
        sttThresholdRef.current = Math.max(0.006, Math.min(0.05, sttNoiseFloorRef.current * 1.8));
        if (rms > sttThresholdRef.current) sttLastSpeechRef.current = Date.now();
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

  async function startServerStt() {
    if (sttActiveRef.current) return;
    const micReason = getMicUnavailableReason();
    if (micReason) {
      setMicState("error");
      setMicError(`${micReason} Use an HTTPS URL for Aika on iPad.`);
      setMicStatus("Mic unavailable");
      return;
    }
    try {
      await startLevelMeter();
      sttModeRef.current = "server";
      const stream = mediaStreamRef.current || await requestMicStream({ audio: true });
      sttActiveRef.current = true;
      sttLastDataRef.current = 0;
      sttChunkCountRef.current = 0;
      sttLastSpeechRef.current = 0;
      sttBlobPartsRef.current = [];
      sttInitChunkRef.current = null;
      sttSpeechActiveRef.current = false;
      sttRequestInFlightRef.current = false;
      setSttDebug({ mode: "server", chunks: 0, sent: 0, lastTextAt: 0 });
      const mimeType = MediaRecorder.isTypeSupported("audio/webm")
        ? "audio/webm"
        : MediaRecorder.isTypeSupported("audio/ogg")
          ? "audio/ogg"
          : "";
      if (!mimeType) {
        setMicError("audio_format_unsupported");
        sttActiveRef.current = false;
        return;
      }
      const recorder = new MediaRecorder(stream, mimeType ? { mimeType } : undefined);
      sttRecorderRef.current = recorder;
      recorder.onerror = () => {
        setMicError("stt_recorder_error");
        setMicState("idle");
        setMicStatus("Mic restarted");
      };
      const sendBufferedUtterance = async () => {
        if (sttRequestInFlightRef.current) return;
        const parts = sttBlobPartsRef.current;
        if (!parts || !parts.length) return;
        const initChunk = sttInitChunkRef.current;
        const payloadParts =
          initChunk && parts[0] !== initChunk
            ? [initChunk, ...parts]
            : parts;
        const utteranceBlob = new Blob(payloadParts, { type: mimeType });
        sttBlobPartsRef.current = [];
        sttLastSpeechRef.current = 0;
        sttSpeechActiveRef.current = false;
        if (!utteranceBlob || utteranceBlob.size < 512) return;
        sttRequestInFlightRef.current = true;
        try {
          const form = new FormData();
          const ext = mimeType.includes("ogg") ? "ogg" : "webm";
          form.append("audio", utteranceBlob, `stt-${Date.now()}.${ext}`);
          const r = await fetch(`${SERVER_URL}/api/stt/transcribe`, { method: "POST", body: form });
          const data = await r.json().catch(() => ({}));
          if (!r.ok) {
            if (data?.error === "unsupported_audio_format") {
              setMicError("unsupported_audio_format");
            } else if (data?.error === "audio_too_short" || data?.error === "transcription_failed") {
              setMicStatus("Listening...");
            }
            return;
          }
          if (data?.text) {
            const transcriptText = String(data.text).trim();
            if (!transcriptText || /^transcription failed\b/i.test(transcriptText) || /^transcription pending\b/i.test(transcriptText)) {
              setMicError("stt_provider_unavailable");
              return;
            }
            latestTranscriptRef.current = transcriptText;
            setMicStatus(`Heard: ${latestTranscriptRef.current}`);
            setUserText(latestTranscriptRef.current);
            setSttDebug(prev => ({
              ...prev,
              chunks: prev.chunks + 1,
              lastTextAt: Date.now()
            }));
            if (silenceTimerRef.current) clearTimeout(silenceTimerRef.current);
            silenceTimerRef.current = setTimeout(() => {
              const toSend = latestTranscriptRef.current.trim();
              if (!toSend || isLowSignalUtterance(toSend)) {
                setMicStatus("Listening...");
                return;
              }
              setMicStatus(`Sending: ${toSend}`);
              latestTranscriptRef.current = "";
              sttTranscriptRef.current = "";
              sttChunkCountRef.current = 0;
              sttLastDataRef.current = 0;
              sttLastSpeechRef.current = 0;
              setSttDebug(prev => ({ ...prev, sent: prev.sent + 1 }));
              setUserText("");
              send(toSend);
            }, 300);
          }
        } catch (err) {
          setMicError(err?.message || "stt_failed");
        } finally {
          sttRequestInFlightRef.current = false;
        }
      };

      recorder.ondataavailable = async (evt) => {
        if (ttsActiveRef.current) return;
        if (!evt.data || evt.data.size < 256) return;
        const now = Date.now();
        if (!sttInitChunkRef.current) sttInitChunkRef.current = evt.data;
        sttBlobPartsRef.current.push(evt.data);
        if (sttBlobPartsRef.current.length > 60) {
          sttBlobPartsRef.current.shift();
        }
        sttLastDataRef.current = now;
        if (sttRmsRef.current > 0.008) {
          sttLastSpeechRef.current = now;
        }
        const hasSpeech = sttLastSpeechRef.current > 0;
        if (hasSpeech) {
          sttSpeechActiveRef.current = true;
          const quietForMs = now - sttLastSpeechRef.current;
          if (quietForMs >= sttSilenceMs) {
            await sendBufferedUtterance();
          }
        }
      };
      recorder.onstop = () => {
        sttActiveRef.current = false;
        setMicState("idle");
        if (!mediaStreamRef.current) {
          stream.getTracks().forEach(t => t.stop());
        }
      };
      recorder.start(500);
      setMicState("listening");
      setMicStatus("Listening (server STT)...");
    } catch (err) {
      sttActiveRef.current = false;
      setMicState("error");
      setMicError(err?.message || "Microphone error.");
    }
  }

  function stopServerStt() {
    if (sttRecorderRef.current) {
      try { sttRecorderRef.current.stop(); } catch {}
      sttRecorderRef.current = null;
    }
    sttActiveRef.current = false;
    sttLastDataRef.current = 0;
    sttTranscriptRef.current = "";
    sttChunkCountRef.current = 0;
    sttLastSpeechRef.current = 0;
    sttBlobPartsRef.current = [];
    sttInitChunkRef.current = null;
    sttSpeechActiveRef.current = false;
    sttRequestInFlightRef.current = false;
    setSttDebug(prev => ({ ...prev, mode: "off" }));
    setMicState("idle");
    setMicStatus("Mic idle");
  }

  async function startMic() {
    if (micState === "listening" || micStartingRef.current || ttsActiveRef.current) return;
    const micReason = getMicUnavailableReason();
    if (micReason) {
      setMicState("error");
      setMicError(`${micReason} Use an HTTPS URL for Aika on iPad.`);
      setMicStatus("Mic unavailable");
      return;
    }
    if (ALWAYS_SERVER_STT) {
      forceServerSttRef.current = true;
      await startServerStt();
      return;
    }
    if (forceServerSttRef.current) {
      await startServerStt();
      return;
    }
    const r = ensureRecognizer();
    if (!r) {
      await startServerStt();
      return;
    }
    micStartingRef.current = true;
    await stopAudio(200);
    await sleep(120);
    try {
      await startLevelMeter();
    } catch {
      // If level meter fails, still attempt server STT.
      await startServerStt();
    }
    if (!audioUnlocked) {
      unlockAudio().then(ok => {
        if (ok) {
          setAudioUnlocked(true);
          setTtsError("");
        }
      });
    }
    try {
      r.start();
    } catch (e) {
      if (e?.name === "NotAllowedError" || e?.name === "NotFoundError") {
        forceServerSttRef.current = true;
        await startServerStt();
      } else if (e?.name !== "InvalidStateError") {
        throw e;
      }
    } finally {
      micStartingRef.current = false;
    }
  }

  function stopMic() {
    const r = ensureRecognizer();
    if (r) r.stop();
    stopServerStt();
    forceServerSttRef.current = false;
    micFailCountRef.current = 0;
    if (silenceTimerRef.current) {
      clearTimeout(silenceTimerRef.current);
      silenceTimerRef.current = null;
    }
    stopLevelMeter();
  }

  async function toggleMic() {
    const listening = micEnabled && micState === "listening";
    if (listening) {
      setMicEnabled(false);
      setVoiceMode(false);
      setAutoSpeak(false);
      setTextOnly(true);
      stopMic();
      return;
    }
    setMicEnabled(true);
    setVoiceMode(true);
    setAutoSpeak(true);
    setTextOnly(false);
    setMicStatus("Starting mic...");
    const ok = await unlockAudio();
    if (ok) {
      setAudioUnlocked(true);
      setTtsError("");
      await startMic();
    } else {
      setTtsError("audio_locked_click_enable");
    }
  }

  useEffect(() => {
    if (!audioUnlocked || !pendingSpeak) return;
    const { text, settings } = pendingSpeak;
    setPendingSpeak(null);
    speak(text, settings);
  }, [audioUnlocked, pendingSpeak]);

  useEffect(() => {
    if (audioUnlocked) return;
    const tryUnlock = async () => {
      const ok = await unlockAudio();
      if (ok) {
        setAudioUnlocked(true);
        if (micEnabled && voiceMode && !textOnly && micState !== "listening") {
          startMic();
        }
      }
    };
    const onFirstGesture = () => {
      tryUnlock();
      window.removeEventListener("pointerdown", onFirstGesture);
      window.removeEventListener("keydown", onFirstGesture);
    };
    window.addEventListener("pointerdown", onFirstGesture);
    window.addEventListener("keydown", onFirstGesture);
    return () => {
      window.removeEventListener("pointerdown", onFirstGesture);
      window.removeEventListener("keydown", onFirstGesture);
    };
  }, [audioUnlocked, micEnabled, voiceMode, textOnly, micState]);

  useEffect(() => {
    if (!audioUnlocked) return;
    if (!autoSpeak || textOnly) return;
    if (REQUIRE_GOOGLE_AUTH && !currentUser) return;
    if (lastAssistantText) return;
    const greeting = buildGreeting(currentUser);
    setLastAssistantText(greeting);
    speakChunks(greeting, { use_raw_text: true });
  }, [audioUnlocked, autoSpeak, textOnly, lastAssistantText, currentUser]);

  useEffect(() => {
    if (!voiceMode || !micEnabled || micState !== "idle") return;
    startMic();
  }, [voiceMode, micEnabled, micState]);

  useEffect(() => {
    const id = setInterval(() => {
      if (!micEnabled || !voiceMode || textOnly) return;
      if (!sttActiveRef.current) return;
      const age = Date.now() - (sttLastDataRef.current || 0);
      if (age < 12000) return;
      setMicStatus("Reconnecting mic...");
      stopServerStt();
      setTimeout(() => {
        startServerStt();
      }, 200);
    }, 4000);
    return () => clearInterval(id);
  }, [micEnabled, voiceMode, textOnly]);

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
      async function loadIntegrations() {
        try {
          const r = await fetch(`${SERVER_URL}/api/integrations`);
          const data = await r.json();
          setIntegrations(data.integrations || {});
        } catch {
          setIntegrations({});
        }
      }
      loadIntegrations();
    }, []);

    useEffect(() => {
      if (activeTab !== "settings" || settingsTab !== "skills") return;
      let cancelled = false;
      async function loadSkills() {
        try {
          const r = await fetch(`${SERVER_URL}/api/skills`);
          if (!r.ok) throw new Error("skills_failed");
          const data = await r.json();
          if (!cancelled) {
            setSkills(data.skills || []);
            setSkillEvents(data.events || []);
            setSkillsError("");
          }
        } catch (err) {
          if (!cancelled) {
            setSkills([]);
            setSkillEvents([]);
            setSkillsError(err?.message || "skills_failed");
          }
        }
      }
      async function loadWebhooks() {
        try {
          const r = await fetch(`${SERVER_URL}/api/skills/webhooks`);
          if (!r.ok) throw new Error("webhooks_failed");
          const data = await r.json();
          if (!cancelled) {
            setWebhooks(data.webhooks || []);
          }
        } catch {
          if (!cancelled) setWebhooks([]);
        }
      }
      async function loadScenes() {
        try {
          const r = await fetch(`${SERVER_URL}/api/skills/scenes`);
          if (!r.ok) throw new Error("scenes_failed");
          const data = await r.json();
          if (!cancelled) setScenes(data.scenes || []);
        } catch {
          if (!cancelled) setScenes([]);
        }
      }
      loadSkills();
      loadWebhooks();
      loadScenes();
      const id = setInterval(loadSkills, 6000);
      return () => {
        cancelled = true;
        clearInterval(id);
      };
    }, [activeTab, settingsTab]);

    useEffect(() => {
      if (activeTab !== "settings" || settingsTab !== "skills") return;
      let cancelled = false;
      async function loadSkillVault() {
        try {
          const r = await fetch(`${SERVER_URL}/api/skill-vault`);
          if (!r.ok) throw new Error("skill_vault_failed");
          const data = await r.json();
          if (!cancelled) {
            setSkillVault(data.skills || []);
            setSkillVaultError("");
          }
        } catch (err) {
          if (!cancelled) {
            setSkillVault([]);
            setSkillVaultError(err?.message || "skill_vault_failed");
          }
        }
      }
      loadSkillVault();
      return () => {
        cancelled = true;
      };
    }, [activeTab, settingsTab]);

    useEffect(() => {
      let cancelled = false;
      async function pollEvents() {
        try {
          const r = await fetch(`${SERVER_URL}/api/skills/events`);
          if (!r.ok) throw new Error("skills_events_failed");
          const data = await r.json();
          if (cancelled) return;
          const events = data.events || [];
          setSkillEvents(events);
          const due = events.filter(e => e.type === "reminder_due").slice(0, 3);
          if (due.length) {
            setSkillToasts(prev => {
              const existing = new Set(prev.map(t => t.id));
              const next = [...prev];
              for (const evt of due) {
                const id = evt.reminderId || `${evt.time}-${evt.skill}`;
                if (!existing.has(id)) {
                  next.push({ id, text: `Reminder: ${evt.input}` });
                  if (reminderAudioCue) {
                    try {
                      const ctx = new (window.AudioContext || window.webkitAudioContext)();
                      const osc = ctx.createOscillator();
                      const gain = ctx.createGain();
                      osc.type = "sine";
                      osc.frequency.value = 740;
                      gain.gain.value = 0.07;
                      osc.connect(gain);
                      gain.connect(ctx.destination);
                      osc.start();
                      osc.stop(ctx.currentTime + 0.2);
                      setTimeout(() => ctx.close(), 300);
                    } catch {
                      // ignore
                    }
                  }
                  if (reminderPush && "Notification" in window) {
                    if (Notification.permission === "granted") {
                      new Notification("Aika Reminder", { body: evt.input || "Reminder due" });
                    }
                  }
                }
              }
              return next.slice(-3);
            });
          }
        } catch {
          // ignore
        }
      }
      pollEvents();
      const id = setInterval(pollEvents, 5000);
      return () => {
        cancelled = true;
        clearInterval(id);
      };
    }, []);

  useEffect(() => {
    async function loadStatus() {
      try {
        const r = await fetch(`${SERVER_URL}/api/status`);
        const data = await r.json();
        setStatusInfo(data);
      } catch {
        setStatusInfo(null);
      }
    }
    loadStatus();
    const id = setInterval(loadStatus, 4000);
    return () => clearInterval(id);
  }, []);

  useEffect(() => {
    if (activeTab !== "debug") return;
    let cancelled = false;
    async function loadVoiceFullTestState() {
      try {
        const r = await fetch(`${SERVER_URL}/api/voice/fulltest`);
        const data = await r.json();
        if (!cancelled) {
          setVoiceFullTest(data?.report || null);
          setVoiceFullTestRunning(Boolean(data?.running));
          setVoiceFullTestError("");
        }
      } catch (err) {
        if (!cancelled) setVoiceFullTestError(err?.message || "voice_fulltest_state_failed");
      }
    }
    loadVoiceFullTestState();
    const id = setInterval(loadVoiceFullTestState, 6000);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, [activeTab]);

  useEffect(() => {
    if (activeTab !== "debug") return;
    let cancelled = false;
    async function loadDiagnostics() {
      try {
        const r = await fetch(`${SERVER_URL}/api/aika/tts/diagnostics`);
        if (!r.ok) throw new Error("diagnostics_failed");
        const data = await r.json();
        if (!cancelled) {
          setTtsDiagnostics(data);
          setTtsDiagError("");
        }
      } catch (err) {
        if (!cancelled) {
          setTtsDiagnostics(null);
          setTtsDiagError(err?.message || "diagnostics_failed");
        }
      }
    }
    loadDiagnostics();
    const id = setInterval(loadDiagnostics, 8000);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, [activeTab]);

  useEffect(() => {
    if (activeTab !== "tools") return;
    let cancelled = false;
    async function loadTools() {
      try {
        const r = await fetch(`${SERVER_URL}/api/tools`);
        const data = await r.json();
        if (!cancelled) setToolsList(Array.isArray(data.tools) ? data.tools : []);
      } catch (err) {
        if (!cancelled) setToolsError(err?.message || "tools_load_failed");
      }
    }
    async function loadApprovals() {
      try {
        const r = await fetch(`${SERVER_URL}/api/approvals`);
        const data = await r.json();
        if (!cancelled) setApprovals(Array.isArray(data.approvals) ? data.approvals : []);
      } catch (err) {
        if (!cancelled) setApprovalsError(err?.message || "approvals_load_failed");
      }
    }
    async function loadHistory() {
      try {
        const r = await fetch(`${SERVER_URL}/api/tools/history?limit=50`);
        const data = await r.json();
        if (!cancelled) setToolHistory(Array.isArray(data.history) ? data.history : []);
      } catch (err) {
        if (!cancelled) setToolHistoryError(err?.message || "history_load_failed");
      }
    }
    loadTools();
    loadApprovals();
    loadHistory();
    return () => {
      cancelled = true;
    };
  }, [activeTab]);

  useEffect(() => {
    if (activeTab !== "features") return;
    let cancelled = false;
    async function loadFeatures(force = false) {
      const now = Date.now();
      if (!force && featuresLastDiscovery && now - featuresLastDiscovery < 60_000) return;
      try {
        setFeaturesError("");
        const [toolsResp, integrationsResp] = await Promise.all([
          fetch(`${SERVER_URL}/api/tools`),
          fetch(`${SERVER_URL}/api/integrations`)
        ]);
        const toolsData = await toolsResp.json();
        const integrationsData = await integrationsResp.json();
        const services = normalizeMcpServices(
          Array.isArray(toolsData.tools) ? toolsData.tools : [],
          integrationsData.integrations || {}
        );
        if (!cancelled) {
          setFeaturesServices(services);
          setFeaturesSelected(prev => prev || services[0]?.id || "");
          setFeaturesLastDiscovery(Date.now());
          setFeaturesDiagnostics({
            serverUrl: SERVER_URL,
            toolCount: toolsData.tools?.length || 0,
            serviceCount: services.length,
            lastDiscovery: new Date().toISOString()
          });
        }
      } catch (err) {
        if (!cancelled) setFeaturesError(err?.message || "features_load_failed");
      }
    }
    loadFeatures();
    return () => {
      cancelled = true;
    };
  }, [activeTab, featuresLastDiscovery]);

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
      async function loadVoices() {
        try {
          const r = await fetch(`${SERVER_URL}/api/aika/voices`);
          const data = await r.json();
          const list = Array.isArray(data.piperVoices)
            ? data.piperVoices
            : Array.isArray(data.voices)
              ? data.voices
              : [];
          setAvailableVoices(list);
          if (list.length && !ttsSettings.voice?.name) {
            setTtsSettings(s => ({ ...s, voice: { ...s.voice, name: list[0].id } }));
          }
          if (!ttsSettings.engine && data.engine) {
            setTtsSettings(s => ({ ...s, engine: data.engine }));
          }
        } catch {
          setAvailableVoices([]);
        }
      }
      loadVoices();
    }, []);

    useEffect(() => {
      async function loadAvatarModels() {
        try {
          const r = await fetch(`${SERVER_URL}/api/aika/avatar/models`);
          const data = await r.json();
          const list = Array.isArray(data.models) ? data.models : [];
          setAvatarModels(list);
          const stored = window.localStorage.getItem("aika_avatar_model") || "";
          const storedOk = stored && list.some(m => m.id === stored && m.available);
          const preferred =
            (storedOk && stored) ||
            (list.find(m => m.id.toLowerCase() === "miku" && m.available)?.id ||
              list.find(m => m.available)?.id ||
              list[0]?.id ||
              "");
          if (preferred) {
            setAvatarModelId(preferred);
            window.localStorage.setItem("aika_avatar_model", preferred);
          }
          if (!list.length || !list.some(m => m.available)) {
            refreshAvatarModels();
          }
          loadAvatarCore();
        } catch {
          setAvatarModels([]);
        }
      }
      loadAvatarModels();
    }, []);

    async function importAvatarZip(file) {
      if (!file) return;
      setAvatarImporting(true);
      setAvatarImportError("");
      setAvatarImportNotice("");
      try {
        const form = new FormData();
        form.append("file", file);
        const r = await fetch(`${SERVER_URL}/api/aika/avatar/import`, {
          method: "POST",
          body: form
        });
        if (!r.ok) {
          const data = await r.json().catch(() => ({}));
          throw new Error(data.error || "avatar_import_failed");
        }
        await r.json();
        await refreshAvatarModels();
        setAvatarImportNotice(
          "Import complete. If the model doesn't appear, click Refresh Models or hard reload (Ctrl+Shift+R)."
        );
      } catch (err) {
        setAvatarImportError(err?.message || "avatar_import_failed");
      } finally {
        setAvatarImporting(false);
      }
    }

    async function refreshAvatarModels() {
      setAvatarImportError("");
      setAvatarImportNotice("");
      try {
        const r = await fetch(`${SERVER_URL}/api/aika/avatar/refresh`, {
          method: "POST"
        });
        if (!r.ok) throw new Error("avatar_refresh_failed");
        const data = await r.json();
        const list = Array.isArray(data.models) ? data.models : [];
        setAvatarModels(list);
        const preferred =
          list.find(m => m.id.toLowerCase() === "miku" && m.available)?.id ||
          list.find(m => m.available)?.id ||
          list[0]?.id ||
          "";
        if (preferred) {
          setAvatarModelId(preferred);
          window.localStorage.setItem("aika_avatar_model", preferred);
        }
      } catch (err) {
        setAvatarImportError(err?.message || "avatar_refresh_failed");
      }
    }

    async function loadAvatarCore() {
      try {
        const r = await fetch(`${SERVER_URL}/api/aika/avatar/core`);
        const data = await r.json();
        setAvatarCoreInfo({
          coreJs: Boolean(data.coreJs),
          coreWasm: Boolean(data.coreWasm)
        });
      } catch {
        setAvatarCoreError("avatar_core_status_failed");
      }
    }

    async function uploadAvatarCore(file) {
      if (!file) return;
      setAvatarCoreError("");
      try {
        const form = new FormData();
        form.append("file", file);
        const r = await fetch(`${SERVER_URL}/api/aika/avatar/core`, {
          method: "POST",
          body: form
        });
        if (!r.ok) {
          const data = await r.json().catch(() => ({}));
          throw new Error(data.error || "avatar_core_upload_failed");
        }
        const data = await r.json();
        setAvatarCoreInfo({
          coreJs: Boolean(data.coreJs),
          coreWasm: Boolean(data.coreWasm)
        });
        setAvatarImportNotice("Live2D core installed. Hard reload the page (Ctrl+Shift+R).");
      } catch (err) {
        setAvatarCoreError(err?.message || "avatar_core_upload_failed");
      }
    }


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

  useEffect(() => {
    const origLog = console.log;
    const origWarn = console.warn;
    const origErr = console.error;
    const push = (level, args) => {
      const line = {
        level,
        text: args.map(a => (typeof a === "string" ? a : JSON.stringify(a))).join(" "),
        time: new Date().toLocaleTimeString()
      };
      setLogLines(prev => [...prev.slice(-399), line]);
    };
    console.log = (...args) => { push("info", args); origLog(...args); };
    console.warn = (...args) => { push("warn", args); origWarn(...args); };
    console.error = (...args) => { push("error", args); origErr(...args); };
    return () => {
      console.log = origLog;
      console.warn = origWarn;
      console.error = origErr;
    };
  }, []);

  useEffect(() => {
    let mounted = true;
    async function loadAuth() {
      try {
        const resp = await fetch(`${SERVER_URL}/api/auth/me`);
        const data = await resp.json();
        if (!mounted) return;
        if (data?.authenticated) {
          setCurrentUser(data.user || null);
          const greeting = buildGreeting(data.user || null);
          setLog(prev => {
            if (prev.length === 1 && prev[0]?.role === "assistant") {
              return [{ ...prev[0], text: greeting }];
            }
            return prev;
          });
        }
      } catch {
        // ignore auth failures
      } finally {
        if (mounted) setAuthChecked(true);
      }
    }
    loadAuth();
    return () => {
      mounted = false;
    };
  }, []);

  const showAuthGate = REQUIRE_GOOGLE_AUTH && authChecked && !currentUser;
  const uiBase = typeof window !== "undefined" ? window.location.origin : "";
  const googleLoginUrl = SERVER_URL
    ? `${SERVER_URL}/api/auth/google/connect?ui_base=${encodeURIComponent(uiBase)}`
    : `/api/auth/google/connect?ui_base=${encodeURIComponent(uiBase)}`;

  if (REQUIRE_GOOGLE_AUTH && !authChecked) {
    return (
      <div style={{
        minHeight: "100vh",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background: "#0b1220",
        color: "#e5e7eb",
        padding: 24
      }}>
        <div style={{ fontSize: 14, color: "#cbd5f5" }}>Checking sign-in…</div>
      </div>
    );
  }

  if (showAuthGate) {
    return (
      <div style={{
        minHeight: "100vh",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background: "#0b1220",
        color: "#e5e7eb",
        padding: 24
      }}>
        <div style={{
          maxWidth: 520,
          width: "100%",
          background: "#0f172a",
          border: "1px solid #1f2937",
          borderRadius: 16,
          padding: 24,
          textAlign: "center"
        }}>
          <div style={{ fontSize: 20, fontWeight: 700, marginBottom: 8 }}>Sign in to Aika</div>
          <div style={{ fontSize: 14, color: "#cbd5f5", marginBottom: 16 }}>
            Aika requires Google sign-in before loading chat, voice, and recordings.
          </div>
          <button
            onClick={() => window.open(googleLoginUrl, "_blank", "width=520,height=680")}
            style={{
              padding: "10px 16px",
              borderRadius: 10,
              border: "1px solid #334155",
              background: "#1d4ed8",
              color: "white",
              fontWeight: 600,
              cursor: "pointer"
            }}
          >
            Sign in with Google
          </button>
          <div style={{ marginTop: 12, fontSize: 12, color: "#94a3b8" }}>
            After signing in, refresh this page to continue.
          </div>
        </div>
      </div>
    );
  }

  const integrationList = [
    { key: "google_docs", label: "Google Docs", detail: "Create and update docs with meeting notes.", method: "oauth", connectUrl: "/api/auth/google/connect" },
    { key: "google_drive", label: "Google Drive", detail: "Store recordings and transcripts.", method: "oauth", connectUrl: "/api/auth/google/connect" },
    { key: "slack", label: "Slack", detail: "Team chat updates.", method: "oauth", connectUrl: "/api/integrations/slack/connect", connectLabel: "Connect OAuth" },
    { key: "discord", label: "Discord", detail: "Community updates (OAuth identity).", method: "oauth", connectUrl: "/api/integrations/discord/connect", connectLabel: "Connect OAuth" },
    { key: "telegram", label: "Telegram", detail: "Message you directly (bot token).", method: "token" },
    { key: "fireflies", label: "Fireflies.ai", detail: "Meeting transcription and summaries (API key).", method: "token" },
    { key: "plex", label: "Plex", detail: "Check server status and library health.", method: "token" },
    { key: "amazon", label: "Amazon", detail: "Product search via Product Advertising API.", method: "api_key" },
    { key: "walmart", label: "Walmart+", detail: "Shopping list sync (requires developer API).", method: "api_key" },
    { key: "facebook", label: "Facebook Pages", detail: "Posts, insights, sentiment (Meta app required).", method: "oauth", connectUrl: "/api/integrations/meta/connect?product=facebook", connectLabel: "Connect Meta" },
    { key: "instagram", label: "Instagram", detail: "Posts and metrics (Meta app required).", method: "oauth", connectUrl: "/api/integrations/meta/connect?product=instagram", connectLabel: "Connect Meta" },
    { key: "whatsapp", label: "WhatsApp", detail: "Messaging via Cloud API (Meta app required).", method: "oauth", connectUrl: "/api/integrations/meta/connect?product=whatsapp", connectLabel: "Connect Meta" }
  ];

  async function toggleIntegration(provider, next, item) {
    try {
      const configured = integrations[provider]?.configured;
      if (configured === false) {
        setChatError(`${provider}_not_configured`);
        return;
      }
      if (item?.method === "oauth" && next) {
        const url = item.connectUrl ? `${SERVER_URL}${item.connectUrl}` : null;
        if (url) {
          window.open(url, "_blank", "width=520,height=680");
          return;
        }
        setChatError(`${provider}_oauth_not_implemented`);
        return;
      }
      if (!next) {
        if (provider === "google_docs" || provider === "google_drive") {
          await fetch(`${SERVER_URL}/api/integrations/google/disconnect`, { method: "POST" });
        } else if (provider === "slack") {
          await fetch(`${SERVER_URL}/api/integrations/slack/disconnect`, { method: "POST" });
        } else if (provider === "discord") {
          await fetch(`${SERVER_URL}/api/integrations/discord/disconnect`, { method: "POST" });
        } else {
          await fetch(`${SERVER_URL}/api/integrations/disconnect`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ provider })
          });
        }
        setIntegrations(prev => ({
          ...prev,
          [provider]: { ...prev[provider], connected: false, connectedAt: undefined }
        }));
        return;
      }
      const url = "/api/integrations/connect";
      await fetch(`${SERVER_URL}${url}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ provider })
      });
      setIntegrations(prev => ({
        ...prev,
        [provider]: { ...prev[provider], connected: next, connectedAt: next ? new Date().toISOString() : undefined }
      }));
    } catch {
      // ignore
    }
  }

  async function runAmazonSearch() {
    try {
      setProductResearchBusy(true);
      setProductResearchNotice("");
      setIntegrationActionError("");
      const query = amazonQuery.trim();
      if (!query) return;
      const r = await fetch(`${SERVER_URL}/api/integrations/amazon/research`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ query, limit: 8 })
      });
      const data = await r.json();
      if (!r.ok) throw new Error(data.error || "amazon_research_failed");
      const report = data.report || null;
      setProductResearch(report);
      setProductResearchOpen(Boolean(report));
      setIntegrationActionResult(JSON.stringify(report, null, 2));
    } catch (err) {
      setIntegrationActionError(err?.message || "amazon_research_failed");
    } finally {
      setProductResearchBusy(false);
    }
  }

  async function addAmazonToCart(option) {
    if (!option?.asin) return;
    try {
      setCartBusyAsin(option.asin);
      setProductResearchNotice("");
      const r = await fetch(`${SERVER_URL}/api/integrations/amazon/cart/add`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ asin: option.asin, quantity: 1 })
      });
      const data = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(data.error || "amazon_cart_add_failed");
      if (data.addToCartUrl) {
        window.open(data.addToCartUrl, "_blank", "noopener,noreferrer");
        setProductResearchNotice(`Opened Amazon add-to-cart for ${option.title || option.asin}.`);
      } else {
        setProductResearchNotice("Amazon cart URL returned empty.");
      }
    } catch (err) {
      setProductResearchNotice(`Cart action failed: ${err?.message || "amazon_cart_add_failed"}`);
    } finally {
      setCartBusyAsin("");
    }
  }

  async function fetchFacebookProfile() {
    try {
      setIntegrationActionError("");
      const r = await fetch(`${SERVER_URL}/api/integrations/facebook/profile`);
      const data = await r.json();
      if (!r.ok) throw new Error(data.error || "facebook_profile_failed");
      setIntegrationActionResult(JSON.stringify(data, null, 2));
    } catch (err) {
      setIntegrationActionError(err?.message || "facebook_profile_failed");
    }
  }

  async function fetchFacebookPosts() {
    try {
      setIntegrationActionError("");
      const r = await fetch(`${SERVER_URL}/api/integrations/facebook/posts`);
      const data = await r.json();
      if (!r.ok) throw new Error(data.error || "facebook_posts_failed");
      setIntegrationActionResult(JSON.stringify(data, null, 2));
    } catch (err) {
      setIntegrationActionError(err?.message || "facebook_posts_failed");
    }
  }

  async function runVoiceFullTestNow() {
    try {
      setVoiceFullTestError("");
      setVoiceFullTestRunning(true);
      const r = await fetch(`${SERVER_URL}/api/voice/fulltest`, { method: "POST" });
      const data = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(data.error || "voice_fulltest_failed");
      setVoiceFullTest(data?.state?.report || null);
      setVoiceFullTestRunning(Boolean(data?.state?.running));
    } catch (err) {
      setVoiceFullTestError(err?.message || "voice_fulltest_failed");
    } finally {
      setVoiceFullTestRunning(false);
    }
  }

  async function toggleSkill(key, next) {
    try {
      const r = await fetch(`${SERVER_URL}/api/skills/toggle`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ key, enabled: next })
      });
      if (!r.ok) throw new Error("skills_toggle_failed");
      setSkills(prev => prev.map(s => (s.key === key ? { ...s, enabled: next } : s)));
      setSkillsError("");
    } catch (err) {
      setSkillsError(err?.message || "skills_toggle_failed");
    }
  }

  async function runSkillVault(skillId) {
    try {
      setSkillVaultError("");
      const r = await fetch(`${SERVER_URL}/api/skill-vault/${skillId}/run`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ input: skillVaultInput })
      });
      const data = await r.json();
      if (data?.status === "approval_required") {
        setSkillVaultResult(JSON.stringify(data, null, 2));
        return;
      }
      if (!r.ok) throw new Error(data.error || "skill_run_failed");
      setSkillVaultResult(JSON.stringify(data, null, 2));
    } catch (err) {
      setSkillVaultError(err?.message || "skill_run_failed");
    }
  }

  function ensureMeetingRecognizer() {
    if (meetingRecRef.current) return meetingRecRef.current;
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognition) {
      setMeetingStatus("Meeting recorder not supported in this browser.");
      return null;
    }
    const r = new SpeechRecognition();
    r.lang = "en-US";
    r.continuous = true;
    r.interimResults = true;
    r.onresult = (e) => {
      let finalText = "";
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const res = e.results[i];
        if (res.isFinal) finalText += res[0].transcript;
      }
      if (finalText) {
        setMeetingTranscript(prev => `${prev} ${finalText}`.trim());
      }
    };
    r.onerror = (e) => {
      setMeetingStatus(e?.error || "Meeting recorder error");
      setMeetingRecording(false);
    };
    r.onend = () => {
      setMeetingRecording(false);
    };
    meetingRecRef.current = r;
    return r;
  }

  function startMeetingRecorder() {
    const r = ensureMeetingRecognizer();
    if (!r) return;
    setMeetingStatus("Recording...");
    setMeetingRecording(true);
    stopMic();
    try {
      r.start();
    } catch {
      setMeetingRecording(false);
    }
  }

  function stopMeetingRecorder() {
    const r = meetingRecRef.current;
    if (r) r.stop();
    setMeetingRecording(false);
    setMeetingStatus("Recording stopped");
  }

  async function generateMeetingSummary() {
    if (!meetingTranscript.trim()) {
      setMeetingStatus("No transcript captured yet.");
      return;
    }
    setMeetingStatus("Generating summary...");
    try {
      const r = await fetch(`${SERVER_URL}/api/meetings/summary`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: meetingTitle, transcript: meetingTranscript })
      });
      const data = await r.json();
      if (!r.ok) throw new Error(data.error || "meeting_summary_failed");
      setMeetingDocUrl(data.docUrl || "");
      setMeetingStatus("Summary ready.");
    } catch (err) {
      setMeetingStatus(err?.message || "meeting_summary_failed");
    }
  }

  async function addWebhook() {
    try {
      const name = webhookForm.name.trim();
      const url = webhookForm.url.trim();
      if (!name || !url) return;
      const r = await fetch(`${SERVER_URL}/api/skills/webhooks`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, url })
      });
      if (!r.ok) throw new Error("webhook_add_failed");
      const data = await r.json();
      setWebhooks(prev => {
        const next = prev.filter(w => w.id !== data.webhook.id && w.name !== data.webhook.name);
        return [...next, data.webhook];
      });
      setWebhookForm({ name: "", url: "" });
    } catch (err) {
      setSkillsError(err?.message || "webhook_add_failed");
    }
  }

  async function deleteWebhook(name) {
    try {
      const r = await fetch(`${SERVER_URL}/api/skills/webhooks/${encodeURIComponent(name)}`, {
        method: "DELETE"
      });
      if (!r.ok) throw new Error("webhook_delete_failed");
      setWebhooks(prev => prev.filter(w => w.name !== name));
    } catch (err) {
      setSkillsError(err?.message || "webhook_delete_failed");
    }
  }

  async function addScene() {
    try {
      const name = sceneForm.name.trim();
      if (!name) return;
      const hooks = sceneForm.hooks
        .split(",")
        .map(s => s.trim())
        .filter(Boolean);
      const r = await fetch(`${SERVER_URL}/api/skills/scenes`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, hooks })
      });
      if (!r.ok) throw new Error("scene_add_failed");
      const data = await r.json();
      setScenes(prev => {
        const next = prev.filter(s => s.name !== data.scene.name && s.id !== data.scene.id);
        return [...next, data.scene];
      });
      setSceneForm({ name: "", hooks: "" });
    } catch (err) {
      setSkillsError(err?.message || "scene_add_failed");
    }
  }

  async function deleteScene(name) {
    try {
      const r = await fetch(`${SERVER_URL}/api/skills/scenes/${encodeURIComponent(name)}`, {
        method: "DELETE"
      });
      if (!r.ok) throw new Error("scene_delete_failed");
      setScenes(prev => prev.filter(s => s.name !== name));
    } catch (err) {
      setSkillsError(err?.message || "scene_delete_failed");
    }
  }

  async function triggerScene(name) {
    try {
      const r = await fetch(`${SERVER_URL}/api/skills/scenes/trigger`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name })
      });
      if (!r.ok) throw new Error("scene_trigger_failed");
    } catch (err) {
      setSkillsError(err?.message || "scene_trigger_failed");
    }
  }

  function downloadExport(type) {
    const url = `${SERVER_URL}/api/skills/export/${type}`;
    const a = document.createElement("a");
    a.href = url;
    a.download = `aika_${type}.txt`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  }

  async function callTool() {
    setToolCallResult("");
    setToolsError("");
    try {
      const params = JSON.parse(toolCallParams || "{}");
      const r = await fetch(`${SERVER_URL}/api/tools/call`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: toolCallName, params })
      });
      const data = await r.json();
      setToolCallResult(JSON.stringify(data, null, 2));
      await refreshToolHistory();
      const approvalsResp = await fetch(`${SERVER_URL}/api/approvals`);
      const approvalsData = await approvalsResp.json();
      setApprovals(Array.isArray(approvalsData.approvals) ? approvalsData.approvals : []);
    } catch (err) {
      setToolsError(err?.message || "tool_call_failed");
    }
  }

  async function refreshToolHistory() {
    setToolHistoryError("");
    try {
      const r = await fetch(`${SERVER_URL}/api/tools/history?limit=50`);
      const data = await r.json();
      setToolHistory(Array.isArray(data.history) ? data.history : []);
    } catch (err) {
      setToolHistoryError(err?.message || "history_load_failed");
    }
  }

  async function approveAction(id) {
    setApprovalsError("");
    try {
      const r = await fetch(`${SERVER_URL}/api/approvals/${id}/approve`, { method: "POST" });
      if (!r.ok) throw new Error("approval_failed");
      const data = await r.json();
      setApprovals(prev => prev.map(a => (a.id === id ? data.approval : a)));
      await refreshToolHistory();
    } catch (err) {
      setApprovalsError(err?.message || "approval_failed");
    }
  }

  async function denyAction(id) {
    setApprovalsError("");
    try {
      const r = await fetch(`${SERVER_URL}/api/approvals/${id}/deny`, { method: "POST" });
      if (!r.ok) throw new Error("approval_deny_failed");
      const data = await r.json();
      setApprovals(prev => prev.map(a => (a.id === id ? data.approval : a)));
      await refreshToolHistory();
    } catch (err) {
      setApprovalsError(err?.message || "approval_deny_failed");
    }
  }

  async function executeAction(id, token) {
    setApprovalsError("");
    try {
      const r = await fetch(`${SERVER_URL}/api/approvals/${id}/execute`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token })
      });
      const data = await r.json();
      setToolCallResult(JSON.stringify(data, null, 2));
      await refreshToolHistory();
      const approvalsResp = await fetch(`${SERVER_URL}/api/approvals`);
      const approvalsData = await approvalsResp.json();
      setApprovals(Array.isArray(approvalsData.approvals) ? approvalsData.approvals : []);
    } catch (err) {
      setApprovalsError(err?.message || "approval_execute_failed");
    }
  }

  function normalizeMcpServices(tools, integrationsState) {
    const serviceMap = new Map();
    const addService = (id, displayName, status = "unknown") => {
      if (!serviceMap.has(id)) {
        serviceMap.set(id, { id, displayName, status, tools: [], connectSpec: null, details: {} });
      }
      return serviceMap.get(id);
    };

    const inferService = (toolName) => {
      const [prefix, rest] = String(toolName || "").split(".");
      if (prefix === "messaging") {
        if (rest?.toLowerCase().includes("slack")) return "slack";
        if (rest?.toLowerCase().includes("telegram")) return "telegram";
        if (rest?.toLowerCase().includes("discord")) return "discord";
        return "messaging";
      }
      if (prefix === "integrations") {
        if (rest?.toLowerCase().includes("plex")) return "plex";
        if (rest?.toLowerCase().includes("fireflies")) return "fireflies";
        return "integrations";
      }
      return prefix || "core";
    };

    for (const tool of tools) {
      const serviceId = inferService(tool.name);
      const svc = addService(serviceId, serviceId.charAt(0).toUpperCase() + serviceId.slice(1));
      svc.tools.push(tool);
    }

    const connectSpecs = {
      google: { method: "oauth", authorizeUrl: "/api/integrations/google/connect" },
      amazon: { method: "oauth", authorizeUrl: "/api/integrations/amazon/auth/start" },
      walmart: { method: "oauth", authorizeUrl: "/api/integrations/walmart/auth/start" },
      fireflies: { method: "api_key", fields: [{ key: "FIREFLIES_API_KEY", label: "Fireflies API Key", type: "password", required: true }] },
      slack: { method: "api_key", fields: [{ key: "SLACK_BOT_TOKEN", label: "Slack Bot Token", type: "password", required: true }] },
      telegram: { method: "api_key", fields: [{ key: "TELEGRAM_BOT_TOKEN", label: "Telegram Bot Token", type: "password", required: true }] },
      discord: { method: "api_key", fields: [{ key: "DISCORD_BOT_TOKEN", label: "Discord Bot Token", type: "password", required: true }] },
      plex: { method: "api_key", fields: [{ key: "PLEX_TOKEN", label: "Plex Token", type: "password", required: true }] }
    };

    for (const [key, state] of Object.entries(integrationsState || {})) {
      const svc = addService(key, key.charAt(0).toUpperCase() + key.slice(1), state.connected ? "connected" : "not_connected");
      svc.details = { configured: state.configured, connectedAt: state.connectedAt };
      svc.connectSpec = connectSpecs[key] || { method: "custom" };
    }

    for (const svc of serviceMap.values()) {
      if (!svc.connectSpec) svc.connectSpec = connectSpecs[svc.id] || { method: "none" };
      if (svc.status === "unknown" && svc.connectSpec.method === "none") {
        svc.status = "connected";
      }
    }

    return Array.from(serviceMap.values()).sort((a, b) => a.displayName.localeCompare(b.displayName));
  }

  async function refreshFeatures() {
    setFeaturesLastDiscovery(0);
    setFeaturesError("");
    setFeaturesServices([]);
    setFeaturesSelected("");
  }

  async function openConnect(service) {
    setConnectModal(service);
  }

  async function runOAuth(service) {
    if (!service?.connectSpec?.authorizeUrl) return;
    window.open(`${SERVER_URL}${service.connectSpec.authorizeUrl}`, "_blank", "width=520,height=680");
  }

  async function markConnected(serviceId, connected) {
    const url = connected ? "/api/integrations/connect" : "/api/integrations/disconnect";
    await fetch(`${SERVER_URL}${url}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ provider: serviceId })
    });
    refreshFeatures();
  }

  async function copyDiagnostics() {
    if (!featuresDiagnostics) return;
    const payload = {
      ...featuresDiagnostics,
      services: featuresServices.map(s => ({
        id: s.id,
        status: s.status,
        tools: s.tools.length
      }))
    };
    await navigator.clipboard.writeText(JSON.stringify(payload, null, 2));
  }

  function handleBackgroundUpload(file) {
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      const result = typeof reader.result === "string" ? reader.result : "";
      setAppBackground(result);
    };
    reader.readAsDataURL(file);
  }

    return (
      <div style={{
        display: "grid",
        gridTemplateColumns: "1.15fr 0.85fr",
        height: "100vh",
        background: "var(--app-bg)",
        color: "var(--text-primary)"
      }}>
        <div style={{ position: "relative" }}>
          {skillToasts.length > 0 && (
            <div style={{
              position: "absolute",
              top: 12,
              left: 12,
              right: 12,
              display: "flex",
              flexDirection: "column",
              gap: 8,
              zIndex: 5
            }}>
              {skillToasts.map(t => (
                <div key={t.id} style={{
                  border: "1px solid #d1d5db",
                  background: "#fefce8",
                  color: "#92400e",
                  padding: "8px 10px",
                  borderRadius: 10,
                  fontSize: 12,
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center"
                }}>
                  <span>{t.text}</span>
                  <button
                    onClick={() => setSkillToasts(prev => prev.filter(x => x.id !== t.id))}
                    style={{ padding: "2px 8px", borderRadius: 8 }}
                  >
                    Dismiss
                  </button>
                </div>
              ))}
            </div>
          )}
          <AikaAvatar
            mood={behavior?.emotion || Emotion.NEUTRAL}
            isTalking={ttsStatus === "playing" || behavior?.speaking}
            talkIntensity={ttsStatus === "playing" ? Math.max(0.12, ttsLevel) : (behavior?.intensity ?? 0.35)}
            isListening={micState === "listening"}
            modelUrl={avatarModels.find(m => m.id === avatarModelId)?.modelUrl}
            fallbackPng={avatarModels.find(m => m.id === avatarModelId)?.fallbackPng}
            backgroundSrc={AVATAR_BACKGROUNDS.find(bg => bg.id === avatarBackground)?.src}
          />
      </div>

      <div style={{
        padding: 16,
        display: "flex",
        flexDirection: "column",
        gap: 12,
        background: "var(--panel-bg)",
        color: "var(--text-primary)",
        borderLeft: "1px solid var(--panel-border)"
      }}>
        {!audioUnlocked && (
          <div style={{
            border: "1px solid #f59e0b",
            background: "#fff7ed",
            color: "#92400e",
            borderRadius: 12,
            padding: "10px 12px",
            fontSize: 12,
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: 10
          }}>
            <span>Audio is locked by the browser. Click once to enable voice.</span>
            <button
              onClick={async () => {
                const ok = await unlockAudio();
                if (ok) {
                  setAudioUnlocked(true);
                  setTtsError("");
                } else {
                  setTtsError("audio_locked_click_enable");
                }
              }}
              style={{
                padding: "6px 10px",
                borderRadius: 8,
                border: "1px solid #f59e0b",
                background: "#fffbeb",
                fontWeight: 600
              }}
            >
              Enable Audio
            </button>
          </div>
        )}
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
          <button
            onClick={() => setActiveTab("chat")}
            style={{
              padding: "8px 12px",
              borderRadius: 10,
              border: activeTab === "chat" ? "2px solid #2b6cb0" : "1px solid #e5e7eb",
              background: activeTab === "chat" ? "#e6f0ff" : "white"
            }}
          >
            Chat
          </button>
          <button
            onClick={() => setActiveTab("recordings")}
            style={{
              padding: "8px 12px",
              borderRadius: 10,
              border: activeTab === "recordings" ? "2px solid #2b6cb0" : "1px solid #e5e7eb",
              background: activeTab === "recordings" ? "#e6f0ff" : "white"
            }}
          >
            Recordings
          </button>
            <button
              onClick={() => setActiveTab("workbench")}
              style={{
                padding: "8px 12px",
                borderRadius: 10,
                border: activeTab === "workbench" ? "2px solid #2b6cb0" : "1px solid #e5e7eb",
                background: activeTab === "workbench" ? "#e6f0ff" : "white"
              }}
            >
              Aika Tools
            </button>
            <button
              onClick={() => setActiveTab("tools")}
              style={{
                padding: "8px 12px",
                borderRadius: 10,
                border: activeTab === "tools" ? "2px solid #2b6cb0" : "1px solid #e5e7eb",
                background: activeTab === "tools" ? "#e6f0ff" : "white"
              }}
            >
              Tools
            </button>
            <button
              onClick={() => setActiveTab("actionRunner")}
              style={{
                padding: "8px 12px",
                borderRadius: 10,
                border: activeTab === "actionRunner" ? "2px solid #2b6cb0" : "1px solid #e5e7eb",
                background: activeTab === "actionRunner" ? "#e6f0ff" : "white"
              }}
            >
              Action Runner
            </button>
            <button
              onClick={() => setActiveTab("teachMode")}
              style={{
                padding: "8px 12px",
                borderRadius: 10,
                border: activeTab === "teachMode" ? "2px solid #2b6cb0" : "1px solid #e5e7eb",
                background: activeTab === "teachMode" ? "#e6f0ff" : "white"
              }}
            >
              Teach Mode
            </button>
            <button
              onClick={() => setActiveTab("canvas")}
              style={{
                padding: "8px 12px",
                borderRadius: 10,
                border: activeTab === "canvas" ? "2px solid #2b6cb0" : "1px solid #e5e7eb",
                background: activeTab === "canvas" ? "#e6f0ff" : "white"
              }}
            >
              Canvas
            </button>
            <button
              onClick={() => setActiveTab("features")}
              style={{
                padding: "8px 12px",
                borderRadius: 10,
                border: activeTab === "features" ? "2px solid #2b6cb0" : "1px solid #e5e7eb",
                background: activeTab === "features" ? "#e6f0ff" : "white"
              }}
            >
              Features
            </button>
            <button
              onClick={() => {
                setActiveTab("settings");
                setSettingsTab("integrations");
              }}
              style={{
                padding: "8px 12px",
                borderRadius: 10,
                border: activeTab === "settings" ? "2px solid #2b6cb0" : "1px solid #e5e7eb",
                background: activeTab === "settings" ? "#e6f0ff" : "white"
              }}
            >
              Settings
            </button>
            <button
              onClick={() => setActiveTab("debug")}
              style={{
                padding: "8px 12px",
                borderRadius: 10,
              border: activeTab === "debug" ? "2px solid #2b6cb0" : "1px solid #e5e7eb",
              background: activeTab === "debug" ? "#e6f0ff" : "white"
            }}
          >
            Debug
          </button>
          <button
            onClick={() => setActiveTab("guide")}
            style={{
              padding: "8px 12px",
              borderRadius: 10,
              border: activeTab === "guide" ? "2px solid #2b6cb0" : "1px solid #e5e7eb",
              background: activeTab === "guide" ? "#e6f0ff" : "white"
            }}
          >
            Guide
          </button>
          <div style={{ marginLeft: "auto", display: "flex", gap: 8, alignItems: "center" }}>
            {currentUser ? (
              <div style={{ fontSize: 12, color: "#6b7280" }}>
                Signed in as <b>{currentUser.name || currentUser.email || currentUser.id}</b>
              </div>
            ) : (
              <button
                onClick={() => window.open(googleLoginUrl, "_blank", "width=520,height=680")}
                style={{
                  padding: "8px 12px",
                  borderRadius: 10,
                  border: "1px solid #e5e7eb",
                  background: "#fff"
                }}
              >
                Sign in with Google
              </button>
            )}
          </div>
        </div>

          {activeTab === "settings" && (
            <div style={{ display: "flex", gap: 8, marginBottom: 10, flexWrap: "wrap" }}>
              {[
                { key: "integrations", label: "Integrations" },
                { key: "skills", label: "Skills" },
                { key: "appearance", label: "Appearance" },
                { key: "voice", label: "Voice" }
              ].map(item => (
                <button
                  key={item.key}
                  onClick={() => setSettingsTab(item.key)}
                  style={{
                    padding: "6px 10px",
                    borderRadius: 8,
                    border: settingsTab === item.key ? "2px solid #2b6cb0" : "1px solid #e5e7eb",
                    background: settingsTab === item.key ? "#e6f0ff" : "white"
                  }}
                >
                  {item.label}
                </button>
              ))}
            </div>
          )}

          {activeTab === "settings" && settingsTab === "integrations" && (
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              <div style={{ fontSize: 14, fontWeight: 600, color: "#111827" }}>
                Connect services for Aika's agent mode
              </div>
            {integrationList.map(item => {
              const status = integrations[item.key]?.connected ? "Connected" : "Not connected";
              const configured = integrations[item.key]?.configured;
              return (
                <div key={item.key} style={{
                  border: "1px solid #e5e7eb",
                  borderRadius: 12,
                  padding: 12,
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  background: "white"
                }}>
                  <div>
                    <div style={{ fontWeight: 600 }}>{item.label}</div>
                    <div style={{ fontSize: 12, color: "#6b7280" }}>{item.detail}</div>
                  </div>
                  <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <span style={{ fontSize: 12, color: "#6b7280" }}>
                      {status}{configured === false ? " · Missing config" : ""}
                    </span>
                    <button
                      onClick={() => toggleIntegration(item.key, !integrations[item.key]?.connected, item)}
                      style={{ padding: "6px 10px", borderRadius: 8 }}
                    >
                      {integrations[item.key]?.connected ? "Disconnect" : "Connect"}
                    </button>
                  </div>
                </div>
              );
            })}
              <div style={{ fontSize: 12, color: "#6b7280" }}>
                Note: Real connections require API keys and OAuth setup. Configure them in `apps/server/.env`.
              </div>
              <div style={{ marginTop: 12, padding: 12, borderRadius: 12, border: "1px solid #e5e7eb", background: "white" }}>
                <div style={{ fontWeight: 600, marginBottom: 6 }}>Integration Actions</div>
                <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
                  <input
                    value={amazonQuery}
                    onChange={(e) => setAmazonQuery(e.target.value)}
                    placeholder="Search Amazon for..."
                    style={{ padding: 6, borderRadius: 8, border: "1px solid #d1d5db", minWidth: 220 }}
                  />
                  <button
                    onClick={runAmazonSearch}
                    disabled={productResearchBusy || !amazonQuery.trim()}
                    style={{ padding: "6px 10px", borderRadius: 8 }}
                  >
                    {productResearchBusy ? "Analyzing..." : "Analyze Product"}
                  </button>
                  <button onClick={fetchFacebookProfile} style={{ padding: "6px 10px", borderRadius: 8 }}>
                    Fetch Facebook Profile
                  </button>
                  <button onClick={fetchFacebookPosts} style={{ padding: "6px 10px", borderRadius: 8 }}>
                    Fetch Facebook Posts
                  </button>
                </div>
                {integrationActionError && (
                  <div style={{ fontSize: 12, color: "#b91c1c", marginTop: 6 }}>
                    {integrationActionError}
                  </div>
                )}
                {integrationActionResult && (
                  <pre style={{ fontSize: 11, marginTop: 8, whiteSpace: "pre-wrap", background: "#f8fafc", padding: 8, borderRadius: 8 }}>
                    {integrationActionResult}
                  </pre>
                )}
                <div style={{ fontSize: 11, color: "#6b7280", marginTop: 6 }}>
                  Product analysis opens a recommendation popup with best-value pick and cart actions.
                </div>
              </div>
            </div>
          )}

        {activeTab === "settings" && settingsTab === "skills" && (
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
              <div style={{ fontSize: 14, fontWeight: 600, color: "#111827" }}>
                Everyday Skills (local-first)
              </div>
              <div style={{ fontSize: 12, color: "#6b7280" }}>
                Toggle skills on/off. These run locally on your server and respond instantly when triggered.
              </div>
              {skills.map(skill => (
                <div key={skill.key} style={{
                  border: "1px solid #e5e7eb",
                  borderRadius: 12,
                  padding: 12,
                  background: "white",
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center"
                }}>
                  <div>
                    <div style={{ fontWeight: 600 }}>{skill.label}</div>
                    <div style={{ fontSize: 12, color: "#6b7280" }}>{skill.description}</div>
                  </div>
                  <button
                    onClick={() => toggleSkill(skill.key, !skill.enabled)}
                    style={{
                      padding: "6px 10px",
                      borderRadius: 8,
                      border: skill.enabled ? "2px solid #10b981" : "1px solid #d1d5db",
                      background: skill.enabled ? "#ecfdf3" : "white",
                      color: skill.enabled ? "#047857" : "#6b7280",
                      fontWeight: 600
                    }}
                  >
                    {skill.enabled ? "Enabled" : "Disabled"}
                  </button>
                </div>
              ))}
              {skillsError && (
                <div style={{ color: "#b91c1c", fontSize: 12 }}>Skills error: {skillsError}</div>
              )}

              <div style={{ fontSize: 14, fontWeight: 600, color: "#111827", marginTop: 6 }}>
                Exports
              </div>
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                <button onClick={() => downloadExport("notes")} style={{ padding: "6px 10px", borderRadius: 8 }}>
                  Download Notes
                </button>
                <button onClick={() => downloadExport("todos")} style={{ padding: "6px 10px", borderRadius: 8 }}>
                  Download Todos
                </button>
                <button onClick={() => downloadExport("shopping")} style={{ padding: "6px 10px", borderRadius: 8 }}>
                  Download Shopping
                </button>
                <button onClick={() => downloadExport("reminders")} style={{ padding: "6px 10px", borderRadius: 8 }}>
                  Download Reminders
                </button>
              </div>

              <div style={{ fontSize: 14, fontWeight: 600, color: "#111827", marginTop: 6 }}>
                Skill Vault
              </div>
              <div style={{ fontSize: 12, color: "#6b7280" }}>
                Local-only skill registry with prompts and macros.
              </div>
              <label style={{ fontSize: 12 }}>
                Input for skill run
                <input
                  value={skillVaultInput}
                  onChange={(e) => setSkillVaultInput(e.target.value)}
                  style={{ width: "100%", padding: 8, marginTop: 4, borderRadius: 8, border: "1px solid #d1d5db" }}
                />
              </label>
              <div style={{ display: "grid", gap: 8 }}>
                {skillVault.map(skill => (
                  <div key={skill.id} style={{ border: "1px solid #e5e7eb", borderRadius: 12, padding: 10, background: "white" }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                      <div>
                        <div style={{ fontWeight: 600 }}>{skill.name}</div>
                        <div style={{ fontSize: 11, color: "#6b7280" }}>v{skill.version || "0.0.1"}</div>
                      </div>
                      <button onClick={() => runSkillVault(skill.id)} style={{ padding: "4px 8px", borderRadius: 6 }}>
                        Run
                      </button>
                    </div>
                  </div>
                ))}
                {skillVault.length === 0 && <div style={{ fontSize: 12, color: "#6b7280" }}>No vault skills yet.</div>}
              </div>
              {skillVaultError && <div style={{ color: "#b91c1c", fontSize: 12 }}>Skill Vault error: {skillVaultError}</div>}
              {skillVaultResult && (
                <pre style={{ fontSize: 11, marginTop: 6, whiteSpace: "pre-wrap", background: "#f8fafc", padding: 8, borderRadius: 8 }}>
                  {skillVaultResult}
                </pre>
              )}

              <div style={{ fontSize: 14, fontWeight: 600, color: "#111827", marginTop: 6 }}>
                Reminders Notifications
              </div>
              <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
                <label style={{ display: "flex", gap: 6, alignItems: "center", fontSize: 12 }}>
                  <input
                    type="checkbox"
                    checked={reminderAudioCue}
                    onChange={(e) => setReminderAudioCue(e.target.checked)}
                  />
                  Audio cue (beep)
                </label>
                <label style={{ display: "flex", gap: 6, alignItems: "center", fontSize: 12 }}>
                  <input
                    type="checkbox"
                    checked={reminderPush}
                    onChange={async (e) => {
                      const next = e.target.checked;
                      setReminderPush(next);
                      if (next && "Notification" in window) {
                        const perm = await Notification.requestPermission();
                        if (perm !== "granted") setReminderPush(false);
                      }
                    }}
                  />
                  Push notification
                </label>
              </div>

              <div style={{ fontSize: 14, fontWeight: 600, color: "#111827", marginTop: 6 }}>
                Webhooks (automation)
              </div>
              <div style={{ fontSize: 12, color: "#6b7280" }}>
                Add a webhook and say: “Trigger &lt;name&gt;” or “Run &lt;name&gt;”.
              </div>
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                <input
                  placeholder="Name (e.g., lights_on)"
                  value={webhookForm.name}
                  onChange={(e) => setWebhookForm(s => ({ ...s, name: e.target.value }))}
                  style={{ padding: 6, borderRadius: 8, border: "1px solid #d1d5db", minWidth: 160 }}
                />
                <input
                  placeholder="Webhook URL"
                  value={webhookForm.url}
                  onChange={(e) => setWebhookForm(s => ({ ...s, url: e.target.value }))}
                  style={{ padding: 6, borderRadius: 8, border: "1px solid #d1d5db", minWidth: 280 }}
                />
                <button onClick={addWebhook} style={{ padding: "6px 10px", borderRadius: 8 }}>
                  Add Webhook
                </button>
              </div>
              <div style={{ border: "1px solid #e5e7eb", borderRadius: 12, padding: 10, background: "white" }}>
                {webhooks.length ? webhooks.map(h => (
                  <div key={h.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
                    <div>
                      <div style={{ fontWeight: 600 }}>{h.name}</div>
                      <div style={{ fontSize: 11, color: "#6b7280" }}>{h.url}</div>
                    </div>
                    <button onClick={() => deleteWebhook(h.name)} style={{ padding: "4px 8px", borderRadius: 8 }}>
                      Remove
                    </button>
                  </div>
                )) : (
                  <div style={{ fontSize: 12, color: "#6b7280" }}>No webhooks yet.</div>
                )}
              </div>

              <div style={{ fontSize: 14, fontWeight: 600, color: "#111827", marginTop: 6 }}>
                Scenes
              </div>
              <div style={{ fontSize: 12, color: "#6b7280" }}>
                Scenes trigger multiple webhooks in sequence. Example: “Run scene morning”.
              </div>
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                <input
                  placeholder="Scene name"
                  value={sceneForm.name}
                  onChange={(e) => setSceneForm(s => ({ ...s, name: e.target.value }))}
                  style={{ padding: 6, borderRadius: 8, border: "1px solid #d1d5db", minWidth: 160 }}
                />
                <input
                  placeholder="Webhook names (comma-separated)"
                  value={sceneForm.hooks}
                  onChange={(e) => setSceneForm(s => ({ ...s, hooks: e.target.value }))}
                  style={{ padding: 6, borderRadius: 8, border: "1px solid #d1d5db", minWidth: 280 }}
                />
                <button onClick={addScene} style={{ padding: "6px 10px", borderRadius: 8 }}>
                  Save Scene
                </button>
              </div>
              <div style={{ border: "1px solid #e5e7eb", borderRadius: 12, padding: 10, background: "white" }}>
                {scenes.length ? scenes.map(s => (
                  <div key={s.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
                    <div>
                      <div style={{ fontWeight: 600 }}>{s.name}</div>
                      <div style={{ fontSize: 11, color: "#6b7280" }}>{(s.hooks || []).join(", ")}</div>
                    </div>
                    <div style={{ display: "flex", gap: 6 }}>
                      <button onClick={() => triggerScene(s.name)} style={{ padding: "4px 8px", borderRadius: 8 }}>
                        Trigger
                      </button>
                      <button onClick={() => deleteScene(s.name)} style={{ padding: "4px 8px", borderRadius: 8 }}>
                        Remove
                      </button>
                    </div>
                  </div>
                )) : (
                  <div style={{ fontSize: 12, color: "#6b7280" }}>No scenes yet.</div>
                )}
              </div>

              <div style={{ fontSize: 14, fontWeight: 600, color: "#111827", marginTop: 6 }}>
                Recent Skill Activity
              </div>
              <div style={{
                border: "1px solid #e5e7eb",
                borderRadius: 12,
                padding: 10,
                background: "white",
                fontSize: 12,
                color: "#374151",
                maxHeight: 180,
                overflow: "auto"
              }}>
                {skillEvents.length ? skillEvents.map((evt, idx) => (
                  <div key={`${evt.time}-${idx}`} style={{ marginBottom: 6 }}>
                    <b>{evt.skill}</b> · {evt.type} · {evt.time}
                  </div>
                )) : (
                  <div>No skill activity yet.</div>
                )}
              </div>

              <div style={{ fontSize: 14, fontWeight: 600, color: "#111827", marginTop: 6 }}>
                Meeting Recorder (local)
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                <input
                  value={meetingTitle}
                  onChange={(e) => setMeetingTitle(e.target.value)}
                  placeholder="Meeting title"
                  style={{ padding: 6, borderRadius: 8, border: "1px solid #d1d5db" }}
                />
                <div style={{ display: "flex", gap: 8 }}>
                  {!meetingRecording ? (
                    <button onClick={startMeetingRecorder} style={{ padding: "6px 10px", borderRadius: 8 }}>
                      Start Recording
                    </button>
                  ) : (
                    <button onClick={stopMeetingRecorder} style={{ padding: "6px 10px", borderRadius: 8 }}>
                      Stop Recording
                    </button>
                  )}
                  <button onClick={generateMeetingSummary} style={{ padding: "6px 10px", borderRadius: 8 }}>
                    Generate Summary
                  </button>
                </div>
                <textarea
                  value={meetingTranscript}
                  readOnly
                  rows={4}
                  placeholder="Transcript appears here..."
                  style={{ padding: 6, borderRadius: 8, border: "1px solid #e5e7eb" }}
                />
                {meetingStatus && (
                  <div style={{ fontSize: 12, color: "#6b7280" }}>{meetingStatus}</div>
                )}
                {meetingDocUrl && (
                  <a href={meetingDocUrl} target="_blank" rel="noreferrer" style={{ fontSize: 12 }}>
                    Open Meeting Summary
                  </a>
                )}
              </div>
            </div>
          )}

          {activeTab === "settings" && settingsTab === "appearance" && (
            <div style={{ display: "grid", gap: 12 }}>
              <div style={{ fontSize: 14, fontWeight: 600, color: "#111827" }}>
                Appearance
              </div>
              <label style={{ display: "flex", flexDirection: "column", gap: 6, fontSize: 12, color: "#374151", maxWidth: 260 }}>
                Theme
                <select
                  value={themeId}
                  onChange={(e) => setThemeId(e.target.value)}
                  style={{ padding: 6, borderRadius: 6, border: "1px solid #d1d5db" }}
                >
                  {THEMES.map(t => (
                    <option key={t.id} value={t.id}>{t.label}</option>
                  ))}
                </select>
              </label>
              <label style={{ display: "flex", flexDirection: "column", gap: 6, fontSize: 12, color: "#374151", maxWidth: 360 }}>
                App background image (fills the borders, not the panels)
                <input
                  type="file"
                  accept="image/*"
                  onChange={(e) => handleBackgroundUpload(e.target.files?.[0])}
                />
                <button
                  onClick={() => setAppBackground("")}
                  style={{ marginTop: 4, padding: "4px 8px", borderRadius: 6 }}
                >
                  Clear background
                </button>
              </label>
              <label style={{ display: "flex", flexDirection: "column", gap: 6, fontSize: 12, color: "#374151", maxWidth: 260 }}>
                Avatar background
                <select
                  value={avatarBackground}
                  onChange={(e) => setAvatarBackground(e.target.value)}
                  style={{ padding: 6, borderRadius: 6, border: "1px solid #d1d5db" }}
                >
                  {AVATAR_BACKGROUNDS.map(bg => (
                    <option key={bg.id} value={bg.id}>{bg.label}</option>
                  ))}
                </select>
              </label>
              <label style={{ display: "flex", gap: 8, alignItems: "center", fontSize: 12, color: "#374151" }}>
                <input
                  type="checkbox"
                  checked={meetingCommandListening}
                  onChange={(e) => setMeetingCommandListening(e.target.checked)}
                />
                Listening for recording commands ("hey Aika, start recording")
              </label>
            </div>
          )}

          {activeTab === "settings" && settingsTab === "voice" && (
            <div style={{ display: "grid", gap: 10 }}>
              <div style={{ fontSize: 14, fontWeight: 600, color: "#111827" }}>
                Voice & Audio
              </div>
              <div style={{ fontSize: 12, color: "#6b7280" }}>
                Voice settings are in the panel below. Open it here to edit.
              </div>
              <button
                onClick={() => setShowSettings(true)}
                style={{ padding: "6px 10px", borderRadius: 8, maxWidth: 200 }}
              >
                Open Voice Settings
              </button>
              <label style={{ display: "grid", gap: 4, maxWidth: 360, fontSize: 12, color: "#374151" }}>
                Send after silence: {(sttSilenceMs / 1000).toFixed(1)}s
                <input
                  type="range"
                  min={800}
                  max={3000}
                  step={100}
                  value={sttSilenceMs}
                  onChange={(e) => setSttSilenceMs(Number(e.target.value))}
                />
              </label>
            </div>
          )}

          {activeTab === "debug" && (
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              <div style={{ fontSize: 14, fontWeight: 600, color: "#111827" }}>
                System Status
              </div>
              <div style={{
                display: "grid",
                gridTemplateColumns: "repeat(2, minmax(0, 1fr))",
                gap: 10
              }}>
              <div style={{ border: "1px solid #e5e7eb", borderRadius: 12, padding: 10 }}>
                <div style={{ fontSize: 12, color: "#6b7280" }}>Server</div>
                <div style={{ fontWeight: 600, color: statusInfo?.server?.ok ? "#059669" : "#b91c1c" }}>
                  {statusInfo?.server?.ok ? "Online" : "Offline"}
                </div>
                <div style={{ fontSize: 12, color: "#6b7280" }}>Uptime: {statusInfo?.server?.uptimeSec ?? "—"}s</div>
              </div>
              <div style={{ border: "1px solid #e5e7eb", borderRadius: 12, padding: 10 }}>
                  <div style={{ fontSize: 12, color: "#6b7280" }}>TTS</div>
                  <div style={{ fontWeight: 600, color: "#111827" }}>
                    Active: {statusInfo?.tts?.selected || "default"}
                  </div>
                  <div style={{ fontSize: 12, color: "#6b7280" }}>
                    GPT-SoVITS: {statusInfo?.tts?.engines?.gptsovits?.enabled ? (statusInfo?.tts?.engines?.gptsovits?.online ? "Online" : "Offline") : "Inactive"}
                  </div>
                  <div style={{ fontSize: 12, color: "#6b7280" }}>
                    Piper: {statusInfo?.tts?.engines?.piper?.enabled ? (statusInfo?.tts?.engines?.piper?.ready ? "Ready" : "Missing voices") : "Inactive"}
                  </div>
                  <div style={{ fontSize: 12, color: "#6b7280" }}>Model: {statusInfo?.openai?.model || "—"}</div>
                </div>
              <div style={{ border: "1px solid #e5e7eb", borderRadius: 12, padding: 10 }}>
                <div style={{ fontSize: 12, color: "#6b7280" }}>Audio</div>
                <div style={{ fontWeight: 600, color: audioUnlocked ? "#059669" : "#b45309" }}>
                  {audioUnlocked ? "Enabled" : "Locked"}
                </div>
                <div style={{ fontSize: 12, color: "#6b7280" }}>Mic: {micEnabled ? "On" : "Off"}</div>
                <div style={{ fontSize: 12, color: "#6b7280" }}>
                  STT: {sttDebug.mode} | chunks {sttDebug.chunks} | sends {sttDebug.sent}
                </div>
                <div style={{ fontSize: 12, color: "#6b7280" }}>
                  VAD: rms {sttRmsRef.current.toFixed(3)} | gate {sttThresholdRef.current.toFixed(3)}
                </div>
                <div style={{ fontSize: 12, color: "#6b7280" }}>
                  TTS: {lastTtsMetrics ? `${lastTtsMetrics.ms}ms | ${lastTtsMetrics.bytes} bytes` : "-"}
                </div>
              </div>
                <div style={{ border: "1px solid #e5e7eb", borderRadius: 12, padding: 10 }}>
                  <div style={{ fontSize: 12, color: "#6b7280" }}>Integrations</div>
                  <div style={{ fontSize: 12, color: "#6b7280" }}>
                    {Object.keys(integrations || {}).length ? "Loaded" : "—"}
                  </div>
                </div>
                <div style={{ border: "1px solid #e5e7eb", borderRadius: 12, padding: 10 }}>
                  <div style={{ fontSize: 12, color: "#6b7280" }}>Live2D</div>
                  <div style={{ fontWeight: 600, color: "#111827" }}>
                    {avatarModels.filter(m => m.available).length}/{avatarModels.length || 0} available
                  </div>
                </div>
                <div style={{ border: "1px solid #e5e7eb", borderRadius: 12, padding: 10 }}>
                  <div style={{ fontSize: 12, color: "#6b7280" }}>Skills</div>
                  <div style={{ fontWeight: 600, color: statusInfo?.skills?.enabled ? "#059669" : "#6b7280" }}>
                    {statusInfo?.skills?.enabled ?? 0}/{statusInfo?.skills?.total ?? 0} enabled
                  </div>
                  <div style={{ fontSize: 12, color: "#6b7280" }}>
                    Last: {statusInfo?.skills?.lastEvent?.skill || "—"}
                  </div>
                </div>
              </div>

              <div style={{ fontSize: 14, fontWeight: 600, color: "#111827" }}>
                Voice Pipeline Check
              </div>
              <div style={{ border: "1px solid #e5e7eb", borderRadius: 12, padding: 12, background: "white", fontSize: 12, color: "#374151" }}>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
                  <div>
                    <div style={{ fontWeight: 600, color: voiceFullTest?.ok ? "#059669" : "#111827" }}>
                      {voiceFullTest ? (voiceFullTest.ok ? "Ready" : "Failed") : "Not run yet"}
                    </div>
                    <div style={{ color: "#6b7280" }}>
                      {voiceFullTest
                        ? `${voiceFullTest.passed}/${voiceFullTest.total} checks passed`
                        : "Run full voice checks before handoff."}
                    </div>
                  </div>
                  <button
                    onClick={runVoiceFullTestNow}
                    disabled={voiceFullTestRunning}
                    style={{ padding: "6px 10px", borderRadius: 8 }}
                  >
                    {voiceFullTestRunning ? "Running..." : "Run Full Test"}
                  </button>
                </div>
                {voiceFullTest?.tests?.length > 0 && (
                  <div style={{ marginTop: 8, display: "grid", gap: 4 }}>
                    {voiceFullTest.tests.map((t, idx) => (
                      <div key={`${t.name}-${idx}`} style={{ color: t.ok ? "#059669" : "#b91c1c" }}>
                        {t.ok ? "OK" : "FAIL"} {t.name}{t.detail ? ` - ${t.detail}` : ""}
                      </div>
                    ))}
                  </div>
                )}
                {voiceFullTestError && (
                  <div style={{ color: "#b91c1c", marginTop: 8 }}>Voice test error: {voiceFullTestError}</div>
                )}
              </div>

              <div style={{ fontSize: 14, fontWeight: 600, color: "#111827" }}>
                TTS Diagnostics
              </div>
              <div style={{ border: "1px solid #e5e7eb", borderRadius: 12, padding: 12, background: "white", fontSize: 12, color: "#374151" }}>
                {ttsDiagnostics ? (
                  <>
                    <div>Engine: <b>{ttsDiagnostics.engine}</b></div>
                    <div>GPT-SoVITS URL: {ttsDiagnostics.gptsovits?.url || "—"}</div>
                    <div>Docs URL: {ttsDiagnostics.gptsovits?.docsUrl || "—"}</div>
                    <div>Status: {ttsDiagnostics.gptsovits?.online ? "online" : "offline"} {ttsDiagnostics.gptsovits?.status ? `(${ttsDiagnostics.gptsovits.status})` : ""}</div>
                    <div>Config: {ttsDiagnostics.gptsovits?.configPath || "—"} {ttsDiagnostics.gptsovits?.configExists ? "(found)" : "(missing)"}</div>
                    <div>Default reference: {ttsDiagnostics.reference?.default || "—"}</div>
                    <div>Reference path: {ttsDiagnostics.reference?.resolved || "—"}</div>
                    <div>Reference ok: {ttsDiagnostics.reference?.exists ? "yes" : "no"}{ttsDiagnostics.reference?.duration ? ` · ${ttsDiagnostics.reference.duration.toFixed(2)}s` : ""}</div>
                  </>
                ) : (
                  <div>Diagnostics unavailable.</div>
                )}
                {ttsDiagError && (
                  <div style={{ color: "#b91c1c", marginTop: 6 }}>Diagnostics error: {ttsDiagError}</div>
                )}
              </div>

              <div style={{ fontSize: 14, fontWeight: 600, color: "#111827" }}>
                Client Logs
              </div>
            <input
              placeholder="Filter logs..."
              value={logFilter}
              onChange={(e) => setLogFilter(e.target.value)}
              style={{ padding: 8, borderRadius: 10, border: "1px solid #e5e7eb" }}
            />
            <div style={{ border: "1px solid #e5e7eb", borderRadius: 12, padding: 8, height: 220, overflow: "auto", background: "#0b1220", color: "#e5e7eb", fontFamily: "monospace", fontSize: 11 }}>
              {logLines.filter(l => !logFilter || l.text.toLowerCase().includes(logFilter.toLowerCase())).map((l, idx) => (
                <div key={idx} style={{ color: l.level === "error" ? "#fca5a5" : l.level === "warn" ? "#facc15" : "#e5e7eb" }}>
                  [{l.time}] {l.level.toUpperCase()}: {l.text}
                </div>
              ))}
            </div>
          </div>
        )}

        {activeTab === "tools" && (
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            <div style={{ fontSize: 14, fontWeight: 600, color: "#111827" }}>
              MCP-lite Tools
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
              <div style={{ border: "1px solid #e5e7eb", borderRadius: 12, padding: 12, background: "white" }}>
                <div style={{ fontWeight: 600, marginBottom: 6 }}>Tool List</div>
                <div style={{ fontSize: 12, color: "#6b7280", marginBottom: 8 }}>
                  {toolsList.length} tools available
                </div>
                <div style={{ maxHeight: 220, overflow: "auto", fontSize: 12 }}>
                  {toolsList.map(t => (
                    <div key={t.name} style={{ marginBottom: 8 }}>
                      <div style={{ fontWeight: 600 }}>{t.name}</div>
                      <div style={{ color: "#6b7280" }}>{t.description}</div>
                    </div>
                  ))}
                  {toolsList.length === 0 && <div>No tools loaded.</div>}
                </div>
              </div>

              <div style={{ border: "1px solid #e5e7eb", borderRadius: 12, padding: 12, background: "white" }}>
                <div style={{ fontWeight: 600, marginBottom: 6 }}>Call Tool</div>
                <label style={{ fontSize: 12, color: "#374151" }}>
                  Tool name
                  <input
                    value={toolCallName}
                    onChange={(e) => setToolCallName(e.target.value)}
                    placeholder="meeting.summarize"
                    style={{ width: "100%", marginTop: 4, padding: 8, borderRadius: 8, border: "1px solid #d1d5db" }}
                  />
                </label>
                <label style={{ fontSize: 12, color: "#374151", marginTop: 8 }}>
                  Params (JSON)
                  <textarea
                    value={toolCallParams}
                    onChange={(e) => setToolCallParams(e.target.value)}
                    rows={6}
                    style={{ width: "100%", marginTop: 4, padding: 8, borderRadius: 8, border: "1px solid #d1d5db", fontFamily: "monospace", fontSize: 12 }}
                  />
                </label>
                <button onClick={callTool} style={{ marginTop: 8, padding: "6px 10px", borderRadius: 8 }}>
                  Call Tool
                </button>
                {toolsError && <div style={{ fontSize: 12, color: "#b91c1c" }}>{toolsError}</div>}
                {toolCallResult && (
                  <pre style={{ marginTop: 8, background: "#0b1220", color: "#e5e7eb", padding: 8, borderRadius: 8, fontSize: 11, overflow: "auto" }}>
{toolCallResult}
                  </pre>
                )}
              </div>
            </div>

            <div style={{ border: "1px solid #e5e7eb", borderRadius: 12, padding: 12, background: "white" }}>
              <div style={{ fontWeight: 600, marginBottom: 6 }}>Approvals</div>
              <div style={{ fontSize: 12, color: "#6b7280", marginBottom: 8 }}>
                Pending approvals: {approvals.filter(a => a.status === "pending").length}
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 8, fontSize: 12 }}>
                {approvals.map(a => (
                  <div key={a.id} style={{ border: "1px solid #e5e7eb", borderRadius: 8, padding: 8 }}>
                    <div style={{ fontWeight: 600 }}>{a.toolName}</div>
                    <div>Status: {a.status}</div>
                    <div>Summary: {a.humanSummary}</div>
                    {a.status === "pending" && (
                      <div style={{ display: "flex", gap: 6, marginTop: 6 }}>
                        <button onClick={() => approveAction(a.id)} style={{ padding: "4px 8px", borderRadius: 6 }}>
                          Approve
                        </button>
                        <button onClick={() => denyAction(a.id)} style={{ padding: "4px 8px", borderRadius: 6 }}>
                          Deny
                        </button>
                      </div>
                    )}
                    {a.status === "approved" && (
                      <button onClick={() => executeAction(a.id, a.token)} style={{ marginTop: 6, padding: "4px 8px", borderRadius: 6 }}>
                        Execute
                      </button>
                    )}
                  </div>
                ))}
                {approvals.length === 0 && <div>No approvals yet.</div>}
              </div>
              {approvalsError && <div style={{ fontSize: 12, color: "#b91c1c", marginTop: 6 }}>{approvalsError}</div>}
            </div>

            <div style={{ border: "1px solid #e5e7eb", borderRadius: 12, padding: 12, background: "white" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <div style={{ fontWeight: 600 }}>Tool History</div>
                <button onClick={refreshToolHistory} style={{ padding: "4px 8px", borderRadius: 6 }}>
                  Refresh
                </button>
              </div>
              <div style={{ fontSize: 12, color: "#6b7280", margin: "6px 0" }}>
                Last {toolHistory.length} calls
              </div>
              <div style={{ maxHeight: 220, overflow: "auto", fontSize: 11 }}>
                {toolHistory.map(h => (
                  <div key={h.id} style={{ borderBottom: "1px solid #f3f4f6", padding: "6px 0" }}>
                    <div style={{ fontWeight: 600 }}>{h.tool}</div>
                    <div>Status: {h.status}</div>
                    <div style={{ color: "#6b7280" }}>{h.ts}</div>
                  </div>
                ))}
                {toolHistory.length === 0 && <div>No history yet.</div>}
              </div>
              {toolHistoryError && <div style={{ fontSize: 12, color: "#b91c1c", marginTop: 6 }}>{toolHistoryError}</div>}
            </div>
          </div>
        )}

        {activeTab === "actionRunner" && (
          <ActionRunnerPanel serverUrl={SERVER_URL} />
        )}

        {activeTab === "teachMode" && (
          <TeachModePanel serverUrl={SERVER_URL} />
        )}

        {activeTab === "canvas" && (
          <CanvasPanel serverUrl={SERVER_URL} />
        )}

        {activeTab === "workbench" && (
          <AikaToolsWorkbench serverUrl={SERVER_URL} />
        )}

        <MeetingCopilot
          serverUrl={SERVER_URL}
          registerControls={registerMeetingCopilotControls}
          onActivateTab={() => setActiveTab("recordings")}
          onRecordingStateChange={setMeetingRecordingActive}
          visible={activeTab === "recordings"}
          commandListening={meetingCommandListening}
          onCommandListeningChange={setMeetingCommandListening}
        />

        {activeTab === "features" && (
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                <button
                  onClick={() => setFeaturesView("mcp")}
                  style={{
                    padding: "6px 10px",
                    borderRadius: 8,
                    border: featuresView === "mcp" ? "2px solid #2b6cb0" : "1px solid #e5e7eb",
                    background: featuresView === "mcp" ? "#e6f0ff" : "white"
                  }}
                >
                  MCP Features
                </button>
                <button
                  onClick={() => setFeaturesView("connections")}
                  style={{
                    padding: "6px 10px",
                    borderRadius: 8,
                    border: featuresView === "connections" ? "2px solid #2b6cb0" : "1px solid #e5e7eb",
                    background: featuresView === "connections" ? "#e6f0ff" : "white"
                  }}
                >
                  Connections
                </button>
              </div>
              {featuresView === "mcp" && (
                <div style={{ display: "flex", gap: 8 }}>
                  <button onClick={refreshFeatures} style={{ padding: "6px 10px", borderRadius: 8 }}>
                    Refresh
                  </button>
                  <button onClick={copyDiagnostics} style={{ padding: "6px 10px", borderRadius: 8 }}>
                    Copy Diagnostics
                  </button>
                </div>
              )}
            </div>

            {featuresView === "mcp" && (
              <>
                {featuresError && <div style={{ color: "#b91c1c", fontSize: 12 }}>{featuresError}</div>}

            <div style={{ display: "grid", gridTemplateColumns: "0.7fr 1.3fr", gap: 12 }}>
              <div style={{ border: "1px solid #e5e7eb", borderRadius: 12, padding: 12, background: "white" }}>
                <div style={{ fontWeight: 600, marginBottom: 8 }}>Services</div>
                {featuresServices.map(s => (
                  <div
                    key={s.id}
                    onClick={() => setFeaturesSelected(s.id)}
                    style={{
                      border: s.id === featuresSelected ? "2px solid #2563eb" : "1px solid #e5e7eb",
                      borderRadius: 10,
                      padding: 8,
                      marginBottom: 8,
                      cursor: "pointer"
                    }}
                  >
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                      <div style={{ fontWeight: 600 }}>{s.displayName}</div>
                      <span style={{
                        fontSize: 11,
                        padding: "2px 6px",
                        borderRadius: 999,
                        background:
                          s.status === "connected"
                            ? "#dcfce7"
                            : s.status === "error"
                              ? "#fee2e2"
                              : "#e5e7eb"
                      }}>
                        {s.status}
                      </span>
                    </div>
                    <div style={{ fontSize: 11, color: "#6b7280" }}>{s.tools.length} tools</div>
                    {s.connectSpec?.method !== "none" && (
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          openConnect(s);
                        }}
                        style={{ marginTop: 6, padding: "4px 8px", borderRadius: 6 }}
                      >
                        {s.status === "connected" ? "Details" : "Connect"}
                      </button>
                    )}
                  </div>
                ))}
                {featuresServices.length === 0 && <div>No services discovered.</div>}
              </div>

              <div style={{ border: "1px solid #e5e7eb", borderRadius: 12, padding: 12, background: "white" }}>
                <div style={{ fontWeight: 600, marginBottom: 8 }}>Tools</div>
                {featuresServices
                  .find(s => s.id === featuresSelected)
                  ?.tools.map(tool => (
                    <div key={tool.name} style={{ borderBottom: "1px solid #f3f4f6", padding: "6px 0" }}>
                      <div style={{ fontWeight: 600 }}>{tool.name}</div>
                      <div style={{ fontSize: 12, color: "#6b7280" }}>{tool.description}</div>
                      <button
                        onClick={() => {
                          setToolCallName(tool.name);
                          setToolCallParams("{}");
                          setToolCallResult("");
                          setActiveTab("tools");
                        }}
                        style={{ marginTop: 4, padding: "4px 8px", borderRadius: 6 }}
                      >
                        Try
                      </button>
                    </div>
                  ))}
                {featuresServices.find(s => s.id === featuresSelected)?.tools.length === 0 && (
                  <div style={{ fontSize: 12, color: "#6b7280" }}>No tools for this service.</div>
                )}
              </div>
            </div>

                {connectModal && (
                  <div style={{
                    position: "fixed",
                    inset: 0,
                    background: "rgba(15,23,42,0.4)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                zIndex: 50
              }}>
                <div style={{ width: 420, background: "white", borderRadius: 12, padding: 16 }}>
                  <div style={{ fontWeight: 600, marginBottom: 8 }}>
                    Connect {connectModal.displayName}
                  </div>
                  {connectModal.connectSpec?.method === "oauth" && (
                    <div style={{ fontSize: 12, color: "#374151" }}>
                      OAuth flow will open a new window. Make sure your credentials are set in `.env`.
                      <button
                        onClick={() => runOAuth(connectModal)}
                        style={{ marginTop: 8, padding: "6px 10px", borderRadius: 8 }}
                      >
                        Start OAuth
                      </button>
                    </div>
                  )}
                  {connectModal.connectSpec?.method === "api_key" && (
                    <div style={{ fontSize: 12, color: "#374151" }}>
                      Set the following env vars, then click “Mark Connected”:
                      <ul>
                        {connectModal.connectSpec.fields?.map(f => (
                          <li key={f.key}><code>{f.key}</code></li>
                        ))}
                      </ul>
                      <button
                        onClick={() => markConnected(connectModal.id, true)}
                        style={{ marginTop: 8, padding: "6px 10px", borderRadius: 8 }}
                      >
                        Mark Connected
                      </button>
                    </div>
                  )}
                  {connectModal.connectSpec?.method === "none" && (
                    <div style={{ fontSize: 12, color: "#374151" }}>No connection required.</div>
                  )}
                  {connectModal.connectSpec?.method === "custom" && (
                    <div style={{ fontSize: 12, color: "#374151" }}>
                      Custom connection required. See docs/MCP_LITE.md.
                    </div>
                  )}
                  <div style={{ display: "flex", justifyContent: "flex-end", marginTop: 12 }}>
                    <button onClick={() => setConnectModal(null)} style={{ padding: "6px 10px", borderRadius: 8 }}>
                      Close
                    </button>
                  </div>
                </div>
              </div>
                )}
              </>
            )}

            {featuresView === "connections" && (
              <ConnectionsPanel serverUrl={SERVER_URL} />
            )}
          </div>
        )}

        {activeTab === "guide" && (
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            <div style={{ fontSize: 14, fontWeight: 600, color: "#111827" }}>
              Quickstart Guide + Demo Prompts
            </div>
            <div style={{ border: "1px solid #e5e7eb", borderRadius: 12, padding: 12, background: "white", fontSize: 13, color: "#374151" }}>
              <div style={{ fontWeight: 600, marginBottom: 6 }}>Voice chat</div>
              <div>1) Click Mic On</div>
              <div>2) Speak a prompt like: “Tell me a spooky story in 3 sentences.”</div>

              <div style={{ fontWeight: 600, marginTop: 10, marginBottom: 6 }}>Live2D avatar</div>
              <div>1) Miku loads by default when available.</div>
              <div>2) Lip-sync uses the actual voice audio, so mouth moves to what you hear.</div>
              <div>2) Use Avatar Model to switch.</div>
              <div>3) Import a Live2D zip and then click Refresh Models.</div>
              <div style={{ fontSize: 12, color: "#6b7280" }}>If you see a Live2D core error, upload live2dcubismcore.js (and .wasm if provided) from the Cubism SDK.</div>
              <div style={{ fontSize: 12, color: "#6b7280" }}>If it doesn???t appear, hard reload (Ctrl+Shift+R).</div>
              <div style={{ fontWeight: 600, marginTop: 10, marginBottom: 6 }}>Fireflies</div>
              <div>“Summarize this Fireflies meeting: [paste Fireflies link]”</div>
              <div style={{ fontWeight: 600, marginTop: 10, marginBottom: 6 }}>Google Docs</div>
              <div>“Create a Google Doc titled ‘Weekly Notes’ and add a short summary.”</div>
                <div style={{ fontWeight: 600, marginTop: 10, marginBottom: 6 }}>Plex</div>
                <div>“Check Plex status and tell me if it’s up.”</div>
                <div style={{ fontWeight: 600, marginTop: 10, marginBottom: 6 }}>Skills</div>
                <div>“Note: call the dentist at 3pm.”</div>
                <div>“List notes.”</div>
                <div>“Add todo buy milk.”</div>
                <div>“List todos.”</div>
                <div>“Add milk to shopping list.”</div>
                <div>“List shopping list.”</div>
                <div>“Remind me at 3pm to call mom.”</div>
                <div>“Remind me in 15 minutes to stretch.”</div>
                <div>“Trigger lights_on.”</div>
                <div>“What time is it?”</div>
                <div>“System status.”</div>
                <div style={{ fontSize: 12, color: "#6b7280", marginTop: 8 }}>
                  This guide will expand as new integrations are added.
                </div>
              </div>
            </div>
        )}

        {activeTab === "chat" && (
        <div style={{ flex: 1, overflow: "auto", border: "1px solid var(--panel-border)", borderRadius: 14, padding: 12, background: "var(--panel-bg)", color: "var(--text-primary)" }}>
          {meetingLock && (
            <div style={{ fontSize: 12, marginBottom: 10, color: "#b45309" }}>
              Recording in progress. Chat is paused until the meeting recording finishes.
            </div>
          )}
          {log.map((m, i) => (
            <div key={m.id || i} style={{ marginBottom: 10 }}>
              <div><b>{m.role === "user" ? "You" : "Aika"}:</b> {m.text}</div>
              {m.role === "assistant" && m.id && (
                <div style={{ marginTop: 6, display: "flex", gap: 6, alignItems: "center" }}>
                  <button
                    onClick={() => submitFeedback(m, "up")}
                    style={{
                      padding: "4px 8px",
                      borderRadius: 8,
                      border: "1px solid #d1d5db",
                      background: feedbackState[m.id] === "up" ? "#dcfce7" : "white",
                      fontSize: 12
                    }}
                    title="Thumbs up"
                  >
                    Thumbs Up
                  </button>
                  <button
                    onClick={() => submitFeedback(m, "down")}
                    style={{
                      padding: "4px 8px",
                      borderRadius: 8,
                      border: "1px solid #d1d5db",
                      background: feedbackState[m.id] === "down" ? "#fee2e2" : "white",
                      fontSize: 12
                    }}
                    title="Thumbs down"
                  >
                    Thumbs Down
                  </button>
                  {feedbackState[m.id] && (
                    <span style={{ fontSize: 11, color: "#6b7280" }}>
                      Feedback saved
                    </span>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
        )}

        {activeTab === "chat" && (
        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          <input
            ref={inputRef}
            value={userText}
            onChange={(e) => setUserText(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && send()}
            placeholder={meetingLock ? "Recording in progress..." : "Type your message..."}
            disabled={meetingLock}
            style={{ flex: 1, padding: 12, borderRadius: 12, border: "1px solid #ccc", background: meetingLock ? "#e5e7eb" : "white" }}
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
            background: micEnabled && micState === "listening" ? "#ecfdf3" : "#f3f4f6",
            color: micEnabled && micState === "listening" ? "#047857" : "#6b7280",
            fontSize: 12
          }}>
            <span style={{
              width: 8,
              height: 8,
              borderRadius: "50%",
              background: micEnabled && micState === "listening" ? "#10b981" : "#9ca3af",
              display: "inline-block"
            }} />
            {micEnabled ? (micState === "listening" ? "Mic active" : "Mic idle") : "Mic off"}
          </div>
          <button
            onClick={toggleMic}
            disabled={meetingLock}
            style={{
              padding: "12px 16px",
              borderRadius: 12,
              border: micEnabled && micState === "listening" ? "2px solid #2b6cb0" : "1px solid #ccc",
              background: micEnabled && micState === "listening" ? "#e6f0ff" : "white"
            }}
            title={micEnabled && micState === "listening" ? "Stop listening (Space)" : "Start listening (Space)"}
          >
            {micEnabled && micState === "listening" ? "Mic Off" : "Mic On"}
          </button>
          <button onClick={() => send()} disabled={meetingLock} style={{ padding: "12px 16px", borderRadius: 12 }}>
            Send
          </button>
          <button
            onClick={() => setShowSettings(v => !v)}
            style={{ padding: "12px 14px", borderRadius: 12, border: "1px solid #ddd", background: "#f9fafb" }}
          >
            {showSettings ? "Close Settings" : "Settings"}
          </button>
        </div>
        )}
        {activeTab === "chat" && (
        <>
          {showSettings && (
          <div style={{
            display: "grid",
            gridTemplateColumns: "repeat(2, minmax(0, 1fr))",
            gap: 8,
            padding: 10,
            border: "1px solid var(--panel-border)",
            borderRadius: 10,
            background: "var(--panel-bg)"
          }}>
            <div style={{ gridColumn: "1 / -1", fontSize: 12, fontWeight: 600, color: "var(--text-primary)" }}>
              Voice + Input
            </div>
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
                if (v) {
                  setAutoSpeak(false);
                  setMicEnabled(false);
                  stopMic();
                } else {
                  setAutoSpeak(true);
                }
              }}
            />
              Text only (no voice)
            </label>
            <div style={{ gridColumn: "1 / -1", fontSize: 12, fontWeight: 600, color: "var(--text-primary)", marginTop: 6 }}>
              Appearance
            </div>
            <label style={{ display: "flex", flexDirection: "column", gap: 4, fontSize: 12, color: "#374151" }}>
              Theme
              <select
                value={themeId}
                onChange={(e) => setThemeId(e.target.value)}
                style={{ padding: 6, borderRadius: 6, border: "1px solid #d1d5db" }}
              >
                {THEMES.map(t => (
                  <option key={t.id} value={t.id}>{t.label}</option>
                ))}
              </select>
            </label>
            <label style={{ display: "flex", flexDirection: "column", gap: 4, fontSize: 12, color: "#374151" }}>
              App background image
              <input
                type="file"
                accept="image/*"
                onChange={(e) => handleBackgroundUpload(e.target.files?.[0])}
              />
              <button
                onClick={() => setAppBackground("")}
                style={{ marginTop: 4, padding: "4px 8px", borderRadius: 6 }}
              >
                Clear background
              </button>
            </label>
            <label style={{ display: "flex", flexDirection: "column", gap: 4, fontSize: 12, color: "#374151" }}>
              Avatar background
              <select
                value={avatarBackground}
                onChange={(e) => setAvatarBackground(e.target.value)}
                style={{ padding: 6, borderRadius: 6, border: "1px solid #d1d5db" }}
              >
                {AVATAR_BACKGROUNDS.map(bg => (
                  <option key={bg.id} value={bg.id}>{bg.label}</option>
                ))}
              </select>
            </label>
            <div style={{ gridColumn: "1 / -1", fontSize: 12, fontWeight: 600, color: "var(--text-primary)", marginTop: 6 }}>
              Meeting Copilot
            </div>
            <label style={{ display: "flex", gap: 8, alignItems: "center", fontSize: 12, color: "#374151" }}>
              <input
                type="checkbox"
                checked={meetingCommandListening}
                onChange={(e) => setMeetingCommandListening(e.target.checked)}
              />
              Listening for recording commands (“hey Aika, start recording”)
            </label>
          </div>
          )}
          {showSettings && showAdvanced && (
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
                Engine
                <select
                  value={ttsSettings.engine || statusInfo?.tts?.engine || ""}
                  onChange={(e) => setTtsSettings(s => ({ ...s, engine: e.target.value }))}
                  style={{ padding: 6, borderRadius: 6, border: "1px solid #d1d5db" }}
                >
                  <option value="">default</option>
                  <option value="gptsovits">gptsovits</option>
                  <option value="piper">piper</option>
                </select>
              </label>
              <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                <div style={{ fontSize: 12, color: "#374151" }}>Avatar Model</div>
                {(() => {
                  const current = avatarModels.find(m => m.id === avatarModelId);
                  const thumb = current?.thumbnailAvailable ? current.thumbnail : "/assets/aika/live2d/placeholder.svg";
                  return (
                    <button
                      onClick={() => setShowAvatarPicker(v => !v)}
                      style={{
                        padding: "6px 10px",
                        borderRadius: 8,
                        border: "1px solid #d1d5db",
                        textAlign: "left",
                        display: "flex",
                        alignItems: "center",
                        gap: 8
                      }}
                    >
                      <img
                        src={thumb}
                        alt={current?.label || "avatar"}
                        style={{ width: 28, height: 38, objectFit: "cover", borderRadius: 6 }}
                      />
                      <span>{current?.label || "(no model selected)"}</span>
                    </button>
                  );
                })()}
                  {showAvatarPicker && (
                    <div style={{
                      border: "1px solid #e5e7eb",
                      borderRadius: 10,
                      padding: 8,
                      display: "grid",
                      gridTemplateColumns: "repeat(2, minmax(0, 1fr))",
                      gap: 8,
                      background: "#fafafa"
                    }}>
                    {avatarModels.length === 0 && (
                      <div style={{ fontSize: 12, color: "#6b7280" }}>(no models installed)</div>
                    )}
                    {avatarModels.map(m => {
                      const thumb = m.thumbnailAvailable ? m.thumbnail : "/assets/aika/live2d/placeholder.svg";
                      return (
                        <button
                          key={m.id}
                          onClick={() => {
                            setAvatarModelId(m.id);
                            if (typeof window !== "undefined") {
                              window.localStorage.setItem("aika_avatar_model", m.id);
                            }
                            setShowAvatarPicker(false);
                          }}
                          style={{
                            border: m.id === avatarModelId ? "2px solid #2563eb" : "1px solid #d1d5db",
                            borderRadius: 10,
                            padding: 6,
                            background: "white",
                            textAlign: "left",
                            display: "flex",
                            gap: 8,
                            alignItems: "center"
                          }}
                        >
                          <img
                            src={thumb}
                            alt={m.label}
                            style={{ width: 46, height: 62, objectFit: "cover", borderRadius: 6 }}
                          />
                          <div>
                            <div style={{ fontSize: 12, fontWeight: 600 }}>{m.label}</div>
                            <div style={{ fontSize: 11, color: m.available ? "#059669" : "#b45309" }}>
                              {m.available ? "Ready" : "Missing files"}
                            </div>
                          </div>
                        </button>
                      );
                    })}
                  </div>
                )}
                <div style={{ display: "flex", flexDirection: "column", gap: 6, marginTop: 6 }}>
                  <label style={{ fontSize: 12, color: "#374151" }}>
                    Import Live2D zip
                    <input
                      type="file"
                      accept=".zip"
                      onChange={(e) => importAvatarZip(e.target.files?.[0])}
                      disabled={avatarImporting}
                      style={{ display: "block", marginTop: 4 }}
                    />
                  </label>
                  <div style={{ fontSize: 12, color: "#374151" }}>
                    Live2D core: {avatarCoreInfo.coreJs ? "Ready" : "Missing"}{avatarCoreInfo.coreWasm ? " + WASM" : ""}
                  </div>
                  <label style={{ fontSize: 12, color: "#374151" }}>
                    Upload live2dcubismcore.js / .wasm
                    <input
                      type="file"
                      accept=".js,.wasm"
                      onChange={(e) => uploadAvatarCore(e.target.files?.[0])}
                      style={{ display: "block", marginTop: 4 }}
                    />
                  </label>
                  <button
                    onClick={refreshAvatarModels}
                    style={{ padding: "6px 10px", borderRadius: 8, width: "fit-content" }}
                  >
                    Refresh Models
                  </button>
                  {avatarImporting && (
                    <div style={{ fontSize: 12, color: "#6b7280" }}>Importing...</div>
                  )}
                  {avatarImportNotice && (
                    <div style={{ fontSize: 12, color: "#2563eb" }}>{avatarImportNotice}</div>
                  )}
                  {avatarImportError && (
                    <div style={{ fontSize: 12, color: "#b91c1c" }}>{avatarImportError}</div>
                  )}
                  {avatarCoreError && (
                    <div style={{ fontSize: 12, color: "#b91c1c" }}>{avatarCoreError}</div>
                  )}
                </div>
              </div>
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
              {(ttsSettings.engine || statusInfo?.tts?.engine) === "piper" ? (
                <>
                  <label style={{ display: "flex", flexDirection: "column", gap: 4, fontSize: 12, color: "#374151" }}>
                    Piper Voice
                    <select
                      value={ttsSettings.voice.name || ""}
                      onChange={(e) => setTtsSettings(s => ({ ...s, voice: { ...s.voice, name: e.target.value } }))}
                      style={{ padding: 6, borderRadius: 6, border: "1px solid #d1d5db" }}
                    >
                      {availableVoices.length === 0 && <option value="">(no voices found)</option>}
                      {availableVoices.map(v => (
                        <option key={v.id} value={v.id}>{v.label}</option>
                      ))}
                    </select>
                  </label>
                  <div style={{ gridColumn: "1 / -1", fontSize: 11, color: "#6b7280" }}>
                    Place Piper .onnx + .onnx.json files in `apps/server/piper_voices`.
                  </div>
                </>
                ) : (
                  <>
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
                  </>
                )}
                <div style={{ gridColumn: "1 / -1", fontSize: 11, color: "#6b7280" }}>
                  Live2D models load from `apps/web/public/assets/aika/live2d/`. Drop free sample runtime folders into
                  `hiyori/`, `mao/`, or `tororo_hijiki/` to enable them.
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
          {showSettings && (
          <>
          <button
            onClick={() => setShowAdvanced(v => !v)}
            style={{ padding: "6px 10px", borderRadius: 8, width: "fit-content" }}
          >
            {showAdvanced ? "Hide Advanced Voice" : "Advanced Voice"}
          </button>
          </>
          )}
          <div style={{ color: "#6b7280", fontSize: 12 }}>
            Voice: {ttsStatus}
          </div>
          <div style={{ color: "#6b7280", fontSize: 12 }}>{ttsEngineOnline === true ? "GPT-SoVITS: online" : ttsEngineOnline === false ? "GPT-SoVITS: offline" : "GPT-SoVITS: unknown"}</div>
          <div style={{ color: "#6b7280", fontSize: 12 }}>
            {audioUnlocked ? "Audio Enabled" : "Audio Locked (click once to enable)"} 
          </div>
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
          {feedbackError && (
            <div style={{ color: "#b91c1c", fontSize: 12 }}>
              Feedback error: {feedbackError}
            </div>
          )}
          {ttsWarnings.length > 0 && (
            <div style={{ color: "#92400e", fontSize: 12 }}>
              TTS warnings: {ttsWarnings.join(", ")}
            </div>
          )}
          {micState === "idle" && voiceMode && (
            <div style={{ color: "#1f2937", fontSize: 12, fontWeight: 600 }}>
              Click Mic to continue
            </div>
          )}
          <div style={{ color: "#6b7280", fontSize: 12 }}>
            Hotkey: Space (when not typing)
          </div>
        </>
        )}
        {productResearchOpen && productResearch && (
          <div
            style={{
              position: "fixed",
              inset: 0,
              background: "rgba(15,23,42,0.55)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              zIndex: 60
            }}
          >
            <div
              style={{
                width: "min(900px, 92vw)",
                maxHeight: "86vh",
                overflow: "auto",
                background: "var(--panel-bg)",
                color: "var(--text-primary)",
                border: "1px solid var(--panel-border)",
                borderRadius: 14,
                padding: 14,
                boxShadow: "0 24px 44px rgba(0,0,0,0.35)"
              }}
            >
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 10 }}>
                <div>
                  <div style={{ fontSize: 18, fontWeight: 700 }}>Product Decision Report</div>
                  <div style={{ fontSize: 13, color: "var(--text-muted)" }}>
                    Query: {productResearch.query}
                  </div>
                </div>
                <button
                  onClick={() => setProductResearchOpen(false)}
                  style={{ padding: "6px 10px", borderRadius: 8, border: "1px solid #d1d5db" }}
                >
                  Close
                </button>
              </div>

              <div style={{ marginTop: 12, display: "grid", gridTemplateColumns: "1.1fr 0.9fr", gap: 12 }}>
                <div style={{ border: "1px solid var(--panel-border)", borderRadius: 10, padding: 10 }}>
                  <div style={{ fontWeight: 600, marginBottom: 6 }}>Analysis</div>
                  <div style={{ fontSize: 13, marginBottom: 8 }}>{productResearch?.analysis?.summary || "(no summary)"}</div>
                  <div style={{ fontSize: 13, marginBottom: 6 }}>
                    <b>Recommendation:</b> {productResearch?.analysis?.recommendation || "(none)"}
                  </div>
                  <div style={{ fontSize: 12, color: "var(--text-muted)", marginBottom: 6 }}>
                    <b>Reasoning:</b> {productResearch?.analysis?.reasoning || "(not provided)"}
                  </div>
                  <div style={{ fontSize: 12, color: "#92400e" }}>
                    <b>Watchouts:</b> {productResearch?.analysis?.watchouts || "Verify seller quality and return policy."}
                  </div>
                </div>

                <div style={{ border: "1px solid var(--panel-border)", borderRadius: 10, padding: 10 }}>
                  <div style={{ fontWeight: 600, marginBottom: 6 }}>Top Pick</div>
                  {productResearch?.recommendationItem ? (
                    <>
                      <div style={{ fontSize: 13, fontWeight: 600 }}>{productResearch.recommendationItem.title}</div>
                      <div style={{ fontSize: 12, color: "var(--text-muted)", marginTop: 4 }}>
                        Price: {productResearch.recommendationItem.priceDisplay || "(price unavailable)"}
                      </div>
                      <div style={{ display: "flex", gap: 8, marginTop: 8, flexWrap: "wrap" }}>
                        {productResearch.recommendationItem.url && (
                          <a
                            href={productResearch.recommendationItem.url}
                            target="_blank"
                            rel="noreferrer"
                            style={{ padding: "6px 10px", borderRadius: 8, border: "1px solid #d1d5db", textDecoration: "none" }}
                          >
                            Open Listing
                          </a>
                        )}
                        <button
                          onClick={() => addAmazonToCart(productResearch.recommendationItem)}
                          disabled={!productResearch.recommendationItem.asin || cartBusyAsin === productResearch.recommendationItem.asin}
                          style={{ padding: "6px 10px", borderRadius: 8, border: "1px solid #d1d5db" }}
                        >
                          {cartBusyAsin === productResearch.recommendationItem.asin ? "Adding..." : "Add to Amazon Cart"}
                        </button>
                      </div>
                    </>
                  ) : (
                    <div style={{ fontSize: 12, color: "var(--text-muted)" }}>No top pick yet.</div>
                  )}
                  {productResearchNotice && (
                    <div style={{ marginTop: 8, fontSize: 12, color: "#2563eb" }}>{productResearchNotice}</div>
                  )}
                </div>
              </div>

              <div style={{ marginTop: 12, border: "1px solid var(--panel-border)", borderRadius: 10, padding: 10 }}>
                <div style={{ fontWeight: 600, marginBottom: 8 }}>Compared Options</div>
                <div style={{ display: "grid", gap: 8 }}>
                  {(productResearch.options || []).map((option, idx) => (
                    <div
                      key={`${option.asin || "opt"}-${idx}`}
                      style={{
                        border: "1px solid #e5e7eb",
                        borderRadius: 10,
                        padding: 8,
                        display: "flex",
                        justifyContent: "space-between",
                        gap: 8,
                        alignItems: "flex-start"
                      }}
                    >
                      <div style={{ minWidth: 0 }}>
                        <div style={{ fontSize: 13, fontWeight: 600 }}>{option.title || "(untitled)"}</div>
                        <div style={{ fontSize: 12, color: "var(--text-muted)" }}>
                          {option.priceDisplay || "Price unavailable"}{option.asin ? ` • ASIN ${option.asin}` : ""}
                        </div>
                      </div>
                      <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                        {option.url && (
                          <a
                            href={option.url}
                            target="_blank"
                            rel="noreferrer"
                            style={{ padding: "4px 8px", borderRadius: 8, border: "1px solid #d1d5db", textDecoration: "none", fontSize: 12 }}
                          >
                            Open
                          </a>
                        )}
                        <button
                          onClick={() => addAmazonToCart(option)}
                          disabled={!option.asin || cartBusyAsin === option.asin}
                          style={{ padding: "4px 8px", borderRadius: 8, border: "1px solid #d1d5db", fontSize: 12 }}
                        >
                          {cartBusyAsin === option.asin ? "Adding..." : "Add to Cart"}
                        </button>
                      </div>
                    </div>
                  ))}
                  {(productResearch.options || []).length === 0 && (
                    <div style={{ fontSize: 12, color: "var(--text-muted)" }}>No options returned for this query.</div>
                  )}
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function getMicUnavailableReason() {
  if (typeof window !== "undefined" && !window.isSecureContext) {
    return "Microphone requires HTTPS on iPad/Safari (or localhost).";
  }
  if (typeof navigator === "undefined" || !navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
    return "Microphone API unavailable in this browser.";
  }
  return "";
}

async function requestMicStream(constraints) {
  const reason = getMicUnavailableReason();
  if (reason) throw new Error(reason);
  return navigator.mediaDevices.getUserMedia(constraints);
}
