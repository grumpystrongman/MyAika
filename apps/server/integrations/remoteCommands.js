import { executor, registry } from "../mcp/index.js";
import { listApprovals, getApproval, denyApproval } from "../mcp/approvals.js";
import { getActionRun } from "../src/agent/actionRunStore.js";
import { findRunByApprovalId } from "../src/desktopRunner/runStore.js";
import { continueDesktopRun } from "../src/desktopRunner/runner.js";
import {
  crawlTradingRssSources,
  listTradingRssSourcesUi,
  addTradingRssSource,
  removeTradingRssSource,
  seedRssSourcesFromFeedspot
} from "../src/trading/rssIngest.js";
import {
  crawlTradingSources,
  listTradingSourcesUi,
  addTradingSource,
  removeTradingSource
} from "../src/trading/knowledgeRag.js";
import { listMacros, getMacro, applyMacroParams } from "../src/actionRunner/macros.js";
import { listDesktopMacros, getDesktopMacro, buildDesktopMacroPlan } from "../src/desktopRunner/macros.js";
import { listRagModels } from "../src/rag/collections.js";
import { getActiveThread, createThread, closeThread, ensureActiveThread, setThreadRagModel } from "../storage/threads.js";
import { getSkillsState } from "../skills/index.js";
import { getRuntimeFlags } from "../storage/runtime_flags.js";
import { approveSafetyApproval, rejectSafetyApproval } from "../src/safety/approvals.js";
import { routeAikaCommand } from "../src/aika/commandRouter.js";
import { listModuleRuns } from "../storage/module_runs.js";
import {
  startCodexRun,
  getCodexRun,
  listCodexRuns,
  readCodexLastMessage,
  tailCodexLog
} from "../src/codex/runner.js";
import { sendTelegramMessage } from "./messaging.js";

const DEFAULT_PORT = 8790;

function getBaseUrl() {
  const port = process.env.PORT || DEFAULT_PORT;
  return `http://127.0.0.1:${port}`;
}

function getUiBaseUrl() {
  return String(process.env.WEB_UI_URL || "http://localhost:3000").replace(/\/+$/, "");
}

function buildCallLink(meta = {}) {
  const base = getUiBaseUrl();
  const params = new URLSearchParams();
  params.set("channel", meta.channel || "telegram");
  if (meta.senderId) params.set("senderId", meta.senderId);
  if (meta.senderName) params.set("senderName", meta.senderName);
  if (meta.chatId) params.set("chatId", meta.chatId);
  return `${base}/telegram-call?${params.toString()}`;
}

function parseCommand(raw) {
  const trimmed = String(raw || "").trim();
  if (!trimmed) return null;
  const lower = trimmed.toLowerCase();
  if (lower === "approve" || lower === "deny" || lower === "approvals") {
    return { line: trimmed, cmd: lower, args: [] };
  }
  if (lower.startsWith("approve ") || lower.startsWith("deny ")) {
    const parts = trimmed.split(/\s+/);
    const candidate = parts[1] || "";
    if (/^[0-9a-f]{8,}$/i.test(candidate)) {
      return { line: trimmed, cmd: parts[0].toLowerCase(), args: parts.slice(1) };
    }
  }
  let line = "";
  if (trimmed.startsWith("/") || trimmed.startsWith("!")) {
    line = trimmed.slice(1).trim();
  } else if (lower.startsWith("cmd:")) {
    line = trimmed.slice(4).trim();
  } else {
    return null;
  }
  if (!line) return null;
  const parts = line.split(/\s+/);
  return { line, cmd: parts[0].toLowerCase(), args: parts.slice(1) };
}

function parseBoolFlag(args, name) {
  return args.some(arg => arg.toLowerCase() === name || arg.toLowerCase() === `--${name}`);
}

function parseList(value) {
  return String(value || "")
    .split(",")
    .map(item => item.trim())
    .filter(Boolean);
}

function parseJsonPayload(raw) {
  if (!raw) return null;
  const cleaned = String(raw || "").trim();
  if (!cleaned) return null;
  if (!cleaned.startsWith("{") && !cleaned.startsWith("[")) return null;
  try {
    return JSON.parse(cleaned);
  } catch {
    return null;
  }
}

function parseKeyValueArgs(args = []) {
  const params = {};
  for (const arg of args) {
    const raw = String(arg || "");
    if (!raw || raw.startsWith("--")) continue;
    const idx = raw.indexOf("=");
    if (idx === -1) continue;
    const key = raw.slice(0, idx).trim();
    const value = raw.slice(idx + 1).trim();
    if (!key) continue;
    params[key] = value;
  }
  return params;
}

function formatList(items, formatter, max = 8) {
  if (!items.length) return "None.";
  const rows = items.slice(0, max).map(formatter);
  const more = items.length > max ? `\n...and ${items.length - max} more.` : "";
  return `${rows.join("\n")}${more}`;
}

async function fetchLocalStatus() {
  const base = getBaseUrl();
  const resp = await fetch(`${base}/api/status`);
  if (!resp.ok) throw new Error("status_unavailable");
  return await resp.json();
}

