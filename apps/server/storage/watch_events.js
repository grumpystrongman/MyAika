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
    watchItemId: row.watch_item_id,
    observedAt: row.observed_at || null,
    rawInput: safeJsonParse(row.raw_input_json, {}),
    derivedSignal: safeJsonParse(row.derived_signal_json, {}),
    severity: row.severity || "low",
    summary: row.summary || "",
    diff: safeJsonParse(row.diff_json, {})
  };
}

export function createWatchEvent({
  watchItemId,
  observedAt = null,
  rawInput = {},
  derivedSignal = {},
  severity = "low",
  summary = "",
  diff = {}
} = {}) {
  const db = getDb();
  const id = makeId();
  const observed = observedAt || nowIso();
  db.prepare(
    `INSERT INTO watch_events (id, watch_item_id, observed_at, raw_input_json, derived_signal_json, severity, summary, diff_json)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(
    id,
    watchItemId,
    observed,
    JSON.stringify(rawInput || {}),
    JSON.stringify(derivedSignal || {}),
    severity,
    summary,
    JSON.stringify(diff || {})
  );
  return getWatchEvent(id);
}

export function getWatchEvent(id) {
  const db = getDb();
  const row = db.prepare("SELECT * FROM watch_events WHERE id = ?").get(id);
  return mapRow(row);
}

export function listWatchEvents({ watchItemId, limit = 50 } = {}) {
  const db = getDb();
  if (!watchItemId) return [];
  const rows = db.prepare(
    `SELECT * FROM watch_events WHERE watch_item_id = ? ORDER BY observed_at DESC LIMIT ?`
  ).all(watchItemId, Number(limit || 50));
  return rows.map(mapRow).filter(Boolean);
}
