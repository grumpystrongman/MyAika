import crypto from "node:crypto";
import { getDb } from "./db.js";
import { nowIso, safeJsonParse } from "./utils.js";

const DEFAULT_TASK_CHANNELS = ["in_app", "email", "telegram"];

function makeId() {
  return crypto.randomBytes(8).toString("hex");
}

function parseList(value) {
  return String(value || "")
    .split(/[;,\n]/)
    .map(item => item.trim())
    .filter(Boolean);
}

function normalizeChannels(input, fallback = DEFAULT_TASK_CHANNELS) {
  const list = Array.isArray(input) ? input : (typeof input === "string" ? parseList(input) : []);
  if (!list.length) return fallback.slice();
  const normalized = list
    .map(item => String(item || "").trim().toLowerCase())
    .map(item => {
      if (item === "in-app" || item === "inapp") return "in_app";
      return item;
    })
    .filter(item => ["in_app", "email", "telegram"].includes(item));
  return normalized.length ? Array.from(new Set(normalized)) : fallback.slice();
}

function normalizeTargets(input) {
  if (!input || typeof input !== "object") return {};
  const next = {};
  if (input.emailTo || input.email_to || input.emailRecipients) {
    const list = Array.isArray(input.emailTo || input.emailRecipients)
      ? (input.emailTo || input.emailRecipients)
      : parseList(input.emailTo || input.email_to || input.emailRecipients || "");
    next.emailTo = list.map(item => String(item || "").trim()).filter(Boolean);
  }
  if (input.telegramChatIds || input.telegram_chat_ids || input.telegramChatId || input.telegram_chat_id) {
    const list = Array.isArray(input.telegramChatIds || input.telegramChatId)
      ? (input.telegramChatIds || input.telegramChatId)
      : parseList(input.telegramChatIds || input.telegram_chat_ids || input.telegramChatId || input.telegram_chat_id || "");
    next.telegramChatIds = list.map(item => String(item || "").trim()).filter(Boolean);
  }
  return next;
}

function normalizeSchedule(input, fallback = null) {
  if (!input || typeof input !== "object") return fallback;
  const rawType = String(input.type || "").trim().toLowerCase();
  const type = rawType || (input.runAt || input.run_at
    ? "once"
    : (input.intervalMinutes || input.interval_minutes
      ? "interval"
      : (input.timeOfDay || input.time_of_day
        ? (input.dayOfWeek || input.day_of_week || input.weekday ? "weekly" : "daily")
        : "")));
  if (!type) return fallback;
  if (type === "once") {
    const runAt = String(input.runAt || input.run_at || "").trim();
    if (!runAt) return fallback;
    return { type: "once", runAt };
  }
  if (type === "interval") {
    const minutes = Number(input.intervalMinutes ?? input.interval_minutes ?? 0);
    if (!Number.isFinite(minutes) || minutes <= 0) return fallback;
    return { type: "interval", intervalMinutes: Math.floor(minutes) };
  }
  if (type === "daily") {
    const timeOfDay = String(input.timeOfDay || input.time_of_day || "").trim();
    if (!timeOfDay) return fallback;
    return {
      type: "daily",
      timeOfDay,
      timezone: String(input.timezone || input.time_zone || "").trim() || ""
    };
  }
  if (type === "weekly") {
    const timeOfDay = String(input.timeOfDay || input.time_of_day || "").trim();
    if (!timeOfDay) return fallback;
    const dayOfWeek = String(input.dayOfWeek || input.day_of_week || input.weekday || "").trim();
    if (!dayOfWeek) return fallback;
    return {
      type: "weekly",
      dayOfWeek,
      timeOfDay,
      timezone: String(input.timezone || input.time_zone || "").trim() || ""
    };
  }
  return fallback;
}

function parseTimeOfDay(value) {
  const match = String(value || "").trim().match(/^(\d{1,2}):(\d{2})$/);
  if (!match) return null;
  const hour = Math.min(23, Math.max(0, Number(match[1])));
  const minute = Math.min(59, Math.max(0, Number(match[2])));
  return { hour, minute };
}

