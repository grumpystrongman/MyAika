import { getDb } from "./db.js";
import { nowIso } from "./utils.js";

function mapRow(row) {
  if (!row) return null;
  return {
    id: row.id,
    name: row.name || "",
    timezone: row.timezone || "",
    email: row.email || "",
    telegramUserId: row.telegram_user_id || "",
    createdAt: row.created_at || null
  };
}

export function getUser(id = "local") {
  const db = getDb();
  const row = db.prepare("SELECT * FROM users WHERE id = ?").get(id);
  return mapRow(row);
}

export function listUsers({ limit = 50 } = {}) {
  const db = getDb();
  const rows = db.prepare("SELECT * FROM users ORDER BY created_at DESC LIMIT ?").all(Number(limit || 50));
  return rows.map(mapRow).filter(Boolean);
}

export function ensureUser(id = "local", input = {}) {
  const existing = getUser(id);
  if (existing) return existing;
  const db = getDb();
  const createdAt = nowIso();
  db.prepare(
    `INSERT OR IGNORE INTO users (id, name, timezone, email, telegram_user_id, created_at)
     VALUES (?, ?, ?, ?, ?, ?)`
  ).run(
    id,
    String(input.name || id),
    String(input.timezone || ""),
    String(input.email || ""),
    String(input.telegramUserId || ""),
    createdAt
  );
  return getUser(id);
}

export function updateUser(id = "local", input = {}) {
  const db = getDb();
  const current = getUser(id) || { id };
  const name = input.name ?? current.name;
  const timezone = input.timezone ?? current.timezone;
  const email = input.email ?? current.email;
  const telegramUserId = input.telegramUserId ?? current.telegramUserId;
  db.prepare(
    `UPDATE users SET name = ?, timezone = ?, email = ?, telegram_user_id = ? WHERE id = ?`
  ).run(
    String(name || ""),
    String(timezone || ""),
    String(email || ""),
    String(telegramUserId || ""),
    id
  );
  return getUser(id);
}
