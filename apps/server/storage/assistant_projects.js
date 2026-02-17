import crypto from "node:crypto";
import { getDb } from "./db.js";
import { nowIso, safeJsonParse } from "./utils.js";

function makeId() {
  return crypto.randomBytes(8).toString("hex");
}

function normalizeStatus(value, fallback = "active") {
  const status = String(value || "").trim().toLowerCase();
  if (["active", "paused", "archived"].includes(status)) return status;
  return fallback;
}

function mapRow(row) {
  if (!row) return null;
  return {
    id: row.id,
    ownerId: row.owner_id || "local",
    name: row.name || "",
    description: row.description || "",
    status: row.status || "active",
    metadata: safeJsonParse(row.metadata_json, {}),
    createdAt: row.created_at || null,
    updatedAt: row.updated_at || null
  };
}

export function listAssistantProjects(ownerId = "local", { status = "", limit = 50, offset = 0, search = "" } = {}) {
  const db = getDb();
  const where = ["owner_id = ?"];
  const params = [ownerId];
  if (status) {
    where.push("status = ?");
    params.push(status);
  }
  if (search) {
    where.push("name LIKE ?");
    params.push(`%${search}%`);
  }
  const sql = `
    SELECT * FROM assistant_projects
    WHERE ${where.join(" AND ")}
    ORDER BY created_at DESC
    LIMIT ? OFFSET ?
  `;
  const rows = db.prepare(sql).all(...params, Number(limit || 50), Number(offset || 0));
  return rows.map(mapRow).filter(Boolean);
}

export function getAssistantProject(ownerId = "local", id) {
  if (!id) return null;
  const db = getDb();
  const row = db.prepare("SELECT * FROM assistant_projects WHERE owner_id = ? AND id = ?").get(ownerId, id);
  return mapRow(row);
}

export function createAssistantProject(ownerId = "local", { name, description = "", status = "active", metadata } = {}) {
  const db = getDb();
  const id = makeId();
  const now = nowIso();
  const finalName = String(name || "").trim();
  if (!finalName) throw new Error("project_name_required");
  const finalStatus = normalizeStatus(status, "active");
  const meta = metadata && typeof metadata === "object" ? metadata : {};
  db.prepare(
    `INSERT INTO assistant_projects (id, owner_id, name, description, status, metadata_json, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(id, ownerId, finalName, String(description || ""), finalStatus, JSON.stringify(meta), now, now);
  return getAssistantProject(ownerId, id);
}

export function updateAssistantProject(ownerId = "local", id, patch = {}) {
  const current = getAssistantProject(ownerId, id);
  if (!current) return null;
  const next = {
    name: current.name,
    description: current.description,
    status: current.status,
    metadata: current.metadata
  };
  if (typeof patch.name === "string") {
    const trimmed = patch.name.trim();
    if (trimmed) next.name = trimmed;
  }
  if (typeof patch.description === "string") {
    next.description = patch.description.trim();
  }
  if (patch.status) {
    next.status = normalizeStatus(patch.status, next.status);
  }
  if (patch.metadata && typeof patch.metadata === "object") {
    next.metadata = { ...next.metadata, ...patch.metadata };
  }
  const now = nowIso();
  const db = getDb();
  db.prepare(
    `UPDATE assistant_projects SET name = ?, description = ?, status = ?, metadata_json = ?, updated_at = ?
     WHERE owner_id = ? AND id = ?`
  ).run(next.name, next.description, next.status, JSON.stringify(next.metadata || {}), now, ownerId, id);
  return getAssistantProject(ownerId, id);
}
