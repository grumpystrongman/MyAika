import crypto from "node:crypto";
import { getDb } from "./db.js";
import { nowIso } from "./utils.js";

function makeId() {
  return crypto.randomBytes(8).toString("hex");
}

function makeToken() {
  return crypto.randomBytes(16).toString("hex");
}

export function createApprovalRecord({ tool, request, preview, actionType, summary, payloadRedacted, createdBy, reason } = {}) {
  const db = getDb();
  const id = makeId();
  const createdAt = nowIso();
  db.prepare(
    `INSERT INTO approvals (id, tool, request_json, preview, status, created_at, resolved_at, token, approved_by, approved_at, executed_at,
      created_by, action_type, summary, payload_redacted_json, decided_at, decided_by, reason)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(
    id,
    tool,
    JSON.stringify(request || {}),
    preview || "",
    "pending",
    createdAt,
    null,
    null,
    null,
    null,
    null,
    createdBy || null,
    actionType || null,
    summary || null,
    JSON.stringify(payloadRedacted || null),
    null,
    null,
    reason || null
  );
  return { id, status: "pending", createdAt };
}

export function listApprovalsRecord() {
  const db = getDb();
  return db.prepare(`SELECT * FROM approvals ORDER BY created_at DESC`).all();
}

export function getApprovalRecord(id) {
  const db = getDb();
  return db.prepare(`SELECT * FROM approvals WHERE id = ?`).get(id) || null;
}

export function approveApprovalRecord(id, approvedBy = "user") {
  const db = getDb();
  const token = makeToken();
  const approvedAt = nowIso();
  db.prepare(
    `UPDATE approvals SET status = ?, approved_by = ?, approved_at = ?, token = ? WHERE id = ?`
  ).run("approved", approvedBy, approvedAt, token, id);
  return getApprovalRecord(id);
}

export function markApprovalExecuted(id) {
  const db = getDb();
  const executedAt = nowIso();
  db.prepare(
    `UPDATE approvals SET status = ?, executed_at = ?, resolved_at = ? WHERE id = ?`
  ).run("executed", executedAt, executedAt, id);
  return getApprovalRecord(id);
}

export function denyApprovalRecord(id, deniedBy = "user") {
  const db = getDb();
  const resolvedAt = nowIso();
  db.prepare(
    `UPDATE approvals SET status = ?, approved_by = ?, resolved_at = ? WHERE id = ?`
  ).run("denied", deniedBy, resolvedAt, id);
  return getApprovalRecord(id);
}

export function cleanupStaleApprovals({ olderThanDays = 7, decidedBy = "system", reason = "stale" } = {}) {
  const days = Number(olderThanDays);
  if (!Number.isFinite(days) || days <= 0) return { updated: 0, cutoff: null };
  const cutoff = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();
  const decidedAt = nowIso();
  const db = getDb();
  const result = db.prepare(
    `UPDATE approvals
       SET status = ?, resolved_at = ?, decided_at = ?, decided_by = ?, reason = ?
     WHERE status = ? AND created_at < ?`
  ).run("denied", decidedAt, decidedAt, decidedBy, reason, "pending", cutoff);
  return { updated: result.changes || 0, cutoff };
}
