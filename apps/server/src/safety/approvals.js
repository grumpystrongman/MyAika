import crypto from "node:crypto";
import { getDb } from "../../storage/db.js";
import { nowIso } from "../../storage/utils.js";
import { notifyApprovalCreated } from "../notifications/approvalNotifications.js";

function makeId() {
  return crypto.randomBytes(8).toString("hex");
}

export function createSafetyApproval({
  actionType,
  summary,
  payloadRedacted,
  createdBy = "user",
  reason = "",
  status = "pending"
} = {}) {
  const db = getDb();
  const id = makeId();
  const createdAt = nowIso();
  db.prepare(
    `INSERT INTO approvals (id, tool, request_json, preview, status, created_at, resolved_at, token, approved_by, approved_at, executed_at,
      created_by, action_type, summary, payload_redacted_json, decided_at, decided_by, reason)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(
    id,
    actionType || "",
    JSON.stringify({}),
    summary || "",
    status,
    createdAt,
    null,
    null,
    null,
    null,
    null,
    createdBy,
    actionType || "",
    summary || "",
    JSON.stringify(payloadRedacted || {}),
    null,
    null,
    reason || ""
  );
  const approval = { id, status, createdAt, toolName: actionType, humanSummary: summary || "" };
  if (status === "pending") {
    void notifyApprovalCreated(approval);
  }
  return approval;
}

export function listSafetyApprovals({ status } = {}) {
  const db = getDb();
  const rows = status
    ? db.prepare("SELECT * FROM approvals WHERE status = ? ORDER BY created_at DESC").all(status)
    : db.prepare("SELECT * FROM approvals ORDER BY created_at DESC").all();
  return rows.map(row => ({
    id: row.id,
    status: row.status,
    actionType: row.action_type || row.tool,
    summary: row.summary || row.preview || "",
    payload: safeParse(row.payload_redacted_json, {}),
    createdAt: row.created_at,
    createdBy: row.created_by || "",
    decidedAt: row.decided_at || row.approved_at || row.resolved_at || null,
    decidedBy: row.decided_by || row.approved_by || null,
    reason: row.reason || ""
  }));
}

export function getSafetyApproval(id) {
  const db = getDb();
  const row = db.prepare("SELECT * FROM approvals WHERE id = ?").get(id);
  if (!row) return null;
  return {
    id: row.id,
    status: row.status,
    actionType: row.action_type || row.tool,
    summary: row.summary || row.preview || "",
    payload: safeParse(row.payload_redacted_json, {}),
    createdAt: row.created_at,
    createdBy: row.created_by || "",
    decidedAt: row.decided_at || row.approved_at || row.resolved_at || null,
    decidedBy: row.decided_by || row.approved_by || null,
    reason: row.reason || ""
  };
}

export function approveSafetyApproval(id, decidedBy = "admin") {
  const db = getDb();
  const decidedAt = nowIso();
  db.prepare(
    `UPDATE approvals SET status = ?, decided_at = ?, decided_by = ? WHERE id = ?`
  ).run("approved", decidedAt, decidedBy, id);
  return getSafetyApproval(id);
}

export function rejectSafetyApproval(id, decidedBy = "admin", reason = "") {
  const db = getDb();
  const decidedAt = nowIso();
  db.prepare(
    `UPDATE approvals SET status = ?, decided_at = ?, decided_by = ?, reason = ? WHERE id = ?`
  ).run("rejected", decidedAt, decidedBy, reason || "", id);
  return getSafetyApproval(id);
}

function safeParse(value, fallback) {
  try {
    return value ? JSON.parse(value) : fallback;
  } catch {
    return fallback;
  }
}
