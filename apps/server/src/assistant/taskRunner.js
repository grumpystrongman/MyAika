import { responsesCreate } from "../llm/openaiClient.js";
import { nowIso } from "../../storage/utils.js";
import {
  listAssistantTasks,
  listDueAssistantTasks,
  recordAssistantTaskRun,
  computeNextRunAt
} from "../../storage/assistant_tasks.js";
import { listAssistantProposals } from "../../storage/assistant_change_proposals.js";
import { executeAction } from "../safety/executeAction.js";
import { executor } from "../../mcp/index.js";
import { sendTelegramMessage } from "../../integrations/messaging.js";
import { getTradingKnowledgeHealthSnapshot } from "../trading/knowledgeRag.js";
import { buildDigestByType } from "../aika/digestEngine.js";
import { listAuditEvents } from "../safety/auditLog.js";
import { injectCalendarBriefing } from "../calendar/briefing.js";

let runnerInterval = null;
let runnerActive = false;
// OpenAI client handled by shared wrapper.

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

function formatPendingProposals(ownerId) {
  const proposals = listAssistantProposals(ownerId, { status: "pending", limit: 20 });
  if (!proposals.length) return "No pending change proposals.";
  return proposals.map(proposal => {
    const summary = proposal.summary ? ` - ${proposal.summary}` : "";
    const approval = proposal.approvalId ? ` (approval: ${proposal.approvalId})` : "";
    return `- ${proposal.title}${approval}${summary}`;
  }).join("\n");
}

function formatTaskFailures(ownerId) {
  const tasks = listAssistantTasks(ownerId, { limit: 50 });
  const failures = tasks.filter(task => ["error", "partial", "approval_required"].includes(task.lastRunStatus));
  if (!failures.length) return "No recent task failures.";
  return failures.map(task => {
    const status = task.lastRunStatus || "error";
    const lastRun = task.lastRunAt || "unknown";
    const error = task.lastRunError ? ` - ${task.lastRunError}` : "";
    return `- ${task.title} (${status}, last run ${lastRun})${error}`;
  }).join("\n");
}

function formatAuditRecent() {
  const events = listAuditEvents({ limit: 20 });
  if (!events.length) return "No recent audit events.";
  return events.map(event => {
    const ts = event.ts || "";
    const action = event.action_type || "unknown";
    const decision = event.decision || "";
    const reason = event.reason ? ` - ${event.reason}` : "";
    return `- ${ts} ${action} ${decision}${reason}`;
  }).join("\n");
}

function injectTradingKnowledgeSnapshot(prompt) {
  let output = String(prompt || "");
  if (!output.includes("{{trading_knowledge_health")) return output;
  const cache = new Map();
  const regex = /\{\{trading_knowledge_health(?::([^}]+))?\}\}/gi;
  output = output.replace(regex, (_match, rawCollection) => {
    const collectionId = String(rawCollection || "trading").trim() || "trading";
    if (!cache.has(collectionId)) {
      cache.set(collectionId, getTradingKnowledgeHealthSnapshot({ collectionId }));
    }
    return cache.get(collectionId);
  });
  return output;
}

async function injectAikaDigest(prompt, task) {
  let output = String(prompt || "");
  if (!output.includes("{{aika_digest")) return { output, used: false };
  const ownerId = task?.ownerId || "local";
  const regex = /\{\{aika_digest:([^}]+)\}\}/gi;
  let used = false;
  const matches = Array.from(output.matchAll(regex));
  for (const match of matches) {
    const type = String(match[1] || "daily").trim();
    const digest = await buildDigestByType(type, { userId: ownerId });
    output = output.replace(match[0], digest?.text || "");
    used = true;
  }
  return { output, used };
}

function injectOpsSnapshots(prompt, task) {
  let output = String(prompt || "");
  const ownerId = task?.ownerId || "local";
  if (output.includes("{{assistant_proposals:pending}}") || output.includes("{{assistant_ops:pending_proposals}}")) {
    const snapshot = formatPendingProposals(ownerId);
    output = output
      .replace(/\{\{assistant_proposals:pending\}\}/gi, snapshot)
      .replace(/\{\{assistant_ops:pending_proposals\}\}/gi, snapshot);
  }
  if (output.includes("{{assistant_ops:task_failures}}")) {
    output = output.replace(/\{\{assistant_ops:task_failures\}\}/gi, formatTaskFailures(ownerId));
  }
  if (output.includes("{{assistant_ops:audit_recent}}")) {
    output = output.replace(/\{\{assistant_ops:audit_recent\}\}/gi, formatAuditRecent());
  }
  return output;
}

async function runTaskPrompt(task) {
  let prompt = String(task.prompt || "").trim();
  prompt = injectTradingKnowledgeSnapshot(prompt);
  prompt = injectOpsSnapshots(prompt, task);
  const digestInjected = await injectAikaDigest(prompt, task);
  prompt = digestInjected.output;
  let fallbackOutput = "";
  if (prompt.includes("{{calendar_briefing_context}}")) {
    const injected = await injectCalendarBriefing(prompt, task);
    prompt = injected.prompt || prompt;
    fallbackOutput = injected.fallbackOutput || "";
  }
  if (!prompt) throw new Error("task_prompt_missing");
  const forceTemplate = String(process.env.AIKA_DIGEST_FORCE_TEMPLATE || "1") !== "0";
  if (digestInjected.used && forceTemplate) {
    return prompt || "Digest generated.";
  }
  if (!process.env.OPENAI_API_KEY) {
    if (fallbackOutput) return fallbackOutput;
    return prompt || "Task executed. Configure OPENAI_API_KEY for AI-generated output.";
  }
  const system = "You are Aika, a personal assistant. Provide a concise, actionable response for the scheduled task.";
  const response = await responsesCreate({
    model: process.env.OPENAI_PRIMARY_MODEL || process.env.OPENAI_MODEL || "gpt-4o-mini",
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

  const result = await executor.callTool({
    name: "email.send",
    params: { to: recipients, subject, body: text },
    context: { userId: task?.ownerId || "local", source: "assistant_task" }
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

