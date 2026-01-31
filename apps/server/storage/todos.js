import crypto from "node:crypto";
import { getDb } from "./db.js";
import { nowIso } from "./utils.js";

export function createTodoRecord({ title, details = "", due = null, priority = "medium", tags = [] }) {
  const db = getDb();
  const id = crypto.randomBytes(8).toString("hex");
  const createdAt = nowIso();
  db.prepare(
    `INSERT INTO todos (id, title, details, due, priority, tags_json, status, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(id, title, details, due, priority, JSON.stringify(tags), "open", createdAt, createdAt);
  return { id, title, details, due, priority, tags, status: "open", createdAt };
}

export function listTodosRecord({ status = "open", dueWithinDays = 14, tag = null }) {
  const db = getDb();
  const clauses = [];
  const params = [];
  if (status && status !== "all") {
    clauses.push("status = ?");
    params.push(status);
  }
  if (dueWithinDays != null) {
    const limitDate = new Date(Date.now() + Number(dueWithinDays) * 86400000).toISOString();
    clauses.push("(due IS NULL OR due <= ?)");
    params.push(limitDate);
  }
  if (tag) {
    clauses.push("tags_json LIKE ?");
    params.push(`%${tag}%`);
  }
  const where = clauses.length ? `WHERE ${clauses.join(" AND ")}` : "";
  return db.prepare(
    `SELECT * FROM todos ${where} ORDER BY created_at DESC LIMIT 200`
  ).all(...params);
}
