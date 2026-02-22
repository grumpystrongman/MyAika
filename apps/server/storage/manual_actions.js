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
    sourceRunId: row.source_run_id,
    priority: row.priority || "medium",
    title: row.title || "",
    instructions: row.instructions || "",
    copyReadyPayload: safeJsonParse(row.copy_ready_payload_json, {}),
    status: row.status || "pending",
    dueAt: row.due_at || null,
    createdAt: row.created_at || null,
    completedAt: row.completed_at || null
  };
}

export function createManualAction({
  userId = "local",
  sourceRunId = "",
  priority = "medium",
  title = "",
  instructions = "",
  copyReadyPayload = {},
  status = "pending",
  dueAt = null
} = {}) {
  const db = getDb();
  const id = makeId();
  const createdAt = nowIso();
  db.prepare(
    `INSERT INTO manual_action_queue
      (id, user_id, source_run_id, priority, title, instructions, copy_ready_payload_json, status, due_at, created_at, completed_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(
    id,
    userId,
    sourceRunId,
    priority,
    title,
    instructions,
    JSON.stringify(copyReadyPayload || {}),
    status,
    dueAt,
    createdAt,
    null
  );
  return getManualAction(id);
}

export function updateManualAction(id, updates = {}) {
  if (!id) return null;
  const db = getDb();
  const current = getManualAction(id);
  if (!current) return null;
  const next = {
    status: updates.status ?? current.status,
    completedAt: updates.completedAt ?? current.completedAt
  };
  db.prepare(
    `UPDATE manual_action_queue SET status = ?, completed_at = ? WHERE id = ?`
  ).run(
    String(next.status || ""),
    next.completedAt,
    id
  );
  return getManualAction(id);
}

export function getManualAction(id) {
  const db = getDb();
  const row = db.prepare("SELECT * FROM manual_action_queue WHERE id = ?").get(id);
  return mapRow(row);
}

export function listManualActions({ userId = "local", status = "", limit = 50 } = {}) {
  const db = getDb();
  const where = ["user_id = ?"];
  const params = [userId];
  if (status) {
    where.push("status = ?");
    params.push(status);
  }
  const rows = db.prepare(
    `SELECT * FROM manual_action_queue WHERE ${where.join(" AND ")} ORDER BY created_at DESC LIMIT ?`
  ).all(...params, Number(limit || 50));
  return rows.map(mapRow).filter(Boolean);
}
