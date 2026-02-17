import OpenAI from "openai";
import { writeOutbox } from "../../storage/outbox.js";
import { nowIso } from "../../storage/utils.js";
import {
  listDueAssistantTasks,
  recordAssistantTaskRun,
  computeNextRunAt
} from "../../storage/assistant_tasks.js";
import { executeAction } from "../safety/executeAction.js";
import { sendGmailMessage, getGoogleStatus } from "../../integrations/google.js";
import { sendTelegramMessage } from "../../integrations/messaging.js";

let runnerInterval = null;
let runnerActive = false;
let openaiClient = null;

function getOpenAIClient() {
  const apiKey = process.env.OPENAI_API_KEY || "";
  if (!apiKey) return null;
  if (!openaiClient) openaiClient = new OpenAI({ apiKey });
  return openaiClient;
}

function parseList(value) {
  return String(value || "")
    .split(/[;,\n]/)
    .map(item => item.trim())
    .filter(Boolean);
}

function limitText(value, maxChars = 8000) {
  const text = String(value || "").trim();
  if (!maxChars || text.length <= maxChars) return text;
  return `${text.slice(0, maxChars)}...`;
}

async function runTaskPrompt(task) {
  const prompt = String(task.prompt || "").trim();
  if (!prompt) throw new Error("task_prompt_missing");
  const client = getOpenAIClient();
  if (!client) {
    return "Task executed. Configure OPENAI_API_KEY for AI-generated output.";
  }
  const system = "You are Aika, a personal assistant. Provide a concise, actionable response for the scheduled task.";
  const response = await client.responses.create({
    model: process.env.OPENAI_MODEL || "gpt-4o-mini",
    input: [
      { role: "system", content: [{ type: "input_text", text: system }] },
      { role: "user", content: [{ type: "input_text", text: prompt }] }
    ],
    max_output_tokens: Number(process.env.OPENAI_MAX_OUTPUT_TOKENS || 300)
  });
  return String(response?.output_text || "").trim() || "No output produced.";
}

async function sendTaskEmail({ task, output }) {
  const recipients = (task.notificationTargets?.emailTo || []).length
    ? task.notificationTargets.emailTo
    : parseList(process.env.ASSISTANT_TASK_EMAIL_TO || "");
  if (!recipients.length) throw new Error("task_email_recipients_missing");
  const subjectPrefix = process.env.ASSISTANT_TASK_EMAIL_SUBJECT_PREFIX || "Aika Task";
  const subject = `${subjectPrefix}: ${task.title}`;
  const text = limitText(output, 12000);
  const fromName = String(process.env.EMAIL_FROM_NAME || "Aika Assistant");
  const allowOutboxFallback = String(process.env.EMAIL_OUTBOX_FALLBACK || "0").toLowerCase() === "1";

  const result = await executeAction({
    actionType: "email.send",
    params: { to: recipients, subject },
    context: { userId: "system" },
    outboundTargets: ["https://www.googleapis.com"],
    summary: `Send task update email for ${task.title}`,
    handler: async () => {
      const googleStatus = getGoogleStatus("local");
      const scopes = new Set(Array.isArray(googleStatus?.scopes) ? googleStatus.scopes : []);
      const hasSendScope = scopes.has("https://www.googleapis.com/auth/gmail.send");
      if (!googleStatus?.connected || !hasSendScope) {
        if (!allowOutboxFallback) throw new Error("gmail_send_scope_missing");
        const outbox = writeOutbox({
          type: "assistant_task_email",
          to: recipients,
          subject,
          text,
          taskId: task.id,
          reason: "gmail_send_scope_missing"
        });
        return { transport: "outbox", outboxId: outbox.id };
      }
      const sent = await sendGmailMessage({
        to: recipients,
        subject,
        text,
        fromName,
        userId: "local"
      });
      return { transport: "gmail", messageId: sent?.id || null };
    }
  });

  if (result.status === "approval_required") {
    return { status: "approval_required", approval: result.approval };
  }
  return { status: "sent", result: result.data };
}

