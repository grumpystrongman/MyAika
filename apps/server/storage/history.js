import crypto from "node:crypto";
import { getDb } from "./db.js";
import { nowIso } from "./utils.js";

export function recordToolHistory({ tool, request, status, response, error }) {
  const db = getDb();
  const id = crypto.randomBytes(8).toString("hex");
  db.prepare(
    `INSERT INTO tool_history (id, ts, tool, request_json, status, response_json, error_json)
     VALUES (?, ?, ?, ?, ?, ?, ?)`
  ).run(
    id,
    nowIso(),
    tool,
    JSON.stringify(request || {}),
    status,
    response ? JSON.stringify(response) : null,
    error ? JSON.stringify(error) : null
  );
  return id;
}

export function listToolHistory(limit = 50) {
  const db = getDb();
  return db.prepare(
    `SELECT * FROM tool_history ORDER BY ts DESC LIMIT ?`
  ).all(limit);
}