function formatStatus(status) {
  const uptime = status?.server?.uptimeSec ?? null;
  const ttsEngine = status?.tts?.engine || "unknown";
  const telegram = status?.integrations?.telegram?.connected ? "connected" : "disconnected";
  const webOnline = status?.server?.ok ? "ok" : "down";
  const uptimeLine = Number.isFinite(uptime) ? `Uptime: ${uptime}s` : "Uptime: unknown";
  return [
    `Server: ${webOnline}`,
    uptimeLine,
    `TTS: ${ttsEngine}`,
    `Telegram: ${telegram}`
  ].join("\n");
}

async function callLocalChat({ userText, channel, senderId, senderName, chatId } = {}) {
  const base = getBaseUrl();
  const resp = await fetch(`${base}/chat`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      userText,
      channel,
      senderId,
      senderName,
      chatId
    })
  });
  if (!resp.ok) {
    return { text: "I'm having trouble responding right now." };
  }
  return await resp.json();
}

function buildCalendarPrompt(args = []) {
  const raw = args.join(" ").trim();
  if (!raw) return "what's on my calendar this week";
  return `what's on my calendar ${raw}`;
}

function buildInboxPrompt(args = []) {
  const raw = args.join(" ").trim();
  if (!raw) return "what's in my inbox";
  return `what's in my inbox ${raw}`;
}

async function handleCalendarCommand(args, meta) {
  const prompt = buildCalendarPrompt(args);
  const response = await callLocalChat({
    userText: prompt,
    channel: meta.channel,
    senderId: meta.senderId,
    senderName: meta.senderName,
    chatId: meta.chatId
  });
  return response?.text || "No calendar response available.";
}

async function handleInboxCommand(args, meta) {
  const prompt = buildInboxPrompt(args);
  const response = await callLocalChat({
    userText: prompt,
    channel: meta.channel,
    senderId: meta.senderId,
    senderName: meta.senderName,
    chatId: meta.chatId
  });
  return response?.text || "No inbox response available.";
}

async function handleRssCommand(args) {
  const sub = (args[0] || "help").toLowerCase();
  if (["help", "?"].includes(sub)) {
    return "RSS commands: /rss list | /rss crawl [--force] | /rss seed <url> | /rss add <url> | /rss remove <id>";
  }
  if (["list", "ls"].includes(sub)) {
    const items = listTradingRssSourcesUi({ limit: 100, includeDisabled: true });
    const formatted = formatList(items, item => {
      const status = item.enabled ? "on" : "off";
      const title = item.title ? ` - ${item.title}` : "";
      return `- ${item.id} [${status}] ${item.url}${title}`;
    });
    return `RSS sources (${items.length}):\n${formatted}`;
  }
  if (["crawl", "sync"].includes(sub)) {
    const force = parseBoolFlag(args, "force");
    const sources = listTradingRssSourcesUi({ limit: 500, includeDisabled: false });
    if (!sources.length) return "No enabled RSS sources. Use /rss add or /rss seed first.";
    const result = await crawlTradingRssSources({
      entries: sources.map(item => ({ id: item.id, url: item.url, title: item.title, tags: item.tags || [] })),
      force
    });
    return `RSS crawl complete. Total: ${result.total || 0}, ingested: ${result.ingested || 0}, skipped: ${result.skipped || 0}, errors: ${result.errors?.length || 0}.`;
  }
  if (["seed"].includes(sub)) {
    const url = args[1] || "https://rss.feedspot.com/stock_market_news_rss_feeds/";
    const result = await seedRssSourcesFromFeedspot(url);
    return `RSS seed complete. Added: ${result.added || 0}, disabled: ${result.disabled || 0}.`;
  }
  if (["add"].includes(sub)) {
    const url = args[1];
    if (!url) return "Usage: /rss add <url>";
    const source = addTradingRssSource({ url });
    return `Added RSS source ${source.id}: ${source.url}`;
  }
  if (["remove", "delete", "rm"].includes(sub)) {
    const id = Number(args[1]);
    if (!Number.isFinite(id)) return "Usage: /rss remove <id>";
    removeTradingRssSource(id);
    return `Removed RSS source ${id}.`;
  }
  return "Unknown RSS command. Try /rss help";
}

