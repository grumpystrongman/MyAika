import { executor, registry } from "../mcp/index.js";
import { listApprovals, getApproval } from "../mcp/approvals.js";
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
import { getSkillsState } from "../skills/index.js";

const DEFAULT_PORT = 8790;

function getBaseUrl() {
  const port = process.env.PORT || DEFAULT_PORT;
  return `http://127.0.0.1:${port}`;
}

function parseCommand(raw) {
  const trimmed = String(raw || "").trim();
  if (!trimmed) return null;
  const lower = trimmed.toLowerCase();
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
    return "Macro commands: /macro list | /macro run <id>";
  }
  if (["list", "ls"].includes(sub)) {
    const macros = listMacros();
    const formatted = formatList(macros, macro => `- ${macro.id}: ${macro.name}`);
    return `Macros (${macros.length}):\n${formatted}`;
  }
  if (["run", "start"].includes(sub)) {
    const id = args[1];
    if (!id) return "Usage: /macro run <id>";
    const macro = getMacro(id);
    if (!macro) return `Macro not found: ${id}`;
    const plan = applyMacroParams(macro, {});
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

async function handleApprove(args, context) {
  const id = args[0];
  if (!id) return "Usage: /approve <approvalId> [token]";
  const requiredToken = process.env.REMOTE_APPROVAL_TOKEN || process.env.ADMIN_APPROVAL_TOKEN || "";
  const providedToken = getApprovalToken(args);
  if (requiredToken && providedToken !== requiredToken) {
    return "Approval token required or invalid.";
  }

  const existing = getApproval(id);
  if (!existing) return "Approval not found.";
  if (existing.status === "executed") return "Approval already executed.";

  let token = existing.token;
  if (existing.status !== "approved") {
    const approved = executor.approve(id, context?.userId || "remote");
    token = approved?.token;
  }
  if (!token) return "Approval token missing. Try approving again.";
  const result = await executor.execute(id, token, context);
  return result?.status === "ok" ? "Approval executed." : "Approval execution failed.";
}

async function handleApprovals() {
  const approvals = listApprovals().filter(item => item.status === "pending");
  if (!approvals.length) return "No pending approvals.";
  const formatted = formatList(approvals, item => `- ${item.id}: ${item.humanSummary || item.toolName}`);
  return `Pending approvals (${approvals.length}):\n${formatted}`;
}

function handleResources() {
  const tools = registry.list().slice().sort((a, b) => a.name.localeCompare(b.name));
  const skills = getSkillsState();
  const enabledSkills = skills.filter(skill => skill.enabled).length;
  const rssSources = listTradingRssSourcesUi({ limit: 200, includeDisabled: true });
  const knowledgeSources = listTradingSourcesUi({ limit: 200, includeDisabled: true });
  const macros = listMacros();

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
  const macroLines = formatList(macros, macro => `- ${macro.id}: ${macro.name}`, 6);

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
    `Macros (${macros.length}):`,
    macroLines,
    "Tips: /rss list, /knowledge list, /macro list for details."
  ].join("\n");
}

export async function tryHandleRemoteCommand({ channel, senderId, senderName, text } = {}) {
  const parsed = parseCommand(text);
  if (!parsed) return { handled: false };
  const { cmd, args } = parsed;
  const context = {
    userId: senderName || senderId || "remote",
    workspaceId: "default",
    source: `remote:${channel || "unknown"}`
  };
  try {
    if (["help", "commands", "?"].includes(cmd)) {
      return {
        handled: true,
        response: [
          "Remote commands:",
          "/status",
          "/restart",
          "/resources",
          "/rss list | /rss crawl [--force] | /rss seed <url> | /rss add <url> | /rss remove <id>",
          "/knowledge list | /knowledge crawl [--force] | /knowledge add <url> | /knowledge remove <id>",
          "/macro list | /macro run <id>",
          "/approvals",
          "/approve <approvalId> [token]"
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

    if (["approvals"].includes(cmd)) {
      return { handled: true, response: await handleApprovals() };
    }

    if (["approve"].includes(cmd)) {
      return { handled: true, response: await handleApprove(args, context) };
    }

    return { handled: true, response: "Unknown command. Try /help." };
  } catch (err) {
    return { handled: true, response: `Command failed: ${err?.message || "unknown_error"}` };
  }
}
