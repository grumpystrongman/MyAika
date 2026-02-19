import crypto from "node:crypto";
import { getDb } from "./db.js";
import { nowIso, safeJsonParse } from "./utils.js";

const DEFAULT_LIST_NAME = "Inbox";
const DEFAULT_LIST_COLOR = "#22c55e";
const DEFAULT_LIST_ICON = "inbox";

function defaultListId(userId = "local") {
  const safe = String(userId || "local").trim() || "local";
  return safe === "local" ? "inbox" : `inbox:${safe}`;
}

function ensureDefaultTodoList(userId = "local") {
  const db = getDb();
  const id = defaultListId(userId);
  const existing = db.prepare("SELECT id FROM todo_lists WHERE id = ?").get(id);
  if (existing) return id;
  const timestamp = nowIso();
  db.prepare(`
    INSERT INTO todo_lists (id, name, color, icon, sort_order, created_at, updated_at, user_id)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `).run(id, DEFAULT_LIST_NAME, DEFAULT_LIST_COLOR, DEFAULT_LIST_ICON, 0, timestamp, timestamp, userId);
  return id;
}

function normalizeTags(tags) {
  if (!Array.isArray(tags)) return [];
  const seen = new Set();
  return tags
    .map(tag => String(tag || "").trim())
    .filter(Boolean)
    .filter(tag => {
      const key = tag.toLowerCase();
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
}

function normalizeSteps(steps) {
  if (!Array.isArray(steps)) return [];
  return steps
    .map(step => {
      const title = String(step?.title || step?.text || "").trim();
      if (!title) return null;
      const id = step?.id ? String(step.id) : crypto.randomBytes(6).toString("hex");
      return {
        id,
        title,
        done: Boolean(step?.done)
      };
    })
    .filter(Boolean);
}

function normalizeDateInput(value) {
  if (!value) return null;
  const raw = String(value).trim();
  if (!raw) return null;
  const parsed = new Date(raw);
  if (Number.isNaN(parsed.getTime())) return null;
  return parsed.toISOString();
}

function normalizeTodoRow(row, userId = "local") {
  if (!row) return null;
  const listId = row.list_id || defaultListId(userId);
  return {
    id: row.id,
    listId,
    title: row.title || "",
    details: row.details || "",
    notes: row.notes || "",
    due: row.due || null,
    reminderAt: row.reminder_at || null,
    repeatRule: row.repeat_rule || "",
    priority: row.priority || "medium",
    tags: row.tags_json ? safeJsonParse(row.tags_json, []) : [],
    status: row.status || "open",
    steps: row.steps_json ? safeJsonParse(row.steps_json, []) : [],
    pinned: Boolean(row.pinned),
    sortOrder: row.sort_order ?? null,
    completedAt: row.completed_at || null,
    archivedAt: row.archived_at || null,
    createdAt: row.created_at || "",
    updatedAt: row.updated_at || ""
  };
}

function normalizeListRow(row, userId = "local") {
  if (!row) return null;
  return {
    id: row.id,
    name: row.name || "",
    color: row.color || "",
    icon: row.icon || "",
    sortOrder: row.sort_order ?? 0,
    isDefault: row.id === defaultListId(userId),
    createdAt: row.created_at || "",
    updatedAt: row.updated_at || ""
  };
}

export function createTodoListRecord({ name, color = "", icon = "", sortOrder = 0, userId = "local" }) {
  const db = getDb();
  if (!name) throw new Error("list_name_required");
  const id = crypto.randomBytes(8).toString("hex");
  const createdAt = nowIso();
  db.prepare(`
    INSERT INTO todo_lists (id, name, color, icon, sort_order, created_at, updated_at, user_id)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `).run(id, name, color, icon, Number(sortOrder || 0), createdAt, createdAt, userId);
  return normalizeListRow(
    db.prepare("SELECT * FROM todo_lists WHERE id = ?").get(id),
    userId
  );
}

export function listTodoListsRecord({ userId = "local" } = {}) {
  const db = getDb();
  ensureDefaultTodoList(userId);
  const rows = db.prepare(`
    SELECT * FROM todo_lists
    WHERE user_id = ?
    ORDER BY sort_order ASC, created_at ASC
  `).all(userId);
  return rows.map(row => normalizeListRow(row, userId)).filter(Boolean);
}

export function getTodoListRecord({ id, userId = "local" }) {
  if (!id) return null;
  const db = getDb();
  const row = db.prepare("SELECT * FROM todo_lists WHERE id = ? AND user_id = ?").get(id, userId);
  return normalizeListRow(row, userId);
}

export function updateTodoListRecord({ id, name, color, icon, sortOrder, userId = "local" }) {
  if (!id) throw new Error("list_id_required");
  const db = getDb();
  const updates = [];
  const params = [];
  if (name !== undefined) {
    updates.push("name = ?");
    params.push(name);
  }
  if (color !== undefined) {
    updates.push("color = ?");
    params.push(color);
  }
  if (icon !== undefined) {
    updates.push("icon = ?");
    params.push(icon);
  }
  if (sortOrder !== undefined) {
    updates.push("sort_order = ?");
    params.push(Number(sortOrder || 0));
  }
  updates.push("updated_at = ?");
  params.push(nowIso());
  params.push(id, userId);
  db.prepare(`UPDATE todo_lists SET ${updates.join(", ")} WHERE id = ? AND user_id = ?`).run(...params);
  const row = db.prepare("SELECT * FROM todo_lists WHERE id = ? AND user_id = ?").get(id, userId);
  return normalizeListRow(row, userId);
}

export function deleteTodoListRecord({ id, userId = "local" }) {
  if (!id) throw new Error("list_id_required");
  const db = getDb();
  db.prepare("DELETE FROM todo_lists WHERE id = ? AND user_id = ?").run(id, userId);
  return { ok: true };
}

export function createTodoRecord({
  title,
  details = "",
  notes = "",
  due = null,
  reminderAt = null,
  repeatRule = "",
  priority = "medium",
  tags = [],
  steps = [],
  listId = null,
  pinned = false,
  sortOrder = null,
  userId = "local"
}) {
  const db = getDb();
  if (!title) throw new Error("title_required");
  const id = crypto.randomBytes(8).toString("hex");
  const createdAt = nowIso();
  const resolvedListId = listId || ensureDefaultTodoList(userId);
  const normalizedTags = normalizeTags(tags);
  const normalizedSteps = normalizeSteps(steps);
  const dueValue = normalizeDateInput(due);
  const reminderValue = normalizeDateInput(reminderAt);
  const sortValue = sortOrder !== null && sortOrder !== undefined ? Number(sortOrder) : Date.now();
  db.prepare(`
    INSERT INTO todos (
      id, list_id, title, details, notes, due, reminder_at, repeat_rule, priority,
      tags_json, status, steps_json, pinned, sort_order, created_at, updated_at, user_id
    )
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    id,
    resolvedListId,
    title,
    details,
    notes,
    dueValue,
    reminderValue,
    repeatRule,
    priority,
    JSON.stringify(normalizedTags),
    "open",
    JSON.stringify(normalizedSteps),
    pinned ? 1 : 0,
    sortValue,
    createdAt,
    createdAt,
    userId
  );
  const row = db.prepare("SELECT * FROM todos WHERE id = ? AND user_id = ?").get(id, userId);
  return normalizeTodoRow(row, userId);
}

export function updateTodoRecord({ id, userId = "local", ...updates }) {
  if (!id) throw new Error("todo_id_required");
  const db = getDb();
  const fields = [];
  const params = [];

  if (updates.title !== undefined) {
    fields.push("title = ?");
    params.push(updates.title);
  }
  if (updates.details !== undefined) {
    fields.push("details = ?");
    params.push(updates.details);
  }
  if (updates.notes !== undefined) {
    fields.push("notes = ?");
    params.push(updates.notes);
  }
  if (updates.due !== undefined) {
    fields.push("due = ?");
    params.push(normalizeDateInput(updates.due));
  }
  if (updates.reminderAt !== undefined) {
    fields.push("reminder_at = ?");
    params.push(normalizeDateInput(updates.reminderAt));
  }
  if (updates.repeatRule !== undefined) {
    fields.push("repeat_rule = ?");
    params.push(updates.repeatRule || "");
  }
  if (updates.priority !== undefined) {
    fields.push("priority = ?");
    params.push(updates.priority || "medium");
  }
  if (updates.tags !== undefined) {
    fields.push("tags_json = ?");
    params.push(JSON.stringify(normalizeTags(updates.tags)));
  }
  if (updates.steps !== undefined) {
    fields.push("steps_json = ?");
    params.push(JSON.stringify(normalizeSteps(updates.steps)));
  }
  if (updates.listId !== undefined) {
    const resolved = updates.listId || ensureDefaultTodoList(userId);
    fields.push("list_id = ?");
    params.push(resolved);
  }
  if (updates.pinned !== undefined) {
    fields.push("pinned = ?");
    params.push(updates.pinned ? 1 : 0);
  }
  if (updates.sortOrder !== undefined) {
    fields.push("sort_order = ?");
    params.push(Number(updates.sortOrder || 0));
  }
  if (updates.status !== undefined) {
    fields.push("status = ?");
    params.push(updates.status || "open");
    if (updates.status === "done") {
      fields.push("completed_at = ?");
      params.push(nowIso());
    } else if (updates.status === "open") {
      fields.push("completed_at = ?");
      params.push(null);
    }
  }

  if (!fields.length) {
    const row = db.prepare("SELECT * FROM todos WHERE id = ? AND user_id = ?").get(id, userId);
    return normalizeTodoRow(row, userId);
  }

  fields.push("updated_at = ?");
  params.push(nowIso());
  params.push(id, userId);
  db.prepare(`UPDATE todos SET ${fields.join(", ")} WHERE id = ? AND user_id = ?`).run(...params);

  const row = db.prepare("SELECT * FROM todos WHERE id = ? AND user_id = ?").get(id, userId);
  return normalizeTodoRow(row, userId);
}

export function completeTodoRecord({ id, userId = "local", completedAt = null }) {
  if (!id) throw new Error("todo_id_required");
  const db = getDb();
  const completedValue = completedAt ? normalizeDateInput(completedAt) : nowIso();
  db.prepare(`
    UPDATE todos
    SET status = 'done', completed_at = ?, updated_at = ?
    WHERE id = ? AND user_id = ?
  `).run(completedValue, nowIso(), id, userId);
  const row = db.prepare("SELECT * FROM todos WHERE id = ? AND user_id = ?").get(id, userId);
  return normalizeTodoRow(row, userId);
}

export function getTodoRecord({ id, userId = "local" }) {
  if (!id) return null;
  const db = getDb();
  const row = db.prepare("SELECT * FROM todos WHERE id = ? AND user_id = ?").get(id, userId);
  return normalizeTodoRow(row, userId);
}

export function listTodosRecord({
  status = "open",
  dueWithinDays = 14,
  tag = null,
  listId = null,
  query = "",
  limit = 200,
  userId = "local"
} = {}) {
  const db = getDb();
  const clauses = ["user_id = ?"];
  const params = [userId];

  if (status && status !== "all") {
    clauses.push("status = ?");
    params.push(status);
  }

  const defaultId = defaultListId(userId);
  if (listId) {
    if (listId === defaultId) {
      clauses.push("(list_id = ? OR list_id IS NULL)");
      params.push(listId);
    } else {
      clauses.push("list_id = ?");
      params.push(listId);
    }
  }

  if (dueWithinDays !== null && dueWithinDays !== undefined && dueWithinDays !== "") {
    const limitDate = new Date(Date.now() + Number(dueWithinDays) * 86400000).toISOString();
    clauses.push("(due IS NULL OR due <= ?)");
    params.push(limitDate);
  }

  if (tag) {
    clauses.push("LOWER(COALESCE(tags_json, '')) LIKE ?");
    params.push(`%${String(tag).toLowerCase()}%`);
  }

  if (query) {
    clauses.push("(LOWER(title) LIKE ? OR LOWER(details) LIKE ? OR LOWER(COALESCE(notes, '')) LIKE ?)");
    const like = `%${String(query).toLowerCase()}%`;
    params.push(like, like, like);
  }

  const where = clauses.length ? `WHERE ${clauses.join(" AND ")}` : "";
  const rows = db.prepare(`
    SELECT * FROM todos
    ${where}
    ORDER BY pinned DESC,
      CASE WHEN status = 'done' THEN 1 ELSE 0 END,
      CASE WHEN due IS NULL THEN 1 ELSE 0 END,
      due ASC,
      sort_order DESC,
      created_at DESC
    LIMIT ?
  `).all(...params, Number(limit || 200));

  return rows.map(row => normalizeTodoRow(row, userId)).filter(Boolean);
}
