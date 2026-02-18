import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";

const DEFAULT_SAMPLE_MS = 30;
const DEFAULT_MAX_SECONDS = 180;
const DEFAULT_STOP_KEY = "F8";
const DEFAULT_MERGE_WINDOW_MS = 450;
const DEFAULT_MAX_WAIT_MS = 30000;
const DEFAULT_MAX_ACTIONS = 140;

function resolveRepoRoot() {
  const cwd = process.cwd();
  const marker = path.join(cwd, "apps", "server");
  if (fs.existsSync(marker)) return cwd;
  return path.resolve(cwd, "..", "..");
}

const repoRoot = resolveRepoRoot();
const scriptPath = path.join(repoRoot, "apps", "server", "scripts", "desktop_record.ps1");

function toBool(value) {
  if (value === true || value === false) return value;
  return String(value || "").trim() === "1";
}

function toNumber(value, fallback) {
  const num = Number(value);
  return Number.isFinite(num) ? num : fallback;
}

function normalizeDelay(value) {
  const ms = Math.max(0, Number(value || 0));
  return Number.isFinite(ms) ? ms : 0;
}

function pushWait(actions, delayMs, maxWaitMs, stats) {
  if (delayMs <= 0) return;
  let waitMs = delayMs;
  if (maxWaitMs > 0 && waitMs > maxWaitMs) {
    waitMs = maxWaitMs;
    stats.waitsCapped += 1;
  }
  actions.push({ type: "wait", ms: Math.round(waitMs) });
}

function flushText(actions, state, maxWaitMs, stats) {
  if (!state.text) return;
  pushWait(actions, state.delayMs, maxWaitMs, stats);
  actions.push({ type: "type", text: state.text });
  state.text = "";
  state.delayMs = 0;
}

export function transformRecordingEvents(events = [], options = {}) {
  const mergeWindowMs = toNumber(options.mergeWindowMs, DEFAULT_MERGE_WINDOW_MS);
  const maxWaitMs = toNumber(options.maxWaitMs, DEFAULT_MAX_WAIT_MS);
  const maxActions = toNumber(options.maxActions, DEFAULT_MAX_ACTIONS);

  const actions = [];
  const stats = { waitsCapped: 0, truncated: false };
  const state = { text: "", delayMs: 0 };

  const safePush = (action) => {
    if (actions.length >= maxActions) {
      stats.truncated = true;
      return false;
    }
    actions.push(action);
    return true;
  };

  for (const event of events || []) {
    const delayMs = normalizeDelay(event?.delayMs);
    if (event?.type === "char") {
      if (!state.text) {
        state.text = String(event.value || "");
        state.delayMs = delayMs;
      } else if (delayMs <= mergeWindowMs) {
        state.text += String(event.value || "");
      } else {
        flushText(actions, state, maxWaitMs, stats);
        state.text = String(event.value || "");
        state.delayMs = delayMs;
      }
      if (actions.length >= maxActions) {
        stats.truncated = true;
        break;
      }
      continue;
    }

    flushText(actions, state, maxWaitMs, stats);
    pushWait(actions, delayMs, maxWaitMs, stats);

    if (event?.type === "mouseClick") {
      if (!safePush({
        type: "mouseClick",
        x: Number(event.x || 0),
        y: Number(event.y || 0),
        button: String(event.button || "left"),
        count: Number(event.count || 1)
      })) break;
      continue;
    }
    if (event?.type === "mouseMove") {
      if (!safePush({
        type: "mouseMove",
        x: Number(event.x || 0),
        y: Number(event.y || 0)
      })) break;
      continue;
    }
    if (event?.type === "key") {
      if (!safePush({ type: "key", combo: String(event.combo || "") })) break;
      continue;
    }
    if (event?.type === "type") {
      if (!safePush({ type: "type", text: String(event.text || "") })) break;
      continue;
    }
  }

  flushText(actions, state, maxWaitMs, stats);
  return { actions, stats };
}

export function recordDesktopMacro(options = {}) {
  if (process.platform !== "win32") {
    const err = new Error("desktop_recorder_windows_only");
    err.status = 400;
    throw err;
  }
  if (!fs.existsSync(scriptPath)) {
    throw new Error("desktop_record_script_missing");
  }

  const sampleMs = toNumber(options.sampleMs || process.env.DESKTOP_RECORD_SAMPLE_MS, DEFAULT_SAMPLE_MS);
  const maxSeconds = toNumber(options.maxSeconds || process.env.DESKTOP_RECORD_MAX_SECONDS, DEFAULT_MAX_SECONDS);
  const stopKey = String(options.stopKey || process.env.DESKTOP_RECORD_STOP_KEY || DEFAULT_STOP_KEY).trim() || DEFAULT_STOP_KEY;
  const includeMoves = toBool(options.includeMoves ?? process.env.DESKTOP_RECORD_INCLUDE_MOUSE_MOVES);

  const args = [
    "-NoProfile",
    "-ExecutionPolicy",
    "Bypass",
    "-File",
    scriptPath,
    "-StopKey",
    stopKey,
    "-SampleMs",
    String(sampleMs),
    "-MaxSeconds",
    String(maxSeconds)
  ];
  if (includeMoves) args.push("-IncludeMouseMoves");

  const result = spawnSync("powershell", args, { encoding: "utf8" });
  if (result.error) throw result.error;
  if (result.status !== 0) {
    const err = new Error(result.stderr?.trim() || "desktop_record_failed");
    err.code = result.status;
    throw err;
  }

  const stdout = String(result.stdout || "").trim();
  if (!stdout) {
    throw new Error("desktop_record_empty");
  }

  let payload;
  try {
    payload = JSON.parse(stdout);
  } catch {
    throw new Error("desktop_record_invalid_json");
  }

  const events = Array.isArray(payload?.events) ? payload.events : [];
  const { actions, stats } = transformRecordingEvents(events, {
    mergeWindowMs: toNumber(options.mergeWindowMs || process.env.DESKTOP_RECORD_MERGE_WINDOW_MS, DEFAULT_MERGE_WINDOW_MS),
    maxWaitMs: toNumber(options.maxWaitMs || process.env.DESKTOP_RECORD_MAX_WAIT_MS, DEFAULT_MAX_WAIT_MS),
    maxActions: toNumber(options.maxActions || process.env.DESKTOP_RECORD_MAX_ACTIONS, DEFAULT_MAX_ACTIONS)
  });

  return {
    ok: true,
    events,
    actions,
    summary: {
      eventCount: events.length,
      actionCount: actions.length,
      durationMs: payload?.durationMs || 0,
      stopKey,
      sampleMs,
      includeMoves,
      truncated: stats.truncated,
      waitsCapped: stats.waitsCapped
    },
    recording: {
      startedAt: payload?.startedAt || null,
      stoppedAt: payload?.stoppedAt || null,
      durationMs: payload?.durationMs || 0,
      stopKey,
      sampleMs,
      includeMoves
    }
  };
}
