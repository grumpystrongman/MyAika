import crypto from "node:crypto";
import { getDb } from "./db.js";
import { nowIso, safeJsonParse } from "./utils.js";

function makeId() {
  return crypto.randomBytes(8).toString("hex");
}

function normalizeStatus(value, fallback = "pending") {
  const status = String(value || "").trim().toLowerCase();
  if (["pending", "approved", "rejected", "implemented"].includes(status)) return status;
  return fallback;
}

function mapRow(row) {
  if (!row) return null;
  return {
    id: row.id,
    ownerId: row.owner_id || "local",
    title: row.title || "",
    summary: row.summary || "",
    details: safeJsonParse(row.details_json, {}),
    status: row.status || "pending",
    approvalId: row.approval_id || null,
    decidedAt: row.decided_at || null,
    decidedBy: row.decided_by || null,
    createdAt: row.created_at || null,
    updatedAt: row.updated_at || null
  };
}

export function listAssistantProposals(ownerId = "local", { status = "", limit = 50, offset = 0 } = {}) {
  const db = getDb();
  const where = ["owner_id = ?"];
  const params = [ownerId];
  if (status) {
    where.push("status = ?");
    params.push(status);
  }
  const sql = `
    SELECT * FROM assistant_change_proposals
    WHERE ${where.join(" AND ")}
    ORDER BY created_at DESC
    LIMIT ? OFFSET ?
  `;
  const rows = db.prepare(sql).all(...params, Number(limit || 50), Number(offset || 0));
  return rows.map(mapRow).filter(Boolean);
}

export function getAssistantProposal(ownerId = "local", id) {
  if (!id) return null;
  const db = getDb();
  const row = db.prepare("SELECT * FROM assistant_change_proposals WHERE owner_id = ? AND id = ?").get(ownerId, id);
  return mapRow(row);
}

export function createAssistantProposal(ownerId = "local", { title, summary = "", details = {}, status = "pending", approvalId = "" } = {}) {
  const db = getDb();
  const finalTitle = String(title || "").trim();
  if (!finalTitle) throw new Error("proposal_title_required");
  const id = makeId();
  const now = nowIso();
  const finalStatus = normalizeStatus(status, "pending");
  const payload = details && typeof details === "object" ? details : {};
  db.prepare(
    `INSERT INTO assistant_change_proposals
      (id, owner_id, title, summary, details_json, status, approval_id, decided_at, decided_by, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(
    id,
    ownerId,
    finalTitle,
    String(summary || "").trim(),
    JSON.stringify(payload),
    finalStatus,
    approvalId || "",
    null,
    null,
    now,
    now
  );
  return getAssistantProposal(ownerId, id);
}

export function updateAssistantProposal(ownerId = "local", id, patch = {}) {
  const db = getDb();
  const current = getAssistantProposal(ownerId, id);
  if (!current) return null;
  const next = {
    title: current.title,
    summary: current.summary,
    details: current.details,
    status: current.status,
    approvalId: current.approvalId,
    decidedAt: current.decidedAt,
    decidedBy: current.decidedBy
  };
  if (typeof patch.title === "string") {
    const trimmed = patch.title.trim();
    if (trimmed) next.title = trimmed;
  }
  if (typeof patch.summary === "string") {
    next.summary = patch.summary.trim();
  }
  if (patch.details && typeof patch.details === "object") {
    next.details = { ...next.details, ...patch.details };
  }
  if (patch.status) {
    next.status = normalizeStatus(patch.status, next.status);
  }
  if (patch.approvalId || patch.approval_id) {
    next.approvalId = String(patch.approvalId || patch.approval_id || "").trim();
  }
  if (patch.decidedAt || patch.decided_at) {
    next.decidedAt = String(patch.decidedAt || patch.decided_at || "").trim();
  }
  if (patch.decidedBy || patch.decided_by) {
    next.decidedBy = String(patch.decidedBy || patch.decided_by || "").trim();
  }

  const now = nowIso();
  db.prepare(
    `UPDATE assistant_change_proposals SET
      title = ?,
      summary = ?,
      details_json = ?,
      status = ?,
      approval_id = ?,
      decided_at = ?,
      decided_by = ?,
      updated_at = ?
     WHERE owner_id = ? AND id = ?`
  ).run(
    next.title,
    next.summary,
    JSON.stringify(next.details || {}),
    next.status,
    next.approvalId || "",
    next.decidedAt || null,
    next.decidedBy || null,
    now,
    ownerId,
    id
  );
  return getAssistantProposal(ownerId, id);
}
