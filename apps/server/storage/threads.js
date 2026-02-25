import crypto from "node:crypto";
import { getDb } from "./db.js";
import { nowIso, safeJsonParse } from "./utils.js";
import { getContextUserId } from "../auth/context.js";

function normalizeChatId(chatId) {
  if (chatId === undefined || chatId === null || chatId === "") return null;
  return String(chatId);
}

function normalizeSender(senderId) {
  return String(senderId || "").trim();
}

function isStrictUserScope() {
  return String(process.env.AIKA_STRICT_USER_SCOPE || process.env.AUTH_REQUIRED || "") === "1";
}

function resolveUserId(userId = "") {
  const explicit = String(userId || "").trim();
  const ctxUser = getContextUserId({ fallback: "" });
  if (ctxUser) {
    if (explicit && explicit !== ctxUser && isStrictUserScope()) {
      throw new Error("user_scope_mismatch");
    }
    return ctxUser;
  }
  if (explicit) return explicit;
  return process.env.AIKA_DEFAULT_USER_ID || "local";
}

function hydrateThread(row) {
  if (!row) return null;
  return {
    ...row,
    metadata: safeJsonParse(row.metadata_json, {})
  };
}

export function getThread(id, { userId } = {}) {
  if (!id) return null;
  const db = getDb();
  const resolvedUserId = resolveUserId(userId);
  const row = db.prepare(`SELECT * FROM chat_threads WHERE id = ? AND user_id = ?`).get(id, resolvedUserId);
  return hydrateThread(row);
}

export function getActiveThread({ channel, senderId, chatId, userId } = {}) {
  const db = getDb();
  const sender = normalizeSender(senderId);
  if (!channel || !sender) return null;
  const resolvedUserId = resolveUserId(userId);
  const row = db.prepare(
    `SELECT * FROM chat_threads
     WHERE channel = ? AND sender_id = ? AND chat_id IS ? AND status = 'active' AND user_id = ?
     ORDER BY updated_at DESC
     LIMIT 1`
  ).get(String(channel), sender, normalizeChatId(chatId), resolvedUserId);
  return hydrateThread(row);
}

export function createThread({ channel, senderId, chatId, senderName, workspaceId, ragModel = "auto", title = "", userId } = {}) {
  const db = getDb();
  const sender = normalizeSender(senderId);
  if (!channel || !sender) return null;
  const resolvedUserId = resolveUserId(userId);
  const id = crypto.randomUUID();
  const now = nowIso();
  const metadata = {
    senderName: senderName || "",
    workspaceId: workspaceId || "default"
  };
  db.prepare(
    `INSERT INTO chat_threads
      (id, user_id, channel, sender_id, chat_id, status, title, rag_model, created_at, updated_at, last_message_at, metadata_json)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(
    id,
    resolvedUserId,
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
  return getThread(id, { userId: resolvedUserId });
}

export function ensureActiveThread({ channel, senderId, chatId, senderName, workspaceId, ragModel, userId } = {}) {
  const existing = getActiveThread({ channel, senderId, chatId, userId });
  if (existing) return existing;
  return createThread({ channel, senderId, chatId, senderName, workspaceId, ragModel, userId });
}

export function closeThread(threadId, { userId } = {}) {
  if (!threadId) return null;
  const db = getDb();
  const resolvedUserId = resolveUserId(userId);
  const now = nowIso();
  const info = db.prepare(
    `UPDATE chat_threads SET status = 'closed', updated_at = ? WHERE id = ? AND user_id = ?`
  ).run(now, threadId, resolvedUserId);
  return info?.changes ? getThread(threadId, { userId: resolvedUserId }) : null;
}

export function setThreadRagModel(threadId, ragModel = "auto", { userId } = {}) {
  if (!threadId) return null;
  const db = getDb();
  const resolvedUserId = resolveUserId(userId);
  const now = nowIso();
  const info = db.prepare(
    `UPDATE chat_threads SET rag_model = ?, updated_at = ? WHERE id = ? AND user_id = ?`
  ).run(ragModel || "auto", now, threadId, resolvedUserId);
  return info?.changes ? getThread(threadId, { userId: resolvedUserId }) : null;
}

export function appendThreadMessage({ threadId, role, content, metadata, userId } = {}) {
  if (!threadId || !role || !content) return null;
  const db = getDb();
  const resolvedUserId = resolveUserId(userId);
  const thread = db.prepare("SELECT id FROM chat_threads WHERE id = ? AND user_id = ?").get(threadId, resolvedUserId);
  if (!thread) return null;
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
    `UPDATE chat_threads SET updated_at = ?, last_message_at = ? WHERE id = ? AND user_id = ?`
  ).run(createdAt, createdAt, threadId, resolvedUserId);
  return { id, created_at: createdAt };
}

export function listThreadMessages(threadId, limit = 12, { userId } = {}) {
  if (!threadId) return [];
  const db = getDb();
  const rows = db.prepare(
    `SELECT m.role, m.content, m.created_at
     FROM chat_messages m
     JOIN chat_threads t ON t.id = m.thread_id
     WHERE m.thread_id = ? AND t.user_id = ?
     ORDER BY m.created_at DESC
     LIMIT ?`
  ).all(threadId, resolveUserId(userId), Math.max(1, Number(limit) || 12));
  return rows.slice().reverse();
}
