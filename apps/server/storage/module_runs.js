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
    moduleId: row.module_id,
    channel: row.channel || "",
    status: row.status || "",
    inputPayload: safeJsonParse(row.input_payload_json, {}),
    outputPayload: safeJsonParse(row.output_payload_json, {}),
    createdAt: row.created_at || null,
    completedAt: row.completed_at || null
  };
}

export function createModuleRun({ userId = "local", moduleId = "", channel = "", status = "running", inputPayload = {} } = {}) {
  const db = getDb();
  const id = makeId();
  const createdAt = nowIso();
  db.prepare(
    `INSERT INTO module_runs (id, user_id, module_id, channel, status, input_payload_json, output_payload_json, created_at, completed_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(
    id,
    userId,
    moduleId,
    channel,
    status,
    JSON.stringify(inputPayload || {}),
    JSON.stringify({}),
    createdAt,
    null
  );
  return getModuleRun(id);
}

export function updateModuleRun(id, updates = {}) {
  if (!id) return null;
  const db = getDb();
  const current = getModuleRun(id);
  if (!current) return null;
  const next = {
    status: updates.status ?? current.status,
    outputPayload: updates.outputPayload ?? current.outputPayload,
    completedAt: updates.completedAt ?? current.completedAt
  };
  db.prepare(
    `UPDATE module_runs SET status = ?, output_payload_json = ?, completed_at = ? WHERE id = ?`
  ).run(
    String(next.status || ""),
    JSON.stringify(next.outputPayload || {}),
    next.completedAt,
    id
  );
  return getModuleRun(id);
}

export function getModuleRun(id) {
  const db = getDb();
  const row = db.prepare("SELECT * FROM module_runs WHERE id = ?").get(id);
  return mapRow(row);
}

export function listModuleRuns({ userId = "local", limit = 50 } = {}) {
  const db = getDb();
  const rows = db.prepare(
    "SELECT * FROM module_runs WHERE user_id = ? ORDER BY created_at DESC LIMIT ?"
  ).all(userId, Number(limit || 50));
  return rows.map(mapRow).filter(Boolean);
}
