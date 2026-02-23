import { executeModule } from "./moduleEngine.js";
import { executeRunbook } from "./runbookEngine.js";
import { formatModuleSummary, listModuleRegistry, findModuleByNameOrTrigger } from "./moduleRegistry.js";
import { buildDigestByType, recordDigest } from "./digestEngine.js";
import { parseStructuredPrefix, buildNoIntegrationInput } from "./noIntegrations.js";
import { createWatchItemFromTemplate, listWatchtowerItems } from "./watchtower.js";
import { createWatchItem, updateWatchItem } from "../../storage/watch_items.js";
import { upsertSettings, setModeFlag } from "../../storage/settings.js";

function normalize(text) {
  return String(text || "").trim();
}

function normalizeLower(text) {
  return normalize(text).toLowerCase();
}

function stripAikaPrefix(text) {
  const trimmed = normalize(text);
  if (!trimmed) return "";
  const match = trimmed.match(/^aika[,\\s:]+(.+)$/i);
  return match ? match[1].trim() : trimmed;
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

export async function routeAikaCommand({ text, context = {} } = {}) {
  const raw = normalize(text);
  if (!raw) return { handled: false };

  const structured = parseStructuredPrefix(raw);
  if (structured) {
    const inputPayload = buildNoIntegrationInput(structured);
    const result = await executeModule({
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

  if (/run (my )?daily digest|daily digest/.test(lower)) {
    const digest = await buildDigestByType("daily", { userId: context.userId || "local" });
    recordDigest({ userId: context.userId || "local", digest });
    return { handled: true, status: "completed", reply: digest.text, data: digest };
  }

  if (/midday pulse|daily pulse|pulse/.test(lower)) {
    const digest = await buildDigestByType("pulse", { userId: context.userId || "local" });
    recordDigest({ userId: context.userId || "local", digest });
    return { handled: true, status: "completed", reply: digest.text, data: digest };
  }

  if (/weekly review|run weekly/.test(lower)) {
    const digest = await buildDigestByType("weekly", { userId: context.userId || "local" });
    recordDigest({ userId: context.userId || "local", digest });
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
    const result = await executeRunbook({ name: name || cleaned, inputPayload: { context_text: cleaned }, context });
    return { handled: true, status: result.status, reply: result.output?.summary || "Mission started.", data: result };
  }

  if (/incident/.test(lower)) {
    const result = await executeRunbook({ name: "Incident Response", inputPayload: { context_text: cleaned }, context });
    return { handled: true, status: result.status, reply: result.output?.summary || "Incident response started.", data: result };
  }

  if (/brief me on/.test(lower)) {
    const topic = cleaned.replace(/brief me on/i, "").trim();
    const result = await executeModule({
      moduleId: "decision_brief_generator",
      inputPayload: { context_text: topic },
      context
    });
    return { handled: true, status: result.status, reply: result.output?.summary || "Brief prepared.", data: result };
  }

  if (/summarize /.test(lower)) {
    const content = cleaned.replace(/summarize/i, "").trim();
    const result = await executeModule({
      moduleId: "quick_summaries",
      inputPayload: { context_text: content },
      context
    });
    return { handled: true, status: result.status, reply: result.output?.summary || "Summary prepared.", data: result };
  }

  if (/draft /.test(lower)) {
    const content = cleaned.replace(/draft/i, "").trim();
    const result = await executeModule({
      moduleId: "drafting_factory",
      inputPayload: { context_text: content },
      context
    });
    return { handled: true, status: result.status, reply: result.output?.summary || "Draft prepared.", data: result };
  }

  if (/decide between/.test(lower)) {
    const parsed = parseDecisionBrief(cleaned);
    const result = await executeModule({
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

  if (/focus mode/.test(lower)) {
    setModeFlag(context.userId || "local", "focus_mode", true);
    return { handled: true, status: "completed", reply: "Focus Mode enabled." };
  }

  if (/focus off|exit focus/.test(lower)) {
    setModeFlag(context.userId || "local", "focus_mode", false);
    return { handled: true, status: "completed", reply: "Focus Mode disabled." };
  }

  if (/alert on|high alert/.test(lower)) {
    setModeFlag(context.userId || "local", "high_alert_mode", true);
    return { handled: true, status: "completed", reply: "High Alert Mode enabled." };
  }

  if (/alert off/.test(lower)) {
    setModeFlag(context.userId || "local", "high_alert_mode", false);
    return { handled: true, status: "completed", reply: "High Alert Mode disabled." };
  }

  if (/writing mode/.test(lower)) {
    setModeFlag(context.userId || "local", "writing_mode", true);
    return { handled: true, status: "completed", reply: "Writing Mode enabled." };
  }

  if (/writing off/.test(lower)) {
    setModeFlag(context.userId || "local", "writing_mode", false);
    return { handled: true, status: "completed", reply: "Writing Mode disabled." };
  }

  if (/travel mode/.test(lower)) {
    setModeFlag(context.userId || "local", "travel_mode", true);
    return { handled: true, status: "completed", reply: "Travel Mode enabled." };
  }

  if (/travel off|exit travel/.test(lower)) {
    setModeFlag(context.userId || "local", "travel_mode", false);
    return { handled: true, status: "completed", reply: "Travel Mode disabled." };
  }

  if (/executive brief mode|exec brief mode/.test(lower)) {
    setModeFlag(context.userId || "local", "executive_brief_mode", true);
    return { handled: true, status: "completed", reply: "Executive Brief Mode enabled." };
  }

  if (/executive brief off|exec brief off|exit executive brief/.test(lower)) {
    setModeFlag(context.userId || "local", "executive_brief_mode", false);
    return { handled: true, status: "completed", reply: "Executive Brief Mode disabled." };
  }

  if (/run /.test(lower)) {
    const target = cleaned.replace(/run /i, "").trim();
    const moduleDef = findModuleByNameOrTrigger(target, listModuleRegistry({ includeDisabled: true }));
    if (moduleDef) {
      const result = await executeModule({ moduleId: moduleDef.id, inputPayload: { context_text: cleaned }, context });
      return { handled: true, status: result.status, reply: result.output?.summary || "Module executed.", data: result };
    }
  }

  return { handled: false };
}
