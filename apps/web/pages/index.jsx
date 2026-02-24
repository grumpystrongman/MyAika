import { useEffect, useMemo, useRef, useState } from "react";
import { Emotion } from "@myaika/shared";
import AikaAvatar from "../src/components/AikaAvatar";
import AikaToolsWorkbench from "../src/components/AikaToolsWorkbench";
import MeetingCopilot from "../src/components/MeetingCopilot";
import ActionRunnerPanel from "../src/components/ActionRunnerPanel";
import ConnectionsPanel from "../src/components/ConnectionsPanel";
import TeachModePanel from "../src/components/TeachModePanel";
import CanvasPanel from "../src/components/CanvasPanel";
import FirefliesPanel from "../src/components/FirefliesPanel";
import SafetyPanel from "../src/components/SafetyPanel";
import TradingPanel from "../src/components/TradingPanel";
import GuidePanel from "../src/components/GuidePanel";

function isLocalhostUrl(value) {
  if (!value) return false;
  try {
    const url = new URL(value);
    return ["localhost", "127.0.0.1"].includes(url.hostname);
  } catch {
    return false;
  }
}

function resolveServerUrl() {
  const envUrl = process.env.NEXT_PUBLIC_SERVER_URL || "";
  if (typeof window !== "undefined") {
    const origin = window.location.origin || "";
    if (!envUrl) return origin;
    if (origin && isLocalhostUrl(envUrl) && !isLocalhostUrl(origin)) {
      return origin;
    }
  }
  return envUrl;
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
    id: "aurora",
    label: "Aurora Glass",
    vars: {
      "--app-bg": "#0c0f1d",
      "--app-gradient": "radial-gradient(1200px 700px at 12% 8%, rgba(113, 125, 201, 0.35), transparent 60%), radial-gradient(900px 600px at 90% 12%, rgba(232, 176, 255, 0.28), transparent 55%), radial-gradient(1200px 800px at 50% 100%, rgba(117, 232, 255, 0.18), transparent 60%), linear-gradient(135deg, #0b0d18, #14172c 45%, #0f1122)",
      "--panel-bg": "rgba(18, 20, 34, 0.82)",
      "--panel-bg-soft": "rgba(255, 255, 255, 0.06)",
      "--panel-border": "rgba(171, 185, 255, 0.22)",
      "--panel-border-strong": "rgba(171, 185, 255, 0.4)",
      "--panel-border-subtle": "rgba(171, 185, 255, 0.12)",
      "--text-primary": "#edf0ff",
      "--text-muted": "#b4bbd6",
      "--accent": "#8ab4ff",
      "--accent-2": "#f0b3ff",
      "--accent-3": "#7bf0ff",
      "--button-bg": "rgba(35, 38, 60, 0.7)",
      "--button-bg-strong": "rgba(138, 180, 255, 0.22)",
      "--chip-bg": "rgba(138, 180, 255, 0.2)",
      "--chip-border": "rgba(138, 180, 255, 0.55)",
      "--input-bg": "rgba(16, 18, 32, 0.72)",
      "--code-bg": "rgba(9, 12, 22, 0.85)",
      "--code-text": "#d7deff"
    }
  },
  {
    id: "light",
    label: "Light",
    vars: {
      "--app-bg": "#f4f6fb",
      "--app-gradient": "radial-gradient(1200px 700px at 10% 0%, rgba(147, 197, 253, 0.35), transparent 60%), radial-gradient(900px 600px at 90% 0%, rgba(251, 207, 232, 0.35), transparent 55%), linear-gradient(135deg, #f4f6fb, #eef2ff 45%, #f9fafb)",
      "--panel-bg": "rgba(255, 255, 255, 0.92)",
      "--panel-bg-soft": "rgba(15, 23, 42, 0.04)",
      "--panel-border": "#e5e7eb",
      "--panel-border-strong": "#d1d5db",
      "--panel-border-subtle": "#f3f4f6",
      "--text-primary": "#111827",
      "--text-muted": "#6b7280",
      "--accent": "#2563eb",
      "--accent-2": "#7c3aed",
      "--accent-3": "#06b6d4",
      "--button-bg": "#f3f4f6",
      "--button-bg-strong": "#e0e7ff",
      "--chip-bg": "var(--chip-bg)",
      "--chip-border": "#c7ddff",
      "--input-bg": "#ffffff",
      "--code-bg": "#0b1220",
      "--code-text": "#e5e7eb"
    }
  },
  {
    id: "dracula",
    label: "Dracula",
    vars: {
      "--app-bg": "#0f1117",
      "--app-gradient": "radial-gradient(1200px 700px at 15% 10%, rgba(189, 147, 249, 0.22), transparent 60%), radial-gradient(900px 600px at 85% 10%, rgba(139, 233, 253, 0.18), transparent 55%), linear-gradient(135deg, #0f1117, #141824 45%, #0b0d14)",
      "--panel-bg": "rgba(27, 31, 42, 0.88)",
      "--panel-bg-soft": "rgba(248, 248, 242, 0.06)",
      "--panel-border": "#2b3140",
      "--panel-border-strong": "#3a4258",
      "--panel-border-subtle": "#242a37",
      "--text-primary": "#f8f8f2",
      "--text-muted": "#b0b8d3",
      "--accent": "#bd93f9",
      "--accent-2": "#ff79c6",
      "--accent-3": "#8be9fd",
      "--button-bg": "#2c3142",
      "--button-bg-strong": "rgba(189, 147, 249, 0.25)",
      "--chip-bg": "rgba(189, 147, 249, 0.2)",
      "--chip-border": "rgba(189, 147, 249, 0.45)",
      "--input-bg": "rgba(20, 23, 34, 0.85)",
      "--code-bg": "#0b1220",
      "--code-text": "#e5e7eb"
    }
  },
  {
    id: "one-dark",
    label: "One Dark",
    vars: {
      "--app-bg": "#0f141b",
      "--app-gradient": "radial-gradient(1200px 700px at 10% 0%, rgba(97, 175, 239, 0.2), transparent 60%), radial-gradient(900px 600px at 85% 5%, rgba(198, 120, 221, 0.18), transparent 55%), linear-gradient(135deg, #0f141b, #151b24 45%, #0e1218)",
      "--panel-bg": "rgba(26, 33, 43, 0.88)",
      "--panel-bg-soft": "rgba(230, 237, 247, 0.06)",
      "--panel-border": "#2b3442",
      "--panel-border-strong": "#3a4558",
      "--panel-border-subtle": "#232c38",
      "--text-primary": "#e6edf7",
      "--text-muted": "#9aa7bd",
      "--accent": "#61afef",
      "--accent-2": "#c678dd",
      "--accent-3": "#56b6c2",
      "--button-bg": "#2b3442",
      "--button-bg-strong": "rgba(97, 175, 239, 0.22)",
      "--chip-bg": "rgba(97, 175, 239, 0.2)",
      "--chip-border": "rgba(97, 175, 239, 0.45)",
      "--input-bg": "rgba(20, 26, 34, 0.82)",
      "--code-bg": "#0b1220",
      "--code-text": "#e5e7eb"
    }
  },
  {
    id: "nord",
    label: "Nord",
    vars: {
      "--app-bg": "#2e3440",
      "--app-gradient": "radial-gradient(1200px 700px at 12% 0%, rgba(136, 192, 208, 0.22), transparent 60%), radial-gradient(900px 600px at 85% 0%, rgba(191, 209, 255, 0.18), transparent 55%), linear-gradient(135deg, #2e3440, #3b4252 45%, #2b313b)",
      "--panel-bg": "rgba(59, 66, 82, 0.86)",
      "--panel-bg-soft": "rgba(236, 239, 244, 0.08)",
      "--panel-border": "#4c566a",
      "--panel-border-strong": "#5a657b",
      "--panel-border-subtle": "#414a5c",
      "--text-primary": "#eceff4",
      "--text-muted": "#cbd5e1",
      "--accent": "#88c0d0",
      "--accent-2": "#b48ead",
      "--accent-3": "#8fbcbb",
      "--button-bg": "#434c5e",
      "--button-bg-strong": "rgba(136, 192, 208, 0.22)",
      "--chip-bg": "rgba(136, 192, 208, 0.2)",
      "--chip-border": "rgba(136, 192, 208, 0.45)",
      "--input-bg": "rgba(47, 54, 66, 0.85)",
      "--code-bg": "#0b1220",
      "--code-text": "#e5e7eb"
    }
  },
  {
    id: "catppuccin-mocha",
    label: "Catppuccin Mocha",
    vars: {
      "--app-bg": "#1e1e2e",
      "--app-gradient": "radial-gradient(1200px 700px at 10% 0%, rgba(198, 160, 246, 0.22), transparent 60%), radial-gradient(900px 600px at 85% 10%, rgba(148, 226, 213, 0.18), transparent 55%), linear-gradient(135deg, #1e1e2e, #24273a 45%, #181826)",
      "--panel-bg": "rgba(36, 39, 58, 0.9)",
      "--panel-bg-soft": "rgba(244, 244, 246, 0.06)",
      "--panel-border": "#363a4f",
      "--panel-border-strong": "#4b5069",
      "--panel-border-subtle": "#2f3347",
      "--text-primary": "#f4f4f6",
      "--text-muted": "#b8c0e0",
      "--accent": "#c6a0f6",
      "--accent-2": "#f5bde6",
      "--accent-3": "#94e2d5",
      "--button-bg": "#303446",
      "--button-bg-strong": "rgba(198, 160, 246, 0.22)",
      "--chip-bg": "rgba(198, 160, 246, 0.2)",
      "--chip-border": "rgba(198, 160, 246, 0.45)",
      "--input-bg": "rgba(27, 29, 45, 0.86)",
      "--code-bg": "#0b1220",
      "--code-text": "#e5e7eb"
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

const VALID_TABS = new Set([
  "chat",
  "calendar",
  "recordings",
  "tools",
  "actionRunner",
  "teachMode",
  "fireflies",
  "trading",
  "safety",
  "canvas",
  "features",
  "settings",
  "debug",
  "guide",
  "capabilities"
]);

const VALID_SETTINGS_TABS = new Set(["connections", "knowledge", "skills", "trading", "appearance", "voice", "aika", "legacy"]);
const VALID_FEATURES_VIEWS = new Set(["mcp"]);

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

function formatActionLabel(actionType = "") {
  return String(actionType || "").replace(/[._]/g, " ").trim() || "action";
}

function formatActionStatus(status = "") {
  const value = String(status || "").toLowerCase();
  if (!value) return "pending";
  if (value === "ok") return "done";
  if (value === "error") return "failed";
  if (value === "client_required") return "waiting on device";
  if (value === "approval_required") return "needs approval";
  return value.replace(/_/g, " ");
}

async function readJsonResponse(response) {
  const text = await response.text();
  if (!text) return {};
  try {
    return JSON.parse(text);
  } catch (err) {
    const snippet = text.replace(/\s+/g, " ").slice(0, 160);
    throw new Error(`Invalid JSON response (${response.status}). ${snippet}`);
  }
}

async function fetchCalendarEventsWithFallback({ baseUrl, query, credentials = "include" }) {
  const candidates = [];
  const normalizedBase = baseUrl ? baseUrl.replace(/\/$/, "") : "";
  if (normalizedBase) candidates.push(normalizedBase);
  if (typeof window !== "undefined") {
    const origin = window.location.origin?.replace(/\/$/, "");
    if (origin) candidates.push(origin);
  }
  candidates.push("");
  const seen = new Set();
  for (const candidate of candidates) {
    const trimmed = candidate || "";
    if (seen.has(trimmed)) continue;
    seen.add(trimmed);
    const url = trimmed ? `${trimmed}/api/calendar/events?${query}` : `/api/calendar/events?${query}`;
    try {
      const resp = await fetch(url, { credentials });
      if (resp.status === 404) continue;
      const data = await readJsonResponse(resp);
      if (!resp.ok) throw new Error(data?.error || "calendar_events_failed");
      return data;
    } catch (err) {
      if (String(err?.message || "").includes("calendar_events_failed")) throw err;
      if (String(err?.message || "").includes("Invalid JSON response")) continue;
      if (String(err?.message || "").includes("calendar_events_not_found")) continue;
    }
  }
  throw new Error("calendar_api_not_found");
}

function toLocalDateInput(value) {
  const date = value instanceof Date ? value : new Date(value || Date.now());
  if (Number.isNaN(date.getTime())) return "";
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60000);
  return local.toISOString().slice(0, 10);
}

function fromDateInput(value, endOfDay = false) {
  if (!value) return "";
  const suffix = endOfDay ? "T23:59:59" : "T00:00:00";
  const date = new Date(`${value}${suffix}`);
  return Number.isNaN(date.getTime()) ? "" : date.toISOString();
}

function parseDateInput(value) {
  if (!value) return null;
  const [year, month, day] = String(value).split("-").map(Number);
  if (!year || !month || !day) return null;
  return { year, month, day };
}

function addDays(dateInput, delta) {
  if (!dateInput) return "";
  const base = new Date(`${dateInput}T00:00:00`);
  if (Number.isNaN(base.getTime())) return dateInput;
  base.setDate(base.getDate() + delta);
  return toLocalDateInput(base);
}

function getTimeZoneParts(date, timeZone) {
  const dtf = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hour12: false,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit"
  });
  const parts = dtf.formatToParts(date);
  const lookup = {};
  for (const part of parts) {
    if (part.type !== "literal") lookup[part.type] = part.value;
  }
  return {
    year: Number(lookup.year),
    month: Number(lookup.month),
    day: Number(lookup.day),
    hour: Number(lookup.hour),
    minute: Number(lookup.minute),
    second: Number(lookup.second)
  };
}

function compareDateParts(a, b) {
  if (!a || !b) return 0;
  if (a.year !== b.year) return a.year - b.year;
  if (a.month !== b.month) return a.month - b.month;
  return a.day - b.day;
}

function getMinutesIntoDay(date, timeZone) {
  const parts = getTimeZoneParts(date, timeZone);
  return parts.hour * 60 + parts.minute + parts.second / 60;
}

function getTimeZoneOffsetMinutes(date, timeZone) {
  const parts = getTimeZoneParts(date, timeZone);
  const utcMs = Date.UTC(parts.year, parts.month - 1, parts.day, parts.hour, parts.minute, parts.second);
  return (utcMs - date.getTime()) / 60000;
}

function zonedTimeToUtcMs({ year, month, day, hour, minute, second }, timeZone) {
  const guessUtc = Date.UTC(year, month - 1, day, hour, minute, second);
  const offset = getTimeZoneOffsetMinutes(new Date(guessUtc), timeZone);
  const adjusted = guessUtc - offset * 60000;
  const offset2 = getTimeZoneOffsetMinutes(new Date(adjusted), timeZone);
  return offset2 === offset ? adjusted : guessUtc - offset2 * 60000;
}

function getZonedDayRange(dateInput, timeZone) {
  const parts = parseDateInput(dateInput);
  if (!parts) return null;
  const startMs = zonedTimeToUtcMs({ ...parts, hour: 0, minute: 0, second: 0 }, timeZone);
  const endMs = zonedTimeToUtcMs({ ...parts, hour: 23, minute: 59, second: 59 }, timeZone);
  return {
    startMs,
    endMs,
    startISO: new Date(startMs).toISOString(),
    endISO: new Date(endMs).toISOString()
  };
}

function formatTimeInTimeZone(value, timeZone) {
  if (!value) return "--";
  const ts = Date.parse(value);
  if (!Number.isFinite(ts)) return value;
  return new Date(ts).toLocaleTimeString(undefined, {
    hour: "2-digit",
    minute: "2-digit",
    timeZone: timeZone || undefined
  });
}

function formatCalendarTime(value) {
  if (!value) return "--";
  const ts = Date.parse(value);
  if (!Number.isFinite(ts)) return value;
  return new Date(ts).toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" });
}