async function handleKnowledgeCommand(args) {
  const sub = (args[0] || "help").toLowerCase();
  if (["help", "?"].includes(sub)) {
    return "Knowledge commands: /knowledge list | /knowledge crawl [--force] | /knowledge add <url> | /knowledge remove <id>";
  }
  if (["list", "ls"].includes(sub)) {
    const items = listTradingSourcesUi({ limit: 100, includeDisabled: true });
    const formatted = formatList(items, item => {
      const status = item.enabled ? "on" : "off";
      const tags = item.tags?.length ? ` [${item.tags.join(", ")}]` : "";
      return `- ${item.id} [${status}] ${item.url}${tags}`;
    });
    return `Trading sources (${items.length}):\n${formatted}`;
  }
  if (["crawl", "sync"].includes(sub)) {
    const force = parseBoolFlag(args, "force");
    const storedSources = listTradingSourcesUi({ limit: 500, includeDisabled: false });
    if (!storedSources.length && !String(process.env.TRADING_RAG_SOURCES || "").trim()) {
      return "No trading sources configured. Add one with /knowledge add <url>.";
    }
    const result = await crawlTradingSources({
      entries: storedSources.length
        ? storedSources.map(item => ({ id: item.id, url: item.url, tags: item.tags || [], sourceGroup: item.url }))
        : undefined,
      force
    });
    return `Knowledge crawl complete. Total: ${result.total || 0}, ingested: ${result.ingested || 0}, skipped: ${result.skipped || 0}, errors: ${result.errors?.length || 0}.`;
  }
  if (["add"].includes(sub)) {
    const url = args[1];
    if (!url) return "Usage: /knowledge add <url>";
    const source = addTradingSource({ url });
    return `Added trading source ${source.id}: ${source.url}`;
  }
  if (["remove", "delete", "rm"].includes(sub)) {
    const id = Number(args[1]);
    if (!Number.isFinite(id)) return "Usage: /knowledge remove <id>";
    const result = removeTradingSource(id, { deleteKnowledge: false });
    if (!result?.ok) return "Source not found.";
    return `Removed trading source ${id}.`;
  }
  return "Unknown knowledge command. Try /knowledge help";
}

async function handleMacroCommand(args, context) {
  const sub = (args[0] || "help").toLowerCase();
  if (["help", "?"].includes(sub)) {
    return "Macro commands: /macro list | /macro run <id> [--desktop|--browser] [key=value...]";
  }
  if (["list", "ls"].includes(sub)) {
    const macros = listMacros();
    const desktop = listDesktopMacros();
    const formatted = formatList(macros, macro => `- [browser] ${macro.id}: ${macro.name}`);
    const formattedDesktop = formatList(desktop, macro => `- [desktop] ${macro.id}: ${macro.name}`);
    return [
      `Browser macros (${macros.length}):`,
      formatted,
      `Desktop macros (${desktop.length}):`,
      formattedDesktop
    ].join("\n");
  }
  if (["run", "start"].includes(sub)) {
    const isDesktop = parseBoolFlag(args, "desktop") || parseBoolFlag(args, "d");
    const isBrowser = parseBoolFlag(args, "browser") || parseBoolFlag(args, "web");
    const filtered = args.slice(1).filter(arg => !String(arg || "").startsWith("--"));
    const id = filtered[0] || "";
    if (!id) return "Usage: /macro run <id> [--desktop|--browser] [key=value...]";
    const params = parseKeyValueArgs(filtered.slice(1));

    let macro = null;
    let mode = "";
    if (!isDesktop) {
      macro = getMacro(id);
      if (macro) mode = "browser";
    }
    if (!macro && !isBrowser) {
      macro = getDesktopMacro(id);
      if (macro) mode = "desktop";
    }
    if (!macro) return `Macro not found: ${id}`;

    if (mode === "desktop") {
      const plan = buildDesktopMacroPlan(macro, { params });
      const result = await executor.callTool({
        name: "desktop.run",
        params: { ...plan, async: true },
        context
      });
      if (result?.status === "approval_required") {
        return `Approval required: ${result.approval?.id}. Reply /approve ${result.approval?.id}`;
      }
      const runId = result?.data?.runId || result?.data?.id || "";
      return runId ? `Desktop macro started. Run ID: ${runId}` : "Desktop macro started.";
    }

    const plan = applyMacroParams(macro, params);
    const result = await executor.callTool({
      name: "action.run",
      params: { ...plan, async: true },
      context
    });
    if (result?.status === "approval_required") {
      return `Approval required: ${result.approval?.id}. Reply /approve ${result.approval?.id}`;
    }
    const runId = result?.data?.runId || result?.data?.id || "";
    return runId ? `Macro started. Run ID: ${runId}` : "Macro started.";
  }
  return "Unknown macro command. Try /macro help";
}

function formatThreadStatus(thread) {
  if (!thread) return "No active thread. Use /thread new to start one.";
  const ragModel = thread.rag_model || "auto";
  const started = thread.created_at || "unknown";
  const last = thread.last_message_at || "n/a";
  return [
    `Thread: ${thread.id}`,
    `Status: ${thread.status || "active"}`,
    `RAG: ${ragModel}`,
    `Started: ${started}`,
    `Last message: ${last}`
  ].join("\n");
}

function normalizeRagSelection(value) {
  const normalized = String(value || "").trim().toLowerCase();
  if (!normalized || ["auto", "off", "none", "default"].includes(normalized)) return "auto";
  return normalized;
}

function formatRagModelsList(models) {
  const formatted = formatList(
    models,
    model => {
      const kind = model.kind || "custom";
      const desc = model.description ? ` - ${model.description}` : "";
      return `- ${model.id} [${kind}]${desc}`;
    },
    12
  );
  return `RAG models (special: auto, all):\n${formatted}`;
}

