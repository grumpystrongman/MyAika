import crypto from "node:crypto";
import { getDb } from "./db.js";
import { nowIso, safeJsonParse } from "./utils.js";

function makeId() {
  return crypto.randomBytes(8).toString("hex");
}

function mapRow(row) {
  if (!row) return null;
  return {
    id: row.id,
    userId: row.user_id,
    type: row.type || "",
    config: safeJsonParse(row.config_json, {}),
    cadence: row.cadence || "",
    thresholds: safeJsonParse(row.thresholds_json, {}),
    enabled: Boolean(row.enabled),
    createdAt: row.created_at || null,
    updatedAt: row.updated_at || null,
    lastObservedAt: row.last_observed_at || null
  };
}

export function createWatchItem({ userId = "local", type = "", config = {}, cadence = "daily", thresholds = {}, enabled = true } = {}) {
  const db = getDb();
  const id = makeId();
  const now = nowIso();
  db.prepare(
    `INSERT INTO watch_items (id, user_id, type, config_json, cadence, thresholds_json, enabled, created_at, updated_at, last_observed_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(
    id,
    userId,
    type,
    JSON.stringify(config || {}),
    cadence,
    JSON.stringify(thresholds || {}),
    enabled ? 1 : 0,
    now,
    now,
    null
  );
  return getWatchItem(id);
}

export function updateWatchItem(id, updates = {}) {
  if (!id) return null;
  const db = getDb();
  const current = getWatchItem(id);
  if (!current) return null;
  const next = {
    type: updates.type ?? current.type,
    config: updates.config ?? current.config,
    cadence: updates.cadence ?? current.cadence,
    thresholds: updates.thresholds ?? current.thresholds,
    enabled: updates.enabled ?? current.enabled,
    lastObservedAt: updates.lastObservedAt ?? current.lastObservedAt
  };
  db.prepare(
    `UPDATE watch_items SET type = ?, config_json = ?, cadence = ?, thresholds_json = ?, enabled = ?, updated_at = ?, last_observed_at = ? WHERE id = ?`
  ).run(
    String(next.type || ""),
    JSON.stringify(next.config || {}),
    String(next.cadence || ""),
    JSON.stringify(next.thresholds || {}),
    next.enabled ? 1 : 0,
    nowIso(),
    next.lastObservedAt,
    id
  );
  return getWatchItem(id);
}

export function getWatchItem(id) {
  const db = getDb();
  const row = db.prepare("SELECT * FROM watch_items WHERE id = ?").get(id);
  return mapRow(row);
}

export function listWatchItems({ userId = "local", enabledOnly = false, limit = 200 } = {}) {
  const db = getDb();
  const where = ["user_id = ?"];
  const params = [userId];
  if (enabledOnly) {
    where.push("enabled = 1");
  }
  const rows = db.prepare(
    `SELECT * FROM watch_items WHERE ${where.join(" AND ")} ORDER BY created_at DESC LIMIT ?`
  ).all(...params, Number(limit || 200));
  return rows.map(mapRow).filter(Boolean);
}
