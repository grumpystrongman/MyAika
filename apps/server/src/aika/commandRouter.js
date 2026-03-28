import { executeModule } from "./moduleEngine.js";
import { executeRunbook } from "./runbookEngine.js";
import { formatModuleSummary, listModuleRegistry, findModuleByNameOrTrigger } from "./moduleRegistry.js";
import { buildDigestByType, recordDigest } from "./digestEngine.js";
import { parseStructuredPrefix, buildNoIntegrationInput } from "./noIntegrations.js";
import { createWatchItemFromTemplate, listWatchtowerItems } from "./watchtower.js";
import {
  buildExecutionProtocolResponse,
  classifyAikaIntent,
  shouldHandleWithIntentProtocol,
  stripAikaPrefix
} from "./intentProtocol.js";
import { executeLaneIntent } from "./laneExecutor.js";
import { executeWorkflowSkillIfMatched } from "./workflowSkills.js";
import { createWatchItem, updateWatchItem } from "../../storage/watch_items.js";
import { upsertSettings, setModeFlag } from "../../storage/settings.js";

function normalize(text) {
  return String(text || "").trim();
}

function normalizeLower(text) {
  return normalize(text).toLowerCase();
}

function parseDecisionBrief(text) {
  const match = text.match(/decide between (.+?) and (.+?)(?: using (.+))?$/i);
  if (!match) return null;
  return {
    options: [match[1], match[2]].map(item => item.trim()),
    criteria: match[3] ? match[3].split(/,|\\band\\b/i).map(item => item.trim()).filter(Boolean) : []
  };
}

function parseConfigure(text) {
  const match = text.match(/configure (.+?) to (.+)$/i);
  if (!match) return null;
  return { key: match[1].trim(), value: match[2].trim() };
}

function parseNumericValue(value) {
  if (value == null) return null;
  const match = String(value).match(/-?\d+(\.\d+)?/);
  if (!match) return null;
  const parsed = Number(match[0]);
  return Number.isFinite(parsed) ? parsed : null;
}