async function handleThreadCommand(args, meta) {
  const sub = (args[0] || "status").toLowerCase();
  if (["help", "?"].includes(sub)) {
    return "Thread commands: /thread new | /thread stop | /thread status";
  }
  if (["new", "start", "reset"].includes(sub)) {
    const active = getActiveThread(meta);
    if (active) closeThread(active.id);
    const next = createThread({
      channel: meta.channel,
      senderId: meta.senderId,
      chatId: meta.chatId,
      senderName: meta.senderName,
      workspaceId: meta.workspaceId
    });
    if (!next) return "Unable to start a new thread.";
    return `Started new thread ${next.id}. Memory is fresh for this conversation.`;
  }
  if (["stop", "end", "close", "off"].includes(sub)) {
    const active = getActiveThread(meta);
    if (!active) return "No active thread to stop.";
    closeThread(active.id);
    return "Thread closed. Send /thread new to start a fresh one.";
  }
  if (["status", "info"].includes(sub)) {
    return formatThreadStatus(getActiveThread(meta));
  }
  return "Thread commands: /thread new | /thread stop | /thread status";
}

function handleRagCommand(args, meta) {
  const sub = (args[0] || "status").toLowerCase();
  if (["help", "?"].includes(sub)) {
    return "RAG commands: /rag list | /rag use <id|all|auto> | /rag status";
  }
  if (["list", "ls"].includes(sub)) {
    const models = listRagModels();
    return formatRagModelsList(models);
  }
  if (["status", "info"].includes(sub)) {
    const active = getActiveThread(meta);
    if (!active) return "No active thread. Use /thread new to start one.";
    return `Thread RAG: ${active.rag_model || "auto"}`;
  }
  let target = "";
  if (["use", "set"].includes(sub)) {
    target = args[1] || "";
  } else if (sub) {
    target = args[0] || "";
  }
  if (!target) return "Usage: /rag use <id|all|auto>";
  const normalized = normalizeRagSelection(target);
  const models = listRagModels();
  const ids = new Set(models.map(model => String(model.id || "").toLowerCase()));
  if (normalized !== "auto" && normalized !== "all" && !ids.has(normalized)) {
    return `Unknown RAG model "${target}". Try /rag list.`;
  }
  const thread = ensureActiveThread({
    channel: meta.channel,
    senderId: meta.senderId,
    chatId: meta.chatId,
    senderName: meta.senderName,
    workspaceId: meta.workspaceId
  });
  if (!thread) return "Unable to set RAG model (no active thread).";
  setThreadRagModel(thread.id, normalized);
  return normalized === "auto"
    ? "RAG set to auto (Aika will choose when to use it)."
    : `RAG model set to ${normalized} for this thread.`;
}

async function handleRestart(context) {
  const result = await executor.callTool({
    name: "system.modify",
    params: { operation: "restart" },
    context
  });
  if (result?.status === "approval_required") {
    return `Approval required: ${result.approval?.id}. Reply /approve ${result.approval?.id}`;
  }
  return "Restarting Aika services.";
}

function getApprovalToken(args) {
  const tokenArg = args.find(arg => arg.startsWith("token="));
  if (tokenArg) return tokenArg.split("=").slice(1).join("=").trim();
  return args[1] || "";
}

async function handleAikaRoute(text, context) {
  const result = await routeAikaCommand({ text, context });
  if (!result?.handled) return "Command not understood.";
  return result.reply || "Done.";
}

function formatMissionStatus(ownerId = "local") {
  const runs = listModuleRuns({ userId: ownerId, limit: 5 });
  if (!runs.length) return "No recent missions or module runs.";
  return runs.map(run => `- ${run.moduleId} (${run.status}) ${run.createdAt || ""}`).join("\n");
}

function truncateTelegram(text, maxChars = 3900) {
  const cleaned = String(text || "");
  if (cleaned.length <= maxChars) return cleaned;
  return `${cleaned.slice(0, maxChars - 20).trim()}… (truncated)`;
}

function resolveCodexAllowedChatIds() {
  const explicit = parseList(process.env.CODEX_REMOTE_CHAT_IDS || process.env.CODEX_REMOTE_ALLOWED_CHAT_IDS || "");
  if (explicit.length) return explicit;
  const fallback = parseList(process.env.ASSISTANT_TASK_TELEGRAM_CHAT_ID || process.env.TELEGRAM_CHAT_ID || "");
  return fallback;
}

function isCodexEnabled() {
  return String(process.env.CODEX_REMOTE_ENABLED || "") === "1";
}

function isCodexAuthorized(meta = {}) {
  if (meta.channel !== "telegram") return false;
  const allowed = resolveCodexAllowedChatIds();
  if (!allowed.length) return true;
  const chatId = String(meta.chatId || "");
  return allowed.includes(chatId);
}

function parseCodexArgs(args = []) {
  const divider = args.indexOf("--");
  const flagArgs = divider === -1 ? args : args.slice(0, divider);
  const promptParts = divider === -1 ? [] : args.slice(divider + 1);
  let mode = "";
  let model = "";
  let profile = "";

  for (let i = 0; i < flagArgs.length; i += 1) {
    const raw = flagArgs[i];
    const lower = String(raw || "").toLowerCase();
    if (!lower) continue;
    if (lower === "--full") {
      mode = "full";
      continue;
    }
    if (lower === "--safe") {
      mode = "safe";
      continue;
    }
    if (lower === "--read-only" || lower === "--readonly") {
      mode = "read-only";
      continue;
    }
    if (lower.startsWith("--mode=")) {
      mode = lower.split("=").slice(1).join("=").trim();
      continue;
    }
    if (lower === "--model") {
      model = flagArgs[i + 1] || "";
      i += 1;
      continue;
    }
    if (lower.startsWith("--model=")) {
      model = raw.split("=").slice(1).join("=").trim();
      continue;
    }
    if (lower === "--profile") {
      profile = flagArgs[i + 1] || "";
      i += 1;
      continue;
    }
    if (lower.startsWith("--profile=")) {
      profile = raw.split("=").slice(1).join("=").trim();
      continue;
    }
    promptParts.push(raw);
  }

  return {
    mode,
    model,
    profile,
    prompt: promptParts.join(" ").trim()
  };
}

