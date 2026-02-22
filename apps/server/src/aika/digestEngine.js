import { listTodosRecord } from "../../storage/todos.js";
import { listManualActions } from "../../storage/manual_actions.js";
import { listWatchItems } from "../../storage/watch_items.js";
import { listWatchEvents } from "../../storage/watch_events.js";
import { createDigest } from "../../storage/digests.js";
import { getSettings } from "../../storage/settings.js";

function nowIso() {
  return new Date().toISOString();
}

function formatList(items, fallback) {
  if (!items.length) return fallback;
  return items.map(item => `- ${item}`).join("\n");
}

function summarizeTodos(todos) {
  if (!todos.length) return ["No open priorities captured yet."];
  return todos.slice(0, 3).map(todo => todo.title);
}

function summarizeManualActions(actions) {
  if (!actions.length) return [];
  return actions.slice(0, 3).map(action => action.title);
}

function summarizeWatchRisks(events) {
  if (!events.length) return ["No critical watchtower alerts detected."];
  return events.slice(0, 3).map(event => `${event.summary} (${event.severity})`);
}

function summarizeLeverageSuggestion(todos, actions) {
  if (actions.length) return "Convert the top manual action into an automation runbook.";
  if (todos.length) return "Batch similar todos into a single SOP to save time.";
  return "Add a recurring Weekly Review runbook for compounding improvements.";
}

function collectWatchEvents(userId) {
  const items = listWatchItems({ userId, enabledOnly: true });
  const events = [];
  for (const item of items) {
    const recent = listWatchEvents({ watchItemId: item.id, limit: 1 });
    if (recent.length) events.push(recent[0]);
  }
  return events;
}

export function buildDailyDigest({ userId = "local" } = {}) {
  const todos = listTodosRecord({ status: "open", limit: 10, userId });
  const manual = listManualActions({ userId, status: "pending", limit: 10 });
  const watchEvents = collectWatchEvents(userId);

  const priorities = summarizeTodos(todos);
  const manualItems = summarizeManualActions(manual);
  const risks = summarizeWatchRisks(watchEvents.filter(event => ["high", "critical"].includes(event.severity)));
  const leverage = summarizeLeverageSuggestion(todos, manual);

  const text = [
    "Daily Digest",
    "",
    "Top 3 Priorities:",
    formatList(priorities, "- No priorities yet."),
    "",
    "Calendar Highlights + Prep:",
    "- Calendar integration not connected. Provide a calendar export for prep notes.",
    "",
    "Inbox Top 5 + Draft Recommendations:",
    "- Inbox integration not connected. Forward emails or use EMAIL: prefix.",
    "",
    "Risks & Blocks:",
    formatList(risks, "- No risks flagged."),
    "",
    "Manual Actions Queue:",
    formatList(manualItems, "- No manual actions pending."),
    "",
    "One Leverage Suggestion:",
    `- ${leverage}`
  ].join("\n");

  return {
    type: "daily",
    text,
    sections: { priorities, manualItems, risks, leverage }
  };
}

export function buildMiddayPulse({ userId = "local" } = {}) {
  const watchEvents = collectWatchEvents(userId);
  const notable = watchEvents.filter(event => ["high", "critical"].includes(event.severity));
  if (!notable.length) {
    return { type: "pulse", text: "Midday Pulse: no notable changes detected." };
  }
  const highlights = notable.map(event => `- ${event.summary} (${event.severity})`);
  const text = ["Midday Pulse", "", "Notable changes:", ...highlights].join("\n");
  return { type: "pulse", text, sections: { highlights } };
}

export function buildWeeklyReview({ userId = "local" } = {}) {
  const manual = listManualActions({ userId, status: "pending", limit: 10 });
  const todos = listTodosRecord({ status: "open", limit: 10, userId });
  const leverage = summarizeLeverageSuggestion(todos, manual);
  const automationBacklog = [
    "Automate KPI drift detection with Watchtower templates.",
    "Create a weekly runbook for status reports.",
    "Reduce manual action queue by converting top two into macros."
  ];

  const text = [
    "Weekly Review",
    "",
    "Wins:",
    "- Placeholder: capture major wins from the week.",
    "",
    "Misses:",
    "- Placeholder: capture misses or slipped commitments.",
    "",
    "Risks:",
    "- Placeholder: list top risks and mitigation plan.",
    "",
    "Next Week Focus:",
    formatList(summarizeTodos(todos), "- Confirm priorities with Jeff."),
    "",
    "Automation Upgrades Backlog:",
    formatList(automationBacklog, "- No upgrades proposed."),
    "",
    "Leverage Suggestion:",
    `- ${leverage}`,
    "",
    "One Question for Jeff:",
    "- Any new priorities or constraints for next week?"
  ].join("\n");

  return {
    type: "weekly",
    text,
    sections: { automationBacklog }
  };
}

export function recordDigest({ userId = "local", digest }) {
  if (!digest) return null;
  const now = nowIso();
  return createDigest({
    userId,
    type: digest.type,
    periodStart: now,
    periodEnd: now,
    content: digest.text,
    sentEmail: false,
    sentTelegram: false
  });
}

export function buildDigestByType(type, { userId = "local" } = {}) {
  const normalized = String(type || "").toLowerCase();
  if (normalized === "weekly") return buildWeeklyReview({ userId });
  if (normalized === "pulse" || normalized === "midday") return buildMiddayPulse({ userId });
  return buildDailyDigest({ userId });
}

export function getDigestSchedule(userId = "local") {
  const settings = getSettings(userId);
  return {
    daily: settings.digestTime,
    pulse: settings.pulseTime,
    weekly: settings.weeklyTime,
    weeklyDay: settings.modeFlags?.weekly_day || "Friday"
  };
}