export async function routeAikaCommand({ text, context = {}, deps = {} } = {}) {
  const raw = normalize(text);
  if (!raw) return { handled: false };
  const moduleExecutor = deps.moduleExecutor || executeModule;
  const runbookExecutor = deps.runbookExecutor || executeRunbook;
  const digestBuilder = deps.digestBuilder || buildDigestByType;
  const digestRecorder = deps.digestRecorder || recordDigest;

  const structured = parseStructuredPrefix(raw);
  if (structured) {
    const inputPayload = buildNoIntegrationInput(structured);
    const result = await moduleExecutor({
      moduleId: structured.moduleId,
      inputPayload,
      context,
      modeFlags: { no_integrations: true }
    });
    return {
      handled: true,
      status: result.status,
      reply: result.status === "completed"
        ? `No-integrations mode: created manual checklist for ${structured.type}.`
        : `No-integrations mode: ${result.status}.`,
      data: result
    };
  }

  const cleaned = stripAikaPrefix(raw);
  const lower = normalizeLower(cleaned);

  if (/(show|list) (my )?modules/.test(lower)) {
    const summary = formatModuleSummary(listModuleRegistry({ includeDisabled: false }));
    return { handled: true, status: "completed", reply: summary };
  }

  const workflowSkillOutcome = await executeWorkflowSkillIfMatched({
    text: cleaned,
    context,
    deps: {
      moduleExecutor,
      runbookExecutor,
      digestBuilder,
      digestRecorder,
      toolExecutor: deps.toolExecutor || null
    }
  });
  if (workflowSkillOutcome?.handled) {
    return workflowSkillOutcome;
  }

  if (/^(run\s+)?(my\s+)?daily digest$/.test(lower)) {
    const digest = await digestBuilder("daily", { userId: context.userId || "local" });
    digestRecorder({ userId: context.userId || "local", digest });
    return { handled: true, status: "completed", reply: digest.text, data: digest };
  }

  if (/^(run\s+)?(my\s+)?(midday pulse|daily pulse|pulse)$/.test(lower)) {
    const digest = await digestBuilder("pulse", { userId: context.userId || "local" });
    digestRecorder({ userId: context.userId || "local", digest });
    return { handled: true, status: "completed", reply: digest.text, data: digest };
  }

  if (/^(run\s+)?(my\s+)?weekly review$/.test(lower) || /^run weekly$/.test(lower)) {
    const digest = await digestBuilder("weekly", { userId: context.userId || "local" });
    digestRecorder({ userId: context.userId || "local", digest });
    return { handled: true, status: "completed", reply: digest.text, data: digest };
  }

  if (/watchlist|watch list|list watches/.test(lower)) {
    const items = listWatchtowerItems({ userId: context.userId || "local", enabledOnly: false });
    if (!items.length) {
      return { handled: true, status: "completed", reply: "No watch items configured." };
    }
    const lines = items.map(item => `- ${item.id}: ${item.type} (${item.enabled ? "on" : "off"})`);
    return { handled: true, status: "completed", reply: `Watch items:\\n${lines.join("\\n")}` };
  }

  if (/stop watching/.test(lower)) {
    const target = cleaned.replace(/stop watching/i, "").trim();
    const items = listWatchtowerItems({ userId: context.userId || "local", enabledOnly: false });
    const match = items.find(item => item.id === target || item.type.toLowerCase() === target.toLowerCase());
    if (!match) return { handled: true, status: "error", reply: "Watch item not found." };
    updateWatchItem(match.id, { enabled: false });
    return { handled: true, status: "completed", reply: `Disabled watch item ${match.id}.` };
  }

  if (/watch /.test(lower)) {
    const target = cleaned.replace(/watch/i, "").trim();
    const template = createWatchItemFromTemplate({ templateId: target, userId: context.userId || "local" });
    if (template) {
      return { handled: true, status: "completed", reply: `Watch item created: ${template.id} (${template.type}).` };
    }
    const created = createWatchItem({
      userId: context.userId || "local",
      type: target || "custom",
      config: { query: target },
      cadence: "daily",
      thresholds: {},
      enabled: true
    });
    return { handled: true, status: "completed", reply: `Custom watch created: ${created.id}.` };
  }

  if (/mission mode|run mission|start mission/.test(lower)) {
    const name = cleaned.replace(/mission mode|run mission|start mission/i, "").trim();
    const result = await runbookExecutor({ name: name || cleaned, inputPayload: { context_text: cleaned }, context });
    return { handled: true, status: result.status, reply: result.output?.summary || "Mission started.", data: result };
  }

  if (/incident/.test(lower)) {
    const result = await runbookExecutor({ name: "Incident Response", inputPayload: { context_text: cleaned }, context });
    return { handled: true, status: result.status, reply: result.output?.summary || "Incident response started.", data: result };
  }

  if (/brief me on/.test(lower)) {
    const topic = cleaned.replace(/brief me on/i, "").trim();
    const result = await moduleExecutor({
      moduleId: "decision_brief_generator",
      inputPayload: { context_text: topic },
      context
    });
    return { handled: true, status: result.status, reply: result.output?.summary || "Brief prepared.", data: result };
  }

  if (/summarize /.test(lower)) {
    const content = cleaned.replace(/summarize/i, "").trim();
    const result = await moduleExecutor({
      moduleId: "quick_summaries",
      inputPayload: { context_text: content },
      context
    });
    return { handled: true, status: result.status, reply: result.output?.summary || "Summary prepared.", data: result };
  }

  if (/draft /.test(lower)) {
    const content = cleaned.replace(/draft/i, "").trim();
    const result = await moduleExecutor({
      moduleId: "drafting_factory",
      inputPayload: { context_text: content },
      context
    });
    return { handled: true, status: result.status, reply: result.output?.summary || "Draft prepared.", data: result };
  }

  if (/decide between/.test(lower)) {
    const parsed = parseDecisionBrief(cleaned);
    const result = await moduleExecutor({
      moduleId: "decision_brief_generator",
      inputPayload: { context_text: cleaned, structured_input: parsed || {} },
      context
    });
    return { handled: true, status: result.status, reply: result.output?.details || "Decision brief prepared.", data: result };
  }

  if (/configure /.test(lower)) {
    const parsed = parseConfigure(cleaned);
    if (!parsed) return { handled: true, status: "error", reply: "Configuration command not understood." };
    const key = parsed.key.toLowerCase();
    const patch = {};
    if (key.includes("daily") || key.includes("digest")) patch.digestTime = parsed.value;
    else if (key.includes("pulse") || key.includes("midday")) patch.pulseTime = parsed.value;
    else if (key.includes("weekly day") || key.includes("weekly review day") || key.includes("weekday")) {
      patch.modeFlags = { weekly_day: parsed.value };
    } else if (key.includes("weekly")) patch.weeklyTime = parsed.value;
    else if (key.includes("noise")) {
      const numeric = parseNumericValue(parsed.value);
      patch.noiseBudgetPerDay = Number.isFinite(numeric) ? numeric : 3;
    }
    else if (key.includes("confirm")) patch.confirmationPolicy = parsed.value;
    else if (key.includes("no integration") || key.includes("no-integrations")) {
      const enabled = /true|on|enable|yes|1/i.test(parsed.value);
      patch.modeFlags = { no_integrations: enabled };
    } else patch.modeFlags = { [parsed.key]: parsed.value };
    const updated = upsertSettings(context.userId || "local", patch);
    return { handled: true, status: "completed", reply: `Updated ${parsed.key} to ${parsed.value}.`, data: updated };
  }

  if (/focus mode off|focus off|exit focus/.test(lower)) {
    setModeFlag(context.userId || "local", "focus_mode", false);
    return { handled: true, status: "completed", reply: "Focus Mode disabled." };
  }

  if (/focus mode/.test(lower) || /focus on|enter focus/.test(lower)) {
    setModeFlag(context.userId || "local", "focus_mode", true);
    return { handled: true, status: "completed", reply: "Focus Mode enabled." };
  }

  if (/high alert off|alert off/.test(lower)) {
    setModeFlag(context.userId || "local", "high_alert_mode", false);
    return { handled: true, status: "completed", reply: "High Alert Mode disabled." };
  }

  if (/alert on|high alert(?!\s*off)/.test(lower)) {
    setModeFlag(context.userId || "local", "high_alert_mode", true);
    return { handled: true, status: "completed", reply: "High Alert Mode enabled." };
  }

  if (/writing mode off|writing off/.test(lower)) {
    setModeFlag(context.userId || "local", "writing_mode", false);
    return { handled: true, status: "completed", reply: "Writing Mode disabled." };
  }

  if (/writing mode/.test(lower) || /writing on/.test(lower)) {
    setModeFlag(context.userId || "local", "writing_mode", true);
    return { handled: true, status: "completed", reply: "Writing Mode enabled." };
  }

  if (/travel mode off|travel off|exit travel/.test(lower)) {
    setModeFlag(context.userId || "local", "travel_mode", false);
    return { handled: true, status: "completed", reply: "Travel Mode disabled." };
  }

  if (/travel mode/.test(lower) || /travel on/.test(lower)) {
    setModeFlag(context.userId || "local", "travel_mode", true);
    return { handled: true, status: "completed", reply: "Travel Mode enabled." };
  }

  if (/executive brief mode off|exec brief mode off|executive brief off|exec brief off|exit executive brief/.test(lower)) {
    setModeFlag(context.userId || "local", "executive_brief_mode", false);
    return { handled: true, status: "completed", reply: "Executive Brief Mode disabled." };
  }

  if (/executive brief mode|exec brief mode/.test(lower) || /executive brief on|exec brief on/.test(lower)) {
    setModeFlag(context.userId || "local", "executive_brief_mode", true);
    return { handled: true, status: "completed", reply: "Executive Brief Mode enabled." };
  }

  if (shouldHandleWithIntentProtocol(cleaned)) {
    const classification = classifyAikaIntent(cleaned);
    const payloadText = classification.cleanedText
      .replace(/^(execute|prepare|analy[sz]e|control|build|monitor|optimi[sz]e|simulate|stage|autopilot)\s*/i, "")
      .trim() || classification.cleanedText;
    let moduleResult = null;
    let laneResult = null;
    if (classification.moduleId && classification.risk?.level !== "prohibited") {
      const modeFlags = classification.intent === "STAGE" ? { no_integrations: true } : null;
      moduleResult = await moduleExecutor({
        moduleId: classification.moduleId,
        inputPayload: {
          context_text: payloadText,
          structured_input: {
            intent: classification.intent,
            lane: classification.laneDecision?.lane || ""
          },
          options: {
            staged: classification.intent === "STAGE"
          }
        },
        context,
        modeFlags,
        toolExecutor: deps.toolExecutor || null
      });
    }
    if (classification.risk?.level !== "prohibited") {
      laneResult = await executeLaneIntent({
        classification,
        text: payloadText,
        context,
        toolExecutor: deps.toolExecutor || null
      });
      if (laneResult?.status === "approval_required" && laneResult.approval) {
        laneResult.approval = {
          ...laneResult.approval,
          approvalContext: {
            action: payloadText || cleaned,
            why: classification.risk?.approvalRequired
              ? (classification.risk?.reason || "High-impact action detected in selected execution lane.")
              : "Selected tool requires approval before execution.",
            tool: laneResult.tool || classification.laneDecision?.system || "",
            boundary: classification.laneDecision?.lane === "desktop"
              ? "host -> sandbox/VM desktop control lane"
              : classification.laneDecision?.lane === "deterministic_web" || classification.laneDecision?.lane === "workflow_web"
                ? "host -> external web automation lane"
                : "host -> execution lane requiring approval",
            risk: classification.risk?.approvalRequired ? (classification.risk?.level || "approval_required") : "approval_required",
            rollback: classification.laneDecision?.lane === "desktop"
              ? "Deny to block execution. If already executed, stop the desktop run and discard produced artifacts."
              : classification.laneDecision?.lane === "deterministic_web" || classification.laneDecision?.lane === "workflow_web"
                ? "Deny to block execution. If already executed, stop the run and remove captured artifacts from output."
                : "Deny to block execution. If already executed, revert the affected state and rerun validation checks."
          }
        };
      }
    }
    const protocol = buildExecutionProtocolResponse({
      originalText: cleaned,
      classification,
      moduleResult,
      laneResult
    });
    let effectiveStatus = "completed";
    if (classification.risk?.level === "prohibited") {
      effectiveStatus = "blocked";
    } else if (laneResult?.status === "error") {
      effectiveStatus = "error";
    } else if (laneResult?.status === "approval_required") {
      effectiveStatus = "approval_required";
    } else if (moduleResult?.status) {
      effectiveStatus = moduleResult.status;
    }
    return {
      handled: true,
      status: effectiveStatus,
      reply: protocol.reply,
      data: {
        protocol,
        moduleResult,
        laneResult
      },
      approval: laneResult?.approval || null
    };
  }

  if (/run /.test(lower)) {
    const target = cleaned.replace(/run /i, "").trim();
    const moduleDef = findModuleByNameOrTrigger(target, listModuleRegistry({ includeDisabled: true }));
    if (moduleDef) {
      const result = await moduleExecutor({ moduleId: moduleDef.id, inputPayload: { context_text: cleaned }, context });
      return { handled: true, status: result.status, reply: result.output?.summary || "Module executed.", data: result };
    }
  }

  return { handled: false };
}
