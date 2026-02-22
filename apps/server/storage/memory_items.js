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
    scope: row.scope || "general",
    key: row.key || "",
    value: safeJsonParse(row.value_json, {}),
    sensitivity: row.sensitivity || "normal",
    source: row.source || "",
    createdAt: row.created_at || null,
    updatedAt: row.updated_at || null
  };
}

export function upsertMemoryItem({
  userId = "local",
  scope = "general",
  key = "",
  value = {},
  sensitivity = "normal",
  source = "manual"
} = {}) {
  if (!key) throw new Error("memory_key_required");
  const db = getDb();
  const now = nowIso();
  const existing = db.prepare(
    "SELECT id FROM memory_items WHERE user_id = ? AND scope = ? AND key = ?"
  ).get(userId, scope, key);
  if (existing) {
    db.prepare(
      `UPDATE memory_items SET value_json = ?, sensitivity = ?, source = ?, updated_at = ? WHERE id = ?`
    ).run(
      JSON.stringify(value || {}),
      String(sensitivity || "normal"),
      String(source || ""),
      now,
      existing.id
    );
    return getMemoryItem(existing.id);
  }
  const id = makeId();
  db.prepare(
    `INSERT INTO memory_items (id, user_id, scope, key, value_json, sensitivity, source, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(
    id,
    userId,
    scope,
    key,
    JSON.stringify(value || {}),
    String(sensitivity || "normal"),
    String(source || ""),
    now,
    now
  );
  return getMemoryItem(id);
}

export function getMemoryItem(id) {
  const db = getDb();
  const row = db.prepare("SELECT * FROM memory_items WHERE id = ?").get(id);
  return mapRow(row);
}

export function listMemoryItems({ userId = "local", scope = "" } = {}) {
  const db = getDb();
  const where = ["user_id = ?"];
  const params = [userId];
  if (scope) {
    where.push("scope = ?");
    params.push(scope);
  }
  const rows = db.prepare(
    `SELECT * FROM memory_items WHERE ${where.join(" AND ")} ORDER BY updated_at DESC`
  ).all(...params);
  return rows.map(mapRow).filter(Boolean);
}
