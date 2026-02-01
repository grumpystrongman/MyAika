import crypto from "node:crypto";
import { getDb } from "./db.js";
import { nowIso } from "./utils.js";

export function addMemoryEntities(entities = []) {
  const db = getDb();
  const stmt = db.prepare(
    `INSERT INTO memory_entities (id, workspace_id, recording_id, type, value, normalized_value, metadata_json, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
  );
  const createdAt = nowIso();
  const rows = [];
  for (const entity of entities) {
    const id = crypto.randomBytes(8).toString("hex");
    stmt.run(
      id,
      entity.workspaceId || "default",
      entity.recordingId || null,
      entity.type || "note",
      entity.value || "",
      entity.normalized || (entity.value || "").toLowerCase(),
      JSON.stringify(entity.metadata || {}),
      createdAt
    );
    rows.push({ id, ...entity, createdAt });
  }
  return rows;
}

export function searchMemoryEntities({ workspaceId = "default", query = "", limit = 25 }) {
  const db = getDb();
  if (!query) {
    return db.prepare(
      `SELECT * FROM memory_entities WHERE workspace_id = ? ORDER BY created_at DESC LIMIT ?`
    ).all(workspaceId, limit);
  }
  return db.prepare(
    `SELECT * FROM memory_entities WHERE workspace_id = ? AND (value LIKE ? OR normalized_value LIKE ?) ORDER BY created_at DESC LIMIT ?`
  ).all(workspaceId, `%${query}%`, `%${query}%`, limit);
}