function formatCodexRunStatus(run, includePrompt = false) {
  if (!run) return "Codex run not found.";
  const lines = [
    `Run: ${run.id}`,
    `Status: ${run.status || "unknown"}`,
    `Mode: ${run.mode || "safe"}`,
    `Started: ${run.startedAt || "n/a"}`,
    `Finished: ${run.finishedAt || "n/a"}`
  ];
  if (Number.isFinite(run.exitCode)) {
    lines.push(`Exit: ${run.exitCode}`);
  }
  if (run.error) {
    lines.push(`Error: ${run.error}`);
  }
  if (includePrompt && run.prompt) {
    lines.push(`Prompt: ${run.prompt.slice(0, 160)}${run.prompt.length > 160 ? "…" : ""}`);
  }
  return lines.join("\n");
}

function looksLikeRunId(value) {
  return /^[0-9a-f-]{8,}$/i.test(String(value || ""));
}

async function handleCodexCommand(args, meta) {
  const sub = (args[0] || "").toLowerCase();
  if (!isCodexEnabled()) {
    return "Codex remote is disabled. Set CODEX_REMOTE_ENABLED=1 to enable.";
  }
  if (!isCodexAuthorized(meta)) {
    return "Codex remote access is not authorized for this chat.";
  }

  if (!sub || ["help", "?", "commands"].includes(sub)) {
    return [
      "Codex commands:",
      "/codex <instructions>",
      "/codex --full|--safe|--read-only <instructions>",
      "/codex status <runId>",
      "/codex last",
      "/codex tail <runId> [stdout|stderr]",
      "Tip: use /codex --safe if you want sandboxed edits."
    ].join("\n");
  }

  if (["status", "info"].includes(sub) && looksLikeRunId(args[1])) {
    const id = args[1] || "";
    return formatCodexRunStatus(getCodexRun(id), true);
  }

  if (["last", "latest"].includes(sub) && args.length === 1) {
    const last = listCodexRuns(1)[0];
    if (!last) return "No Codex runs found.";
    const summary = readCodexLastMessage(last.id, 1200);
    const status = formatCodexRunStatus(last, false);
    return summary ? `${status}\n\nSummary:\n${summary}` : status;
  }

  if (["tail", "log", "logs"].includes(sub) && looksLikeRunId(args[1])) {
    const id = args[1] || "";
    const stream = ["stderr"].includes((args[2] || "").toLowerCase()) ? "stderr" : "stdout";
    const output = tailCodexLog(id, stream, 40, 3500);
    if (!output) return "No log output found yet.";
    return `Last ${stream} lines:\n${output}`;
  }

  const allowConcurrent = String(process.env.CODEX_REMOTE_ALLOW_CONCURRENT || "") === "1";
  if (!allowConcurrent) {
    const running = listCodexRuns(6).find(run => ["pending", "running"].includes(run.status));
    if (running) {
      return `Codex is already running (${running.id}). Use /codex status ${running.id} or /codex tail ${running.id}.`;
    }
  }

  const parsed = parseCodexArgs(args);
  const prompt = parsed.prompt || args.join(" ");
  if (!prompt.trim()) return "Usage: /codex <instructions>";

  const timeoutMinutes = Number(process.env.CODEX_REMOTE_TIMEOUT_MINUTES || 0);
  const timeoutMs = Number.isFinite(timeoutMinutes) && timeoutMinutes > 0 ? timeoutMinutes * 60 * 1000 : 0;

  const run = startCodexRun({
    prompt,
    mode: parsed.mode,
    model: parsed.model,
    profile: parsed.profile,
    channel: meta.channel,
    chatId: meta.chatId,
    senderId: meta.senderId,
    senderName: meta.senderName,
    timeoutMs,
    onComplete: ({ runId, status, exitCode, error }) => {
      if (meta.channel !== "telegram" || !meta.chatId) return;
      const summary = readCodexLastMessage(runId, 2500);
      const statusLine = status === "completed"
        ? `Codex run ${runId} completed (exit ${exitCode ?? "0"}).`
        : `Codex run ${runId} failed${exitCode != null ? ` (exit ${exitCode})` : ""}.`;
      const detail = summary ? `\n\nSummary:\n${summary}` : error ? `\n\nError: ${error}` : "";
      const hint = `\n\nLogs: data/codex_runs/${runId}/stdout.log`;
      const message = truncateTelegram(`${statusLine}${detail}${hint}`);
      sendTelegramMessage(meta.chatId, message).catch(() => {});
    }
  });

  return `Codex run started: ${run.id}\nMode: ${run.mode}\nUse /codex status ${run.id} or /codex tail ${run.id}.`;
}