export function computeNextRunAt(schedule, fromDate = new Date()) {
  if (!schedule || !schedule.type) return "";
  const now = new Date();
  if (schedule.type === "once") {
    const runAt = new Date(schedule.runAt);
    if (Number.isNaN(runAt.getTime())) return "";
    return runAt.toISOString();
  }
  if (schedule.type === "interval") {
    const minutes = Number(schedule.intervalMinutes || 0);
    if (!Number.isFinite(minutes) || minutes <= 0) return "";
    const intervalMs = minutes * 60_000;
    const base = fromDate instanceof Date ? fromDate : new Date(fromDate);
    let next = new Date(base.getTime() + intervalMs);
    if (next < now) {
      const diff = now.getTime() - base.getTime();
      const steps = Math.ceil(diff / intervalMs);
      next = new Date(base.getTime() + steps * intervalMs);
    }
    return next.toISOString();
  }
  if (schedule.type === "daily") {
    const time = parseTimeOfDay(schedule.timeOfDay);
    if (!time) return "";
    const candidate = new Date();
    candidate.setHours(time.hour, time.minute, 0, 0);
    if (candidate <= now) {
      candidate.setDate(candidate.getDate() + 1);
    }
    return candidate.toISOString();
  }
  if (schedule.type === "weekly") {
    const time = parseTimeOfDay(schedule.timeOfDay);
    if (!time) return "";
    const dayValue = String(schedule.dayOfWeek || "").trim().toLowerCase();
    const dayMap = {
      sunday: 0,
      monday: 1,
      tuesday: 2,
      wednesday: 3,
      thursday: 4,
      friday: 5,
      saturday: 6
    };
    const targetDay = Number.isFinite(Number(dayValue))
      ? Math.min(6, Math.max(0, Number(dayValue)))
      : (dayMap[dayValue] ?? null);
    if (targetDay === null || targetDay === undefined) return "";
    const candidate = new Date();
    candidate.setHours(time.hour, time.minute, 0, 0);
    const currentDay = candidate.getDay();
    let offset = targetDay - currentDay;
    if (offset < 0 || (offset === 0 && candidate <= now)) offset += 7;
    candidate.setDate(candidate.getDate() + offset);
    return candidate.toISOString();
  }
  return "";
}

function mapRow(row) {
  if (!row) return null;
  return {
    id: row.id,
    ownerId: row.owner_id || "local",
    title: row.title || "",
    prompt: row.prompt || "",
    schedule: safeJsonParse(row.schedule_json, null),
    status: row.status || "paused",
    lastRunAt: row.last_run_at || null,
    nextRunAt: row.next_run_at || null,
    lastRunStatus: row.last_run_status || null,
    lastRunOutput: row.last_run_output || null,
    lastRunError: row.last_run_error || null,
    notificationChannels: safeJsonParse(row.notification_channels_json, DEFAULT_TASK_CHANNELS),
    notificationTargets: safeJsonParse(row.notification_targets_json, {}),
    createdAt: row.created_at || null,
    updatedAt: row.updated_at || null
  };
}

export function listAssistantTasks(ownerId = "local", { status = "", limit = 50, offset = 0 } = {}) {
  const db = getDb();
  const where = ["owner_id = ?"];
  const params = [ownerId];
  if (status) {
    where.push("status = ?");
    params.push(status);
  }
  const sql = `
    SELECT * FROM assistant_tasks
    WHERE ${where.join(" AND ")}
    ORDER BY created_at DESC
    LIMIT ? OFFSET ?
  `;
  const rows = db.prepare(sql).all(...params, Number(limit || 50), Number(offset || 0));
  return rows.map(mapRow).filter(Boolean);
}

export function getAssistantTask(ownerId = "local", id) {
  if (!id) return null;
  const db = getDb();
  const row = db.prepare("SELECT * FROM assistant_tasks WHERE owner_id = ? AND id = ?").get(ownerId, id);
  return mapRow(row);
}

export function findAssistantTaskByTitle(ownerId = "local", title = "") {
  const trimmed = String(title || "").trim();
  if (!trimmed) return null;
  const db = getDb();
  const row = db.prepare(
    "SELECT * FROM assistant_tasks WHERE owner_id = ? AND title = ? ORDER BY created_at DESC LIMIT 1"
  ).get(ownerId, trimmed);
  return mapRow(row);
}

export function listDueAssistantTasks({ limit = 10 } = {}) {
  const db = getDb();
  const now = nowIso();
  const rows = db.prepare(
    `SELECT * FROM assistant_tasks
     WHERE status = 'active'
       AND next_run_at IS NOT NULL
       AND next_run_at <= ?
     ORDER BY next_run_at ASC
     LIMIT ?`
  ).all(now, Number(limit || 10));
  return rows.map(mapRow).filter(Boolean);
}

