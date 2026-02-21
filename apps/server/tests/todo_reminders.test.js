import test from "node:test";
import assert from "node:assert/strict";
import { initDb } from "../storage/db.js";
import { runMigrations } from "../storage/schema.js";
import { createTodoRecord, getTodoRecord } from "../storage/todos.js";
import { runTodoReminders, getTodoReminderConfig, saveTodoReminderConfig } from "../src/todos/reminders.js";
import { setProvider } from "../integrations/store.js";

initDb();
runMigrations();

test("todo reminders mark sent in-app", async () => {
  const userId = `todo-reminder-${Date.now()}`;
  const todo = createTodoRecord({
    title: "Reminder demo",
    details: "Check the inbox",
    reminderAt: new Date(Date.now() - 1000).toISOString(),
    userId
  });
  const config = {
    enabled: true,
    channels: ["in_app"],
    slackChannels: [],
    telegramChatIds: [],
    emailTo: [],
    maxPerRun: 10
  };
  const result = await runTodoReminders({ userId, config });
  assert.equal(result.processed, 1);
  const updated = getTodoRecord({ id: todo.id, userId });
  assert.equal(updated.reminderStatus, "sent");
  assert.ok(updated.reminderSentAt);
});

test("todo reminders send slack via executor", async () => {
  const userId = `todo-reminder-${Date.now()}-slack`;
  const todo = createTodoRecord({
    title: "Slack reminder",
    reminderAt: new Date(Date.now() - 2000).toISOString(),
    userId
  });
  const config = {
    enabled: true,
    channels: ["slack"],
    slackChannels: ["#ops"],
    telegramChatIds: [],
    emailTo: [],
    maxPerRun: 10
  };
  let sent = false;
  const executeAction = async ({ handler }) => {
    const data = await handler();
    return { status: "ok", data };
  };
  const sendSlackMessage = async () => {
    sent = true;
    return { ok: true };
  };

  await runTodoReminders({ userId, config, deps: { executeAction, sendSlackMessage } });
  assert.equal(sent, true);
  const updated = getTodoRecord({ id: todo.id, userId });
  assert.equal(updated.reminderStatus, "sent");
});

test("todo reminder config saves and loads", () => {
  const userId = "todo-reminder-config";
  setProvider("todo_reminders_config", null, userId);
  const saved = saveTodoReminderConfig({
    enabled: true,
    channels: "slack, email",
    slackChannels: ["#ops"],
    emailTo: "owner@example.com",
    intervalMinutes: 9
  }, userId);
  assert.equal(saved.enabled, true);
  assert.ok(saved.channels.includes("slack"));
  assert.ok(saved.emailTo.includes("owner@example.com"));
  const loaded = getTodoReminderConfig(userId);
  assert.equal(loaded.intervalMinutes, 9);
  setProvider("todo_reminders_config", null, userId);
});