function resolveLatestApprovalId(meta) {
  const flags = getRuntimeFlags();
  const map = flags.approval_last_by_chat || {};
  if (meta?.channel === "telegram" && meta?.chatId && map[`telegram:${meta.chatId}`]) {
    return map[`telegram:${meta.chatId}`];
  }
  const pending = listApprovals().filter(item => item.status === "pending");
  return pending[0]?.id || "";
}

async function handleApprove(args, context, meta) {
  let id = args[0] || "";
  if (!id) {
    id = resolveLatestApprovalId(meta);
  }
  if (!id) return "No pending approvals. Use /approvals to list.";
  const requiredToken = process.env.REMOTE_APPROVAL_TOKEN || process.env.ADMIN_APPROVAL_TOKEN || "";
  const providedToken = getApprovalToken(args);
  if (requiredToken && providedToken !== requiredToken) {
    return "Approval token required or invalid.";
  }

  const existing = getApproval(id);
  if (!existing) return "Approval not found.";
  if (existing.status === "executed") return "Approval already executed.";

  if (existing.toolName === "desktop.step") {
    approveSafetyApproval(id, context?.userId || "remote");
    try {
      executor.approve(id, context?.userId || "remote");
    } catch (err) {
      if (err?.message !== "approval_not_found") throw err;
    }
    const run = findRunByApprovalId(id);
    if (!run) return `Approved ${id}. No matching desktop run found.`;
    const resumed = await continueDesktopRun(run.id, {
      userId: context?.userId || "remote",
      workspaceId: context?.workspaceId || "default"
    });
    return resumed?.status ? `Desktop run resumed (${resumed.status}).` : "Desktop run resumed.";
  }

  let token = existing.token;
  if (existing.status !== "approved") {
    const approved = executor.approve(id, context?.userId || "remote");
    token = approved?.token;
  }
  if (!token) return `Approved ${id}. Execute it in the app if needed.`;
  try {
    const result = await executor.execute(id, token, context);
    return result?.status === "ok" ? "Approval executed." : "Approval execution failed.";
  } catch (err) {
    return `Approved ${id}. Execute failed: ${err?.message || "execution_failed"}`;
  }
}

async function handleDeny(args, context, meta) {
  let id = args[0] || "";
  if (!id) {
    id = resolveLatestApprovalId(meta);
  }
  if (!id) return "No pending approvals. Use /approvals to list.";
  const requiredToken = process.env.REMOTE_APPROVAL_TOKEN || process.env.ADMIN_APPROVAL_TOKEN || "";
  const providedToken = getApprovalToken(args);
  if (requiredToken && providedToken !== requiredToken) {
    return "Approval token required or invalid.";
  }
  const existing = getApproval(id);
  if (!existing) return "Approval not found.";
  denyApproval(id, context?.userId || "remote");
  rejectSafetyApproval(id, context?.userId || "remote");
  return `Denied approval ${id}.`;
}

async function handleApprovals() {
  const approvals = listApprovals().filter(item => item.status === "pending");
  if (!approvals.length) return "No pending approvals.";
  const formatted = formatList(approvals, item => `- ${item.id}: ${item.humanSummary || item.toolName}`);
  return `Pending approvals (${approvals.length}):\n${formatted}`;
}

function handleActionStatus(args) {
  const id = args[0] || "";
  if (!id) return "Usage: /action <id>";
  const run = getActionRun(id);
  if (!run) return "Action not found.";
  const status = run.status || "unknown";
  const attempts = run.attempts || 0;
  const updated = run.updatedAt || "unknown";
  return `Action ${id}: ${status}\nAttempts: ${attempts}\nUpdated: ${updated}`;
}

function handleResources() {
  const tools = registry.list().slice().sort((a, b) => a.name.localeCompare(b.name));
  const skills = getSkillsState();
  const enabledSkills = skills.filter(skill => skill.enabled).length;
  const rssSources = listTradingRssSourcesUi({ limit: 200, includeDisabled: true });
  const knowledgeSources = listTradingSourcesUi({ limit: 200, includeDisabled: true });
  const macros = listMacros();
  const desktopMacros = listDesktopMacros();

  const toolLines = tools.length
    ? tools.map(tool => `- ${tool.name}${tool.description ? `: ${tool.description}` : ""}`).join("\n")
    : "None.";
  const skillLines = skills.length
    ? skills.map(skill => `- ${skill.key} (${skill.enabled ? "on" : "off"}): ${skill.label}`).join("\n")
    : "None.";
  const rssLines = formatList(
    rssSources,
    item => `- ${item.id} [${item.enabled ? "on" : "off"}] ${item.url}${item.title ? ` (${item.title})` : ""}`,
    6
  );
  const knowledgeLines = formatList(
    knowledgeSources,
    item => `- ${item.id} [${item.enabled ? "on" : "off"}] ${item.url}`,
    6
  );
  const macroLines = formatList(macros, macro => `- [browser] ${macro.id}: ${macro.name}`, 6);
  const desktopMacroLines = formatList(desktopMacros, macro => `- [desktop] ${macro.id}: ${macro.name}`, 6);

  return [
    "Resources:",
    `Tools (${tools.length}):`,
    toolLines,
    `Skills (${enabledSkills}/${skills.length} enabled):`,
    skillLines,
    `RSS sources (${rssSources.length}):`,
    rssLines,
    `Knowledge sources (${knowledgeSources.length}):`,
    knowledgeLines,
    `Browser macros (${macros.length}):`,
    macroLines,
    `Desktop macros (${desktopMacros.length}):`,
    desktopMacroLines,
    "Tips: /tool list, /rss list, /knowledge list, /macro list for details."
  ].join("\n");
}

