import { listDueReminders, updateTodoRecord } from "../../storage/todos.js";
import { nowIso } from "../../storage/utils.js";
import { executeAction } from "../safety/executeAction.js";
import { sendSlackMessage, sendTelegramMessage } from "../../integrations/messaging.js";
import { sendGmailMessage, getGoogleStatus } from "../../integrations/google.js";
import { writeOutbox } from "../../storage/outbox.js";
import { getProvider, setProvider } from "../../integrations/store.js";

const DEFAULT_MAX_PER_RUN = 25;
const DEFAULT_INTERVAL_MINUTES = 5;
const DEFAULT_CHANNELS = ["in_app"];

function parseList(value) {
  return String(value || "")
    .split(/[;,\n]/)
    .map(item => item.trim())
    .filter(Boolean);
}

function normalizeListInput(value, fallback = []) {
  if (Array.isArray(value)) {
    return value.map(item => String(item || "").trim()).filter(Boolean);
  }
  if (value === undefined || value === null) return Array.isArray(fallback) ? fallback : parseList(fallback);
  return parseList(value);
}

function toNumber(value, fallback) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function buildDefaultsFromEnv() {
  return {
    enabled: String(process.env.TODO_REMINDER_ENABLED || "0") === "1",
    channels: parseList(process.env.TODO_REMINDER_CHANNELS) || DEFAULT_CHANNELS,
    slackChannels: parseList(process.env.TODO_REMINDER_SLACK_CHANNELS),
    telegramChatIds: parseList(process.env.TODO_REMINDER_TELEGRAM_CHAT_IDS),
    emailTo: parseList(process.env.TODO_REMINDER_EMAIL_TO),
    maxPerRun: toNumber(process.env.TODO_REMINDER_MAX_PER_RUN, DEFAULT_MAX_PER_RUN),
    intervalMinutes: toNumber(process.env.TODO_REMINDER_INTERVAL_MINUTES, DEFAULT_INTERVAL_MINUTES),
    runOnStartup: String(process.env.TODO_REMINDER_ON_STARTUP || "0") === "1"
  };
}

function normalizeConfigInput(value, defaults) {
  const cfg = value || {};
  return {
    enabled: cfg.enabled !== undefined ? Boolean(cfg.enabled) : defaults.enabled,
    channels: normalizeListInput(cfg.channels, defaults.channels || DEFAULT_CHANNELS),
    slackChannels: normalizeListInput(cfg.slackChannels, defaults.slackChannels),
    telegramChatIds: normalizeListInput(cfg.telegramChatIds, defaults.telegramChatIds),
    emailTo: normalizeListInput(cfg.emailTo, defaults.emailTo),
    maxPerRun: toNumber(cfg.maxPerRun, defaults.maxPerRun),
    intervalMinutes: toNumber(cfg.intervalMinutes, defaults.intervalMinutes),
    runOnStartup: cfg.runOnStartup !== undefined ? Boolean(cfg.runOnStartup) : defaults.runOnStartup
  };
}

export function getTodoReminderConfig(userId = "local") {
  const defaults = buildDefaultsFromEnv();
  const stored = getProvider("todo_reminders_config", userId) || {};
  return normalizeConfigInput(stored, defaults);
}

export function saveTodoReminderConfig(config, userId = "local") {
  const defaults = buildDefaultsFromEnv();
  const normalized = normalizeConfigInput(config, defaults);
  setProvider("todo_reminders_config", normalized, userId);
  return normalized;
}

function normalizeChannels(config) {
  const channels = Array.isArray(config.channels) ? config.channels : [];
  if (!channels.length) return ["in_app"];
  return channels.map(ch => String(ch || "").trim()).filter(Boolean);
}

function formatReminderMessage(todo) {
  const lines = [`Reminder: ${todo.title}`];
  if (todo.due) lines.push(`Due: ${todo.due}`);
  if (todo.details) lines.push(`Details: ${todo.details}`);
  if (todo.notes) lines.push(`Notes: ${todo.notes}`);
  return lines.join("\n");
}

async function sendSlackReminder({ text, channel }, deps = {}) {
  const executor = deps.executeAction || executeAction;
  const sendFn = deps.sendSlackMessage || sendSlackMessage;
  return await executor({
    actionType: "todo.reminder",
    params: { channel, text, transport: "slack" },
    context: { userId: "system" },
    outboundTargets: ["https://slack.com"],
    summary: `Send todo reminder to Slack ${channel}`,
    handler: async () => {
      await sendFn(channel, text);
      return { channel };
    }
  });
}

async function sendTelegramReminder({ text, chatId }, deps = {}) {
  const executor = deps.executeAction || executeAction;
  const sendFn = deps.sendTelegramMessage || sendTelegramMessage;
  return await executor({
    actionType: "todo.reminder",
    params: { chatId, text, transport: "telegram" },
    context: { userId: "system" },
    outboundTargets: ["https://api.telegram.org"],
    summary: `Send todo reminder via Telegram`,
    handler: async () => {
      await sendFn(chatId, text);
      return { chatId };
    }
  });
}

