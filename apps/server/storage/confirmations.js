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
    runId: row.run_id,
    actionType: row.action_type || "",
    summary: row.summary || "",
    details: safeJsonParse(row.details_json, {}),
    status: row.status || "pending",
    approvalId: row.approval_id || "",
    requestedAt: row.requested_at || null,
    resolvedAt: row.resolved_at || null
  };
}

export function createConfirmation({
  userId = "local",
  runId = "",
  actionType = "",
  summary = "",
  details = {},
  status = "pending",
  approvalId = ""
} = {}) {
  const db = getDb();
  const id = makeId();
  const requestedAt = nowIso();
  db.prepare(
    `INSERT INTO confirmations (id, user_id, run_id, action_type, summary, details_json, status, approval_id, requested_at, resolved_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(
    id,
    userId,
    runId,
    actionType,
    summary,
    JSON.stringify(details || {}),
    status,
    approvalId,
    requestedAt,
    null
  );
  return getConfirmation(id);
}

export function updateConfirmation(id, updates = {}) {
  if (!id) return null;
  const db = getDb();
  const current = getConfirmation(id);
  if (!current) return null;
  const next = {
    status: updates.status ?? current.status,
    resolvedAt: updates.resolvedAt ?? current.resolvedAt
  };
  db.prepare(
    `UPDATE confirmations SET status = ?, resolved_at = ? WHERE id = ?`
  ).run(
    String(next.status || ""),
    next.resolvedAt,
    id
  );
  return getConfirmation(id);
}

export function getConfirmation(id) {
  const db = getDb();
  const row = db.prepare("SELECT * FROM confirmations WHERE id = ?").get(id);
  return mapRow(row);
}

export function listConfirmations({ userId = "local", status = "", limit = 50 } = {}) {
  const db = getDb();
  const where = ["user_id = ?"];
  const params = [userId];
  if (status) {
    where.push("status = ?");
    params.push(status);
  }
  const rows = db.prepare(
    `SELECT * FROM confirmations WHERE ${where.join(" AND ")} ORDER BY requested_at DESC LIMIT ?`
  ).all(...params, Number(limit || 50));
  return rows.map(mapRow).filter(Boolean);
}