async function handleToolCommand(args, context) {
  const sub = (args[0] || "help").toLowerCase();
  if (["help", "?"].includes(sub)) {
    return "Tool commands: /tool list | /tool info <name> | /tool call <name> <json|key=value...>";
  }
  if (["list", "ls"].includes(sub)) {
    const tools = registry.list().slice().sort((a, b) => a.name.localeCompare(b.name));
    const formatted = formatList(tools, tool => `- ${tool.name}${tool.description ? `: ${tool.description}` : ""}`, 12);
    return `Tools (${tools.length}):\n${formatted}`;
  }
  if (["info", "schema", "show"].includes(sub)) {
    const name = args[1] || "";
    if (!name) return "Usage: /tool info <name>";
    const tool = registry.get(name);
    if (!tool) return `Tool not found: ${name}`;
    const def = tool.def || {};
    return [
      `Tool: ${def.name}`,
      def.description ? `Description: ${def.description}` : "",
      def.riskLevel ? `Risk: ${def.riskLevel}` : "",
      def.requiresApproval ? "Requires approval: yes" : "Requires approval: no",
      def.paramsSchema ? `Params: ${JSON.stringify(def.paramsSchema)}` : ""
    ].filter(Boolean).join("\n");
  }
  if (["call", "run"].includes(sub)) {
    const name = args[1] || "";
    if (!name) return "Usage: /tool call <name> <json|key=value...>";
    const rawPayload = args.slice(2).join(" ").trim();
    let params = {};
    const parsedJson = parseJsonPayload(rawPayload);
    if (parsedJson) {
      params = parsedJson;
    } else if (rawPayload) {
      params = parseKeyValueArgs(args.slice(2));
      if (!Object.keys(params).length) {
        return "Unable to parse params. Provide JSON or key=value pairs.";
      }
    }
    const result = await executor.callTool({
      name,
      params,
      context
    });
    if (result?.status === "approval_required") {
      return `Approval required: ${result.approval?.id}. Reply /approve ${result.approval?.id}`;
    }
    if (result?.status === "error") {
      return `Tool error: ${result.error?.message || "tool_failed"}`;
    }
    const payload = result?.data ?? result;
    const text = typeof payload === "string" ? payload : JSON.stringify(payload, null, 2);
    return text.length > 3500 ? `${text.slice(0, 3500)}\n...` : text;
  }
  return "Unknown tool command. Try /tool help";
}

