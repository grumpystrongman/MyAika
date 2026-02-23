import { listTodosRecord } from "../../storage/todos.js";
import { listManualActions } from "../../storage/manual_actions.js";
import { listWatchItems } from "../../storage/watch_items.js";
import { listWatchEvents } from "../../storage/watch_events.js";
import { createDigest } from "../../storage/digests.js";
import { getSettings } from "../../storage/settings.js";
import { buildCalendarBriefing } from "../calendar/briefing.js";
import { getEmailInbox } from "../connectors/emailInbox.js";
import { getGoogleStatus } from "../../integrations/google.js";
import { getMicrosoftStatus } from "../../integrations/microsoft.js";

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

function hasGmailReadScope(scopes = []) {
  const set = new Set(scopes);
  return set.has("https://www.googleapis.com/auth/gmail.readonly")
    || set.has("https://www.googleapis.com/auth/gmail.modify");
}

function hasMicrosoftMailRead(scopes = []) {
  const set = new Set(scopes);
  return set.has("mail.read") || set.has("mail.readbasic") || set.has("mail.readwrite");
}

function formatEventTime(event, timezone) {
  if (event?.allDay) return "All day";
  const start = event?.start ? new Date(event.start) : null;
  const end = event?.end ? new Date(event.end) : null;
  if (!start || Number.isNaN(start.getTime())) return "--";
  const timeFmt = new Intl.DateTimeFormat("en-US", {
    timeZone: timezone || undefined,
    hour: "numeric",
    minute: "2-digit"
  });
  const startText = timeFmt.format(start);
  if (!end || Number.isNaN(end.getTime())) return startText;
  const endText = timeFmt.format(end);
  return `${startText} - ${endText}`;
}

function formatEventDate(event, timezone) {
  const start = event?.start ? new Date(event.start) : null;
  if (!start || Number.isNaN(start.getTime())) return "";
  const dateFmt = new Intl.DateTimeFormat("en-US", {
    timeZone: timezone || undefined,
    weekday: "short",
    month: "short",
    day: "numeric"
  });
  return dateFmt.format(start);
}

function buildEventLine(event, timezone, includeDate = false) {
  const dateLabel = includeDate ? `${formatEventDate(event, timezone)} ` : "";
  const timeLabel = formatEventTime(event, timezone);
  return `${dateLabel}${timeLabel} - ${event?.summary || "(no title)"}`.trim();
}

function triageCategory(email = {}) {
  const subject = String(email.subject || "").toLowerCase();
  const from = String(email.from || "").toLowerCase();
  if (subject.includes("urgent") || subject.includes("asap") || subject.includes("action required") || subject.includes("deadline")) {
    return "urgent";
  }
  if (from.includes("no-reply") || from.includes("noreply") || subject.includes("newsletter")) {
    return "low";
  }
  return "normal";
}

function suggestedAction(category) {
  if (category === "urgent") return "reply";
  if (category === "low") return "archive";
  return "follow_up";
}

async function buildCalendarSection(userId) {
  try {
    const briefing = await buildCalendarBriefing({ userId });
    const timezone = briefing?.config?.timezone || "UTC";
    const today = Array.isArray(briefing?.todayEvents) ? briefing.todayEvents : [];
    const week = Array.isArray(briefing?.weekEvents) ? briefing.weekEvents : [];
    const warnings = Array.isArray(briefing?.warnings) ? briefing.warnings : [];
    const lines = [];
    if (warnings.length) {
      warnings.forEach(warning => lines.push(`- ${warning}`));
    }
    if (today.length) {
      lines.push("Today:");
      today.slice(0, 3).forEach(event => lines.push(`- ${buildEventLine(event, timezone)}`));
    }
    if (week.length) {
      lines.push("Upcoming:");
      week.slice(0, 3).forEach(event => lines.push(`- ${buildEventLine(event, timezone, true)}`));
    }
    if (!lines.length) {
      lines.push("- No upcoming events detected.");
    }
    return lines.join("\n");
  } catch (err) {
    return `- Calendar briefing failed: ${err?.message || "calendar_failed"}`;
  }
}

async function buildInboxSection(userId) {
  const googleStatus = getGoogleStatus(userId);
  const microsoftStatus = getMicrosoftStatus(userId);
  const providers = [];
  const issues = [];
  if (googleStatus?.connected && hasGmailReadScope(googleStatus.scopes || [])) {
    providers.push("gmail");
  } else if (googleStatus?.connected) {
    issues.push("Google connected without Gmail read scope. Reconnect with preset \"core\" or \"gmail_full\" to enable inbox access.");
  }
  if (microsoftStatus?.connected && hasMicrosoftMailRead(microsoftStatus.scopes || [])) {
    providers.push("outlook");
  } else if (microsoftStatus?.connected) {
    issues.push("Microsoft connected without Mail.Read scope. Reconnect to enable Outlook inbox access.");
  }
  if (!providers.length) {
    if (issues.length) {
      return issues.map(issue => `- ${issue}`).join("\n");
    }
    return "- Inbox integration not connected or missing read scope.";
  }
  let items = [];
  try {
    items = await getEmailInbox({ userId, providers, limit: 5, lookbackDays: 7 });
  } catch {
    items = [];
  }
  if (!items.length) {
    return "- No recent inbox items found.";
  }
  const lines = items.slice(0, 5).map(item => {
    const category = triageCategory(item);
    const action = suggestedAction(category);
    const from = item.from || "Unknown sender";
    const subject = item.subject || "(no subject)";
    return `- ${from}: ${subject} → ${action}`;
  });
  return lines.join("\n");
}

export async function buildDailyDigest({ userId = "local" } = {}) {
  const todos = listTodosRecord({ status: "open", limit: 10, userId });
  const manual = listManualActions({ userId, status: "pending", limit: 10 });
  const watchEvents = collectWatchEvents(userId);

  const priorities = summarizeTodos(todos);
  const manualItems = summarizeManualActions(manual);
  const risks = summarizeWatchRisks(watchEvents.filter(event => ["high", "critical"].includes(event.severity)));
  const leverage = summarizeLeverageSuggestion(todos, manual);
  const calendarSection = await buildCalendarSection(userId);
  const inboxSection = await buildInboxSection(userId);

  const text = [
    "Daily Digest",
    "",
    "Top 3 Priorities:",
    formatList(priorities, "- No priorities yet."),
    "",
    "Calendar Highlights + Prep:",
    calendarSection,
    "",
    "Inbox Top 5 + Draft Recommendations:",
    inboxSection,
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

export async function buildMiddayPulse({ userId = "local" } = {}) {
  const watchEvents = collectWatchEvents(userId);
  const notable = watchEvents.filter(event => ["high", "critical"].includes(event.severity));
  if (!notable.length) {
    return { type: "pulse", text: "Midday Pulse: no notable changes detected." };
  }
  const highlights = notable.map(event => `- ${event.summary} (${event.severity})`);
  const text = ["Midday Pulse", "", "Notable changes:", ...highlights].join("\n");
  return { type: "pulse", text, sections: { highlights } };
}

export async function buildWeeklyReview({ userId = "local" } = {}) {
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

export async function buildDigestByType(type, { userId = "local" } = {}) {
  const normalized = String(type || "").toLowerCase();
  if (normalized === "weekly") return await buildWeeklyReview({ userId });
  if (normalized === "pulse" || normalized === "midday") return await buildMiddayPulse({ userId });
  return await buildDailyDigest({ userId });
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
