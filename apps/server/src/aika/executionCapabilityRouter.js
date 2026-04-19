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

function splitExecutionClauses(text = "") {
  const stripped = stripAssistantInvocation(text);
  if (!stripped) return [];
  return stripped
    .split(/\s*(?:,|\band then\b|\bthen\b|\band\b)\s+(?=(?:send|email|mail|message|text|notify|schedule|create|add|put|book|set up|hold|block)\b)/i)
    .map(part => normalize(part))
    .filter(Boolean);
}

function sectionTitleForAction(actionType = "") {
  if (actionType === "email.send") return "Email";
  if (actionType === "calendar.proposeHold") return "Calendar";
  if (actionType === "messaging.telegramSend") return "Telegram";
  if (actionType === "messaging.whatsapp.send") return "WhatsApp";
  if (actionType === "messaging.sms.send") return "SMS";
  return "Action";
}

export function parseExecutionCapabilityRequest(text = "") {
  const clauses = splitExecutionClauses(text);
  const intents = clauses
    .map(clause => {
      const intent = routeIntent(clause);
      if (!intent?.action?.type || !EXECUTION_ACTIONS.has(intent.action.type)) return null;
      return { clause, intent };
    })
    .filter(Boolean);

  return {
    actionable: intents.length >= 2,
    clauses,
    intents
  };
}

export async function executeExecutionCapabilityRequest({
  text,
  context = {},
  deps = {}
} = {}) {
  const parsed = parseExecutionCapabilityRequest(text);
  if (!parsed.actionable) return { handled: false };

  const runIntent = deps.runIntent || (async ({ text: clauseText, context: clauseContext, deps: clauseDeps }) =>
    handleActionIntent({ text: clauseText, context: clauseContext, deps: clauseDeps }));

  const sections = [];
  const actions = [];
  const approvals = [];

  for (const item of parsed.intents) {
    const outcome = await runIntent({ text: item.clause, context, deps });
    if (!outcome?.handled) continue;
    const actionType = outcome.action?.type || item.intent.action?.type || "";
    const title = sectionTitleForAction(actionType);
    sections.push(`${title}\n${normalize(outcome.reply || "Action processed.")}`);
    actions.push({
      clause: item.clause,
      actionType,
      status: outcome.status || "",
      approval: outcome.approval || null,
      result: outcome.result || null
    });
    if (outcome.approval) approvals.push(outcome.approval);
  }

  if (actions.length < 2) return { handled: false };

  return {
    handled: true,
    reply: sections.join("\n\n"),
    data: {
      clauses: parsed.clauses,
      actions
    },
    approvals
  };
}