export async function tryHandleRemoteCommand({ channel, senderId, senderName, chatId, text, allowUnknown = true } = {}) {
  const parsed = parseCommand(text);
  if (!parsed) return { handled: false };
  const { cmd, args } = parsed;
  const context = {
    userId: senderName || senderId || "remote",
    workspaceId: "default",
    source: `remote:${channel || "unknown"}`
  };
  const meta = { channel, senderId, senderName, chatId, workspaceId: "default" };
  try {
    if (["help", "commands", "?"].includes(cmd)) {
      return {
        handled: true,
        response: [
          "Remote commands:",
          "/call",
          "/status",
          "/restart",
          "/resources",
          "/tool list | /tool info <name> | /tool call <name> <json>",
          "/calendar [today|tomorrow|this week|next week|this month]",
          "/inbox [today|this week|last 3 days]",
          "/thread new | /thread stop | /thread status",
          "/rag list | /rag use <id|all|auto> | /rag status",
          "/codex <instructions> | /codex status <runId> | /codex last | /codex tail <runId>",
          "/rss list | /rss crawl [--force] | /rss seed <url> | /rss add <url> | /rss remove <id>",
          "/knowledge list | /knowledge crawl [--force] | /knowledge add <url> | /knowledge remove <id>",
          "/macro list | /macro run <id>",
          "/modules",
          "/digest | /pulse | /weekly",
          "/watch <thing> | /unwatch <thing> | /watchlist",
          "/mission <name> | /mission_status | /incident",
          "/summarize <text>",
          "/templates | /sop | /status_report",
          "/focus_on | /focus_off | /alert_on | /alert_off | /writing_on | /writing_off",
          "/approvals",
          "/approve <approvalId> [token]",
          "/deny <approvalId> [token]",
          "/action <id>"
        ].join("\n")
      };
    }

    if (["call", "duplex", "voicecall", "voice"].includes(cmd)) {
      const url = buildCallLink(meta);
      return {
        handled: true,
        response: [
          "Aika full-duplex call link:",
          url,
          "Tip: use headphones for best echo cancellation."
        ].join("\n")
      };
    }

    if (["ping"].includes(cmd)) {
      return { handled: true, response: "pong" };
    }

    if (["status", "health"].includes(cmd)) {
      try {
        const status = await fetchLocalStatus();
        return { handled: true, response: formatStatus(status) };
      } catch {
        return { handled: true, response: "Status unavailable." };
      }
    }

    if (["resources", "resource", "tools", "capabilities"].includes(cmd)) {
      return { handled: true, response: handleResources() };
    }

    if (["tool", "tools"].includes(cmd)) {
      return { handled: true, response: await handleToolCommand(args, context) };
    }

    if (["calendar", "agenda", "schedule"].includes(cmd)) {
      return { handled: true, response: await handleCalendarCommand(args, meta) };
    }

    if (["inbox", "email", "emails", "mail"].includes(cmd)) {
      return { handled: true, response: await handleInboxCommand(args, meta) };
    }

    if (["restart", "reboot"].includes(cmd)) {
      return { handled: true, response: await handleRestart(context) };
    }

    if (cmd === "rss") {
      return { handled: true, response: await handleRssCommand(args) };
    }

    if (["knowledge", "crawl"].includes(cmd)) {
      return { handled: true, response: await handleKnowledgeCommand(args) };
    }

    if (["macro", "macros"].includes(cmd)) {
      return { handled: true, response: await handleMacroCommand(args, context) };
    }

    if (["modules", "module", "registry"].includes(cmd)) {
      return { handled: true, response: await handleAikaRoute("AIKA, show my modules", context) };
    }

    if (["digest", "daily"].includes(cmd)) {
      return { handled: true, response: await handleAikaRoute("AIKA, run daily digest", context) };
    }

    if (["pulse", "midday"].includes(cmd)) {
      return { handled: true, response: await handleAikaRoute("AIKA, run midday pulse", context) };
    }

    if (["weekly", "review"].includes(cmd)) {
      return { handled: true, response: await handleAikaRoute("AIKA, run weekly review", context) };
    }

    if (["watchlist", "watching"].includes(cmd)) {
      return { handled: true, response: await handleAikaRoute("AIKA, watchlist", context) };
    }

    if (["watch"].includes(cmd)) {
      const target = args.join(" ");
      return { handled: true, response: await handleAikaRoute(`AIKA, watch ${target}`, context) };
    }

    if (["unwatch", "stopwatch", "stop"].includes(cmd)) {
      const target = args.join(" ");
      return { handled: true, response: await handleAikaRoute(`AIKA, stop watching ${target}`, context) };
    }

    if (["mission"].includes(cmd)) {
      const target = args.join(" ");
      return { handled: true, response: await handleAikaRoute(`AIKA, run mission ${target}`, context) };
    }

    if (["mission_status", "missionstatus"].includes(cmd)) {
      return { handled: true, response: formatMissionStatus(context.userId || "local") };
    }

    if (["incident"].includes(cmd)) {
      return { handled: true, response: await handleAikaRoute("AIKA, incident", context) };
    }

    if (["summarize", "summary"].includes(cmd)) {
      const target = args.join(" ");
      return { handled: true, response: await handleAikaRoute(`AIKA, summarize ${target}`, context) };
    }

    if (["templates", "sop", "status_report"].includes(cmd)) {
      return { handled: true, response: await handleAikaRoute("AIKA, run Template Engine", context) };
    }

    if (["focus_on", "focus"].includes(cmd)) {
      return { handled: true, response: await handleAikaRoute("AIKA, focus mode", context) };
    }

    if (["focus_off"].includes(cmd)) {
      return { handled: true, response: await handleAikaRoute("AIKA, focus off", context) };
    }

    if (["alert_on"].includes(cmd)) {
      return { handled: true, response: await handleAikaRoute("AIKA, alert on", context) };
    }

    if (["alert_off"].includes(cmd)) {
      return { handled: true, response: await handleAikaRoute("AIKA, alert off", context) };
    }

    if (["writing_on"].includes(cmd)) {
      return { handled: true, response: await handleAikaRoute("AIKA, writing mode", context) };
    }

    if (["writing_off"].includes(cmd)) {
      return { handled: true, response: await handleAikaRoute("AIKA, writing off", context) };
    }

    if (["approvals"].includes(cmd)) {
      return { handled: true, response: await handleApprovals() };
    }

    if (["action", "run"].includes(cmd)) {
      return { handled: true, response: handleActionStatus(args) };
    }

    if (["approve"].includes(cmd)) {
      return { handled: true, response: await handleApprove(args, context, meta) };
    }

    if (["deny", "reject"].includes(cmd)) {
      return { handled: true, response: await handleDeny(args, context, meta) };
    }

    if (["thread", "threads"].includes(cmd)) {
      return { handled: true, response: await handleThreadCommand(args, meta) };
    }

    if (["rag", "knowledgebase", "kb"].includes(cmd)) {
      return { handled: true, response: handleRagCommand(args, meta) };
    }

    if (["codex", "cx"].includes(cmd)) {
      return { handled: true, response: await handleCodexCommand(args, meta) };
    }

    if (!allowUnknown) return { handled: false };
    return { handled: true, response: "Unknown command. Try /help." };
  } catch (err) {
    return { handled: true, response: `Command failed: ${err?.message || "unknown_error"}` };
  }
}
