import { setModeFlag } from "../../storage/settings.js";
import { updateAssistantProfile } from "../../storage/assistant_profile.js";

function normalize(text) {
  return String(text || "").trim();
}

function normalizeLower(text) {
  return normalize(text).toLowerCase();
}

const INTEGRATION_MAP = [
  { key: "email", label: "Email", matches: ["email", "gmail", "outlook", "exchange", "microsoft 365"] },
  { key: "calendar", label: "Calendar", matches: ["calendar", "calendars", "gcal", "google calendar", "outlook calendar"] },
  { key: "files", label: "Files", matches: ["files", "file storage", "drive", "google drive", "onedrive", "sharepoint", "box", "dropbox"] },
  { key: "bi", label: "BI Dashboards", matches: ["bi", "dashboard", "dashboards", "tableau", "power bi", "looker", "mode analytics"] },
  { key: "ticketing", label: "Ticketing", matches: ["ticketing", "jira", "servicenow", "zendesk", "freshservice", "freshdesk"] },
  { key: "telegram", label: "Telegram", matches: ["telegram", "telegram bot"] }
];

const SKIP_BOOT_MATCHES = [
  "skip boot",
  "skip onboarding",
  "later",
  "not now",
  "ignore boot"
];

const NO_INTEGRATIONS_MATCHES = [
  "no integrations",
  "no integration",
  "no-integrations",
  "no integrations mode",
  "manual mode",
  "no access",
  "none available"
];

function detectMatches(input, matches = []) {
  return matches.some(match => input.includes(match));
}

function extractIntegrations(text) {
  const lowered = normalizeLower(text);
  if (!lowered) return [];
  const found = [];
  for (const item of INTEGRATION_MAP) {
    if (item.matches.some(match => lowered.includes(match))) {
      found.push(item);
    }
  }
  return found;
}

function formatIntegrationSummary(found = []) {
  if (!found.length) return "No integrations captured yet.";
  return found.map(item => item.label).join(", ");
}

function buildPreferencesPatch(found = []) {
  const available = {};
  found.forEach(item => {
    available[item.key] = true;
  });
  return {
    integrations: {
      available,
      capturedAt: new Date().toISOString()
    }
  };
}

export function handleBootFlow({ userId = "local", userText }) {
  const raw = normalizeLower(userText);
  if (!raw) return { handled: false };

  if (detectMatches(raw, SKIP_BOOT_MATCHES)) {
    setModeFlag(userId, "boot_completed", true);
    return {
      handled: true,
      reply: "Boot sequence skipped. You can run it anytime with “AIKA, begin now.”"
    };
  }

  if (detectMatches(raw, NO_INTEGRATIONS_MATCHES)) {
    setModeFlag(userId, "no_integrations", true);
    setModeFlag(userId, "boot_completed", true);
    return {
      handled: true,
      reply: "No-Integrations Mode enabled. I will provide manual runbooks and checklists until you connect systems."
    };
  }

  const integrations = extractIntegrations(raw);
  if (!integrations.length) return { handled: false };

  updateAssistantProfile(userId, {
    preferences: buildPreferencesPatch(integrations)
  });
  setModeFlag(userId, "no_integrations", false);
  setModeFlag(userId, "boot_completed", true);

  return {
    handled: true,
    reply: `Got it. Captured integrations: ${formatIntegrationSummary(integrations)}. I will prioritize workflows that use these systems.`
  };
}

