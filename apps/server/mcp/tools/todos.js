import {
  createTodoRecord,
  listTodosRecord,
  updateTodoRecord,
  completeTodoRecord,
  createTodoListRecord,
  listTodoListsRecord,
  updateTodoListRecord,
  getTodoListRecord
} from "../../storage/todos.js";
import { ingestTodoToRag } from "../../src/rag/todosIngest.js";

function resolveUserId(context = {}) {
  return context.userId || "local";
}

export function createTodoList({ name, color = "", icon = "", sortOrder = 0 } = {}, context = {}) {
  if (!name) {
    const err = new Error("list_name_required");
    err.status = 400;
    throw err;
  }
  return createTodoListRecord({ name, color, icon, sortOrder, userId: resolveUserId(context) });
}

export function listTodoLists(_params = {}, context = {}) {
  return listTodoListsRecord({ userId: resolveUserId(context) });
}

export function updateTodoList({ id, name, color, icon, sortOrder } = {}, context = {}) {
  if (!id) {
    const err = new Error("list_id_required");
    err.status = 400;
    throw err;
  }
  return updateTodoListRecord({ id, name, color, icon, sortOrder, userId: resolveUserId(context) });
}

export async function createTodo(params = {}, context = {}) {
  const { title, details = "", notes = "", due = null, reminderAt = null, repeatRule = "", priority = "medium", tags = [], steps = [], listId = null, pinned = false } = params;
  if (!title) {
    const err = new Error("title_required");
    err.status = 400;
    throw err;
  }
  const userId = resolveUserId(context);
  const record = createTodoRecord({
    title,
    details,
    notes,
    due,
    reminderAt,
    repeatRule,
    priority,
    tags,
    steps,
    listId,
    pinned,
    userId
  });
  let rag = null;
  try {
    const list = record.listId ? getTodoListRecord({ id: record.listId, userId }) : null;
    rag = await ingestTodoToRag({ todo: record, listName: list?.name || "" });
  } catch {
    rag = null;
  }
  return { ...record, rag };
}

export function listTodos({ status = "open", dueWithinDays = 14, tag = null, listId = null, query = "", limit = 200 } = {}, context = {}) {
  return listTodosRecord({
    status,
    dueWithinDays,
    tag,
    listId,
    query,
    limit,
    userId: resolveUserId(context)
  });
}

export async function updateTodo(params = {}, context = {}) {
  const { id } = params;
  if (!id) {
    const err = new Error("todo_id_required");
    err.status = 400;
    throw err;
  }
  const userId = resolveUserId(context);
  const record = updateTodoRecord({ ...params, userId });
  let rag = null;
  try {
    const list = record.listId ? getTodoListRecord({ id: record.listId, userId }) : null;
    rag = await ingestTodoToRag({ todo: record, listName: list?.name || "" });
  } catch {
    rag = null;
  }
  return { ...record, rag };
}

export async function completeTodo({ id } = {}, context = {}) {
  if (!id) {
    const err = new Error("todo_id_required");
    err.status = 400;
    throw err;
  }
  const userId = resolveUserId(context);
  const record = completeTodoRecord({ id, userId });
  let rag = null;
  try {
    const list = record.listId ? getTodoListRecord({ id: record.listId, userId }) : null;
    rag = await ingestTodoToRag({ todo: record, listName: list?.name || "" });
  } catch {
    rag = null;
  }
  return { ...record, rag };
}
