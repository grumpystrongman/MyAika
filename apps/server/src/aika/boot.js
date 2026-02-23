import { getSettings, setModeFlag } from "../../storage/settings.js";
import { formatModuleSummary, listModuleRegistry } from "./moduleRegistry.js";
import { buildDailyDigest } from "./digestEngine.js";

function buildIntegrationPlan() {
  return [
    "If integrations are not available, I can run in No-Integrations Mode with manual checklists.",
    "Phased integration plan:",
    "- Phase 1: Email + Calendar",
    "- Phase 2: BI dashboards + file storage",
    "- Phase 3: Ticketing system + Telegram bot"
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
  return {
    completed: false,
    steps: [
      `Operating Mode: ${modeLabel}.`,
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
      "Sample Daily Digest Template:",
      digest.text
    ]
  };
}

export function completeBootSequence(userId = "local") {
  setModeFlag(userId, "boot_completed", true);
  return { completed: true };
}
