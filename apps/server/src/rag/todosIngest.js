import { ingestConnectorDocument } from "../connectors/ingest.js";

function formatTodoText(todo = {}, listName = "") {
  const lines = [];
  const title = String(todo.title || "").trim();
  lines.push(`Todo: ${title || "Untitled"}`);
  if (listName) lines.push(`List: ${listName}`);
  if (todo.status) lines.push(`Status: ${todo.status}`);
  if (todo.priority) lines.push(`Priority: ${todo.priority}`);
  if (todo.due) lines.push(`Due: ${todo.due}`);
  if (todo.reminderAt) lines.push(`Reminder: ${todo.reminderAt}`);
  if (todo.repeatRule) lines.push(`Repeat: ${todo.repeatRule}`);
  if (Array.isArray(todo.tags) && todo.tags.length) lines.push(`Tags: ${todo.tags.join(", ")}`);
  if (todo.details) lines.push(`Details: ${todo.details}`);
  if (todo.notes) lines.push(`Notes: ${todo.notes}`);
  const steps = Array.isArray(todo.steps) ? todo.steps : [];
  if (steps.length) {
    lines.push("Steps:");
    steps.forEach(step => {
      const done = step?.done ? "x" : " ";
      const text = String(step?.title || step?.text || "").trim();
      if (text) lines.push(`- [${done}] ${text}`);
    });
  }
  return lines.filter(Boolean).join("\n");
}

export async function ingestTodoToRag({ todo, listName = "" } = {}) {
  if (!todo?.id) return { ok: false, error: "todo_id_required" };
  const text = formatTodoText(todo, listName);
  if (!text) return { ok: false, error: "todo_text_required" };
  const meetingId = `rag:todos:todo:${todo.id}`;
  const listTag = listName ? `list:${String(listName).trim().toLowerCase().replace(/\s+/g, "-")}` : "";
  const tags = Array.isArray(todo.tags) ? todo.tags : [];
  return ingestConnectorDocument({
    collectionId: "todos",
    sourceType: "todo",
    meetingId,
    title: todo.title || "Todo",
    sourceUrl: "",
    text,
    tags: listTag ? [...tags, listTag] : tags,
    metadata: {
      todoId: todo.id,
      listId: todo.listId || "",
      status: todo.status || "",
      priority: todo.priority || "",
      due: todo.due || "",
      reminderAt: todo.reminderAt || ""
    },
    occurredAt: todo.updatedAt || todo.createdAt,
    force: true,
    replaceExisting: true
  });
}
