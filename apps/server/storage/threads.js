import crypto from "node:crypto";
import { getDb } from "./db.js";
import { nowIso, safeJsonParse } from "./utils.js";

function normalizeChatId(chatId) {
  if (chatId === undefined || chatId === null || chatId === "") return null;
  return String(chatId);
}

function normalizeSender(senderId) {
  return String(senderId || "").trim();
}

function hydrateThread(row) {
  if (!row) return null;
  return {
    ...row,
    metadata: safeJsonParse(row.metadata_json, {})
  };
}

export function getThread(id) {
  if (!id) return null;
  const db = getDb();
  const row = db.prepare(`SELECT * FROM chat_threads WHERE id = ?`).get(id);
  return hydrateThread(row);
}

export function getActiveThread({ channel, senderId, chatId } = {}) {
  const db = getDb();
  const sender = normalizeSender(senderId);
  if (!channel || !sender) return null;
  const row = db.prepare(
    `SELECT * FROM chat_threads
     WHERE channel = ? AND sender_id = ? AND chat_id IS ? AND status = 'active'
     ORDER BY updated_at DESC
     LIMIT 1`
  ).get(String(channel), sender, normalizeChatId(chatId));
  return hydrateThread(row);
}

export function createThread({ channel, senderId, chatId, senderName, workspaceId, ragModel = "auto", title = "" } = {}) {
  const db = getDb();
  const sender = normalizeSender(senderId);
  if (!channel || !sender) return null;
  const id = crypto.randomUUID();
  const now = nowIso();
  const metadata = {
    senderName: senderName || "",
    workspaceId: workspaceId || "default"
  };
  db.prepare(
    `INSERT INTO chat_threads
      (id, channel, sender_id, chat_id, status, title, rag_model, created_at, updated_at, last_message_at, metadata_json)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(
    id,
    String(channel),
    sender,
    normalizeChatId(chatId),
    "active",
    title || null,
    ragModel || "auto",
    now,
    now,
    null,
    JSON.stringify(metadata)
  );
  return getThread(id);
}

export function ensureActiveThread({ channel, senderId, chatId, senderName, workspaceId, ragModel } = {}) {
  const existing = getActiveThread({ channel, senderId, chatId });
  if (existing) return existing;
  return createThread({ channel, senderId, chatId, senderName, workspaceId, ragModel });
}

export function closeThread(threadId) {
  if (!threadId) return null;
  const db = getDb();
  const now = nowIso();
  const info = db.prepare(
    `UPDATE chat_threads SET status = 'closed', updated_at = ? WHERE id = ?`
  ).run(now, threadId);
  return info?.changes ? getThread(threadId) : null;
}

export function setThreadRagModel(threadId, ragModel = "auto") {
  if (!threadId) return null;
  const db = getDb();
  const now = nowIso();
  const info = db.prepare(
    `UPDATE chat_threads SET rag_model = ?, updated_at = ? WHERE id = ?`
  ).run(ragModel || "auto", now, threadId);
  return info?.changes ? getThread(threadId) : null;
}

export function appendThreadMessage({ threadId, role, content, metadata } = {}) {
  if (!threadId || !role || !content) return null;
  const db = getDb();
  const id = crypto.randomUUID();
  const createdAt = nowIso();
  db.prepare(
    `INSERT INTO chat_messages (id, thread_id, role, content, created_at, metadata_json)
     VALUES (?, ?, ?, ?, ?, ?)`
  ).run(
    id,
    threadId,
    String(role),
    String(content),
    createdAt,
    metadata ? JSON.stringify(metadata) : null
  );
  db.prepare(
    `UPDATE chat_threads SET updated_at = ?, last_message_at = ? WHERE id = ?`
  ).run(createdAt, createdAt, threadId);
  return { id, created_at: createdAt };
}

export function listThreadMessages(threadId, limit = 12) {
  if (!threadId) return [];
  const db = getDb();
  const rows = db.prepare(
    `SELECT role, content, created_at
     FROM chat_messages
     WHERE thread_id = ?
     ORDER BY created_at DESC
     LIMIT ?`
  ).all(threadId, Math.max(1, Number(limit) || 12));
  return rows.slice().reverse();
}