export function createAssistantTask(ownerId = "local", input = {}) {
  const db = getDb();
  const title = String(input.title || "").trim();
  const prompt = String(input.prompt || "").trim();
  if (!title) throw new Error("task_title_required");
  if (!prompt) throw new Error("task_prompt_required");

  const schedule = normalizeSchedule(input.schedule, null);
  const now = nowIso();
  const statusRaw = String(input.status || "").trim().toLowerCase();
  const status = ["active", "paused", "completed"].includes(statusRaw)
    ? statusRaw
    : (schedule ? "active" : "paused");

  const nextRunAt = status === "active" ? computeNextRunAt(schedule, new Date()) : "";
  const id = makeId();
  const channels = normalizeChannels(input.notificationChannels || input.notification_channels, DEFAULT_TASK_CHANNELS);
  const targets = normalizeTargets(input.notificationTargets || input.notification_targets);

  db.prepare(
    `INSERT INTO assistant_tasks
      (id, owner_id, title, prompt, schedule_json, status, last_run_at, next_run_at, last_run_status, last_run_output, last_run_error,
       notification_channels_json, notification_targets_json, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(
    id,
    ownerId,
    title,
    prompt,
    schedule ? JSON.stringify(schedule) : "",
    status,
    null,
    nextRunAt || null,
    null,
    null,
    null,
    JSON.stringify(channels),
    JSON.stringify(targets),
    now,
    now
  );

  return getAssistantTask(ownerId, id);
}

export function updateAssistantTask(ownerId = "local", id, patch = {}) {
  const db = getDb();
  const current = getAssistantTask(ownerId, id);
  if (!current) return null;
  const next = {
    title: current.title,
    prompt: current.prompt,
    schedule: current.schedule,
    status: current.status,
    notificationChannels: current.notificationChannels,
    notificationTargets: current.notificationTargets
  };

  if (typeof patch.title === "string") {
    const trimmed = patch.title.trim();
    if (trimmed) next.title = trimmed;
  }
  if (typeof patch.prompt === "string") {
    const trimmed = patch.prompt.trim();
    if (trimmed) next.prompt = trimmed;
  }
  if (patch.schedule) {
    const schedule = normalizeSchedule(patch.schedule, next.schedule);
    next.schedule = schedule;
  }
  if (patch.status) {
    const status = String(patch.status || "").trim().toLowerCase();
    if (["active", "paused", "completed"].includes(status)) {
      next.status = status;
    }
  }
  if (patch.notificationChannels || patch.notification_channels) {
    next.notificationChannels = normalizeChannels(patch.notificationChannels || patch.notification_channels, next.notificationChannels);
  }
  if (patch.notificationTargets || patch.notification_targets) {
    next.notificationTargets = {
      ...next.notificationTargets,
      ...normalizeTargets(patch.notificationTargets || patch.notification_targets)
    };
  }

  let nextRunAt = current.nextRunAt || "";
  if (next.status === "active") {
    nextRunAt = computeNextRunAt(next.schedule, current.lastRunAt ? new Date(current.lastRunAt) : new Date()) || "";
  } else {
    nextRunAt = "";
  }

  const now = nowIso();
  db.prepare(
    `UPDATE assistant_tasks SET
      title = ?,
      prompt = ?,
      schedule_json = ?,
      status = ?,
      next_run_at = ?,
      notification_channels_json = ?,
      notification_targets_json = ?,
      updated_at = ?
     WHERE owner_id = ? AND id = ?`
  ).run(
    next.title,
    next.prompt,
    next.schedule ? JSON.stringify(next.schedule) : "",
    next.status,
    nextRunAt || null,
    JSON.stringify(next.notificationChannels || DEFAULT_TASK_CHANNELS),
    JSON.stringify(next.notificationTargets || {}),
    now,
    ownerId,
    id
  );

  return getAssistantTask(ownerId, id);
}

export function recordAssistantTaskRun(id, {
  lastRunAt,
  lastRunStatus,
  lastRunOutput,
  lastRunError,
  nextRunAt,
  status
} = {}) {
  const db = getDb();
  const now = nowIso();
  db.prepare(
    `UPDATE assistant_tasks SET
      last_run_at = ?,
      last_run_status = ?,
      last_run_output = ?,
      last_run_error = ?,
      next_run_at = ?,
      status = ?,
      updated_at = ?
     WHERE id = ?`
  ).run(
    lastRunAt || null,
    lastRunStatus || null,
    lastRunOutput || null,
    lastRunError || null,
    nextRunAt || null,
    status || "active",
    now,
    id
  );
  const row = db.prepare("SELECT * FROM assistant_tasks WHERE id = ?").get(id);
  return mapRow(row);
}
