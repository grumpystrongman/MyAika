import test from "node:test";
import assert from "node:assert/strict";
import { initDb } from "../storage/db.js";
import { runMigrations } from "../storage/schema.js";
import {
  createTodoListRecord,
  createTodoRecord,
  listTodosRecord,
  updateTodoRecord,
  completeTodoRecord
} from "../storage/todos.js";

initDb();
runMigrations();

test("todo lists and task updates", () => {
  const list = createTodoListRecord({ name: "Projects", color: "#38bdf8", icon: "briefcase", userId: "local" });
  assert.ok(list?.id);
  const todo = createTodoRecord({
    title: "Plan sprint",
    details: "Draft goals",
    due: "2026-02-20",
    priority: "high",
    tags: ["planning"],
    listId: list.id,
    steps: [{ title: "Scope", done: false }],
    userId: "local"
  });
  assert.equal(todo.listId, list.id);
  const open = listTodosRecord({ listId: list.id, status: "open", userId: "local" });
  assert.ok(open.find(item => item.id === todo.id));

  const updated = updateTodoRecord({ id: todo.id, userId: "local", status: "done", notes: "Done" });
  assert.equal(updated.status, "done");
  assert.ok(updated.completedAt);

  const reopened = updateTodoRecord({ id: todo.id, userId: "local", status: "open" });
  assert.equal(reopened.status, "open");

  const completed = completeTodoRecord({ id: todo.id, userId: "local" });
  assert.equal(completed.status, "done");
});

test("rag ingestion replaces todo chunks", async () => {
  const { ingestTodoToRag } = await import("../src/rag/todosIngest.js");
  const { ingestNoteToRag } = await import("../src/rag/notesIngest.js");
  const { countChunksForMeeting } = await import("../src/rag/vectorStore.js");

  const todo = {
    id: "todo-demo",
    title: "Ship release",
    details: "Prepare release notes",
    status: "open",
    priority: "high",
    tags: ["release"],
    steps: []
  };
  const first = await ingestTodoToRag({ todo, listName: "Inbox" });
  assert.equal(first.ok, true);
  const meetingId = `rag:todos:todo:${todo.id}`;
  const count1 = countChunksForMeeting(meetingId);
  assert.equal(count1, 1);

  todo.details = "Prepare release notes and changelog";
  const second = await ingestTodoToRag({ todo, listName: "Inbox" });
  assert.equal(second.ok, true);
  const count2 = countChunksForMeeting(meetingId);
  assert.equal(count2, 1);

  const note = await ingestNoteToRag({
    noteId: "note-demo",
    title: "Ops Runbook",
    body: "Restart the service and verify health checks.",
    tags: ["ops"]
  });
  assert.equal(note.ok, true);
  const noteMeetingId = "rag:notes:note:note-demo";
  assert.equal(countChunksForMeeting(noteMeetingId), 1);
});
