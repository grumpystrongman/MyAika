import { createTodoRecord, listTodosRecord } from "../../storage/todos.js";

export function createTodo({ title, details = "", due = null, priority = "medium", tags = [] }, context = {}) {
  if (!title) {
    const err = new Error("title_required");
    err.status = 400;
    throw err;
  }
  return createTodoRecord({ title, details, due, priority, tags, userId: context.userId || "local" });
}

export function listTodos({ status = "open", dueWithinDays = 14, tag = null }, context = {}) {
  return listTodosRecord({ status, dueWithinDays, tag, userId: context.userId || "local" });
}
