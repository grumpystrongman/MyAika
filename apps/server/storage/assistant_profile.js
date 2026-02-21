import { getDb } from "./db.js";
import { nowIso, safeJsonParse } from "./utils.js";

const DEFAULT_TIMEZONE = process.env.DEFAULT_TIMEZONE || "America/New_York";
const DEFAULT_MEMORY_MODE = "opt_in";
const MAX_SUMMARY_CHARS = 2000;

function limitText(value, max) {
  const text = String(value || "").trim();
  if (!max || text.length <= max) return text;
  return `${text.slice(0, max)}...`;
}

function defaultPreferences() {
  return {
    notifications: {
      taskChannels: ["in_app", "email", "telegram"]
    },
    identity: {
      workEmail: "",
      personalEmail: ""
    },
    appearance: {
      theme: "aurora",
      appBackground: "",
      avatarBackground: "none",
      avatarModelId: "miku"
    },
    audio: {
      sttSilenceMs: 1400,
      meetingCommandListening: false
    },
    voice: {
      promptText: "",
      settings: {
        style: "brat_baddy",
        format: "wav",
        rate: 1.05,
        pitch: 0,
        energy: 1.0,
        pause: 1.1,
        engine: "piper",
        voice: {
          reference_wav_path: "riko_sample.wav",
          name: "en_GB-semaine-medium",
          prompt_text: ""
        }
      }
    },
    rag: {
      defaultModel: "auto",
      tradingModel: "trading"
    }
  };
}

function mergePreferences(base, patch) {
  if (!patch || typeof patch !== "object") return base;
  const output = Array.isArray(base) ? [...base] : { ...base };
  for (const [key, value] of Object.entries(patch)) {
    if (value === undefined) continue;
    if (
      value &&
      typeof value === "object" &&
      !Array.isArray(value) &&
      base &&
      typeof base[key] === "object" &&
      !Array.isArray(base[key])
    ) {
      output[key] = mergePreferences(base[key], value);
    } else {
      output[key] = value;
    }
  }
  return output;
}

function normalizePreferences(input, fallback) {
  if (!input || typeof input !== "object") return fallback;
  return mergePreferences(fallback, input);
}

function normalizeMemoryMode(value, fallback) {
  const mode = String(value || "").trim().toLowerCase();
  if (mode === "opt_in" || mode === "auto_summary_minimal") return mode;
  return fallback;
}

function normalizeSummary(input, fallback) {
  if (input == null) return fallback;
  if (typeof input === "string") {
    return { text: limitText(input, MAX_SUMMARY_CHARS), updatedAt: nowIso() };
  }
  if (typeof input === "object") {
    const text = limitText(input.text || input.summary || "", MAX_SUMMARY_CHARS);
    if (!text) return fallback;
    return { text, updatedAt: nowIso() };
  }
  return fallback;
}

function buildDefaultProfile(userId) {
  return {
    id: userId,
    displayName: "Aika",
    timezone: DEFAULT_TIMEZONE,
    preferences: defaultPreferences(),
    memoryMode: DEFAULT_MEMORY_MODE,
    autoSummary: false,
    memorySummary: "",
    createdAt: null,
    updatedAt: null
  };
}

function mapRow(row, userId) {
  const defaults = buildDefaultProfile(userId);
  if (!row) return defaults;
  const preferences = normalizePreferences(
    safeJsonParse(row.preferences_json, null),
    defaults.preferences
  );
  const summary = safeJsonParse(row.summary_json, null) || {};
  return {
    id: row.id,
    displayName: row.display_name || defaults.displayName,
    timezone: row.timezone || defaults.timezone,
    preferences,
    memoryMode: normalizeMemoryMode(row.memory_mode, defaults.memoryMode),
    autoSummary: Boolean(row.auto_summary),
    memorySummary: String(summary.text || ""),
    createdAt: row.created_at || null,
    updatedAt: row.updated_at || null
  };
}

export function getAssistantProfile(userId = "local") {
  const db = getDb();
  const row = db.prepare("SELECT * FROM assistant_profile WHERE id = ?").get(userId);
  return mapRow(row, userId);
}

export function updateAssistantProfile(userId = "local", patch = {}) {
  const db = getDb();
  const current = getAssistantProfile(userId);
  const next = {
    displayName: current.displayName,
    timezone: current.timezone,
    preferences: current.preferences,
    memoryMode: current.memoryMode,
    autoSummary: current.autoSummary,
    memorySummary: current.memorySummary
  };

  if (typeof patch.displayName === "string") {
    next.displayName = patch.displayName.trim() || next.displayName;
  }
  if (typeof patch.timezone === "string") {
    next.timezone = patch.timezone.trim() || next.timezone;
  }
  if (patch.preferences && typeof patch.preferences === "object") {
    next.preferences = normalizePreferences(patch.preferences, next.preferences);
  }
  if (patch.notifications && typeof patch.notifications === "object") {
    next.preferences = normalizePreferences({
      ...next.preferences,
      notifications: {
        ...(next.preferences?.notifications || {}),
        ...patch.notifications
      }
    }, next.preferences);
  }
  if (patch.memoryMode || patch.memory_mode) {
    next.memoryMode = normalizeMemoryMode(patch.memoryMode || patch.memory_mode, next.memoryMode);
  }
  if (typeof patch.autoSummary === "boolean") {
    next.autoSummary = patch.autoSummary;
  }
  if (typeof patch.auto_summary === "boolean") {
    next.autoSummary = patch.auto_summary;
  }
  if (patch.memorySummary != null || patch.memory_summary != null) {
    const summary = normalizeSummary(patch.memorySummary ?? patch.memory_summary, { text: next.memorySummary });
    next.memorySummary = summary.text || "";
  }

  const now = nowIso();
  const createdAt = current.createdAt || now;
  db.prepare(
    `INSERT INTO assistant_profile
      (id, display_name, timezone, preferences_json, memory_mode, auto_summary, summary_json, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(id) DO UPDATE SET
       display_name = excluded.display_name,
       timezone = excluded.timezone,
       preferences_json = excluded.preferences_json,
       memory_mode = excluded.memory_mode,
       auto_summary = excluded.auto_summary,
       summary_json = excluded.summary_json,
       updated_at = excluded.updated_at`
  ).run(
    userId,
    next.displayName,
    next.timezone,
    JSON.stringify(next.preferences || {}),
    next.memoryMode,
    next.autoSummary ? 1 : 0,
    JSON.stringify({ text: next.memorySummary || "", updatedAt: now }),
    createdAt,
    now
  );

  return {
    id: userId,
    displayName: next.displayName,
    timezone: next.timezone,
    preferences: next.preferences,
    memoryMode: next.memoryMode,
    autoSummary: next.autoSummary,
    memorySummary: next.memorySummary,
    createdAt,
    updatedAt: now
  };
}
