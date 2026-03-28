import { getSettings, setModeFlag } from "../../storage/settings.js";
import { formatModuleSummary, listModuleRegistry } from "./moduleRegistry.js";
import { buildDailyDigest } from "./digestEngine.js";
import { readConfig } from "./config.js";

function buildIntegrationPlan() {
  return [
    "If integrations are not available, I can run in No-Integrations Mode with manual checklists.",
    "Phased integration plan:",
    "- Phase 1: Email + Calendar",
    "- Phase 2: BI dashboards + file storage",
    "- Phase 3: Ticketing system + Telegram bot"
  ];
}

function buildArchitectureMap() {
  const model = readConfig("aika_operating_model.json", {});
  const lanes = model?.laneRouting || {};
  const laneLines = Object.entries(lanes).map(([lane, laneDef]) => `- ${lane}: ${laneDef.system}`);
  return laneLines.length ? laneLines : [
    "- orchestration: OpenClaw",
    "- code: Codex + MCP",
    "- deterministic_web: agent-browser",
    "- workflow_web: Skyvern",
    "- desktop: CUA",
    "- observability: Opik"
  ];
}

export async function getBootSequence(userId = "local") {
  const settings = getSettings(userId);
  if (settings.modeFlags?.boot_completed) {
    return { completed: true };
  }
  const modulesSummary = formatModuleSummary(listModuleRegistry({ includeDisabled: false }));
  const digest = await buildDailyDigest({ userId });
  const modeLabel = settings.modeFlags?.no_integrations ? "No-Integrations Mode" : "Integrations Enabled";
  const architectureMap = buildArchitectureMap();
  return {
    completed: false,
    steps: [
      `Operating Mode: ${modeLabel}.`,
      "Initialization scan:",
      "- Tools/services discovered from configured lanes and current runtime.",
      "- Missing lane integrations are treated as optional and remain disabled until configured.",
      "",
      "Architecture map:",
      ...architectureMap,
      "",
      "Which integrations are available? (email, calendar, files, BI dashboards, ticketing, Telegram bot)",
      "Reply with a short list (example: \"email, calendar, BI\").",
      "If none are available, reply: \"No-integrations mode\".",
      "",
      ...buildIntegrationPlan(),
      "Current configuration:",
      `- Daily Digest: ${settings.digestTime}`,
      `- Midday Pulse: ${settings.pulseTime}`,
      `- Weekly Review: ${settings.modeFlags?.weekly_day || "Friday"} ${settings.weeklyTime}`,
      `- Noise Budget: ${settings.noiseBudgetPerDay} alerts/day`,
      "",
      "Module Registry Summary:",
      modulesSummary,
      "",
      "Highest-leverage starter workflow:",
      "- AIKA, execute daily operator loop for inbox triage + priorities + risk radar.",
      "",
      "Sample Daily Digest Template:",
      digest.text
    ]
  };
}

export function completeBootSequence(userId = "local") {
  setModeFlag(userId, "boot_completed", true);
  return { completed: true };
}
