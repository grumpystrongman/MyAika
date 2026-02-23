import { getSettings, setModeFlag } from "../../storage/settings.js";
import { formatModuleSummary, listModuleRegistry } from "./moduleRegistry.js";
import { buildDailyDigest } from "./digestEngine.js";

export function getBootSequence(userId = "local") {
  const settings = getSettings(userId);
  if (settings.modeFlags?.boot_completed) {
    return { completed: true };
  }
  const modulesSummary = formatModuleSummary(listModuleRegistry({ includeDisabled: false }));
  const digest = buildDailyDigest({ userId });
  return {
    completed: false,
    steps: [
      "Operating Mode: No-Integrations Mode (default).",
      "Which integrations are available? (email, calendar, files, BI dashboards, ticketing, Telegram bot)",
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
