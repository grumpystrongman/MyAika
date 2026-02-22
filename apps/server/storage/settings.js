import { getDb } from "./db.js";
import { nowIso, safeJsonParse } from "./utils.js";

const DEFAULT_SETTINGS = {
  digestTime: "07:30",
  pulseTime: "12:30",
  weeklyTime: "16:30",
  noiseBudgetPerDay: 3,
  confirmationPolicy: "always_confirm_external",
  modeFlags: {
    no_integrations: true,
    focus_mode: false,
    high_alert_mode: false,
    travel_mode: false,
    writing_mode: false,
    executive_brief_mode: false,
    weekly_day: "Friday"
  }
};

function mapRow(row) {
  if (!row) return null;
  return {
    userId: row.user_id,
    digestTime: row.digest_time || DEFAULT_SETTINGS.digestTime,
    pulseTime: row.pulse_time || DEFAULT_SETTINGS.pulseTime,
    weeklyTime: row.weekly_time || DEFAULT_SETTINGS.weeklyTime,
    noiseBudgetPerDay: Number.isFinite(row.noise_budget_per_day)
      ? row.noise_budget_per_day
      : DEFAULT_SETTINGS.noiseBudgetPerDay,
    confirmationPolicy: row.confirmation_policy || DEFAULT_SETTINGS.confirmationPolicy,
    modeFlags: safeJsonParse(row.mode_flags_json, DEFAULT_SETTINGS.modeFlags),
    createdAt: row.created_at || null,
    updatedAt: row.updated_at || null
  };
}

export function getDefaultSettings() {
  return JSON.parse(JSON.stringify(DEFAULT_SETTINGS));
}

export function getSettings(userId = "local") {
  const db = getDb();
  const row = db.prepare("SELECT * FROM settings WHERE user_id = ?").get(userId);
  if (!row) return { userId, ...getDefaultSettings() };
  return mapRow(row);
}

export function upsertSettings(userId = "local", input = {}) {
  const db = getDb();
  const current = getSettings(userId);
  const next = {
    digestTime: input.digestTime ?? input.digest_time ?? current.digestTime,
    pulseTime: input.pulseTime ?? input.pulse_time ?? current.pulseTime,
    weeklyTime: input.weeklyTime ?? input.weekly_time ?? current.weeklyTime,
    noiseBudgetPerDay: Number.isFinite(input.noiseBudgetPerDay)
      ? input.noiseBudgetPerDay
      : (Number.isFinite(input.noise_budget_per_day) ? input.noise_budget_per_day : current.noiseBudgetPerDay),
    confirmationPolicy: input.confirmationPolicy ?? input.confirmation_policy ?? current.confirmationPolicy,
    modeFlags: {
      ...(current.modeFlags || {}),
      ...(input.modeFlags || input.mode_flags || {})
    }
  };
  const now = nowIso();
  const exists = db.prepare("SELECT 1 FROM settings WHERE user_id = ?").get(userId);
  if (exists) {
    db.prepare(
      `UPDATE settings
       SET digest_time = ?, pulse_time = ?, weekly_time = ?, noise_budget_per_day = ?, confirmation_policy = ?,
           mode_flags_json = ?, updated_at = ?
       WHERE user_id = ?`
    ).run(
      String(next.digestTime || ""),
      String(next.pulseTime || ""),
      String(next.weeklyTime || ""),
      Number(next.noiseBudgetPerDay || 0),
      String(next.confirmationPolicy || ""),
      JSON.stringify(next.modeFlags || {}),
      now,
      userId
    );
  } else {
    db.prepare(
      `INSERT INTO settings (user_id, digest_time, pulse_time, weekly_time, noise_budget_per_day, confirmation_policy, mode_flags_json, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(
      userId,
      String(next.digestTime || ""),
      String(next.pulseTime || ""),
      String(next.weeklyTime || ""),
      Number(next.noiseBudgetPerDay || 0),
      String(next.confirmationPolicy || ""),
      JSON.stringify(next.modeFlags || {}),
      now,
      now
    );
  }
  return getSettings(userId);
}

export function setModeFlag(userId = "local", flag, value) {
  if (!flag) return getSettings(userId);
  const current = getSettings(userId);
  const nextFlags = { ...(current.modeFlags || {}) };
  nextFlags[String(flag)] = value;
  return upsertSettings(userId, { modeFlags: nextFlags });
}