async function sendTaskTelegram({ task, output }) {
  const chatIds = (task.notificationTargets?.telegramChatIds || []).length
    ? task.notificationTargets.telegramChatIds
    : parseList(process.env.ASSISTANT_TASK_TELEGRAM_CHAT_ID || process.env.TELEGRAM_CHAT_ID || "");
  if (!chatIds.length) throw new Error("task_telegram_chat_missing");
  const text = limitText(output, 3500);
  const result = await executeAction({
    actionType: "messaging.telegramSend",
    params: { chatIds, text },
    context: { userId: "system" },
    outboundTargets: ["https://api.telegram.org"],
    summary: `Send task update via Telegram for ${task.title}`,
    handler: async () => {
      for (const chatId of chatIds) {
        await sendTelegramMessage(chatId, text);
      }
      return { sent: true, count: chatIds.length };
    }
  });
  if (result.status === "approval_required") {
    return { status: "approval_required", approval: result.approval };
  }
  return { status: "sent", result: result.data };
}

async function notifyTask(task, output) {
  const channels = Array.isArray(task.notificationChannels) && task.notificationChannels.length
    ? task.notificationChannels
    : ["in_app"];
  const results = [];
  for (const channel of channels) {
    try {
      if (channel === "email") {
        results.push({ channel, ...(await sendTaskEmail({ task, output })) });
        continue;
      }
      if (channel === "telegram") {
        results.push({ channel, ...(await sendTaskTelegram({ task, output })) });
        continue;
      }
      results.push({ channel, status: "in_app" });
    } catch (err) {
      results.push({ channel, status: "error", error: String(err?.message || err) });
    }
  }
  return results;
}

function summarizeNotificationStatus(results) {
  let sent = 0;
  let approvals = 0;
  let errors = 0;
  for (const item of results) {
    if (item.status === "sent" || item.status === "in_app") sent += 1;
    if (item.status === "approval_required") approvals += 1;
    if (item.status === "error") errors += 1;
  }
  return { sent, approvals, errors };
}

export async function runDueAssistantTasks({ limit = 10 } = {}) {
  if (runnerActive) return;
  runnerActive = true;
  try {
    const tasks = listDueAssistantTasks({ limit });
    for (const task of tasks) {
      const startedAt = nowIso();
      let output = "";
      let lastRunStatus = "ok";
      let lastRunError = "";
      try {
        output = await runTaskPrompt(task);
        const notifyResults = await notifyTask(task, output);
        const summary = summarizeNotificationStatus(notifyResults);
        const firstError = notifyResults.find(item => item.status === "error")?.error || "";
        if (firstError) lastRunError = firstError;
        if (summary.errors > 0 && summary.sent > 0) {
          lastRunStatus = "partial";
        } else if (summary.errors > 0) {
          lastRunStatus = "error";
        } else if (summary.approvals > 0) {
          lastRunStatus = "approval_required";
        }
      } catch (err) {
        lastRunStatus = "error";
        lastRunError = String(err?.message || err);
      }

      const schedule = task.schedule || null;
      let nextRunAt = "";
      let status = task.status || "active";
      if (schedule?.type === "once") {
        status = "completed";
        nextRunAt = "";
      } else {
        nextRunAt = computeNextRunAt(schedule, new Date()) || "";
        status = task.status || "active";
      }

      recordAssistantTaskRun(task.id, {
        lastRunAt: startedAt,
        lastRunStatus,
        lastRunOutput: output,
        lastRunError,
        nextRunAt,
        status
      });
    }
  } finally {
    runnerActive = false;
  }
}

export function startAssistantTasksLoop() {
  if (runnerInterval) return;
  const intervalMs = Number(process.env.ASSISTANT_TASK_POLL_MS || 60000);
  const runOnStartup = String(process.env.ASSISTANT_TASK_RUN_ON_STARTUP || "0") === "1";
  if (runOnStartup) {
    runDueAssistantTasks().catch(() => {});
  }
  runnerInterval = setInterval(() => {
    runDueAssistantTasks().catch(() => {});
  }, Math.max(5000, intervalMs));
}

export function stopAssistantTasksLoop() {
  if (runnerInterval) clearInterval(runnerInterval);
  runnerInterval = null;
}
