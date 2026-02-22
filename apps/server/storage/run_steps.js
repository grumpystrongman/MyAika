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
    moduleRunId: row.module_run_id,
    stepIndex: row.step_index,
    stepType: row.step_type || "",
    status: row.status || "",
    request: safeJsonParse(row.request_json, {}),
    response: safeJsonParse(row.response_json, {}),
    startedAt: row.started_at || null,
    endedAt: row.ended_at || null
  };
}

export function createRunStep({ moduleRunId, stepIndex = 0, stepType = "", status = "running", request = {} } = {}) {
  const db = getDb();
  const id = makeId();
  const startedAt = nowIso();
  db.prepare(
    `INSERT INTO run_steps (id, module_run_id, step_index, step_type, status, request_json, response_json, started_at, ended_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(
    id,
    moduleRunId,
    stepIndex,
    stepType,
    status,
    JSON.stringify(request || {}),
    JSON.stringify({}),
    startedAt,
    null
  );
  return getRunStep(id);
}

export function updateRunStep(id, updates = {}) {
  if (!id) return null;
  const db = getDb();
  const current = getRunStep(id);
  if (!current) return null;
  const next = {
    status: updates.status ?? current.status,
    response: updates.response ?? current.response,
    endedAt: updates.endedAt ?? current.endedAt
  };
  db.prepare(
    `UPDATE run_steps SET status = ?, response_json = ?, ended_at = ? WHERE id = ?`
  ).run(
    String(next.status || ""),
    JSON.stringify(next.response || {}),
    next.endedAt,
    id
  );
  return getRunStep(id);
}

export function getRunStep(id) {
  const db = getDb();
  const row = db.prepare("SELECT * FROM run_steps WHERE id = ?").get(id);
  return mapRow(row);
}

export function listRunSteps(moduleRunId) {
  const db = getDb();
  const rows = db.prepare(
    "SELECT * FROM run_steps WHERE module_run_id = ? ORDER BY step_index ASC"
  ).all(moduleRunId);
  return rows.map(mapRow).filter(Boolean);
}
