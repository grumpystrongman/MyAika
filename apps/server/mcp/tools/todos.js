import { createTodoRecord, listTodosRecord } from "../../storage/todos.js";

export function createTodo({ title, details = "", due = null, priority = "medium", tags = [] }) {
  if (!title) {
    const err = new Error("title_required");
    err.status = 400;
    throw err;
  }
  return createTodoRecord({ title, details, due, priority, tags });
}

export function listTodos({ status = "open", dueWithinDays = 14, tag = null }) {
  return listTodosRecord({ status, dueWithinDays, tag });
}