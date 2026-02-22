import crypto from "node:crypto";
import { getDb } from "./db.js";
import { nowIso } from "./utils.js";

function makeId() {
  return crypto.randomBytes(8).toString("hex");
}

function mapRow(row) {
  if (!row) return null;
  return {
    id: row.id,
    userId: row.user_id,
    type: row.type || "",
    periodStart: row.period_start || null,
    periodEnd: row.period_end || null,
    content: row.content || "",
    sentEmail: Boolean(row.sent_email),
    sentTelegram: Boolean(row.sent_telegram),
    createdAt: row.created_at || null,
    sentAt: row.sent_at || null
  };
}

export function createDigest({
  userId = "local",
  type = "daily",
  periodStart = "",
  periodEnd = "",
  content = "",
  sentEmail = false,
  sentTelegram = false
} = {}) {
  const db = getDb();
  const id = makeId();
  const createdAt = nowIso();
  db.prepare(
    `INSERT INTO digests (id, user_id, type, period_start, period_end, content, sent_email, sent_telegram, created_at, sent_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(
    id,
    userId,
    type,
    periodStart || "",
    periodEnd || "",
    content || "",
    sentEmail ? 1 : 0,
    sentTelegram ? 1 : 0,
    createdAt,
    null
  );
  return getDigest(id);
}

export function updateDigest(id, updates = {}) {
  if (!id) return null;
  const db = getDb();
  const current = getDigest(id);
  if (!current) return null;
  const next = {
    sentEmail: updates.sentEmail ?? current.sentEmail,
    sentTelegram: updates.sentTelegram ?? current.sentTelegram,
    sentAt: updates.sentAt ?? current.sentAt,
    content: updates.content ?? current.content
  };
  db.prepare(
    `UPDATE digests SET content = ?, sent_email = ?, sent_telegram = ?, sent_at = ? WHERE id = ?`
  ).run(
    String(next.content || ""),
    next.sentEmail ? 1 : 0,
    next.sentTelegram ? 1 : 0,
    next.sentAt,
    id
  );
  return getDigest(id);
}

export function getDigest(id) {
  const db = getDb();
  const row = db.prepare("SELECT * FROM digests WHERE id = ?").get(id);
  return mapRow(row);
}

export function listDigests({ userId = "local", type = "", limit = 20 } = {}) {
  const db = getDb();
  const where = ["user_id = ?"];
  const params = [userId];
  if (type) {
    where.push("type = ?");
    params.push(type);
  }
  const rows = db.prepare(
    `SELECT * FROM digests WHERE ${where.join(" AND ")} ORDER BY created_at DESC LIMIT ?`
  ).all(...params, Number(limit || 20));
  return rows.map(mapRow).filter(Boolean);
}
