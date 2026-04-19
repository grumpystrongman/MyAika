import { parseCoreCapabilityRequest, executeCoreCapabilityRequest } from "./coreCapabilityRouter.js";
import { routeIntent } from "../agent/intentRouter.js";
import { handleActionIntent } from "../agent/actionPipeline.js";

const EXECUTION_ACTIONS = new Set([
  "email.send",
  "calendar.proposeHold",
  "messaging.telegramSend",
  "messaging.whatsapp.send",
  "messaging.sms.send"
]);

function normalize(text) {
  return String(text || "").replace(/\s+/g, " ").trim();
}

function stripAssistantInvocation(text) {
  return normalize(text).replace(/^(?:hey|hi|hello)\s+aika[:,]?\s*/i, "").replace(/^aika[:,]?\s*/i, "");
}

function splitMixedClauses(text = "") {
  const stripped = stripAssistantInvocation(text);
  if (!stripped) return [];
  return stripped
    .split(/\s*(?:,|\band then\b|\bthen\b|\band\b)\s+(?=(?:send|email|mail|message|text|notify|schedule|create|add|put|book|set up|hold|block|check|show|review|look up|find|search|google search|chatgpt search|weather|forecast|calendar|inbox|gmail|outlook)\b)/i)
    .map((part) => normalize(part))
    .filter(Boolean);
}

function looksLikeReadClause(clause = "") {
  return /^(?:check|show|review|read|what(?:'s| is)|look up|find|search|google search|chatgpt search|weather|forecast|calendar|inbox|gmail|outlook)\b/i.test(normalize(clause));
}

function classifyClause(clause = "") {
  const core = parseCoreCapabilityRequest(clause, { allowSingle: true });
  if (core?.capabilities?.length && looksLikeReadClause(clause)) {
    return { kind: "core", clause, core };
  }
  const intent = routeIntent(clause);
  if (intent?.action?.type && EXECUTION_ACTIONS.has(intent.action.type)) {
    return { kind: "execution", clause, intent };
  }
  if (core?.capabilities?.length) {
    return { kind: "core", clause, core };
  }
  return null;
}

export function parseMixedCapabilityRequest(text = "") {
  const clauses = splitMixedClauses(text);
  const items = clauses.map(classifyClause).filter(Boolean);
  const kinds = new Set(items.map((item) => item.kind));
  return {
    actionable: items.length >= 2 && kinds.has("core") && kinds.has("execution"),
    clauses,
    items
  };
}

export async function executeMixedCapabilityRequest({
  text,
  context = {},
  deps = {}
} = {}) {
  const parsed = parseMixedCapabilityRequest(text);
  if (!parsed.actionable) return { handled: false };

  const sections = [];
  const approvals = [];
  const actions = [];
  const capabilities = [];

  for (const item of parsed.items) {
    if (item.kind === "execution") {
      const outcome = await (deps.runIntent || (async ({ text: clauseText, context: clauseContext, deps: clauseDeps }) =>
        handleActionIntent({ text: clauseText, context: clauseContext, deps: clauseDeps })))({
        text: item.clause,
        context,
        deps
      });
      if (!outcome?.handled) continue;
      sections.push(String(outcome.reply || "Action processed.").trim());
      actions.push({
        clause: item.clause,
        actionType: outcome.action?.type || item.intent?.action?.type || "",
        status: outcome.status || "",
        approval: outcome.approval || null,
        result: outcome.result || null
      });
      if (outcome.approval) approvals.push(outcome.approval);
      continue;
    }

    const coreOutcome = await executeCoreCapabilityRequest({
      text: item.clause,
      userId: context.userId,
      timezone: context.timezone,
      homeLocation: context.homeLocation || "",
      deps,
      options: { allowSingle: true }
    });
    if (!coreOutcome?.handled) continue;
    sections.push(String(coreOutcome.reply || "").trim());
    capabilities.push(...(coreOutcome.capabilities || []));
  }

  if (!sections.length || !actions.length || !capabilities.length) {
    return { handled: false };
  }

  return {
    handled: true,
    reply: sections.filter(Boolean).join("\n\n"),
    approvals,
    data: {
      clauses: parsed.clauses,
      items: parsed.items.map((item) => ({
        kind: item.kind,
        clause: item.clause,
        ...(item.kind === "execution"
          ? { actionType: item.intent?.action?.type || "" }
          : { capabilities: item.core?.capabilities || [] })
      })),
      actions,
      capabilities: Array.from(new Set(capabilities))
    }
  };
}