function formatCalendarRange(start, end) {
  const startLabel = formatCalendarTime(start);
  if (!end) return startLabel;
  return `${startLabel} - ${formatCalendarTime(end)}`;
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

function readLegacyPreferences() {
  if (typeof window === "undefined") return {};
  try {
    return {
      theme: window.localStorage.getItem("aika_theme") || "",
      appBackground: window.localStorage.getItem("aika_app_bg") || "",
      avatarBackground: window.localStorage.getItem("aika_avatar_bg") || "",
      avatarModelId: window.localStorage.getItem("aika_avatar_model") || "",
      meetingCommands: window.localStorage.getItem("aika_meeting_commands") || "",
      sttSilenceMs: Number(window.localStorage.getItem("aika_stt_silence_ms") || "1400"),
      ragModel: window.localStorage.getItem("aika_default_rag_model") || window.localStorage.getItem("aika_active_rag_model") || ""
    };
  } catch {
    return {};
  }
}

export default function Home() {
  const [activeTab, setActiveTab] = useState("chat");
  const [killSwitchActive, setKillSwitchActive] = useState(false);
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
  const [tradingEmailSettings, setTradingEmailSettings] = useState({
    enabled: false,
    time: "08:00",
    recipients: "",
    subjectPrefix: "Aika Daily Picks",
    minPicks: 10,
    maxPicks: 15,
    stockCount: 8,
    cryptoCount: 4,
    stocks: "",
    cryptos: ""
  });
  const [tradingQuestions, setTradingQuestions] = useState([]);
  const [tradingNotes, setTradingNotes] = useState("");
  const [tradingSettingsStatus, setTradingSettingsStatus] = useState("");
  const [tradingSettingsError, setTradingSettingsError] = useState("");
  const [tradingSettingsLoading, setTradingSettingsLoading] = useState(false);
  const [calendarDate, setCalendarDate] = useState(() => toLocalDateInput(new Date()));
  const [calendarProvider, setCalendarProvider] = useState("all");
  const [calendarEvents, setCalendarEvents] = useState([]);
  const [calendarLoading, setCalendarLoading] = useState(false);
  const [calendarError, setCalendarError] = useState("");
  const [userText, setUserText] = useState("");
  const [toolsList, setToolsList] = useState([]);
  const [toolsError, setToolsError] = useState("");
  const [toolCallName, setToolCallName] = useState("");
  const [toolCallParams, setToolCallParams] = useState("{}");
  const [toolCallResult, setToolCallResult] = useState("");
  const [toolApproval, setToolApproval] = useState(null);
  const [toolApprovalStatus, setToolApprovalStatus] = useState("");
  const [toolHistory, setToolHistory] = useState([]);
  const [toolHistoryError, setToolHistoryError] = useState("");
  const [aikaModules, setAikaModules] = useState([]);
  const [aikaRunbooks, setAikaRunbooks] = useState([]);
  const [aikaWatchItems, setAikaWatchItems] = useState([]);
  const [aikaWatchTemplates, setAikaWatchTemplates] = useState([]);
  const [aikaSettings, setAikaSettings] = useState(null);
  const [aikaPanelStatus, setAikaPanelStatus] = useState("");
  const [aikaPanelError, setAikaPanelError] = useState("");
  const [aikaModuleId, setAikaModuleId] = useState("");
  const [aikaModuleContext, setAikaModuleContext] = useState("");
  const [aikaModuleStructured, setAikaModuleStructured] = useState("");
  const [aikaModuleResult, setAikaModuleResult] = useState("");
  const [aikaRunbookName, setAikaRunbookName] = useState("");
  const [aikaRunbookContext, setAikaRunbookContext] = useState("");
  const [aikaRunbookResult, setAikaRunbookResult] = useState("");
  const [aikaWatchTemplateId, setAikaWatchTemplateId] = useState("");
  const [aikaWatchConfig, setAikaWatchConfig] = useState("");
  const [aikaWatchObserveId, setAikaWatchObserveId] = useState("");
  const [aikaWatchObserveValue, setAikaWatchObserveValue] = useState("");
  const [aikaWatchResult, setAikaWatchResult] = useState("");
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
  const [workEmail, setWorkEmail] = useState("");
  const [personalEmail, setPersonalEmail] = useState("");
  const [authChecked, setAuthChecked] = useState(false);
  const [assistantProfile, setAssistantProfile] = useState(null);
  const [assistantProfileError, setAssistantProfileError] = useState("");
  const [assistantProfileLoaded, setAssistantProfileLoaded] = useState(false);
  const [defaultRagModel, setDefaultRagModel] = useState("auto");
  const [ragModels, setRagModels] = useState([]);
  const [ragModelsError, setRagModelsError] = useState("");
  const [ragModelsLoading, setRagModelsLoading] = useState(false);
  const [ragExportStatus, setRagExportStatus] = useState("");
  const [ragExportError, setRagExportError] = useState("");
  const [ragExportBusy, setRagExportBusy] = useState(false);
  const [ragBackupStatus, setRagBackupStatus] = useState("");
  const [ragBackupError, setRagBackupError] = useState("");
  const [ragBackupBusy, setRagBackupBusy] = useState(false);
  const [ragImportStatus, setRagImportStatus] = useState("");
  const [ragImportError, setRagImportError] = useState("");
  const [ragImportBusy, setRagImportBusy] = useState(false);
  const [tradingEngineSettings, setTradingEngineSettings] = useState({
    tradeApiUrl: "http://localhost:8088",
    alpacaFeed: "iex"
  });
  const profileSaveTimerRef = useRef(null);
  const ragImportInputRef = useRef(null);
  const lastSavedPrefsRef = useRef("");
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
  const [settingsTab, setSettingsTab] = useState("connections");
  const calendarTimezone = Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
  const calendarDayRange = useMemo(() => getZonedDayRange(calendarDate, calendarTimezone), [calendarDate, calendarTimezone]);
  const calendarDayParts = useMemo(() => parseDateInput(calendarDate), [calendarDate]);
  const calendarHourHeight = 44;
  const calendarHours = useMemo(() => Array.from({ length: 24 }, (_, idx) => idx), []);
  const calendarDayLabel = useMemo(() => {
    if (!calendarDayRange?.startMs) return "";
    return new Date(calendarDayRange.startMs).toLocaleDateString(undefined, {
      weekday: "long",
      month: "long",
      day: "numeric",
      timeZone: calendarTimezone
    });
  }, [calendarDayRange, calendarTimezone]);
  const calendarEventsNormalized = useMemo(() => {
    return (calendarEvents || [])
      .map(event => {
        const startMs = Date.parse(event.start);
        if (!Number.isFinite(startMs)) return null;
        const rawEnd = event.end ? Date.parse(event.end) : NaN;
        const endMs = Number.isFinite(rawEnd) ? rawEnd : startMs + 30 * 60000;
        return {
          ...event,
          _startMs: startMs,
          _endMs: Math.max(endMs, startMs)
        };
      })
      .filter(Boolean)
      .sort((a, b) => a._startMs - b._startMs);
  }, [calendarEvents]);
  const calendarDayEvents = useMemo(() => {
    if (!calendarDayRange) return [];
    const { startMs, endMs } = calendarDayRange;
    return calendarEventsNormalized.filter(event => event._endMs >= startMs && event._startMs <= endMs);
  }, [calendarEventsNormalized, calendarDayRange]);
  const calendarAllDayEvents = useMemo(() => calendarDayEvents.filter(event => event.allDay), [calendarDayEvents]);
  const calendarTimedEvents = useMemo(() => calendarDayEvents.filter(event => !event.allDay), [calendarDayEvents]);
  useEffect(() => {
    if (typeof window === "undefined") return;
    const params = new URLSearchParams(window.location.search);
    const tab = params.get("tab");
    if (tab === "workbench") {
      setActiveTab("settings");
      setSettingsTab("legacy");
    } else if (tab && VALID_TABS.has(tab)) {
      setActiveTab(tab);
    }
    const settings = params.get("settingsTab");
    if (settings && VALID_SETTINGS_TABS.has(settings)) setSettingsTab(settings);
    const features = params.get("featuresView");
    if (features && VALID_FEATURES_VIEWS.has(features)) setFeaturesView(features);
  }, []);
  const [themeId, setThemeId] = useState("aurora");
  const [appBackground, setAppBackground] = useState("");
  const [avatarBackground, setAvatarBackground] = useState("none");
  const [meetingCommandListening, setMeetingCommandListening] = useState(false);
  const [activeRecordingId, setActiveRecordingId] = useState("");
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
  const logRef = useRef(log);

  function registerMeetingCopilotControls(controls) {
    meetingCopilotRef.current = controls || {};
  }

  function setMeetingRecordingActive(active) {
    setMeetingLock(Boolean(active));
  }

  useEffect(() => {
    logRef.current = log;
  }, [log]);

  function buildPreferencePayload(overrides = {}) {
    const base = assistantProfile?.preferences || {};
    const voiceSettings = {
      ...ttsSettings,
      voice: {
        ...(ttsSettings.voice || {}),
        prompt_text: voicePromptText || ttsSettings.voice?.prompt_text || ""
      }
    };
    return {
      ...base,
      ...overrides,
      appearance: {
        ...(base.appearance || {}),
        theme: themeId,
        appBackground,
        avatarBackground,
        avatarModelId
      },
      audio: {
        ...(base.audio || {}),
        sttSilenceMs,
        meetingCommandListening
      },
      voice: {
        ...(base.voice || {}),
        promptText: voicePromptText || "",
        settings: voiceSettings
      },
      identity: {
        ...(base.identity || {}),
        workEmail,
        personalEmail
      },
      rag: {
        ...(base.rag || {}),
        defaultModel: defaultRagModel || "auto"
      }
    };
  }

  async function persistPreferences(nextPrefs) {
    if (!SERVER_URL) return;
    try {
      const resp = await fetch(`${SERVER_URL}/api/assistant/profile`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ preferences: nextPrefs })
      });
      const data = await resp.json();
      if (!resp.ok) throw new Error(data?.error || "profile_update_failed");
      if (data?.profile) {
        setAssistantProfile(data.profile);
        lastSavedPrefsRef.current = JSON.stringify(data.profile.preferences || {});
      }
      setAssistantProfileError("");
    } catch (err) {
      setAssistantProfileError(err?.message || "profile_update_failed");
    }
  }

  function schedulePreferenceSave(nextPrefs) {
    if (!assistantProfileLoaded) return;
    const payload = JSON.stringify(nextPrefs || {});
    if (payload === lastSavedPrefsRef.current) return;
    if (profileSaveTimerRef.current) clearTimeout(profileSaveTimerRef.current);
    profileSaveTimerRef.current = setTimeout(() => {
      persistPreferences(nextPrefs);
    }, 500);
  }

  useEffect(() => {
    if (!authChecked) return;
    let mounted = true;
    async function loadProfile() {
      try {
        const resp = await fetch(`${SERVER_URL}/api/assistant/profile`, { credentials: "include" });
        const data = await resp.json();
        if (!mounted) return;
        const profile = data?.profile || null;
        if (!profile) {
          setAssistantProfileLoaded(true);
          return;
        }
        let prefs = profile.preferences || {};
        const shouldMigrate = !profile.createdAt;
        if (shouldMigrate) {
          const legacy = readLegacyPreferences();
          const nextAppearance = {
            ...(prefs.appearance || {}),
            ...(legacy.theme ? { theme: legacy.theme } : {}),
            ...(legacy.appBackground ? { appBackground: legacy.appBackground } : {}),
            ...(legacy.avatarBackground ? { avatarBackground: legacy.avatarBackground } : {}),
            ...(legacy.avatarModelId ? { avatarModelId: legacy.avatarModelId } : {})
          };
          const nextAudio = {
            ...(prefs.audio || {}),
            ...(legacy.meetingCommands ? { meetingCommandListening: legacy.meetingCommands === "true" } : {}),
            ...(Number.isFinite(legacy.sttSilenceMs) ? { sttSilenceMs: legacy.sttSilenceMs } : {})
          };
          const nextRag = {
            ...(prefs.rag || {}),
            ...(legacy.ragModel ? { defaultModel: legacy.ragModel, tradingModel: legacy.ragModel } : {})
          };
          prefs = {
            ...prefs,
            appearance: nextAppearance,
            audio: nextAudio,
            rag: nextRag
          };
        }

        setAssistantProfile({ ...profile, preferences: prefs });
        setAssistantProfileError("");
        setThemeId(prefs.appearance?.theme || "aurora");
        setAppBackground(prefs.appearance?.appBackground || "");
        setAvatarBackground(prefs.appearance?.avatarBackground || "none");
        if (prefs.appearance?.avatarModelId) {
          setAvatarModelId(prefs.appearance.avatarModelId);
        }
        setMeetingCommandListening(Boolean(prefs.audio?.meetingCommandListening));
        const silenceMs = Number(prefs.audio?.sttSilenceMs || 1400);
        if (Number.isFinite(silenceMs)) {
          setSttSilenceMs(Math.max(800, Math.min(3000, silenceMs)));
        }
        if (prefs.voice?.settings) {
          setTtsSettings(prev => ({
            ...prev,
            ...prefs.voice.settings,
            voice: { ...prev.voice, ...(prefs.voice.settings.voice || {}) }
          }));
        }
        const prompt = prefs.voice?.promptText || prefs.voice?.settings?.voice?.prompt_text || "";
        if (prompt) {
          setVoicePromptText(prompt);
          setTtsSettings(prev => ({
            ...prev,
            voice: { ...prev.voice, prompt_text: prompt }
          }));
        }
        setDefaultRagModel(prefs.rag?.defaultModel || "auto");
        setWorkEmail(prefs.identity?.workEmail || "");
        setPersonalEmail(prefs.identity?.personalEmail || "");
        lastSavedPrefsRef.current = JSON.stringify(prefs || {});
        setAssistantProfileLoaded(true);
        if (shouldMigrate) {
          persistPreferences(prefs);
        }
      } catch (err) {
        if (!mounted) return;
        setAssistantProfileError(err?.message || "profile_load_failed");
        setAssistantProfileLoaded(true);
      }
    }
    loadProfile();
    return () => {
      mounted = false;
    };
  }, [authChecked]);

  useEffect(() => {
    if (!assistantProfileLoaded) return;
    const prefs = buildPreferencePayload();
    schedulePreferenceSave(prefs);
  }, [
    assistantProfileLoaded,
    themeId,
    appBackground,
    avatarBackground,
    avatarModelId,
    meetingCommandListening,
    sttSilenceMs,
    ttsSettings,
    voicePromptText,
    defaultRagModel,
    workEmail,
    personalEmail
  ]);

  useEffect(() => {
    const interval = setInterval(async () => {
      const current = logRef.current || [];
      const pending = current.filter(item => item.actionMeta?.idempotencyKey && ["running", "client_required", "approval_required"].includes(item.actionMeta.status));
      if (!pending.length) return;
      const ids = [...new Set(pending.map(item => item.actionMeta.idempotencyKey))];
      const updates = await Promise.all(ids.map(async (id) => {
        try {
          const resp = await fetch(`${SERVER_URL}/api/actions/runs/${id}`);
          if (!resp.ok) return { id, run: null };
          const data = await resp.json();
          return { id, run: data.run || null };
        } catch {
          return { id, run: null };
        }
      }));
      const statusMap = new Map(updates.filter(item => item.run).map(item => [item.id, item.run]));
      if (!statusMap.size) return;
      setLog(prev => prev.map(item => {
        const id = item.actionMeta?.idempotencyKey;
        if (!id || !statusMap.has(id)) return item;
        const run = statusMap.get(id);
        const nextStatus = run?.status || item.actionMeta.status;
        return { ...item, actionMeta: { ...item.actionMeta, status: nextStatus } };
      }));
    }, 2000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const theme = THEMES.find(t => t.id === themeId) || THEMES[0];
    Object.entries(theme.vars).forEach(([key, value]) => {
      document.documentElement.style.setProperty(key, value);
    });
    document.body.dataset.aikaTheme = theme.id;
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
    if (avatarModelId) window.localStorage.setItem("aika_avatar_model", avatarModelId);
    if (defaultRagModel) {
      window.localStorage.setItem("aika_default_rag_model", defaultRagModel);
    }
  }, [themeId, appBackground, avatarBackground, avatarModelId, defaultRagModel]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    window.localStorage.setItem("aika_meeting_commands", String(meetingCommandListening));
  }, [meetingCommandListening]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    window.localStorage.setItem("aika_stt_silence_ms", String(sttSilenceMs));
  }, [sttSilenceMs]);

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
    const ragModel = defaultRagModel || "auto";
    try {
      const senderId = currentUser?.email || "local";
      const senderName = currentUser?.name || currentUser?.email || "local";
      r = await fetch(`${SERVER_URL}/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          userText: text,
          maxOutputTokens: fastReplies ? 200 : 320,
          ragModel,
          channel: "web",
          senderId,
          senderName,
          recordingId: activeRecordingId || undefined
        })
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
    if (data?.ragModel) {
      setDefaultRagModel(data.ragModel);
    }
    const action = data?.action;
    if (action?.type?.startsWith("record_meeting") && action?.status === "client_required") {
      const controls = meetingCopilotRef.current || {};
      try {
        if (action.type === "record_meeting.start") {
          await controls.start?.(action.params || {});
        } else if (action.type === "record_meeting.stop") {
          await controls.stop?.();
        } else if (action.type === "record_meeting.pause") {
          await controls.pause?.();
        } else if (action.type === "record_meeting.resume") {
          await controls.resume?.();
        }
      } catch (err) {
        setChatError(err?.message || "recording_action_failed");
      }
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
      const actionMeta = data?.action ? { ...data.action } : null;
      const memoryNote = data?.memoryAdded
        ? "Added to memory"
        : data?.memoryRecall
          ? "Memory recall"
          : "";
      setLog(l => [
        ...l,
        {
          id: replyMessageId,
          role: "assistant",
          text: displayReply || "(no reply)",
          prompt: text,
          source: data?.source || "chat",
          citations: replyCitations,
          memoryNote,
          actionMeta
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
    if (activeTab !== "settings" || settingsTab !== "trading") return;
    loadTradingSettings();
  }, [activeTab, settingsTab]);

  useEffect(() => {
    if (activeTab !== "settings" || settingsTab !== "aika") return;
    loadAikaPanel();
  }, [activeTab, settingsTab]);

  useEffect(() => {
    if (activeTab !== "settings" || settingsTab !== "knowledge") return;
    loadRagModels();
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
    async function loadKillSwitch() {
      try {
        const r = await fetch(`${SERVER_URL}/api/safety/kill-switch`);
        const data = await r.json();
        if (r.ok) {
          setKillSwitchActive(Boolean(data?.killSwitch?.enabled));
        }
      } catch {
        // ignore
      }
    }
    loadKillSwitch();
    const id = setInterval(loadKillSwitch, 15000);
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
    loadHistory();
    return () => {
      cancelled = true;
    };
  }, [activeTab]);

  useEffect(() => {
    if (activeTab !== "calendar") return;
    loadCalendarDayEvents();
  }, [activeTab, calendarDate, calendarProvider]);

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
        const resp = await fetch(`${SERVER_URL}/api/auth/me`, { credentials: "include" });
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
        background: "var(--code-bg)",
        color: "#e5e7eb",
        padding: 24
      }}>
        <div style={{ fontSize: 14, color: "#cbd5f5" }}>Checking sign-in...</div>
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
        background: "var(--code-bg)",
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
              border: "1px solid var(--panel-border-strong)",
              background: "#1d4ed8",
              color: "var(--panel-bg)",
              fontWeight: 600,
              cursor: "pointer"
            }}
          >
            Sign in with Google
          </button>
          <div style={{ marginTop: 12, fontSize: 12, color: "var(--text-muted)" }}>
            After signing in, refresh this page to continue.
          </div>
        </div>
      </div>
    );
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

  function parseListInput(value) {
    return String(value || "")
      .split(/[;,\n]/)
      .map(v => v.trim())
      .filter(Boolean);
  }

  function formatListInput(list) {
    if (!Array.isArray(list)) return "";
    return list.join(", ");
  }

  function parseJsonInput(raw, label = "JSON") {
    const trimmed = String(raw || "").trim();
    if (!trimmed) return null;
    try {
      return JSON.parse(trimmed);
    } catch {
      throw new Error(`${label} must be valid JSON.`);
    }
  }

  function addTradingQuestion() {
    const id = (typeof crypto !== "undefined" && crypto.randomUUID)
      ? crypto.randomUUID()
      : `q_${Date.now()}`;
    setTradingQuestions(prev => [...prev, { id, question: "", answer: "" }]);
  }

  function updateTradingQuestion(idx, field, value) {
    setTradingQuestions(prev => prev.map((item, i) => (
      i === idx ? { ...item, [field]: value } : item
    )));
  }

  function removeTradingQuestion(idx) {
    setTradingQuestions(prev => prev.filter((_, i) => i !== idx));
  }

  async function loadAikaPanel() {
    setAikaPanelStatus("Loading AIKA data...");
    setAikaPanelError("");
    try {
      const [modulesRes, runbooksRes, watchRes, templateRes, settingsRes] = await Promise.all([
        fetch(`${SERVER_URL}/api/aika/modules`),
        fetch(`${SERVER_URL}/api/aika/runbooks`),
        fetch(`${SERVER_URL}/api/aika/watch`),
        fetch(`${SERVER_URL}/api/aika/watch/templates`),
        fetch(`${SERVER_URL}/api/aika/settings`)
      ]);
      const modulesData = await readJsonResponse(modulesRes);
      const runbooksData = await readJsonResponse(runbooksRes);
      const watchData = await readJsonResponse(watchRes);
      const templateData = await readJsonResponse(templateRes);
      const settingsData = await readJsonResponse(settingsRes);
      if (!modulesRes.ok) throw new Error(modulesData?.error || "aika_modules_failed");
      if (!runbooksRes.ok) throw new Error(runbooksData?.error || "aika_runbooks_failed");
      if (!watchRes.ok) throw new Error(watchData?.error || "aika_watch_failed");
      if (!templateRes.ok) throw new Error(templateData?.error || "aika_watch_templates_failed");
      if (!settingsRes.ok) throw new Error(settingsData?.error || "aika_settings_failed");
      setAikaModules(modulesData.modules || []);
      setAikaRunbooks(runbooksData.runbooks || []);
      setAikaWatchItems(watchData.items || []);
      setAikaWatchTemplates(templateData.templates || []);
      setAikaSettings(settingsData.settings || null);
      if (!aikaModuleId && modulesData.modules?.length) setAikaModuleId(modulesData.modules[0].id);
      if (!aikaRunbookName && runbooksData.runbooks?.length) setAikaRunbookName(runbooksData.runbooks[0].name);
      if (!aikaWatchTemplateId && templateData.templates?.length) setAikaWatchTemplateId(templateData.templates[0].id);
      if (!aikaWatchObserveId && watchData.items?.length) setAikaWatchObserveId(watchData.items[0].id);
      setAikaPanelStatus("AIKA data loaded.");
    } catch (err) {
      setAikaPanelError(err?.message || "aika_panel_failed");
      setAikaPanelStatus("");
    }
  }

  async function updateAikaSettings(next) {
    setAikaPanelStatus("Saving settings...");
    setAikaPanelError("");
    try {
      const r = await fetch(`${SERVER_URL}/api/aika/settings`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(next || {})
      });
      const data = await readJsonResponse(r);
      if (!r.ok) throw new Error(data?.error || "aika_settings_save_failed");
      setAikaSettings(data.settings || null);
      setAikaPanelStatus("Settings saved.");
    } catch (err) {
      setAikaPanelError(err?.message || "aika_settings_save_failed");
      setAikaPanelStatus("");
    }
  }

  async function runAikaModule() {
    if (!aikaModuleId) {
      setAikaPanelError("Select a module to run.");
      return;
    }
    setAikaPanelStatus("Running module...");
    setAikaPanelError("");
    setAikaModuleResult("");
    try {
      const structured = parseJsonInput(aikaModuleStructured, "Structured input");
      const payload = {
        moduleId: aikaModuleId,
        inputPayload: {
          context_text: aikaModuleContext,
          structured_input: structured || {}
        }
      };
      const r = await fetch(`${SERVER_URL}/api/aika/modules/run`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
      });
      const data = await readJsonResponse(r);
      if (!r.ok) throw new Error(data?.error || "module_run_failed");
      setAikaModuleResult(JSON.stringify(data, null, 2));
      setAikaPanelStatus(`Module ${data?.status || "completed"}.`);
      await loadAikaPanel();
    } catch (err) {
      setAikaPanelError(err?.message || "module_run_failed");
      setAikaPanelStatus("");
    }
  }

  async function runAikaRunbook() {
    if (!aikaRunbookName) {
      setAikaPanelError("Select a runbook to run.");
      return;
    }
    setAikaPanelStatus("Running runbook...");
    setAikaPanelError("");
    setAikaRunbookResult("");
    try {
      const payload = {
        name: aikaRunbookName,
        inputPayload: { context_text: aikaRunbookContext }
      };
      const r = await fetch(`${SERVER_URL}/api/aika/runbooks/run`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
      });
      const data = await readJsonResponse(r);
      if (!r.ok) throw new Error(data?.error || "runbook_run_failed");
      setAikaRunbookResult(JSON.stringify(data, null, 2));
      setAikaPanelStatus(`Runbook ${data?.status || "completed"}.`);
      await loadAikaPanel();
    } catch (err) {
      setAikaPanelError(err?.message || "runbook_run_failed");
      setAikaPanelStatus("");
    }
  }

  async function createAikaWatch() {
    if (!aikaWatchTemplateId) {
      setAikaPanelError("Select a watch template.");
      return;
    }
    setAikaPanelStatus("Creating watch item...");
    setAikaPanelError("");
    try {
      const config = parseJsonInput(aikaWatchConfig, "Watch config") || {};
      const r = await fetch(`${SERVER_URL}/api/aika/watch`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ templateId: aikaWatchTemplateId, config })
      });
      const data = await readJsonResponse(r);
      if (!r.ok) throw new Error(data?.error || "watch_create_failed");
      setAikaPanelStatus("Watch item created.");
      setAikaWatchObserveId(data?.item?.id || "");
      await loadAikaPanel();
    } catch (err) {
      setAikaPanelError(err?.message || "watch_create_failed");
      setAikaPanelStatus("");
    }
  }

  async function observeAikaWatch() {
    if (!aikaWatchObserveId) {
      setAikaPanelError("Select a watch item to observe.");
      return;
    }
    setAikaPanelStatus("Recording watch event...");
    setAikaPanelError("");
    setAikaWatchResult("");
    try {
      let rawInput = aikaWatchObserveValue;
      const trimmed = String(aikaWatchObserveValue || "").trim();
      if (trimmed) {
        try {
          rawInput = JSON.parse(trimmed);
        } catch {
          rawInput = trimmed;
        }
      }
      const r = await fetch(`${SERVER_URL}/api/aika/watch/${encodeURIComponent(aikaWatchObserveId)}/observe`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ rawInput })
      });
      const data = await readJsonResponse(r);
      if (!r.ok) throw new Error(data?.error || "watch_observe_failed");
      setAikaWatchResult(JSON.stringify(data, null, 2));
      setAikaPanelStatus("Watch event recorded.");
      await loadAikaPanel();
    } catch (err) {
      setAikaPanelError(err?.message || "watch_observe_failed");
      setAikaPanelStatus("");
    }
  }

  async function loadTradingSettings() {
    setTradingSettingsLoading(true);
    setTradingSettingsError("");
    try {
      const r = await fetch(`${SERVER_URL}/api/trading/settings`);
      const data = await r.json();
      if (!r.ok) throw new Error(data?.error || "trading_settings_failed");
      const email = data?.email || {};
      const training = data?.training || {};
      const engine = data?.engine || {};
      setTradingEmailSettings({
        enabled: Boolean(email.enabled),
        time: email.time || "08:00",
        recipients: formatListInput(email.recipients),
        subjectPrefix: email.subjectPrefix || "Aika Daily Picks",
        minPicks: Number(email.minPicks || 10),
        maxPicks: Number(email.maxPicks || 15),
        stockCount: Number(email.stockCount || 8),
        cryptoCount: Number(email.cryptoCount || 4),
        stocks: formatListInput(email.stocks || []),
        cryptos: formatListInput(email.cryptos || [])
      });
      setTradingQuestions(Array.isArray(training.questions) ? training.questions : []);
      setTradingNotes(training.notes || "");
      setTradingEngineSettings(prev => ({
        tradeApiUrl: engine.tradeApiUrl || prev.tradeApiUrl,
        alpacaFeed: engine.alpacaFeed || prev.alpacaFeed
      }));
      setTradingSettingsStatus("Loaded settings.");
    } catch (err) {
      setTradingSettingsError(err?.message || "trading_settings_failed");
    } finally {
      setTradingSettingsLoading(false);
    }
  }

  async function saveTradingSettings() {
    setTradingSettingsLoading(true);
    setTradingSettingsError("");
    try {
      const payload = {
        email: {
          enabled: Boolean(tradingEmailSettings.enabled),
          time: tradingEmailSettings.time,
          recipients: parseListInput(tradingEmailSettings.recipients),
          subjectPrefix: tradingEmailSettings.subjectPrefix,
          minPicks: Number(tradingEmailSettings.minPicks || 10),
          maxPicks: Number(tradingEmailSettings.maxPicks || 15),
          stockCount: Number(tradingEmailSettings.stockCount || 8),
          cryptoCount: Number(tradingEmailSettings.cryptoCount || 4),
          stocks: parseListInput(tradingEmailSettings.stocks),
          cryptos: parseListInput(tradingEmailSettings.cryptos)
        },
        training: {
          notes: tradingNotes,
          questions: tradingQuestions
            .map(item => ({
              id: item.id,
              question: String(item.question || "").trim(),
              answer: String(item.answer || "").trim()
            }))
            .filter(item => item.question.length > 0)
        },
        engine: {
          tradeApiUrl: tradingEngineSettings.tradeApiUrl,
          alpacaFeed: tradingEngineSettings.alpacaFeed
        }
      };
      const r = await fetch(`${SERVER_URL}/api/trading/settings`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
      });
      const data = await r.json();
      if (!r.ok) throw new Error(data?.error || "trading_settings_save_failed");
      setTradingSettingsStatus("Saved.");
      if (data?.settings) {
        setTradingEmailSettings(prev => ({
          ...prev,
          enabled: Boolean(data.settings.email?.enabled),
          time: data.settings.email?.time || prev.time,
          recipients: formatListInput(data.settings.email?.recipients || []),
          subjectPrefix: data.settings.email?.subjectPrefix || prev.subjectPrefix,
          minPicks: data.settings.email?.minPicks || prev.minPicks,
          maxPicks: data.settings.email?.maxPicks || prev.maxPicks,
          stockCount: data.settings.email?.stockCount || prev.stockCount,
          cryptoCount: data.settings.email?.cryptoCount || prev.cryptoCount,
          stocks: formatListInput(data.settings.email?.stocks || []),
          cryptos: formatListInput(data.settings.email?.cryptos || [])
        }));
        setTradingQuestions(Array.isArray(data.settings.training?.questions) ? data.settings.training.questions : []);
        setTradingNotes(data.settings.training?.notes || "");
        setTradingEngineSettings(prev => ({
          tradeApiUrl: data.settings.engine?.tradeApiUrl || prev.tradeApiUrl,
          alpacaFeed: data.settings.engine?.alpacaFeed || prev.alpacaFeed
        }));
      }
    } catch (err) {
      setTradingSettingsError(err?.message || "trading_settings_save_failed");
    } finally {
      setTradingSettingsLoading(false);
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
    setToolApproval(null);
    setToolApprovalStatus("");
    try {
      const params = JSON.parse(toolCallParams || "{}");
      const r = await fetch(`${SERVER_URL}/api/tools/call`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: toolCallName, params })
      });
      const data = await r.json();
      setToolCallResult(JSON.stringify(data, null, 2));
      if (data?.status === "approval_required" && data?.approval) {
        setToolApproval(data.approval);
        setToolApprovalStatus("Approval required.");
      }
      await refreshToolHistory();
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

  async function loadRagModels() {
    setRagModelsError("");
    setRagModelsLoading(true);
    try {
      const r = await fetch(`${SERVER_URL}/api/rag/models`);
      const data = await r.json();
      if (!r.ok) throw new Error(data?.error || "rag_models_failed");
      setRagModels(Array.isArray(data.models) ? data.models : []);
    } catch (err) {
      setRagModels([]);
      setRagModelsError(err?.message || "rag_models_failed");
    } finally {
      setRagModelsLoading(false);
    }
  }

  function resolveDownloadName(headerValue, fallbackName) {
    if (!headerValue) return fallbackName;
    const match = headerValue.match(/filename\*?=(?:UTF-8''|\"?)([^\";]+)/i);
    if (!match) return fallbackName;
    const raw = match[1].replace(/\"/g, "");
    try {
      return decodeURIComponent(raw);
    } catch {
      return raw || fallbackName;
    }
  }

  async function downloadRagBackup() {
    setRagBackupError("");
    setRagBackupStatus("");
    setRagBackupBusy(true);
    try {
      const r = await fetch(`${SERVER_URL}/api/rag/backup/download`);
      if (!r.ok) {
        let errText = "rag_backup_failed";
        try {
          const data = await r.json();
          errText = data?.error || errText;
        } catch {
          errText = await r.text();
        }
        throw new Error(errText || "rag_backup_failed");
      }
      const blob = await r.blob();
      const fileName = resolveDownloadName(r.headers.get("content-disposition"), "rag-backup.zip");
      const objectUrl = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = objectUrl;
      a.download = fileName;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      setTimeout(() => URL.revokeObjectURL(objectUrl), 2000);
      setRagBackupStatus(`Downloaded ${fileName}`);
    } catch (err) {
      setRagBackupError(err?.message || "rag_backup_failed");
    } finally {
      setRagBackupBusy(false);
    }
  }

  async function exportRagModelsFile() {
    setRagExportError("");
    setRagExportStatus("");
    setRagExportBusy(true);
    try {
      const r = await fetch(`${SERVER_URL}/api/rag/models/export`);
      if (!r.ok) {
        let errText = "rag_models_export_failed";
        try {
          const data = await r.json();
          errText = data?.error || errText;
        } catch {
          errText = await r.text();
        }
        throw new Error(errText || "rag_models_export_failed");
      }
      const blob = await r.blob();
      const fileName = resolveDownloadName(r.headers.get("content-disposition"), "rag-models.json");
      const objectUrl = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = objectUrl;
      a.download = fileName;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      setTimeout(() => URL.revokeObjectURL(objectUrl), 2000);
      setRagExportStatus(`Exported ${fileName}`);
    } catch (err) {
      setRagExportError(err?.message || "rag_models_export_failed");
    } finally {
      setRagExportBusy(false);
    }
  }

  async function importRagModelsFile(file) {
    if (!file) return;
    setRagImportError("");
    setRagImportStatus("");
    setRagImportBusy(true);
    try {
      const raw = await file.text();
      const payload = JSON.parse(raw || "{}");
      const r = await fetch(`${SERVER_URL}/api/rag/models/import`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
      });
      const data = await r.json();
      if (!r.ok) throw new Error(data?.error || "rag_models_import_failed");
      const imported = data?.imported || {};
      const sources = imported.sources || {};
      setRagImportStatus(`Imported ${imported.models || 0} models, ${sources.trading || 0} trading sources, ${sources.rss || 0} RSS sources, ${sources.youtube || 0} YouTube sources.`);
      await loadRagModels();
    } catch (err) {
      setRagImportError(err?.message || "rag_models_import_failed");
    } finally {
      if (ragImportInputRef.current) ragImportInputRef.current.value = "";
      setRagImportBusy(false);
    }
  }

  async function updateToolApproval(action, token) {
    if (!toolApproval?.id) return;
    setToolApprovalStatus("");
    try {
      const endpoint = action === "approve" ? "approve" : action === "deny" ? "deny" : "execute";
      const r = await fetch(`${SERVER_URL}/api/approvals/${toolApproval.id}/${endpoint}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(endpoint === "execute" ? { token } : {})
      });
      const data = await r.json();
      if (!r.ok) throw new Error(data?.error || "approval_update_failed");
      if (endpoint === "execute") {
        setToolApprovalStatus("Approved action executed.");
        setToolApproval(null);
        setToolCallResult(JSON.stringify(data, null, 2));
      } else {
        setToolApproval(data.approval || null);
        setToolApprovalStatus(endpoint === "approve" ? "Approved. Ready to execute." : "Approval denied.");
      }
      await refreshToolHistory();
    } catch (err) {
      setToolApprovalStatus(err?.message || "approval_update_failed");
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
      outlook: { method: "oauth", authorizeUrl: "/api/integrations/microsoft/connect?preset=mail_read" },
      microsoft: { method: "oauth", authorizeUrl: "/api/integrations/microsoft/connect?preset=mail_read" },
      amazon: { method: "oauth", authorizeUrl: "/api/integrations/amazon/auth/start" },
      walmart: { method: "oauth", authorizeUrl: "/api/integrations/walmart/auth/start" },
      notion: { method: "oauth", authorizeUrl: "/api/integrations/notion/connect" },
      whatsapp: { method: "oauth", authorizeUrl: "/api/integrations/meta/connect?product=whatsapp" },
      fireflies: { method: "api_key", fields: [{ key: "FIREFLIES_API_KEY", label: "Fireflies API Key", type: "password", required: true }] },
      slack: { method: "oauth", authorizeUrl: "/api/integrations/slack/connect" },
      telegram: { method: "api_key", fields: [{ key: "TELEGRAM_BOT_TOKEN", label: "Telegram Bot Token", type: "password", required: true }] },
      discord: { method: "oauth", authorizeUrl: "/api/integrations/discord/connect" },
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

  async function loadCalendarDayEvents(selectedDate = calendarDate) {
    if (!selectedDate) return;
    const range = getZonedDayRange(selectedDate, calendarTimezone);
    if (!range) return;
    setCalendarLoading(true);
    setCalendarError("");
    try {
      const params = new URLSearchParams({
        providers: calendarProvider,
        start: range.startISO,
        end: range.endISO,
        timezone: calendarTimezone
      });
      const data = await fetchCalendarEventsWithFallback({ baseUrl: SERVER_URL, query: params.toString() });
      setCalendarEvents(Array.isArray(data.events) ? data.events : []);
    } catch (err) {
      setCalendarEvents([]);
      const message = err?.message === "calendar_api_not_found"
        ? "Calendar API not available. Restart the server or update to the latest build."
        : err?.message || "calendar_events_failed";
      setCalendarError(message);
    } finally {
      setCalendarLoading(false);
    }
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
      <div
        className="app-shell"
        style={{
          display: "grid",
          gridTemplateColumns: "1.15fr 0.85fr",
          height: "100vh",
          background: "var(--app-gradient)",
          color: "var(--text-primary)"
        }}
      >
        <div className="avatar-stage" style={{ position: "relative" }}>
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
                  border: "1px solid var(--panel-border-strong)",
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
            pngSet={avatarModels.find(m => m.id === avatarModelId)?.pngSet}
            backgroundSrc={AVATAR_BACKGROUNDS.find(bg => bg.id === avatarBackground)?.src}
          />
      </div>

      <div
        className="side-panel"
        style={{
          padding: 16,
          display: "flex",
          flexDirection: "column",
          gap: 12,
          background: "var(--panel-bg)",
          color: "var(--text-primary)",
          borderLeft: "1px solid var(--panel-border-strong)",
          backdropFilter: "blur(18px)",
          minHeight: 0,
          overflow: "hidden"
        }}
      >
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
        {killSwitchActive && (
          <div style={{
            border: "1px solid #dc2626",
            background: "#fef2f2",
            color: "#991b1b",
            borderRadius: 12,
            padding: "10px 12px",
            fontSize: 12,
            fontWeight: 600
          }}>
            Kill switch active: automation is paused.
          </div>
        )}
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
          <button
            onClick={() => setActiveTab("chat")}
            style={{
              padding: "8px 12px",
              borderRadius: 10,
              border: activeTab === "chat" ? "1px solid var(--accent)" : "1px solid var(--panel-border)",
              background: activeTab === "chat" ? "var(--chip-bg)" : "var(--panel-bg)"
            }}
          >
            Chat
          </button>
          <button
            onClick={() => setActiveTab("recordings")}
            style={{
              padding: "8px 12px",
              borderRadius: 10,
              border: activeTab === "recordings" ? "1px solid var(--accent)" : "1px solid var(--panel-border)",
              background: activeTab === "recordings" ? "var(--chip-bg)" : "var(--panel-bg)"
            }}
          >
            Recordings
          </button>
            <button
              onClick={() => setActiveTab("tools")}
              style={{
                padding: "8px 12px",
                borderRadius: 10,
                border: activeTab === "tools" ? "1px solid var(--accent)" : "1px solid var(--panel-border)",
                background: activeTab === "tools" ? "var(--chip-bg)" : "var(--panel-bg)"
              }}
            >
              Tools
            </button>
            <button
              onClick={() => setActiveTab("actionRunner")}
              style={{
                padding: "8px 12px",
                borderRadius: 10,
                border: activeTab === "actionRunner" ? "1px solid var(--accent)" : "1px solid var(--panel-border)",
                background: activeTab === "actionRunner" ? "var(--chip-bg)" : "var(--panel-bg)"
              }}
            >
              Action Runner
            </button>
            <button
              onClick={() => setActiveTab("teachMode")}
              style={{
                padding: "8px 12px",
                borderRadius: 10,
                border: activeTab === "teachMode" ? "1px solid var(--accent)" : "1px solid var(--panel-border)",
                background: activeTab === "teachMode" ? "var(--chip-bg)" : "var(--panel-bg)"
              }}
            >
              Teach Mode
            </button>
            <button
              onClick={() => setActiveTab("fireflies")}
              style={{
                padding: "8px 12px",
                borderRadius: 10,
                border: activeTab === "fireflies" ? "1px solid var(--accent)" : "1px solid var(--panel-border)",
                background: activeTab === "fireflies" ? "var(--chip-bg)" : "var(--panel-bg)"
              }}
            >
              Fireflies
            </button>
            <button
              onClick={() => setActiveTab("trading")}
              style={{
                padding: "8px 12px",
                borderRadius: 10,
                border: activeTab === "trading" ? "1px solid var(--accent)" : "1px solid var(--panel-border)",
                background: activeTab === "trading" ? "var(--chip-bg)" : "var(--panel-bg)"
              }}
            >
              Trading
            </button>
            <button
              onClick={() => setActiveTab("calendar")}
              style={{
                padding: "8px 12px",
                borderRadius: 10,
                border: activeTab === "calendar" ? "1px solid var(--accent)" : "1px solid var(--panel-border)",
                background: activeTab === "calendar" ? "var(--chip-bg)" : "var(--panel-bg)"
              }}
            >
              Calendar
            </button>
            <button
              onClick={() => {
                if (typeof window !== "undefined") {
                  window.location.href = "/email";
                }
              }}
              style={{
                padding: "8px 12px",
                borderRadius: 10,
                border: "1px solid var(--panel-border)",
                background: "var(--panel-bg)"
              }}
            >
              Email Full Screen
            </button>
            <button
              onClick={() => {
                if (typeof window !== "undefined") {
                  window.location.href = "/calendar";
                }
              }}
              style={{
                padding: "8px 12px",
                borderRadius: 10,
                border: "1px solid var(--panel-border)",
                background: "var(--panel-bg)"
              }}
            >
              Calendar Full Screen
            </button>
            <button
              onClick={() => setActiveTab("safety")}
              style={{
                padding: "8px 12px",
                borderRadius: 10,
                border: activeTab === "safety" ? "1px solid var(--accent)" : "1px solid var(--panel-border)",
                background: activeTab === "safety" ? "var(--chip-bg)" : "var(--panel-bg)"
              }}
            >
              Safety
            </button>
            <button
              onClick={() => setActiveTab("canvas")}
              style={{
                padding: "8px 12px",
                borderRadius: 10,
                border: activeTab === "canvas" ? "1px solid var(--accent)" : "1px solid var(--panel-border)",
                background: activeTab === "canvas" ? "var(--chip-bg)" : "var(--panel-bg)"
              }}
            >
              Canvas
            </button>
            <button
              onClick={() => setActiveTab("features")}
              style={{
                padding: "8px 12px",
                borderRadius: 10,
                border: activeTab === "features" ? "1px solid var(--accent)" : "1px solid var(--panel-border)",
                background: activeTab === "features" ? "var(--chip-bg)" : "var(--panel-bg)"
              }}
            >
              Features
            </button>
            <button
              onClick={() => {
                setActiveTab("settings");
                setSettingsTab("connections");
              }}
              style={{
                padding: "8px 12px",
                borderRadius: 10,
                border: activeTab === "settings" ? "1px solid var(--accent)" : "1px solid var(--panel-border)",
                background: activeTab === "settings" ? "var(--chip-bg)" : "var(--panel-bg)"
              }}
            >
              Settings
            </button>
            <button
              onClick={() => setActiveTab("debug")}
              style={{
                padding: "8px 12px",
                borderRadius: 10,
              border: activeTab === "debug" ? "1px solid var(--accent)" : "1px solid var(--panel-border)",
              background: activeTab === "debug" ? "var(--chip-bg)" : "var(--panel-bg)"
            }}
          >
            Debug
          </button>
          <button
            onClick={() => setActiveTab("guide")}
            style={{
              padding: "8px 12px",
              borderRadius: 10,
              border: activeTab === "guide" ? "1px solid var(--accent)" : "1px solid var(--panel-border)",
              background: activeTab === "guide" ? "var(--chip-bg)" : "var(--panel-bg)"
            }}
          >
            Guide
          </button>
          <button
            onClick={() => setActiveTab("capabilities")}
            style={{
              padding: "8px 12px",
              borderRadius: 10,
              border: activeTab === "capabilities" ? "1px solid var(--accent)" : "1px solid var(--panel-border)",
              background: activeTab === "capabilities" ? "var(--chip-bg)" : "var(--panel-bg)"
            }}
          >
            Capabilities
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
                  border: "1px solid var(--panel-border)",
                  background: "var(--panel-bg)"
                }}
              >
                Sign in with Google
              </button>
            )}
          </div>
        </div>

        <div
          className="side-panel-body"
          style={{
            flex: 1,
            minHeight: 0,
            display: "flex",
            flexDirection: "column",
            gap: 12,
            overflow: activeTab === "chat" ? "hidden" : "auto",
            paddingRight: 2
          }}
        >
          {activeTab === "settings" && (
            <div style={{ display: "flex", gap: 8, marginBottom: 10, flexWrap: "wrap" }}>
              {[
                { key: "connections", label: "Connections" },
                { key: "knowledge", label: "Knowledge" },
                { key: "skills", label: "Skills" },
                { key: "trading", label: "Trading" },
                { key: "appearance", label: "Appearance" },
                { key: "voice", label: "Voice" },
                { key: "aika", label: "AIKA" },
                { key: "legacy", label: "Legacy" }
              ].map(item => (
                <button
                  key={item.key}
                  onClick={() => setSettingsTab(item.key)}
                  style={{
                    padding: "6px 10px",
                    borderRadius: 8,
                    border: settingsTab === item.key ? "1px solid var(--accent)" : "1px solid var(--panel-border)",
                    background: settingsTab === item.key ? "var(--chip-bg)" : "var(--panel-bg)"
                  }}
                >
                  {item.label}
                </button>
              ))}
            </div>
          )}

          {activeTab === "settings" && settingsTab === "connections" && (
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              <div style={{ fontSize: 14, fontWeight: 600, color: "#111827" }}>
                Connections
              </div>
              <div style={{ fontSize: 12, color: "#6b7280" }}>
                Link external services once. Aika will reuse them across chat, tools, and Telegram.
              </div>
              <div style={{ border: "1px solid var(--panel-border)", borderRadius: 12, padding: 12, background: "var(--panel-bg)" }}>
                <div style={{ fontWeight: 600, marginBottom: 6 }}>Email identity</div>
                <div style={{ fontSize: 12, color: "var(--text-muted)", marginBottom: 8 }}>
                  Used for voice commands like "email my work address". Saved locally to your profile.
                </div>
                <label style={{ display: "grid", gap: 6, fontSize: 12, color: "var(--text-muted)" }}>
                  Work email
                  <input
                    value={workEmail}
                    onChange={(e) => setWorkEmail(e.target.value)}
                    placeholder="you@work.com"
                    style={{ padding: 6, borderRadius: 8, border: "1px solid var(--panel-border-strong)" }}
                  />
                </label>
                <label style={{ display: "grid", gap: 6, fontSize: 12, color: "var(--text-muted)", marginTop: 8 }}>
                  Personal email (optional)
                  <input
                    value={personalEmail}
                    onChange={(e) => setPersonalEmail(e.target.value)}
                    placeholder="you@gmail.com"
                    style={{ padding: 6, borderRadius: 8, border: "1px solid var(--panel-border-strong)" }}
                  />
                </label>
              </div>
              <ConnectionsPanel serverUrl={SERVER_URL} />

              <div style={{ marginTop: 12, padding: 12, borderRadius: 12, border: "1px solid var(--panel-border)", background: "var(--panel-bg)" }}>
                <div style={{ fontWeight: 600, marginBottom: 6 }}>Integration Actions (advanced)</div>
                <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
                  <input
                    value={amazonQuery}
                    onChange={(e) => setAmazonQuery(e.target.value)}
                    placeholder="Search Amazon for..."
                    style={{ padding: 6, borderRadius: 8, border: "1px solid var(--panel-border-strong)", minWidth: 220 }}
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
                  <pre style={{ fontSize: 11, marginTop: 8, whiteSpace: "pre-wrap", background: "var(--panel-bg-soft)", padding: 8, borderRadius: 8 }}>
                    {integrationActionResult}
                  </pre>
                )}
                <div style={{ fontSize: 11, color: "#6b7280", marginTop: 6 }}>
                  Product analysis opens a recommendation popup with best-value pick and cart actions.
                </div>
              </div>
            </div>
          )}

          {activeTab === "settings" && settingsTab === "knowledge" && (
            <div style={{ display: "grid", gap: 12 }}>
              <div style={{ fontSize: 14, fontWeight: 600, color: "#111827" }}>
                Knowledge Defaults
              </div>
              <div style={{ fontSize: 12, color: "#6b7280" }}>
                Choose the default knowledge source for chat and Telegram. Aika will still auto-route when needed.
              </div>
              <label style={{ display: "grid", gap: 6, fontSize: 12, color: "var(--text-muted)", maxWidth: 320 }}>
                Default RAG model
                <select
                  value={defaultRagModel}
                  onChange={(e) => setDefaultRagModel(e.target.value)}
                  style={{ padding: 6, borderRadius: 6, border: "1px solid var(--panel-border-strong)" }}
                >
                  <option value="auto">Auto (Aika decides)</option>
                  <option value="all">All sources</option>
                  {ragModels.map(model => (
                    <option key={model.id} value={model.id}>
                      {model.title || model.id}
                    </option>
                  ))}
                </select>
              </label>
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
                <button onClick={loadRagModels} style={{ padding: "6px 10px", borderRadius: 8 }}>
                  Refresh Models
                </button>
                {ragModelsLoading && <span style={{ fontSize: 12, color: "#6b7280" }}>Loading...</span>}
                {assistantProfileError && (
                  <span style={{ fontSize: 12, color: "#b91c1c" }}>{assistantProfileError}</span>
                )}
              </div>
              {ragModelsError && (
                <div style={{ fontSize: 12, color: "#b91c1c" }}>{ragModelsError}</div>
              )}
              {ragModels.length > 0 && (
                <div style={{ display: "grid", gap: 6, fontSize: 12 }}>
                  {ragModels.map(model => (
                    <div key={model.id} style={{ border: "1px solid var(--panel-border)", borderRadius: 10, padding: 8, background: "var(--panel-bg)" }}>
                      <div style={{ fontWeight: 600 }}>{model.title || model.id}</div>
                      {model.description && (
                        <div style={{ color: "#6b7280" }}>{model.description}</div>
                      )}
                    </div>
                  ))}
                </div>
              )}
              <div style={{ marginTop: 6, padding: 12, borderRadius: 12, border: "1px solid var(--panel-border)", background: "var(--panel-bg)" }}>
                <div style={{ fontWeight: 600, marginBottom: 6 }}>Backups & Transfers</div>
                <div style={{ fontSize: 12, color: "#6b7280", marginBottom: 10 }}>
                  Export model metadata, or download a full vector-store backup (SQLite + HNSW) so knowledge is retrievable.
                </div>
                <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
                  <button
                    onClick={downloadRagBackup}
                    disabled={ragBackupBusy}
                    style={{ padding: "6px 10px", borderRadius: 8 }}
                  >
                    {ragBackupBusy ? "Preparing backup..." : "Download RAG Backup (zip)"}
                  </button>
                  <button
                    onClick={exportRagModelsFile}
                    disabled={ragExportBusy}
                    style={{ padding: "6px 10px", borderRadius: 8 }}
                  >
                    {ragExportBusy ? "Exporting..." : "Export RAG Models (JSON)"}
                  </button>
                  <button
                    onClick={() => ragImportInputRef.current?.click()}
                    disabled={ragImportBusy}
                    style={{ padding: "6px 10px", borderRadius: 8 }}
                  >
                    {ragImportBusy ? "Importing..." : "Import RAG Models"}
                  </button>
                  <input
                    ref={ragImportInputRef}
                    type="file"
                    accept="application/json,.json"
                    onChange={(e) => importRagModelsFile(e.target.files?.[0])}
                    style={{ display: "none" }}
                  />
                </div>
                {(ragBackupStatus || ragExportStatus || ragImportStatus) && (
                  <div style={{ fontSize: 12, color: "#065f46", marginTop: 8 }}>
                    {[ragBackupStatus, ragExportStatus, ragImportStatus].filter(Boolean).join(" ")}
                  </div>
                )}
                {(ragBackupError || ragExportError || ragImportError) && (
                  <div style={{ fontSize: 12, color: "#b91c1c", marginTop: 6 }}>
                    {[ragBackupError, ragExportError, ragImportError].filter(Boolean).join(" ")}
                  </div>
                )}
                <div style={{ fontSize: 11, color: "#6b7280", marginTop: 8 }}>
                  Model import restores collection definitions + trading/RSS/YouTube sources. Use the full backup to restore embeddings.
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
                  border: "1px solid var(--panel-border)",
                  borderRadius: 12,
                  padding: 12,
                  background: "var(--panel-bg)",
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
                      border: skill.enabled ? "2px solid #10b981" : "1px solid var(--panel-border-strong)",
                      background: skill.enabled ? "#ecfdf3" : "var(--panel-bg)",
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
                  style={{ width: "100%", padding: 8, marginTop: 4, borderRadius: 8, border: "1px solid var(--panel-border-strong)" }}
                />
              </label>
              <div style={{ display: "grid", gap: 8 }}>
                {skillVault.map(skill => (
                  <div key={skill.id} style={{ border: "1px solid var(--panel-border)", borderRadius: 12, padding: 10, background: "var(--panel-bg)" }}>
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
                <pre style={{ fontSize: 11, marginTop: 6, whiteSpace: "pre-wrap", background: "var(--panel-bg-soft)", padding: 8, borderRadius: 8 }}>
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
                Add a webhook and say: "Trigger &lt;name&gt;" or "Run &lt;name&gt;".
              </div>
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                <input
                  placeholder="Name (e.g., lights_on)"
                  value={webhookForm.name}
                  onChange={(e) => setWebhookForm(s => ({ ...s, name: e.target.value }))}
                  style={{ padding: 6, borderRadius: 8, border: "1px solid var(--panel-border-strong)", minWidth: 160 }}
                />
                <input
                  placeholder="Webhook URL"
                  value={webhookForm.url}
                  onChange={(e) => setWebhookForm(s => ({ ...s, url: e.target.value }))}
                  style={{ padding: 6, borderRadius: 8, border: "1px solid var(--panel-border-strong)", minWidth: 280 }}
                />
                <button onClick={addWebhook} style={{ padding: "6px 10px", borderRadius: 8 }}>
                  Add Webhook
                </button>
              </div>
              <div style={{ border: "1px solid var(--panel-border)", borderRadius: 12, padding: 10, background: "var(--panel-bg)" }}>
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
                Scenes trigger multiple webhooks in sequence. Example: "Run scene morning".
              </div>
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                <input
                  placeholder="Scene name"
                  value={sceneForm.name}
                  onChange={(e) => setSceneForm(s => ({ ...s, name: e.target.value }))}
                  style={{ padding: 6, borderRadius: 8, border: "1px solid var(--panel-border-strong)", minWidth: 160 }}
                />
                <input
                  placeholder="Webhook names (comma-separated)"
                  value={sceneForm.hooks}
                  onChange={(e) => setSceneForm(s => ({ ...s, hooks: e.target.value }))}
                  style={{ padding: 6, borderRadius: 8, border: "1px solid var(--panel-border-strong)", minWidth: 280 }}
                />
                <button onClick={addScene} style={{ padding: "6px 10px", borderRadius: 8 }}>
                  Save Scene
                </button>
              </div>
              <div style={{ border: "1px solid var(--panel-border)", borderRadius: 12, padding: 10, background: "var(--panel-bg)" }}>
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
                border: "1px solid var(--panel-border)",
                borderRadius: 12,
                padding: 10,
                background: "var(--panel-bg)",
                fontSize: 12,
                color: "var(--text-muted)",
                maxHeight: 180,
                overflow: "auto"
              }}>
                {skillEvents.length ? skillEvents.map((evt, idx) => (
                  <div key={`${evt.time}-${idx}`} style={{ marginBottom: 6 }}>
                    <b>{evt.skill}</b> | {evt.type} | {evt.time}
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
                  style={{ padding: 6, borderRadius: 8, border: "1px solid var(--panel-border-strong)" }}
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
                  style={{ padding: 6, borderRadius: 8, border: "1px solid var(--panel-border)" }}
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

        {activeTab === "settings" && settingsTab === "trading" && (
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            <div style={{ fontSize: 14, fontWeight: 600, color: "#111827" }}>
              Trading Engine
            </div>
            <div style={{ fontSize: 12, color: "#6b7280" }}>
              Configure the local trading API and market data feed. This applies to the Trading terminal and paper workflows.
            </div>
            <div style={{ display: "grid", gap: 10, padding: 12, borderRadius: 12, border: "1px solid var(--panel-border)", background: "var(--panel-bg)" }}>
              <label style={{ display: "grid", gap: 4, fontSize: 12 }}>
                Trading API base URL
                <input
                  value={tradingEngineSettings.tradeApiUrl}
                  onChange={(e) => setTradingEngineSettings(prev => ({ ...prev, tradeApiUrl: e.target.value }))}
                  style={{ padding: 6, borderRadius: 8, border: "1px solid var(--panel-border-strong)" }}
                />
              </label>
              <label style={{ display: "grid", gap: 4, fontSize: 12 }}>
                Alpaca data feed
                <select
                  value={tradingEngineSettings.alpacaFeed}
                  onChange={(e) => setTradingEngineSettings(prev => ({ ...prev, alpacaFeed: e.target.value }))}
                  style={{ padding: 6, borderRadius: 8, border: "1px solid var(--panel-border-strong)" }}
                >
                  <option value="iex">IEX (free)</option>
                  <option value="sip">SIP (paid)</option>
                </select>
              </label>
            </div>
            <div style={{ fontSize: 14, fontWeight: 600, color: "#111827" }}>
              Trading Emails
            </div>
            <div style={{ fontSize: 12, color: "#6b7280" }}>
              Configure daily picks delivery and the watchlists Aika uses. These are stored locally and persist across restarts.
            </div>
            <div style={{ display: "grid", gap: 10, padding: 12, borderRadius: 12, border: "1px solid var(--panel-border)", background: "var(--panel-bg)" }}>
              <label style={{ display: "flex", gap: 8, alignItems: "center", fontSize: 12 }}>
                <input
                  type="checkbox"
                  checked={tradingEmailSettings.enabled}
                  onChange={(e) => setTradingEmailSettings(prev => ({ ...prev, enabled: e.target.checked }))}
                />
                Enable daily trading picks email
              </label>
              <div style={{ display: "grid", gap: 8, gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))" }}>
                <label style={{ display: "grid", gap: 4, fontSize: 12 }}>
                  Send time (local)
                  <input
                    type="time"
                    value={tradingEmailSettings.time}
                    onChange={(e) => setTradingEmailSettings(prev => ({ ...prev, time: e.target.value }))}
                    style={{ padding: 6, borderRadius: 8, border: "1px solid var(--panel-border-strong)" }}
                  />
                </label>
                <label style={{ display: "grid", gap: 4, fontSize: 12 }}>
                  Subject prefix
                  <input
                    value={tradingEmailSettings.subjectPrefix}
                    onChange={(e) => setTradingEmailSettings(prev => ({ ...prev, subjectPrefix: e.target.value }))}
                    style={{ padding: 6, borderRadius: 8, border: "1px solid var(--panel-border-strong)" }}
                  />
                </label>
                <label style={{ display: "grid", gap: 4, fontSize: 12 }}>
                  Recipients (comma-separated)
                  <input
                    value={tradingEmailSettings.recipients}
                    onChange={(e) => setTradingEmailSettings(prev => ({ ...prev, recipients: e.target.value }))}
                    style={{ padding: 6, borderRadius: 8, border: "1px solid var(--panel-border-strong)" }}
                  />
                </label>
              </div>
              <div style={{ display: "grid", gap: 8, gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))" }}>
                <label style={{ display: "grid", gap: 4, fontSize: 12 }}>
                  Stock picks
                  <input
                    type="number"
                    value={tradingEmailSettings.stockCount}
                    onChange={(e) => setTradingEmailSettings(prev => ({ ...prev, stockCount: e.target.value }))}
                    style={{ padding: 6, borderRadius: 8, border: "1px solid var(--panel-border-strong)" }}
                  />
                </label>
                <label style={{ display: "grid", gap: 4, fontSize: 12 }}>
                  Crypto picks
                  <input
                    type="number"
                    value={tradingEmailSettings.cryptoCount}
                    onChange={(e) => setTradingEmailSettings(prev => ({ ...prev, cryptoCount: e.target.value }))}
                    style={{ padding: 6, borderRadius: 8, border: "1px solid var(--panel-border-strong)" }}
                  />
                </label>
                <label style={{ display: "grid", gap: 4, fontSize: 12 }}>
                  Min picks
                  <input
                    type="number"
                    value={tradingEmailSettings.minPicks}
                    onChange={(e) => setTradingEmailSettings(prev => ({ ...prev, minPicks: e.target.value }))}
                    style={{ padding: 6, borderRadius: 8, border: "1px solid var(--panel-border-strong)" }}
                  />
                </label>
                <label style={{ display: "grid", gap: 4, fontSize: 12 }}>
                  Max picks
                  <input
                    type="number"
                    value={tradingEmailSettings.maxPicks}
                    onChange={(e) => setTradingEmailSettings(prev => ({ ...prev, maxPicks: e.target.value }))}
                    style={{ padding: 6, borderRadius: 8, border: "1px solid var(--panel-border-strong)" }}
                  />
                </label>
              </div>
              <label style={{ display: "grid", gap: 4, fontSize: 12 }}>
                Stock watchlist (comma-separated)
                <input
                  value={tradingEmailSettings.stocks}
                  onChange={(e) => setTradingEmailSettings(prev => ({ ...prev, stocks: e.target.value }))}
                  style={{ padding: 6, borderRadius: 8, border: "1px solid var(--panel-border-strong)" }}
                />
              </label>
              <label style={{ display: "grid", gap: 4, fontSize: 12 }}>
                Crypto watchlist (comma-separated)
                <input
                  value={tradingEmailSettings.cryptos}
                  onChange={(e) => setTradingEmailSettings(prev => ({ ...prev, cryptos: e.target.value }))}
                  style={{ padding: 6, borderRadius: 8, border: "1px solid var(--panel-border-strong)" }}
                />
              </label>
            </div>

            <div style={{ fontSize: 14, fontWeight: 600, color: "#111827", marginTop: 6 }}>
              Trading Personalization
            </div>
            <div style={{ fontSize: 12, color: "#6b7280" }}>
              These answers guide Aika's trading assistant and stay in memory until you overwrite them.
            </div>
            <div style={{ display: "grid", gap: 10, padding: 12, borderRadius: 12, border: "1px solid var(--panel-border)", background: "var(--panel-bg)" }}>
              <label style={{ display: "grid", gap: 4, fontSize: 12 }}>
                Directives / Notes
                <textarea
                  rows={3}
                  value={tradingNotes}
                  onChange={(e) => setTradingNotes(e.target.value)}
                  style={{ padding: 6, borderRadius: 8, border: "1px solid var(--panel-border-strong)" }}
                />
              </label>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <div style={{ fontWeight: 600, fontSize: 12 }}>Guiding Questions</div>
                <button onClick={addTradingQuestion} style={{ padding: "4px 8px", borderRadius: 8 }}>
                  Add question
                </button>
              </div>
              <div style={{ display: "grid", gap: 8 }}>
                {tradingQuestions.length === 0 && (
                  <div style={{ fontSize: 12, color: "#6b7280" }}>No questions added yet.</div>
                )}
                {tradingQuestions.map((q, idx) => (
                  <div key={q.id || idx} style={{ border: "1px solid var(--panel-border)", borderRadius: 10, padding: 8, background: "var(--panel-bg-soft)" }}>
                    <label style={{ display: "grid", gap: 4, fontSize: 12 }}>
                      Question
                      <input
                        value={q.question || ""}
                        onChange={(e) => updateTradingQuestion(idx, "question", e.target.value)}
                        style={{ padding: 6, borderRadius: 8, border: "1px solid var(--panel-border-strong)" }}
                      />
                    </label>
                    <label style={{ display: "grid", gap: 4, fontSize: 12, marginTop: 6 }}>
                      Answer
                      <input
                        value={q.answer || ""}
                        onChange={(e) => updateTradingQuestion(idx, "answer", e.target.value)}
                        style={{ padding: 6, borderRadius: 8, border: "1px solid var(--panel-border-strong)" }}
                      />
                    </label>
                    <div style={{ display: "flex", justifyContent: "flex-end", marginTop: 6 }}>
                      <button onClick={() => removeTradingQuestion(idx)} style={{ padding: "4px 8px", borderRadius: 8 }}>
                        Remove
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
              <button onClick={saveTradingSettings} style={{ padding: "6px 12px", borderRadius: 8 }}>
                Save Trading Settings
              </button>
              <button onClick={loadTradingSettings} style={{ padding: "6px 12px", borderRadius: 8 }}>
                Reload
              </button>
              {tradingSettingsLoading && <span style={{ fontSize: 12, color: "#6b7280" }}>Saving...</span>}
              {tradingSettingsStatus && <span style={{ fontSize: 12, color: "var(--accent)" }}>{tradingSettingsStatus}</span>}
            </div>
            {tradingSettingsError && <div style={{ fontSize: 12, color: "#b91c1c" }}>{tradingSettingsError}</div>}
          </div>
        )}

          {activeTab === "settings" && settingsTab === "appearance" && (
            <div style={{ display: "grid", gap: 12 }}>
              <div style={{ fontSize: 14, fontWeight: 600, color: "#111827" }}>
                Appearance
              </div>
              <label style={{ display: "flex", flexDirection: "column", gap: 6, fontSize: 12, color: "var(--text-muted)", maxWidth: 260 }}>
                Theme
                <select
                  value={themeId}
                  onChange={(e) => setThemeId(e.target.value)}
                  style={{ padding: 6, borderRadius: 6, border: "1px solid var(--panel-border-strong)" }}
                >
                  {THEMES.map(t => (
                    <option key={t.id} value={t.id}>{t.label}</option>
                  ))}
                </select>
              </label>
              <label style={{ display: "flex", flexDirection: "column", gap: 6, fontSize: 12, color: "var(--text-muted)", maxWidth: 360 }}>
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
              <label style={{ display: "flex", flexDirection: "column", gap: 6, fontSize: 12, color: "var(--text-muted)", maxWidth: 260 }}>
                Avatar background
                <select
                  value={avatarBackground}
                  onChange={(e) => setAvatarBackground(e.target.value)}
                  style={{ padding: 6, borderRadius: 6, border: "1px solid var(--panel-border-strong)" }}
                >
                  {AVATAR_BACKGROUNDS.map(bg => (
                    <option key={bg.id} value={bg.id}>{bg.label}</option>
                  ))}
                </select>
              </label>
              <div style={{ display: "flex", flexDirection: "column", gap: 6, maxWidth: 520 }}>
                <div style={{ fontSize: 12, fontWeight: 600, color: "var(--text-muted)" }}>Avatar Model</div>
                {(() => {
                  const current = avatarModels.find(m => m.id === avatarModelId);
                  const thumb = current?.thumbnailAvailable ? current.thumbnail : "/assets/aika/live2d/placeholder.svg";
                  return (
                    <button
                      onClick={() => setShowAvatarPicker(v => !v)}
                      style={{
                        padding: "6px 10px",
                        borderRadius: 8,
                        border: "1px solid var(--panel-border-strong)",
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
                    border: "1px solid var(--panel-border)",
                    borderRadius: 10,
                    padding: 8,
                    display: "grid",
                    gridTemplateColumns: "repeat(2, minmax(0, 1fr))",
                    gap: 8,
                    background: "var(--panel-bg)"
                  }}>
                    {avatarModels.length === 0 && (
                      <div style={{ fontSize: 12 }}>No models found. Import one below.</div>
                    )}
                    {avatarModels.map(m => (
                      <button
                        key={m.id}
                        onClick={() => {
                          if (!m.available) return;
                          setAvatarModelId(m.id);
                          setShowAvatarPicker(false);
                        }}
                        style={{
                          border: m.id === avatarModelId ? "1px solid var(--accent)" : "1px solid var(--panel-border)",
                          borderRadius: 10,
                          padding: 8,
                          display: "flex",
                          alignItems: "center",
                          gap: 8,
                          background: m.available ? "var(--panel-bg)" : "var(--panel-bg-soft)",
                          opacity: m.available ? 1 : 0.6,
                          cursor: m.available ? "pointer" : "not-allowed"
                        }}
                      >
                        <img
                          src={m.thumbnail || "/assets/aika/live2d/placeholder.svg"}
                          alt={m.label || m.id}
                          style={{ width: 32, height: 40, objectFit: "cover", borderRadius: 6 }}
                        />
                        <div>
                          <div style={{ fontSize: 12, fontWeight: 600 }}>{m.label || m.id}</div>
                          <div style={{ fontSize: 10, color: "#6b7280" }}>{m.available ? "Ready" : "Missing files"}</div>
                        </div>
                      </button>
                    ))}
                  </div>
                )}
                {avatarImportError && (
                  <div style={{ fontSize: 11, color: "#b91c1c" }}>{avatarImportError}</div>
                )}
                {avatarImportNotice && (
                  <div style={{ fontSize: 11, color: "var(--accent)" }}>{avatarImportNotice}</div>
                )}
                <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 4 }}>
                  <label style={{ fontSize: 12 }}>
                    Import Live2D ZIP
                    <input
                      type="file"
                      accept=".zip"
                      onChange={(e) => importAvatarZip(e.target.files?.[0])}
                      disabled={avatarImporting}
                    />
                  </label>
                  <button onClick={refreshAvatarModels} style={{ padding: "4px 8px", borderRadius: 6 }}>
                    Refresh Models
                  </button>
                </div>
                <div style={{ fontSize: 10, color: "#6b7280" }}>
                  Install core once, then import ZIPs from your Live2D packs.
                </div>
                <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                  <button onClick={() => document.getElementById("avatar-core-input")?.click()} style={{ padding: "4px 8px", borderRadius: 6 }}>
                    Upload Core
                  </button>
                  <input
                    id="avatar-core-input"
                    type="file"
                    accept=".zip"
                    style={{ display: "none" }}
                    onChange={(e) => uploadAvatarCore(e.target.files?.[0])}
                  />
                  <div style={{ fontSize: 10, color: "#6b7280" }}>
                    Core JS: {avatarCoreInfo.coreJs ? "OK" : "missing"} | Core WASM: {avatarCoreInfo.coreWasm ? "OK" : "missing"}
                  </div>
                </div>
              </div>
            </div>
          )}

          {activeTab === "settings" && settingsTab === "voice" && (
            <div style={{ display: "grid", gap: 12 }}>
              <div style={{ fontSize: 14, fontWeight: 600, color: "#111827" }}>
                Voice & Audio
              </div>
              <div style={{ fontSize: 12, color: "#6b7280" }}>
                Tune Aika's voice, pacing, and engine. Changes apply everywhere.
              </div>
              <label style={{ display: "grid", gap: 4, maxWidth: 360, fontSize: 12, color: "var(--text-muted)" }}>
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
              <div style={{ border: "1px solid var(--panel-border)", borderRadius: 12, padding: 12, background: "var(--panel-bg)" }}>
                <label style={{ display: "flex", flexDirection: "column", gap: 4, fontSize: 12, color: "var(--text-muted)" }}>
                  Voice prompt text
                  <textarea
                    rows={3}
                    value={voicePromptText}
                    onChange={(e) => {
                      setVoicePromptText(e.target.value);
                      setTtsSettings(s => ({ ...s, voice: { ...s.voice, prompt_text: e.target.value } }));
                    }}
                    placeholder="Describe Aika's voice/persona..."
                    style={{ padding: 6, borderRadius: 6, border: "1px solid var(--panel-border-strong)" }}
                  />
                </label>
                <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 8 }}>
                  <button onClick={testVoice} style={{ padding: "8px 12px", borderRadius: 8 }}>
                    Test Voice
                  </button>
                  <button
                    onClick={() => setShowAdvanced(v => !v)}
                    style={{ padding: "8px 12px", borderRadius: 8 }}
                  >
                    {showAdvanced ? "Hide Advanced" : "Advanced Controls"}
                  </button>
                </div>
                <div style={{ display: "grid", gap: 8, marginTop: 10, gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))" }}>
                  <label style={{ display: "flex", flexDirection: "column", gap: 4, fontSize: 12, color: "var(--text-muted)" }}>
                    Style
                    <select
                      value={ttsSettings.style}
                      onChange={(e) => setTtsSettings(s => ({ ...s, style: e.target.value }))}
                      style={{ padding: 6, borderRadius: 6, border: "1px solid var(--panel-border-strong)" }}
                    >
                      <option value="brat_baddy">brat_baddy</option>
                      <option value="brat_soft">brat_soft</option>
                      <option value="brat_firm">brat_firm</option>
                    </select>
                  </label>
                  <label style={{ display: "flex", flexDirection: "column", gap: 4, fontSize: 12, color: "var(--text-muted)" }}>
                    Engine
                    <select
                      value={ttsSettings.engine || statusInfo?.tts?.engine || ""}
                      onChange={(e) => setTtsSettings(s => ({ ...s, engine: e.target.value }))}
                      style={{ padding: 6, borderRadius: 6, border: "1px solid var(--panel-border-strong)" }}
                    >
                      <option value="">default</option>
                      <option value="gptsovits">gptsovits</option>
                      <option value="piper">piper</option>
                    </select>
                  </label>
                </div>
                {showAdvanced && (
                  <div style={{ display: "grid", gap: 8, marginTop: 10, gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))" }}>
                    <label style={{ display: "flex", flexDirection: "column", gap: 4, fontSize: 12, color: "var(--text-muted)" }}>
                      Output format
                      <select
                        value={ttsSettings.format}
                        onChange={(e) => setTtsSettings(s => ({ ...s, format: e.target.value }))}
                        style={{ padding: 6, borderRadius: 6, border: "1px solid var(--panel-border-strong)" }}
                      >
                        <option value="wav">wav</option>
                        <option value="mp3">mp3</option>
                      </select>
                    </label>
                    <label style={{ display: "flex", flexDirection: "column", gap: 4, fontSize: 12, color: "var(--text-muted)" }}>
                      Rate
                      <input
                        type="number"
                        step="0.05"
                        min="0.6"
                        max="1.4"
                        value={ttsSettings.rate}
                        onChange={(e) => setTtsSettings(s => ({ ...s, rate: Number(e.target.value) }))}
                        style={{ padding: 6, borderRadius: 6, border: "1px solid var(--panel-border-strong)" }}
                      />
                    </label>
                    <label style={{ display: "flex", flexDirection: "column", gap: 4, fontSize: 12, color: "var(--text-muted)" }}>
                      Pitch
                      <input
                        type="number"
                        step="0.5"
                        min="-5"
                        max="5"
                        value={ttsSettings.pitch}
                        onChange={(e) => setTtsSettings(s => ({ ...s, pitch: Number(e.target.value) }))}
                        style={{ padding: 6, borderRadius: 6, border: "1px solid var(--panel-border-strong)" }}
                      />
                    </label>
                    <label style={{ display: "flex", flexDirection: "column", gap: 4, fontSize: 12, color: "var(--text-muted)" }}>
                      Energy
                      <input
                        type="number"
                        step="0.1"
                        min="0.5"
                        max="1.5"
                        value={ttsSettings.energy}
                        onChange={(e) => setTtsSettings(s => ({ ...s, energy: Number(e.target.value) }))}
                        style={{ padding: 6, borderRadius: 6, border: "1px solid var(--panel-border-strong)" }}
                      />
                    </label>
                    <label style={{ display: "flex", flexDirection: "column", gap: 4, fontSize: 12, color: "var(--text-muted)" }}>
                      Pause
                      <input
                        type="number"
                        step="0.1"
                        min="0.8"
                        max="1.8"
                        value={ttsSettings.pause}
                        onChange={(e) => setTtsSettings(s => ({ ...s, pause: Number(e.target.value) }))}
                        style={{ padding: 6, borderRadius: 6, border: "1px solid var(--panel-border-strong)" }}
                      />
                    </label>
                  </div>
                )}
                <div style={{ display: "grid", gap: 8, marginTop: 10 }}>
                  {(ttsSettings.engine || statusInfo?.tts?.engine) === "piper" ? (
                    <>
                      <label style={{ display: "flex", flexDirection: "column", gap: 4, fontSize: 12, color: "var(--text-muted)" }}>
                        Piper Voice
                        <select
                          value={ttsSettings.voice.name || ""}
                          onChange={(e) => setTtsSettings(s => ({ ...s, voice: { ...s.voice, name: e.target.value } }))}
                          style={{ padding: 6, borderRadius: 6, border: "1px solid var(--panel-border-strong)" }}
                        >
                          {availableVoices.length === 0 && <option value="">(no voices found)</option>}
                          {availableVoices.map(v => (
                            <option key={v.id} value={v.id}>{v.label}</option>
                          ))}
                        </select>
                      </label>
                      <div style={{ fontSize: 11, color: "#6b7280" }}>
                        Place Piper .onnx + .onnx.json files in `apps/server/piper_voices`.
                      </div>
                    </>
                  ) : (
                    <>
                      <label style={{ display: "flex", flexDirection: "column", gap: 4, fontSize: 12, color: "var(--text-muted)" }}>
                        Reference WAV (apps/server/voices)
                        <input
                          type="text"
                          placeholder="example.wav"
                          value={ttsSettings.voice.reference_wav_path}
                          onChange={(e) => setTtsSettings(s => ({ ...s, voice: { reference_wav_path: e.target.value } }))}
                          style={{ padding: 6, borderRadius: 6, border: "1px solid var(--panel-border-strong)" }}
                        />
                      </label>
                      <div style={{ fontSize: 11, color: "#6b7280" }}>
                        Reference file must be inside apps/server/voices. Leave blank for default voice.
                      </div>
                      <div style={{ fontSize: 11, color: "#6b7280" }}>
                        For a more feminine voice, add a speaker WAV and set it above.
                      </div>
                    </>
                  )}
                </div>
              </div>
            </div>
          )}

          {activeTab === "settings" && settingsTab === "aika" && (
            <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
              <div style={{ fontSize: 14, fontWeight: 600, color: "#111827" }}>
                AIKA Control Panel
              </div>
              <div style={{ fontSize: 12, color: "#6b7280" }}>
                Manage modules, runbooks, and Watchtower signals. Toggle No-Integrations Mode to allow tool execution.
              </div>
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
                <button onClick={loadAikaPanel} style={{ padding: "6px 10px", borderRadius: 8 }}>
                  Refresh
                </button>
                {aikaPanelStatus && <span style={{ fontSize: 12, color: "var(--accent)" }}>{aikaPanelStatus}</span>}
              </div>
              {aikaPanelError && (
                <div style={{ fontSize: 12, color: "#b91c1c" }}>{aikaPanelError}</div>
              )}

              <div style={{ border: "1px solid var(--panel-border)", borderRadius: 12, padding: 12, background: "var(--panel-bg)" }}>
                <div style={{ fontWeight: 600, marginBottom: 6 }}>Execution Mode</div>
                <label style={{ display: "flex", gap: 8, alignItems: "center", fontSize: 12, color: "var(--text-muted)" }}>
                  <input
                    type="checkbox"
                    checked={Boolean(aikaSettings?.modeFlags?.no_integrations)}
                    onChange={(e) => updateAikaSettings({ modeFlags: { no_integrations: e.target.checked } })}
                  />
                  No-Integrations Mode (manual checklists only)
                </label>
                <div style={{ fontSize: 12, color: "#6b7280", marginTop: 8 }}>
                  Email: {integrations?.gmail?.connected || integrations?.outlook?.connected ? "connected" : "not connected"} ·
                  Calendar: {integrations?.google_docs?.connected ? "connected" : "not connected"} ·
                  BI Snapshot: ready
                </div>
              </div>

              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                <div style={{ border: "1px solid var(--panel-border)", borderRadius: 12, padding: 12, background: "var(--panel-bg)" }}>
                  <div style={{ fontWeight: 600, marginBottom: 6 }}>Modules</div>
                  <div style={{ fontSize: 12, color: "#6b7280", marginBottom: 6 }}>
                    {aikaModules.length} modules loaded
                  </div>
                  <div style={{ maxHeight: 220, overflow: "auto", fontSize: 12 }}>
                    {aikaModules.map(mod => (
                      <div key={mod.id} style={{ paddingBottom: 8, marginBottom: 8, borderBottom: "1px solid var(--panel-border-subtle)" }}>
                        <div style={{ fontWeight: 600 }}>
                          {mod.name} <span style={{ fontSize: 11, color: "#6b7280" }}>Lv {mod.level}</span>
                        </div>
                        <div style={{ color: "#6b7280" }}>{mod.description}</div>
                        <div style={{ fontSize: 11, color: "#94a3b8" }}>
                          {(mod.trigger_phrases || []).slice(0, 2).join(" · ")}
                        </div>
                      </div>
                    ))}
                    {aikaModules.length === 0 && <div>No modules loaded.</div>}
                  </div>
                </div>

                <div style={{ border: "1px solid var(--panel-border)", borderRadius: 12, padding: 12, background: "var(--panel-bg)" }}>
                  <div style={{ fontWeight: 600, marginBottom: 6 }}>Run Module</div>
                  <label style={{ fontSize: 12, color: "var(--text-muted)" }}>
                    Module
                    <select
                      value={aikaModuleId}
                      onChange={(e) => setAikaModuleId(e.target.value)}
                      style={{ width: "100%", marginTop: 4, padding: 6, borderRadius: 8, border: "1px solid var(--panel-border-strong)" }}
                    >
                      {aikaModules.map(mod => (
                        <option key={mod.id} value={mod.id}>{mod.name}</option>
                      ))}
                    </select>
                  </label>
                  <label style={{ fontSize: 12, color: "var(--text-muted)", marginTop: 8 }}>
                    Context text
                    <textarea
                      value={aikaModuleContext}
                      onChange={(e) => setAikaModuleContext(e.target.value)}
                      rows={3}
                      style={{ width: "100%", marginTop: 4, padding: 6, borderRadius: 8, border: "1px solid var(--panel-border-strong)" }}
                    />
                  </label>
                  <label style={{ fontSize: 12, color: "var(--text-muted)", marginTop: 8 }}>
                    Structured input (JSON)
                    <textarea
                      value={aikaModuleStructured}
                      onChange={(e) => setAikaModuleStructured(e.target.value)}
                      rows={4}
                      style={{ width: "100%", marginTop: 4, padding: 6, borderRadius: 8, border: "1px solid var(--panel-border-strong)", fontFamily: "monospace", fontSize: 11 }}
                    />
                  </label>
                  <button onClick={runAikaModule} style={{ marginTop: 8, padding: "6px 10px", borderRadius: 8 }}>
                    Run Module
                  </button>
                  {aikaModuleResult && (
                    <pre style={{ marginTop: 8, background: "var(--code-bg)", color: "#e5e7eb", padding: 8, borderRadius: 8, fontSize: 11, maxHeight: 220, overflow: "auto" }}>
{aikaModuleResult}
                    </pre>
                  )}
                </div>
              </div>

              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                <div style={{ border: "1px solid var(--panel-border)", borderRadius: 12, padding: 12, background: "var(--panel-bg)" }}>
                  <div style={{ fontWeight: 600, marginBottom: 6 }}>Runbooks</div>
                  <div style={{ fontSize: 12, color: "#6b7280", marginBottom: 6 }}>
                    {aikaRunbooks.length} runbooks loaded
                  </div>
                  <div style={{ maxHeight: 200, overflow: "auto", fontSize: 12 }}>
                    {aikaRunbooks.map(runbook => (
                      <div key={runbook.name} style={{ paddingBottom: 8, marginBottom: 8, borderBottom: "1px solid var(--panel-border-subtle)" }}>
                        <div style={{ fontWeight: 600 }}>{runbook.name}</div>
                        <div style={{ color: "#6b7280" }}>{runbook.description}</div>
                      </div>
                    ))}
                    {aikaRunbooks.length === 0 && <div>No runbooks loaded.</div>}
                  </div>
                </div>

                <div style={{ border: "1px solid var(--panel-border)", borderRadius: 12, padding: 12, background: "var(--panel-bg)" }}>
                  <div style={{ fontWeight: 600, marginBottom: 6 }}>Run Runbook</div>
                  <label style={{ fontSize: 12, color: "var(--text-muted)" }}>
                    Runbook
                    <select
                      value={aikaRunbookName}
                      onChange={(e) => setAikaRunbookName(e.target.value)}
                      style={{ width: "100%", marginTop: 4, padding: 6, borderRadius: 8, border: "1px solid var(--panel-border-strong)" }}
                    >
                      {aikaRunbooks.map(runbook => (
                        <option key={runbook.name} value={runbook.name}>{runbook.name}</option>
                      ))}
                    </select>
                  </label>
                  <label style={{ fontSize: 12, color: "var(--text-muted)", marginTop: 8 }}>
                    Context text
                    <textarea
                      value={aikaRunbookContext}
                      onChange={(e) => setAikaRunbookContext(e.target.value)}
                      rows={3}
                      style={{ width: "100%", marginTop: 4, padding: 6, borderRadius: 8, border: "1px solid var(--panel-border-strong)" }}
                    />
                  </label>
                  <button onClick={runAikaRunbook} style={{ marginTop: 8, padding: "6px 10px", borderRadius: 8 }}>
                    Run Runbook
                  </button>
                  {aikaRunbookResult && (
                    <pre style={{ marginTop: 8, background: "var(--code-bg)", color: "#e5e7eb", padding: 8, borderRadius: 8, fontSize: 11, maxHeight: 220, overflow: "auto" }}>
{aikaRunbookResult}
                    </pre>
                  )}
                </div>
              </div>

              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                <div style={{ border: "1px solid var(--panel-border)", borderRadius: 12, padding: 12, background: "var(--panel-bg)" }}>
                  <div style={{ fontWeight: 600, marginBottom: 6 }}>Watchtower Templates</div>
                  <label style={{ fontSize: 12, color: "var(--text-muted)" }}>
                    Template
                    <select
                      value={aikaWatchTemplateId}
                      onChange={(e) => setAikaWatchTemplateId(e.target.value)}
                      style={{ width: "100%", marginTop: 4, padding: 6, borderRadius: 8, border: "1px solid var(--panel-border-strong)" }}
                    >
                      {aikaWatchTemplates.map(template => (
                        <option key={template.id} value={template.id}>{template.name || template.id}</option>
                      ))}
                    </select>
                  </label>
                  <label style={{ fontSize: 12, color: "var(--text-muted)", marginTop: 8 }}>
                    Config override (JSON)
                    <textarea
                      value={aikaWatchConfig}
                      onChange={(e) => setAikaWatchConfig(e.target.value)}
                      rows={3}
                      style={{ width: "100%", marginTop: 4, padding: 6, borderRadius: 8, border: "1px solid var(--panel-border-strong)", fontFamily: "monospace", fontSize: 11 }}
                    />
                  </label>
                  <button onClick={createAikaWatch} style={{ marginTop: 8, padding: "6px 10px", borderRadius: 8 }}>
                    Create Watch Item
                  </button>
                  <div style={{ fontSize: 11, color: "#6b7280", marginTop: 6 }}>
                    Use config to attach KPI metadata like metric name or thresholds.
                  </div>
                </div>

                <div style={{ border: "1px solid var(--panel-border)", borderRadius: 12, padding: 12, background: "var(--panel-bg)" }}>
                  <div style={{ fontWeight: 600, marginBottom: 6 }}>Observe Watch Item</div>
                  <label style={{ fontSize: 12, color: "var(--text-muted)" }}>
                    Watch item
                    <select
                      value={aikaWatchObserveId}
                      onChange={(e) => setAikaWatchObserveId(e.target.value)}
                      style={{ width: "100%", marginTop: 4, padding: 6, borderRadius: 8, border: "1px solid var(--panel-border-strong)" }}
                    >
                      {aikaWatchItems.map(item => (
                        <option key={item.id} value={item.id}>{item.type} · {item.config?.metric || item.id}</option>
                      ))}
                    </select>
                  </label>
                  <label style={{ fontSize: 12, color: "var(--text-muted)", marginTop: 8 }}>
                    Raw value (JSON or scalar)
                    <input
                      value={aikaWatchObserveValue}
                      onChange={(e) => setAikaWatchObserveValue(e.target.value)}
                      style={{ width: "100%", marginTop: 4, padding: 6, borderRadius: 8, border: "1px solid var(--panel-border-strong)" }}
                    />
                  </label>
                  <button onClick={observeAikaWatch} style={{ marginTop: 8, padding: "6px 10px", borderRadius: 8 }}>
                    Record Observation
                  </button>
                  {aikaWatchResult && (
                    <pre style={{ marginTop: 8, background: "var(--code-bg)", color: "#e5e7eb", padding: 8, borderRadius: 8, fontSize: 11, maxHeight: 220, overflow: "auto" }}>
{aikaWatchResult}
                    </pre>
                  )}
                </div>
              </div>
            </div>
          )}

          {activeTab === "settings" && settingsTab === "legacy" && (
            <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
              <div style={{ fontSize: 14, fontWeight: 600, color: "#111827" }}>
                Legacy: Aika Tools
              </div>
              <div style={{ fontSize: 12, color: "#6b7280" }}>
                Kept for reference and likely unused in the beta release.
              </div>
              <AikaToolsWorkbench
                serverUrl={SERVER_URL}
                onOpenConnections={() => {
                  setActiveTab("settings");
                  setSettingsTab("connections");
                }}
                onOpenSafety={() => setActiveTab("safety")}
              />
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
              <div style={{ border: "1px solid var(--panel-border)", borderRadius: 12, padding: 10 }}>
                <div style={{ fontSize: 12, color: "#6b7280" }}>Server</div>
                <div style={{ fontWeight: 600, color: statusInfo?.server?.ok ? "#059669" : "#b91c1c" }}>
                  {statusInfo?.server?.ok ? "Online" : "Offline"}
                </div>
                <div style={{ fontSize: 12, color: "#6b7280" }}>Uptime: {statusInfo?.server?.uptimeSec ?? "-"}s</div>
              </div>
              <div style={{ border: "1px solid var(--panel-border)", borderRadius: 12, padding: 10 }}>
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
                  <div style={{ fontSize: 12, color: "#6b7280" }}>Model: {statusInfo?.openai?.model || "-"}</div>
                </div>
              <div style={{ border: "1px solid var(--panel-border)", borderRadius: 12, padding: 10 }}>
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
                <div style={{ border: "1px solid var(--panel-border)", borderRadius: 12, padding: 10 }}>
                  <div style={{ fontSize: 12, color: "#6b7280" }}>Integrations</div>
                  <div style={{ fontSize: 12, color: "#6b7280" }}>
                    {Object.keys(integrations || {}).length ? "Loaded" : "-"}
                  </div>
                </div>
                <div style={{ border: "1px solid var(--panel-border)", borderRadius: 12, padding: 10 }}>
                  <div style={{ fontSize: 12, color: "#6b7280" }}>Live2D</div>
                  <div style={{ fontWeight: 600, color: "#111827" }}>
                    {avatarModels.filter(m => m.available).length}/{avatarModels.length || 0} available
                  </div>
                </div>
                <div style={{ border: "1px solid var(--panel-border)", borderRadius: 12, padding: 10 }}>
                  <div style={{ fontSize: 12, color: "#6b7280" }}>Skills</div>
                  <div style={{ fontWeight: 600, color: statusInfo?.skills?.enabled ? "#059669" : "#6b7280" }}>
                    {statusInfo?.skills?.enabled ?? 0}/{statusInfo?.skills?.total ?? 0} enabled
                  </div>
                  <div style={{ fontSize: 12, color: "#6b7280" }}>
                    Last: {statusInfo?.skills?.lastEvent?.skill || "-"}
                  </div>
                </div>
              </div>

              <div style={{ fontSize: 14, fontWeight: 600, color: "#111827" }}>
                Voice Pipeline Check
              </div>
              <div style={{ border: "1px solid var(--panel-border)", borderRadius: 12, padding: 12, background: "var(--panel-bg)", fontSize: 12, color: "var(--text-muted)" }}>
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
              <div style={{ border: "1px solid var(--panel-border)", borderRadius: 12, padding: 12, background: "var(--panel-bg)", fontSize: 12, color: "var(--text-muted)" }}>
                {ttsDiagnostics ? (
                  <>
                    <div>Engine: <b>{ttsDiagnostics.engine}</b></div>
                    <div>GPT-SoVITS URL: {ttsDiagnostics.gptsovits?.url || "-"}</div>
                    <div>Docs URL: {ttsDiagnostics.gptsovits?.docsUrl || "-"}</div>
                    <div>Status: {ttsDiagnostics.gptsovits?.online ? "online" : "offline"} {ttsDiagnostics.gptsovits?.status ? `(${ttsDiagnostics.gptsovits.status})` : ""}</div>
                    <div>Config: {ttsDiagnostics.gptsovits?.configPath || "-"} {ttsDiagnostics.gptsovits?.configExists ? "(found)" : "(missing)"}</div>
                    <div>Default reference: {ttsDiagnostics.reference?.default || "-"}</div>
                    <div>Reference path: {ttsDiagnostics.reference?.resolved || "-"}</div>
                    <div>Reference ok: {ttsDiagnostics.reference?.exists ? "yes" : "no"}{ttsDiagnostics.reference?.duration ? ` | ${ttsDiagnostics.reference.duration.toFixed(2)}s` : ""}</div>
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
              style={{ padding: 8, borderRadius: 10, border: "1px solid var(--panel-border)" }}
            />
            <div style={{ border: "1px solid var(--panel-border)", borderRadius: 12, padding: 8, height: 220, overflow: "auto", background: "var(--code-bg)", color: "#e5e7eb", fontFamily: "monospace", fontSize: 11 }}>
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
              <div style={{ border: "1px solid var(--panel-border)", borderRadius: 12, padding: 12, background: "var(--panel-bg)" }}>
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

              <div style={{ border: "1px solid var(--panel-border)", borderRadius: 12, padding: 12, background: "var(--panel-bg)" }}>
                <div style={{ fontWeight: 600, marginBottom: 6 }}>Call Tool</div>
                <label style={{ fontSize: 12, color: "var(--text-muted)" }}>
                  Tool name
                  <input
                    value={toolCallName}
                    onChange={(e) => setToolCallName(e.target.value)}
                    placeholder="meeting.summarize"
                    style={{ width: "100%", marginTop: 4, padding: 8, borderRadius: 8, border: "1px solid var(--panel-border-strong)" }}
                  />
                </label>
                <label style={{ fontSize: 12, color: "var(--text-muted)", marginTop: 8 }}>
                  Params (JSON)
                  <textarea
                    value={toolCallParams}
                    onChange={(e) => setToolCallParams(e.target.value)}
                    rows={6}
                    style={{ width: "100%", marginTop: 4, padding: 8, borderRadius: 8, border: "1px solid var(--panel-border-strong)", fontFamily: "monospace", fontSize: 12 }}
                  />
                </label>
                <button onClick={callTool} style={{ marginTop: 8, padding: "6px 10px", borderRadius: 8 }}>
                  Call Tool
                </button>
                {toolsError && <div style={{ fontSize: 12, color: "#b91c1c" }}>{toolsError}</div>}
                {toolCallResult && (
                  <pre style={{ marginTop: 8, background: "var(--code-bg)", color: "#e5e7eb", padding: 8, borderRadius: 8, fontSize: 11, overflow: "auto" }}>
{toolCallResult}
                  </pre>
                )}
              </div>
            </div>

            <div style={{ border: "1px solid var(--panel-border)", borderRadius: 12, padding: 12, background: "var(--panel-bg)" }}>
              <div style={{ fontWeight: 600, marginBottom: 6 }}>Pending approval</div>
              {!toolApproval && (
                <div style={{ fontSize: 12, color: "#6b7280" }}>No approvals from recent tool calls.</div>
              )}
              {toolApproval && (
                <div style={{ display: "flex", flexDirection: "column", gap: 6, fontSize: 12 }}>
                  <div><b>Tool:</b> {toolApproval.toolName}</div>
                  <div><b>Status:</b> {toolApproval.status}</div>
                  <div><b>Summary:</b> {toolApproval.humanSummary || "Approval required"}</div>
                  <div style={{ display: "flex", gap: 6, marginTop: 6 }}>
                    {toolApproval.status === "pending" && (
                      <>
                        <button onClick={() => updateToolApproval("approve")} style={{ padding: "4px 8px", borderRadius: 6 }}>
                          Approve
                        </button>
                        <button onClick={() => updateToolApproval("deny")} style={{ padding: "4px 8px", borderRadius: 6 }}>
                          Deny
                        </button>
                      </>
                    )}
                    {toolApproval.status === "approved" && (
                      <button onClick={() => updateToolApproval("execute", toolApproval.token)} style={{ padding: "4px 8px", borderRadius: 6 }}>
                        Execute
                      </button>
                    )}
                    <button
                      onClick={() => setActiveTab("safety")}
                      style={{ padding: "4px 8px", borderRadius: 6 }}
                    >
                      Open Safety
                    </button>
                  </div>
                </div>
              )}
              {toolApprovalStatus && <div style={{ fontSize: 12, color: "var(--accent)", marginTop: 6 }}>{toolApprovalStatus}</div>}
            </div>

            <div style={{ border: "1px solid var(--panel-border)", borderRadius: 12, padding: 12, background: "var(--panel-bg)" }}>
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
                  <div key={h.id} style={{ borderBottom: "1px solid var(--panel-border-subtle)", padding: "6px 0" }}>
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

        {activeTab === "fireflies" && (
          <FirefliesPanel serverUrl={SERVER_URL} />
        )}

        {activeTab === "trading" && (
          <TradingPanel serverUrl={SERVER_URL} />
        )}

        {activeTab === "calendar" && (
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12 }}>
              <div style={{ fontSize: 14, fontWeight: 600, color: "#111827" }}>
                Calendar Day View
              </div>
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                <button
                  onClick={() => loadCalendarDayEvents()}
                  style={{ padding: "6px 10px", borderRadius: 8 }}
                >
                  Refresh
                </button>
                <button
                  onClick={() => {
                    if (typeof window !== "undefined") {
                      window.location.href = "/calendar";
                    }
                  }}
                  style={{ padding: "6px 10px", borderRadius: 8 }}
                >
                  Open Full Screen
                </button>
              </div>
            </div>

            <div style={{ display: "flex", flexWrap: "wrap", gap: 10, alignItems: "flex-end" }}>
              <label style={{ display: "flex", flexDirection: "column", gap: 4, fontSize: 12, color: "var(--text-muted)" }}>
                Day
                <input
                  type="date"
                  value={calendarDate}
                  onChange={(e) => setCalendarDate(e.target.value)}
                  style={{ padding: 6, borderRadius: 8, border: "1px solid var(--panel-border-strong)" }}
                />
              </label>
              <label style={{ display: "flex", flexDirection: "column", gap: 4, fontSize: 12, color: "var(--text-muted)" }}>
                Provider
                <select
                  value={calendarProvider}
                  onChange={(e) => setCalendarProvider(e.target.value)}
                  style={{ padding: 6, borderRadius: 8, border: "1px solid var(--panel-border-strong)" }}
                >
                  <option value="all">All</option>
                  <option value="google">Google</option>
                  <option value="outlook">Microsoft</option>
                </select>
              </label>
              <div style={{ display: "flex", gap: 6 }}>
                <button
                  onClick={() => setCalendarDate(addDays(calendarDate, -1))}
                  style={{ padding: "6px 10px", borderRadius: 8 }}
                >
                  Prev
                </button>
                <button
                  onClick={() => setCalendarDate(toLocalDateInput(new Date()))}
                  style={{ padding: "6px 10px", borderRadius: 8 }}
                >
                  Today
                </button>
                <button
                  onClick={() => setCalendarDate(addDays(calendarDate, 1))}
                  style={{ padding: "6px 10px", borderRadius: 8 }}
                >
                  Next
                </button>
              </div>
              <div style={{ fontSize: 12, color: "var(--text-muted)" }}>
                {calendarDayLabel || "Day view"} · {calendarTimezone}
              </div>
            </div>

            {calendarLoading && (
              <div style={{ fontSize: 12, color: "var(--text-muted)" }}>Loading events...</div>
            )}
            {calendarError && (
              <div style={{ fontSize: 12, color: "#b91c1c" }}>Calendar error: {calendarError}</div>
            )}
            {!calendarLoading && !calendarError && calendarEvents.length === 0 && (
              <div style={{ fontSize: 12, color: "var(--text-muted)" }}>No events scheduled for this day.</div>
            )}

            <div style={{
              border: "1px solid var(--panel-border)",
              borderRadius: 14,
              overflow: "hidden",
              background: "var(--panel-bg)"
            }}>
              <div style={{
                display: "grid",
                gridTemplateColumns: "72px 1fr",
                borderBottom: "1px solid var(--panel-border-subtle)",
                background: "var(--panel-bg-soft)"
              }}>
                <div style={{ padding: "8px 10px", fontSize: 11, color: "var(--text-muted)" }}>All day</div>
                <div style={{ padding: 8, display: "flex", flexDirection: "column", gap: 6 }}>
                  {calendarAllDayEvents.length === 0 && (
                    <div style={{ fontSize: 11, color: "var(--text-muted)" }}>No all-day events</div>
                  )}
                  {calendarAllDayEvents.map(event => (
                    (() => {
                      const isOutlook = event.provider === "outlook";
                      const borderColor = isOutlook ? "rgba(16, 185, 129, 0.4)" : "rgba(59, 130, 246, 0.35)";
                      const bgColor = isOutlook ? "rgba(16, 185, 129, 0.12)" : "rgba(59, 130, 246, 0.12)";
                      const tagColor = isOutlook ? "var(--accent-3)" : "var(--accent)";
                      return (
                        <div
                          key={`${event.provider}-${event.id}-allday`}
                          style={{
                            padding: "6px 8px",
                            borderRadius: 8,
                            border: `1px solid ${borderColor}`,
                            background: bgColor,
                            fontSize: 11,
                            fontWeight: 600,
                            display: "flex",
                            justifyContent: "space-between",
                            gap: 8
                          }}
                        >
                          <span>{event.summary || "Untitled event"}</span>
                          <span style={{ fontSize: 10, letterSpacing: "0.12em", textTransform: "uppercase", color: tagColor }}>
                            {event.provider}
                          </span>
                        </div>
                      );
                    })()
                  ))}
                </div>
              </div>
              <div style={{
                display: "grid",
                gridTemplateColumns: "72px 1fr"
              }}>
                <div style={{
                  borderRight: "1px solid var(--panel-border-subtle)",
                  background: "var(--panel-bg-soft)"
                }}>
                  {calendarHours.map(hour => (
                    <div
                      key={`calendar-hour-${hour}`}
                      style={{
                        height: calendarHourHeight,
                        fontSize: 10,
                        padding: "4px 6px",
                        color: "var(--text-muted)",
                        borderBottom: "1px solid var(--panel-border-subtle)"
                      }}
                    >
                      {hour === 0 ? "12 AM" : hour < 12 ? `${hour} AM` : hour === 12 ? "12 PM" : `${hour - 12} PM`}
                    </div>
                  ))}
                </div>
                <div style={{
                  position: "relative",
                  height: calendarHourHeight * 24,
                  background: "rgba(15,23,42,0.35)"
                }}>
                  {calendarHours.map(hour => (
                    <div
                      key={`calendar-line-${hour}`}
                      style={{
                        position: "absolute",
                        top: hour * calendarHourHeight,
                        left: 0,
                        right: 0,
                        borderTop: "1px solid var(--panel-border-subtle)"
                      }}
                    />
                  ))}
                  {calendarTimedEvents.map(event => {
                    if (!calendarDayRange) return null;
                    const startDate = new Date(event._startMs);
                    const endDate = new Date(event._endMs);
                    const startParts = getTimeZoneParts(startDate, calendarTimezone);
                    const endParts = getTimeZoneParts(endDate, calendarTimezone);
                    const startCompare = compareDateParts(startParts, calendarDayParts);
                    const endCompare = compareDateParts(endParts, calendarDayParts);
                    let startMinutes = startCompare < 0 ? 0 : startCompare > 0 ? 24 * 60 : getMinutesIntoDay(startDate, calendarTimezone);
                    let endMinutes = endCompare > 0 ? 24 * 60 : endCompare < 0 ? 0 : getMinutesIntoDay(endDate, calendarTimezone);
                    if (endMinutes <= startMinutes) {
                      endMinutes = Math.min(startMinutes + 30, 24 * 60);
                    }
                    const top = (startMinutes / 60) * calendarHourHeight;
                    const height = Math.max(24, ((endMinutes - startMinutes) / 60) * calendarHourHeight);
                    const timeLabel = `${formatTimeInTimeZone(event.start, calendarTimezone)} - ${formatTimeInTimeZone(event.end || event.start, calendarTimezone)}`;
                    const isOutlook = event.provider === "outlook";
                    const borderColor = isOutlook ? "rgba(16, 185, 129, 0.4)" : "rgba(59, 130, 246, 0.35)";
                    const bgColor = isOutlook ? "rgba(16, 185, 129, 0.18)" : "rgba(59, 130, 246, 0.16)";
                    return (
                      <div
                        key={`${event.provider}-${event.id}-timed`}
                        style={{
                          position: "absolute",
                          left: 12,
                          right: 12,
                          top,
                          height,
                          padding: "6px 8px",
                          borderRadius: 10,
                          border: `1px solid ${borderColor}`,
                          background: bgColor,
                          color: "var(--text-primary)",
                          overflow: "hidden"
                        }}
                      >
                        <div style={{ fontWeight: 600, fontSize: 11 }}>{event.summary || "Untitled event"}</div>
                        <div style={{ fontSize: 10, color: "var(--text-muted)" }}>{timeLabel}</div>
                        {event.location && (
                          <div style={{ fontSize: 10, color: "var(--text-muted)" }}>{event.location}</div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          </div>
        )}

        {activeTab === "safety" && (
          <SafetyPanel serverUrl={SERVER_URL} />
        )}

        {activeTab === "canvas" && (
          <CanvasPanel serverUrl={SERVER_URL} />
        )}

        <MeetingCopilot
          serverUrl={SERVER_URL}
          registerControls={registerMeetingCopilotControls}
          onActivateTab={() => setActiveTab("recordings")}
          onRecordingStateChange={setMeetingRecordingActive}
          onSelectedRecordingChange={setActiveRecordingId}
          visible={activeTab === "recordings"}
          commandListening={meetingCommandListening}
          onCommandListeningChange={setMeetingCommandListening}
        />

        {activeTab === "features" && (
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <div style={{ fontWeight: 600, fontSize: 14 }}>MCP Features</div>
              <div style={{ display: "flex", gap: 8 }}>
                <button onClick={refreshFeatures} style={{ padding: "6px 10px", borderRadius: 8 }}>
                  Refresh
                </button>
                <button onClick={copyDiagnostics} style={{ padding: "6px 10px", borderRadius: 8 }}>
                  Copy Diagnostics
                </button>
              </div>
            </div>

            {featuresView === "mcp" && (
              <>
                {featuresError && <div style={{ color: "#b91c1c", fontSize: 12 }}>{featuresError}</div>}

            <div style={{ display: "grid", gridTemplateColumns: "0.7fr 1.3fr", gap: 12 }}>
              <div style={{ border: "1px solid var(--panel-border)", borderRadius: 12, padding: 12, background: "var(--panel-bg)" }}>
                <div style={{ fontWeight: 600, marginBottom: 8 }}>Services</div>
                {featuresServices.map(s => (
                  <div
                    key={s.id}
                    onClick={() => setFeaturesSelected(s.id)}
                    style={{
                      border: s.id === featuresSelected ? "1px solid var(--accent)" : "1px solid var(--panel-border)",
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

              <div style={{ border: "1px solid var(--panel-border)", borderRadius: 12, padding: 12, background: "var(--panel-bg)" }}>
                <div style={{ fontWeight: 600, marginBottom: 8 }}>Tools</div>
                {featuresServices
                  .find(s => s.id === featuresSelected)
                  ?.tools.map(tool => (
                    <div key={tool.name} style={{ borderBottom: "1px solid var(--panel-border-subtle)", padding: "6px 0" }}>
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
                <div style={{ width: 420, background: "var(--panel-bg)", borderRadius: 12, padding: 16 }}>
                  <div style={{ fontWeight: 600, marginBottom: 8 }}>
                    Connect {connectModal.displayName}
                  </div>
                  {connectModal.connectSpec?.method === "oauth" && (
                    <div style={{ fontSize: 12, color: "var(--text-muted)" }}>
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
                    <div style={{ fontSize: 12, color: "var(--text-muted)" }}>
                      Set the following env vars, then click "Mark Connected":
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
                    <div style={{ fontSize: 12, color: "var(--text-muted)" }}>No connection required.</div>
                  )}
                  {connectModal.connectSpec?.method === "custom" && (
                    <div style={{ fontSize: 12, color: "var(--text-muted)" }}>
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

          </div>
        )}

        {activeTab === "guide" && (
          <GuidePanel />
        )}
        {activeTab === "capabilities" && (
          <GuidePanel
            docPath="/docs/capabilities.md"
            title="What Aika Can Do"
            openLabel="Open Capabilities"
          />
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
              <div style={{ display: "flex", gap: 6, alignItems: "flex-start" }}>
                <b>{m.role === "user" ? "You" : "Aika"}:</b>
                <div style={{ whiteSpace: "pre-wrap", overflowWrap: "anywhere", flex: 1 }}>
                  {m.text}
                </div>
              </div>
              {m.memoryNote && (
                <div style={{ marginTop: 4, fontSize: 12, color: "var(--accent)" }}>{m.memoryNote}</div>
              )}
              {m.actionMeta && (
                <div style={{ marginTop: 4, fontSize: 12, color: m.actionMeta.status === "error" ? "#b91c1c" : "#6b7280" }}>
                  Action: {formatActionLabel(m.actionMeta.type)} - {formatActionStatus(m.actionMeta.status)}
                </div>
              )}
              {Array.isArray(m.citations) && m.citations.length > 0 && (
                <details style={{ marginTop: 6 }}>
                  <summary style={{ cursor: "pointer", fontSize: 12, color: "#6b7280" }}>
                    View citations ({m.citations.length})
                  </summary>
                  <div style={{ marginTop: 6, display: "flex", flexDirection: "column", gap: 6 }}>
                    {m.citations.map((cite, idx) => (
                      <div key={`${cite.chunk_id || idx}-${idx}`} style={{ fontSize: 12, color: "var(--text-muted)" }}>
                        <div style={{ fontWeight: 600 }}>{cite.meeting_title || "Meeting"} {cite.occurred_at ? `(${cite.occurred_at})` : ""}</div>
                        <div style={{ color: "#6b7280" }}>{cite.chunk_id}</div>
                        <div style={{ whiteSpace: "pre-wrap" }}>{cite.snippet}</div>
                      </div>
                    ))}
                  </div>
                </details>
              )}
              {m.role === "assistant" && m.id && (
                <div style={{ marginTop: 6, display: "flex", gap: 6, alignItems: "center" }}>
                  <button
                    onClick={() => submitFeedback(m, "up")}
                    style={{
                      padding: "4px 8px",
                      borderRadius: 8,
                      border: "1px solid var(--panel-border-strong)",
                      background: feedbackState[m.id] === "up" ? "#dcfce7" : "var(--panel-bg)",
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
                      border: "1px solid var(--panel-border-strong)",
                      background: feedbackState[m.id] === "down" ? "#fee2e2" : "var(--panel-bg)",
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
            style={{ flex: 1, padding: 12, borderRadius: 12, border: "1px solid var(--panel-border-strong)", background: meetingLock ? "var(--panel-bg-soft)" : "var(--panel-bg)" }}
          />
          <div style={{
            width: 10,
            height: 36,
            borderRadius: 8,
            background: "var(--panel-bg-soft)",
            border: "1px solid var(--panel-border-strong)",
            display: "flex",
            alignItems: "flex-end",
            padding: 2
          }}>
            <div style={{
              width: "100%",
              height: `${Math.max(0.08, micLevel) * 100}%`,
              borderRadius: 6,
              background: micState === "listening" ? "var(--accent)" : "var(--text-muted)",
              transition: "height 60ms linear"
            }} />
          </div>

          <div style={{
            display: "flex",
            alignItems: "center",
            gap: 6,
            padding: "6px 10px",
            borderRadius: 999,
            border: "1px solid var(--panel-border)",
            background: micEnabled && micState === "listening" ? "rgba(123, 240, 255, 0.18)" : "var(--panel-bg-soft)",
            color: micEnabled && micState === "listening" ? "var(--accent-3)" : "var(--text-muted)",
            fontSize: 12
          }}>
            <span style={{
              width: 8,
              height: 8,
              borderRadius: "50%",
              background: micEnabled && micState === "listening" ? "var(--accent-3)" : "var(--text-muted)",
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
              border: micEnabled && micState === "listening" ? "1px solid var(--accent)" : "1px solid var(--panel-border-strong)",
              background: micEnabled && micState === "listening" ? "var(--chip-bg)" : "var(--panel-bg)"
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
            style={{ padding: "12px 14px", borderRadius: 12, border: "1px solid var(--panel-border)", background: "var(--panel-bg-soft)" }}
          >
            {showSettings ? "Close Quick" : "Quick Settings"}
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
            <label style={{ display: "flex", gap: 8, alignItems: "center", fontSize: 12, color: "var(--text-muted)" }}>
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
            <label style={{ display: "flex", gap: 8, alignItems: "center", fontSize: 12, color: "var(--text-muted)" }}>
              <input
                type="checkbox"
                checked={fastReplies}
                onChange={(e) => setFastReplies(e.target.checked)}
              />
              Fast replies (shorter, quicker)
            </label>
            <label style={{ display: "flex", gap: 8, alignItems: "center", fontSize: 12, color: "var(--text-muted)" }}>
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
            <div style={{ gridColumn: "1 / -1", display: "flex", gap: 8, flexWrap: "wrap", marginTop: 4 }}>
              <button
                onClick={() => {
                  setActiveTab("settings");
                  setSettingsTab("voice");
                }}
                style={{ padding: "6px 10px", borderRadius: 8 }}
              >
                Voice Settings
              </button>
              <button
                onClick={() => {
                  setActiveTab("settings");
                  setSettingsTab("appearance");
                }}
                style={{ padding: "6px 10px", borderRadius: 8 }}
              >
                Appearance
              </button>
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
          <div style={{ color: "var(--text-muted)", fontSize: 12 }}>
            {micStatus}
          </div>
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
                  style={{ padding: "6px 10px", borderRadius: 8, border: "1px solid var(--panel-border-strong)" }}
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
                            style={{ padding: "6px 10px", borderRadius: 8, border: "1px solid var(--panel-border-strong)", textDecoration: "none" }}
                          >
                            Open Listing
                          </a>
                        )}
                        <button
                          onClick={() => addAmazonToCart(productResearch.recommendationItem)}
                          disabled={!productResearch.recommendationItem.asin || cartBusyAsin === productResearch.recommendationItem.asin}
                          style={{ padding: "6px 10px", borderRadius: 8, border: "1px solid var(--panel-border-strong)" }}
                        >
                          {cartBusyAsin === productResearch.recommendationItem.asin ? "Adding..." : "Add to Amazon Cart"}
                        </button>
                      </div>
                    </>
                  ) : (
                    <div style={{ fontSize: 12, color: "var(--text-muted)" }}>No top pick yet.</div>
                  )}
                  {productResearchNotice && (
                    <div style={{ marginTop: 8, fontSize: 12, color: "var(--accent)" }}>{productResearchNotice}</div>
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
                        border: "1px solid var(--panel-border)",
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
                          {option.priceDisplay || "Price unavailable"}{option.asin ? ` - ASIN ${option.asin}` : ""}
                        </div>
                      </div>
                      <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                        {option.url && (
                          <a
                            href={option.url}
                            target="_blank"
                            rel="noreferrer"
                            style={{ padding: "4px 8px", borderRadius: 8, border: "1px solid var(--panel-border-strong)", textDecoration: "none", fontSize: 12 }}
                          >
                            Open
                          </a>
                        )}
                        <button
                          onClick={() => addAmazonToCart(option)}
                          disabled={!option.asin || cartBusyAsin === option.asin}
                          style={{ padding: "4px 8px", borderRadius: 8, border: "1px solid var(--panel-border-strong)", fontSize: 12 }}
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
      <style jsx global>{`
        @import url("https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@300;400;500;600;700&family=Manrope:wght@300;400;500;600;700&display=swap");

        :root {
          --font-body: "Manrope", "Segoe UI", sans-serif;
          --font-display: "Space Grotesk", "Segoe UI", sans-serif;
          --radius-lg: 18px;
          --radius-md: 12px;
          --radius-sm: 10px;
          --shadow-elevated: 0 30px 70px rgba(7, 9, 20, 0.55);
          --shadow-soft: 0 12px 30px rgba(6, 8, 18, 0.35);
          --glow-accent: 0 0 30px rgba(138, 180, 255, 0.35);
          --glow-warm: 0 0 40px rgba(240, 179, 255, 0.3);
        }

        html,
        body,
        #__next {
          height: 100%;
        }

        body {
          margin: 0;
          font-family: var(--font-body);
          color: var(--text-primary);
          background: var(--app-bg);
        }

        .app-shell {
          position: relative;
          overflow: hidden;
        }

        .app-shell::before {
          content: "";
          position: absolute;
          inset: -20% -10% -20% -10%;
          background: radial-gradient(600px 400px at 12% 20%, rgba(138, 180, 255, 0.18), transparent 60%),
            radial-gradient(700px 500px at 88% 15%, rgba(240, 179, 255, 0.18), transparent 60%),
            radial-gradient(900px 600px at 50% 90%, rgba(123, 240, 255, 0.12), transparent 65%);
          filter: blur(8px);
          opacity: 0.9;
          pointer-events: none;
          animation: floatGlow 18s ease-in-out infinite;
        }

        .app-shell::after {
          content: "";
          position: absolute;
          inset: 0;
          background-image: radial-gradient(rgba(255, 255, 255, 0.08) 0.5px, transparent 0.5px);
          background-size: 3px 3px;
          opacity: 0.08;
          mix-blend-mode: screen;
          pointer-events: none;
        }

        .app-shell > * {
          position: relative;
          z-index: 1;
        }

        .avatar-stage::after {
          content: "";
          position: absolute;
          inset: 0;
          background: radial-gradient(500px 300px at 30% 10%, rgba(138, 180, 255, 0.12), transparent 60%),
            radial-gradient(600px 400px at 80% 20%, rgba(240, 179, 255, 0.12), transparent 60%);
          pointer-events: none;
        }

        .side-panel {
          box-shadow: var(--shadow-elevated);
        }

        button,
        input,
        select,
        textarea {
          font-family: var(--font-body);
          color: var(--text-primary);
        }

        button {
          background: var(--button-bg);
          border: 1px solid var(--panel-border);
          border-radius: var(--radius-md);
          transition: transform 0.15s ease, box-shadow 0.2s ease, border-color 0.2s ease, background 0.2s ease;
        }

        button:hover {
          border-color: var(--accent);
          box-shadow: var(--glow-accent);
          transform: translateY(-1px);
        }

        button:disabled {
          opacity: 0.55;
          cursor: not-allowed;
          box-shadow: none;
          transform: none;
        }

        input,
        select,
        textarea {
          background: var(--input-bg);
          border: 1px solid var(--panel-border-strong);
          border-radius: var(--radius-md);
          outline: none;
          transition: border-color 0.2s ease, box-shadow 0.2s ease;
        }

        input:focus,
        select:focus,
        textarea:focus {
          border-color: var(--accent);
          box-shadow: 0 0 0 2px rgba(138, 180, 255, 0.2);
        }

        a {
          color: var(--accent);
        }

        pre {
          background: var(--code-bg);
          color: var(--code-text);
          border-radius: var(--radius-md);
        }

        .app-shell [style*="var(--panel-bg)"] {
          backdrop-filter: blur(14px);
          box-shadow: var(--shadow-soft);
        }

        .app-shell [style*="var(--panel-bg-soft)"] {
          backdrop-filter: blur(10px);
        }

        .app-shell [style*="var(--chip-bg)"] {
          border-color: var(--chip-border);
        }

        @keyframes floatGlow {
          0% {
            transform: translateY(0px) translateX(0px);
          }
          50% {
            transform: translateY(12px) translateX(-8px);
          }
          100% {
            transform: translateY(0px) translateX(0px);
          }
        }

        @media (max-width: 1100px) {
          .app-shell {
            grid-template-columns: 1fr !important;
            height: auto !important;
          }
        }
      `}</style>
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