async function sendEmailReminder({ subject, text, recipients }, deps = {}) {
  const executor = deps.executeAction || executeAction;
  const sendFn = deps.sendGmailMessage || sendGmailMessage;
  return await executor({
    actionType: "todo.reminder",
    params: { to: recipients, subject, transport: "email" },
    context: { userId: "system" },
    outboundTargets: ["https://www.googleapis.com"],
    summary: `Send todo reminder email`,
    handler: async () => {
      const allowOutboxFallback = String(process.env.EMAIL_OUTBOX_FALLBACK || "0") === "1";
      const googleStatus = getGoogleStatus("local");
      const scopes = new Set(Array.isArray(googleStatus?.scopes) ? googleStatus.scopes : []);
      const hasSendScope = scopes.has("https://www.googleapis.com/auth/gmail.send");
      if (!googleStatus?.connected || !hasSendScope) {
        if (!allowOutboxFallback) throw new Error("gmail_send_scope_missing");
        const outbox = writeOutbox({
          type: "todo_reminder_email",
          to: recipients,
          subject,
          text,
          reason: "gmail_send_scope_missing"
        });
        return { transport: "outbox", outboxId: outbox.id };
      }
      const sent = await sendFn({ to: recipients, subject, text, fromName: String(process.env.EMAIL_FROM_NAME || "Aika Assistant"), userId: "local" });
      return { transport: "gmail", messageId: sent?.id || null };
    }
  });
}

function summarizeResults(results) {
  let sent = 0;
  let approvals = 0;
  let errors = 0;
  let approvalId = null;
  let errorMessage = "";
  for (const result of results) {
    if (result.status === "sent" || result.status === "in_app") sent += 1;
    if (result.status === "approval_required") {
      approvals += 1;
      approvalId = approvalId || result.approvalId || null;
    }
    if (result.status === "error") {
      errors += 1;
      if (!errorMessage) errorMessage = result.error || "reminder_failed";
    }
  }
  return { sent, approvals, errors, approvalId, errorMessage };
}

function loadReminderState(userId = "local") {
  const stored = getProvider("todo_reminders", userId);
  if (stored?.version === 1) return stored;
  return { version: 1, lastRunAt: null, lastRunSummary: null };
}

function saveReminderState(userId, summary) {
  const state = loadReminderState(userId);
  const next = { ...state, lastRunAt: new Date().toISOString(), lastRunSummary: summary };
  setProvider("todo_reminders", next, userId);
  return next;
}

export async function runTodoReminders({ userId = "local", config, deps = {} } = {}) {
  const cfg = config ? normalizeConfigInput(config, buildDefaultsFromEnv()) : getTodoReminderConfig(userId);
  if (!cfg.enabled) return { ok: false, disabled: true };
  const channels = normalizeChannels(cfg);
  const todos = listDueReminders({ userId, limit: cfg.maxPerRun });
  const summary = { ok: true, processed: 0, sent: 0, approvals: 0, errors: 0, items: [] };

  for (const todo of todos) {
    const text = formatReminderMessage(todo);
    const results = [];
    const sentAt = nowIso();
    if (channels.includes("slack") && cfg.slackChannels.length) {
      for (const channel of cfg.slackChannels) {
        try {
          const result = await sendSlackReminder({ text, channel }, deps);
          if (result.status === "approval_required") {
            results.push({ channel: "slack", status: "approval_required", approvalId: result.approval?.id || "" });
          } else {
            results.push({ channel: "slack", status: "sent" });
          }
        } catch (err) {
          results.push({ channel: "slack", status: "error", error: err?.message || "slack_failed" });
        }
      }
    }
    if (channels.includes("telegram") && cfg.telegramChatIds.length) {
      for (const chatId of cfg.telegramChatIds) {
        try {
          const result = await sendTelegramReminder({ text, chatId }, deps);
          if (result.status === "approval_required") {
            results.push({ channel: "telegram", status: "approval_required", approvalId: result.approval?.id || "" });
          } else {
            results.push({ channel: "telegram", status: "sent" });
          }
        } catch (err) {
          results.push({ channel: "telegram", status: "error", error: err?.message || "telegram_failed" });
        }
      }
    }
    if (channels.includes("email") && cfg.emailTo.length) {
      try {
        const subject = `Todo reminder: ${todo.title}`;
        const result = await sendEmailReminder({ subject, text, recipients: cfg.emailTo }, deps);
        if (result.status === "approval_required") {
          results.push({ channel: "email", status: "approval_required", approvalId: result.approval?.id || "" });
        } else {
          results.push({ channel: "email", status: "sent" });
        }
      } catch (err) {
        results.push({ channel: "email", status: "error", error: err?.message || "email_failed" });
      }
    }
    if (channels.includes("in_app") || results.length === 0) {
      results.push({ channel: "in_app", status: "in_app" });
    }

    const totals = summarizeResults(results);
    summary.processed += 1;
    summary.sent += totals.sent;
    summary.approvals += totals.approvals;
    summary.errors += totals.errors;
    summary.items.push({ id: todo.id, results });

    const updates = {
      id: todo.id,
      userId,
      reminderStatus: totals.sent > 0 ? "sent" : totals.approvals > 0 ? "approval_required" : totals.errors > 0 ? "error" : "skipped",
      reminderError: totals.errors > 0 ? totals.errorMessage : null,
      reminderApprovalId: totals.approvals > 0 ? totals.approvalId : null
    };
    if (totals.sent > 0) {
      updates.reminderSentAt = sentAt;
    }
    updateTodoRecord(updates);
  }

  saveReminderState(userId, summary);
  return summary;
}

let reminderTimer = null;

export function startTodoReminderLoop() {
  if (reminderTimer) return;
  const config = getTodoReminderConfig("local");
  if (!config.enabled) return;
  if (config.runOnStartup) {
    runTodoReminders({ userId: "local" }).catch(() => {});
  }
  const intervalMs = Math.max(60_000, (config.intervalMinutes || DEFAULT_INTERVAL_MINUTES) * 60_000);
  reminderTimer = setInterval(() => {
    runTodoReminders({ userId: "local" }).catch(() => {});
  }, intervalMs);
}

export function getTodoReminderStatus(userId = "local") {
  const config = getTodoReminderConfig(userId);
  const state = loadReminderState(userId);
  return {
    enabled: config.enabled,
    lastRunAt: state.lastRunAt || null,
    lastRunSummary: state.lastRunSummary || null
  };
}
