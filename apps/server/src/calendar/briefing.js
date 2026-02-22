import { getAssistantProfile } from "../../storage/assistant_profile.js";
import { findAssistantTaskByTitle, createAssistantTask, updateAssistantTask } from "../../storage/assistant_tasks.js";
import { getGoogleStatus, listCalendarEventsRange } from "../../integrations/google.js";
import { getMicrosoftStatus, listMicrosoftCalendarEvents } from "../../integrations/microsoft.js";
import { answerRagQuestionRouted } from "../rag/router.js";
import { searchWeb } from "../../integrations/web_search.js";

const TASK_TITLE = "Aika Daily Calendar Briefing";
const DEFAULT_KEYWORDS = [
  "important",
  "priority",
  "review",
  "vendor",
  "client",
  "customer",
  "partner",
  "board",
  "exec",
  "leadership",
  "contract",
  "renewal",
  "deadline",
  "budget",
  "proposal",
  "demo",
  "pitch",
  "interview",
  "planning",
  "strategy",
  "qbr"
];

function parseList(value) {
  return String(value || "")
    .split(/[;,\n]/)
    .map(item => item.trim())
    .filter(Boolean);
}

function limitText(value, max = 260) {
  const text = String(value || "").trim();
  if (!max || text.length <= max) return text;
  return `${text.slice(0, max)}...`;
}

function ensureArray(value) {
  if (Array.isArray(value)) return value;
  if (typeof value === "string") return parseList(value);
  return [];
}

function resolveRecipients(profile, config) {
  const fromConfig = ensureArray(config.emailTo);
  if (fromConfig.length) return fromConfig;
  const identity = profile?.preferences?.identity || {};
  const fallback = [identity.workEmail, identity.personalEmail].filter(Boolean);
  if (fallback.length) return fallback;
  return parseList(process.env.CALENDAR_BRIEFING_EMAIL_TO || process.env.ASSISTANT_TASK_EMAIL_TO || "");
}

function resolveKeywords(config) {
  const custom = ensureArray(config.importanceKeywords || process.env.CALENDAR_BRIEFING_IMPORTANT_KEYWORDS || "");
  const merged = [...DEFAULT_KEYWORDS, ...custom]
    .map(item => String(item || "").trim().toLowerCase())
    .filter(Boolean);
  return Array.from(new Set(merged));
}

function resolveConfig(profile) {
  const prefs = profile?.preferences?.calendarBriefing || {};
  const enabledEnv = String(process.env.CALENDAR_BRIEFING_ENABLED || "1") === "1";
  const enabled = typeof prefs.enabled === "boolean" ? prefs.enabled : enabledEnv;
  const timezone = String(prefs.timezone || process.env.CALENDAR_BRIEFING_TIMEZONE || profile?.timezone || "UTC").trim();
  const timeOfDay = String(prefs.timeOfDay || process.env.CALENDAR_BRIEFING_TIME_OF_DAY || "07:00").trim();
  const providers = ensureArray(prefs.providers || process.env.CALENDAR_BRIEFING_PROVIDERS || "google,outlook")
    .map(item => item.toLowerCase());
  const includeRag = typeof prefs.includeRag === "boolean"
    ? prefs.includeRag
    : String(process.env.CALENDAR_BRIEFING_INCLUDE_RAG || "1") === "1";
  const includeWeb = typeof prefs.includeWebResearch === "boolean"
    ? prefs.includeWebResearch
    : String(process.env.CALENDAR_BRIEFING_INCLUDE_WEB || "0") === "1";
  const maxEventsToday = Number(prefs.maxEventsToday || process.env.CALENDAR_BRIEFING_MAX_TODAY || 5);
  const maxEventsWeek = Number(prefs.maxEventsWeek || process.env.CALENDAR_BRIEFING_MAX_WEEK || 8);
  const maxPrepEvents = Number(prefs.maxPrepEvents || process.env.CALENDAR_BRIEFING_MAX_PREP || 3);
  const maxWebResults = Number(prefs.maxWebResults || process.env.CALENDAR_BRIEFING_WEB_RESULTS || 2);
  const maxAttendeeResearch = Number(prefs.maxAttendeeResearch || process.env.CALENDAR_BRIEFING_MAX_ATTENDEE_WEB || 2);
  return {
    enabled,
    timezone,
    timeOfDay,
    providers,
    includeRag,
    includeWeb,
    maxEventsToday,
    maxEventsWeek,
    maxPrepEvents,
    maxWebResults,
    maxAttendeeResearch,
    emailTo: prefs.emailTo || [],
    importanceKeywords: resolveKeywords(prefs)
  };
}

function buildPrompt() {
  return [
    "Create a concise daily calendar briefing email.",
    "Include:",
    "- Today's important events (time, title, attendees, location, meeting link).",
    "- Upcoming important events this week.",
    "- Meeting prep for key meetings (context, decisions, questions to ask).",
    "Use only the data provided below.",
    "",
    "{{calendar_briefing_context}}"
  ].join("\n");
}

function startOfDay(date) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

function endOfDay(date) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate(), 23, 59, 59, 999);
}

function formatEventTime(event, timezone) {
  if (event.allDay) return "All day";
  const start = event.start ? new Date(event.start) : null;
  const end = event.end ? new Date(event.end) : null;
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
  const start = event.start ? new Date(event.start) : null;
  if (!start || Number.isNaN(start.getTime())) return "";
  const dateFmt = new Intl.DateTimeFormat("en-US", {
    timeZone: timezone || undefined,
    weekday: "short",
    month: "short",
    day: "numeric"
  });
  return dateFmt.format(start);
}

function normalizeAttendees(attendees = []) {
  if (!Array.isArray(attendees)) return [];
  return attendees
    .map(item => ({
      name: String(item?.displayName || item?.name || "").trim(),
      email: String(item?.email || item?.address || "").trim(),
      responseStatus: String(item?.responseStatus || item?.status || "").trim()
    }))
    .filter(item => item.name || item.email);
}

function normalizeGoogleEvent(item = {}) {
  const allDay = Boolean(item?.start?.date && !item?.start?.dateTime);
  const start = item?.start?.dateTime || (item?.start?.date ? `${item.start.date}T00:00:00` : "");
  const end = item?.end?.dateTime || (item?.end?.date ? `${item.end.date}T00:00:00` : "");
  const attendees = normalizeAttendees(item?.attendees);
  const meetingLink = item?.hangoutLink
    || item?.conferenceData?.entryPoints?.find(entry => entry?.uri)?.uri
    || "";
  return {
    provider: "google",
    id: item?.id || "",
    summary: item?.summary || "(no title)",
    description: item?.description || "",
    location: item?.location || "",
    start,
    end,
    allDay,
    attendees,
    organizer: item?.organizer?.email || item?.organizer?.displayName || "",
    meetingLink,
    webLink: item?.htmlLink || "",
    status: item?.status || ""
  };
}

function normalizeOutlookEvent(item = {}) {
  const start = item?.start?.dateTime || "";
  const end = item?.end?.dateTime || "";
  const allDay = Boolean(item?.isAllDay);
  const attendees = Array.isArray(item?.attendees)
    ? item.attendees.map(att => ({
        name: att?.emailAddress?.name || "",
        email: att?.emailAddress?.address || "",
        responseStatus: att?.status?.response || ""
      })).filter(att => att.name || att.email)
    : [];
  const meetingLink = item?.onlineMeeting?.joinUrl || item?.onlineMeetingUrl || "";
  return {
    provider: "outlook",
    id: item?.id || "",
    summary: item?.subject || "(no title)",
    description: item?.bodyPreview || "",
    location: item?.location?.displayName || "",
    start,
    end,
    allDay,
    attendees,
    organizer: item?.organizer?.emailAddress?.address || item?.organizer?.emailAddress?.name || "",
    meetingLink,
    webLink: item?.webLink || "",
    importance: item?.importance || "",
    showAs: item?.showAs || "",
    status: item?.isCancelled ? "cancelled" : ""
  };
}

function eventScore(event, keywords) {
  let score = 0;
  if (event.importance && String(event.importance).toLowerCase() === "high") score += 3;
  if (event.attendees && event.attendees.length > 1) score += 2;
  const summary = String(event.summary || "").toLowerCase();
  if (keywords.some(keyword => summary.includes(keyword))) score += 2;
  if (event.meetingLink) score += 1;
  return score;
}

function formatAttendees(attendees = [], max = 4) {
  const names = attendees.map(att => att.name || att.email).filter(Boolean);
  if (!names.length) return "";
  const trimmed = names.slice(0, max);
  const extra = names.length > max ? ` +${names.length - max}` : "";
  return `${trimmed.join(", ")}${extra}`;
}

function buildEventLine(event, timezone, includeDate = false) {
  const dateLabel = includeDate ? `${formatEventDate(event, timezone)} ` : "";
  const timeLabel = formatEventTime(event, timezone);
  const attendees = formatAttendees(event.attendees);
  const location = event.location ? ` @ ${event.location}` : "";
  const meetingLink = event.meetingLink ? ` | ${event.meetingLink}` : "";
  const attendeeText = attendees ? ` | ${attendees}` : "";
  return `${dateLabel}${timeLabel} - ${event.summary}${location}${attendeeText}${meetingLink}`.trim();
}

async function buildPrepBlock(event, config) {
  const lines = [];
  lines.push(`Event: ${event.summary}`);
  lines.push(`When: ${formatEventDate(event, config.timezone)} ${formatEventTime(event, config.timezone)}`);
  if (event.attendees?.length) {
    lines.push(`Attendees: ${formatAttendees(event.attendees, 8)}`);
  }
  if (event.location) lines.push(`Location: ${event.location}`);
  if (event.meetingLink) lines.push(`Meeting link: ${event.meetingLink}`);

  if (config.includeRag) {
    const attendeeNames = event.attendees?.map(att => att.name || att.email).filter(Boolean).slice(0, 6) || [];
    const prompt = [
      `Provide meeting prep for "${event.summary}".`,
      attendeeNames.length ? `Attendees: ${attendeeNames.join(", ")}.` : "",
      "Summarize relevant notes, decisions, action items, and open questions."
    ].filter(Boolean).join(" ");
    try {
      const rag = await answerRagQuestionRouted(prompt, {
        topK: 6,
        ragModel: "all",
        filters: { meetingIdPrefix: "rag:" },
        skipAnswer: true
      });
      const citations = Array.isArray(rag?.citations) ? rag.citations.slice(0, 4) : [];
      if (citations.length) {
        lines.push("Context from notes/emails/docs:");
        citations.forEach(cite => {
          lines.push(`- ${cite.meeting_title || "Source"}: ${limitText(cite.snippet || "", 220)}`);
        });
      }
    } catch (err) {
      lines.push(`Context lookup failed: ${err?.message || "rag_failed"}`);
    }
  }

  if (config.includeWeb) {
    const attendeeTargets = (event.attendees || []).slice(0, config.maxAttendeeResearch || 2);
    for (const attendee of attendeeTargets) {
      const label = attendee.name || attendee.email;
      if (!label) continue;
      const query = `${label} LinkedIn`;
      try {
        const results = await searchWeb(query, config.maxWebResults || 2);
        const items = Array.isArray(results?.results) ? results.results.slice(0, config.maxWebResults || 2) : [];
        if (items.length) {
          lines.push(`Web results for ${label}:`);
          items.forEach(item => {
            lines.push(`- ${item.title}: ${limitText(item.snippet || "", 200)} (${item.url})`);
          });
        }
      } catch (err) {
        lines.push(`Web lookup failed for ${label}: ${err?.message || "web_search_failed"}`);
      }
    }
  }

  return lines.join("\n");
}

function buildBriefingText({ today, week, prepBlocks, timezone, warnings }) {
  const lines = [];
  const nowLabel = new Date().toLocaleString(undefined, { timeZone: timezone || undefined });
  lines.push(`Aika Calendar Briefing (${nowLabel}${timezone ? `, ${timezone}` : ""})`);
  if (warnings.length) {
    lines.push("");
    lines.push("Warnings:");
    warnings.forEach(warning => lines.push(`- ${warning}`));
  }
  lines.push("");
  lines.push("Today's important events:");
  if (!today.length) {
    lines.push("- None flagged.");
  } else {
    today.forEach(event => lines.push(`- ${buildEventLine(event, timezone)}`));
  }
  lines.push("");
  lines.push("Upcoming important events (next 7 days):");
  if (!week.length) {
    lines.push("- None flagged.");
  } else {
    week.forEach(event => lines.push(`- ${buildEventLine(event, timezone, true)}`));
  }
  if (prepBlocks.length) {
    lines.push("");
    lines.push("Meeting prep:");
    prepBlocks.forEach(block => {
      lines.push("");
      lines.push(block);
    });
  }
  return lines.join("\n");
}

export async function buildCalendarBriefing({ userId = "local" } = {}) {
  const profile = getAssistantProfile(userId);
  const config = resolveConfig(profile);
  const warnings = [];
  const providers = Array.isArray(config.providers) ? config.providers : [];

  const now = new Date();
  const todayStart = startOfDay(now);
  const todayEnd = endOfDay(now);
  const weekStart = new Date(todayEnd.getTime() + 1000);
  const weekEnd = endOfDay(new Date(now.getTime() + 7 * 86400000));

  const events = [];
  if (providers.includes("google")) {
    try {
      const googleStatus = getGoogleStatus(userId);
      if (!googleStatus?.connected) {
        warnings.push("Google Calendar not connected.");
      } else {
        const data = await listCalendarEventsRange({
          timeMin: todayStart.toISOString(),
          timeMax: weekEnd.toISOString(),
          max: 50,
          userId
        });
        const items = Array.isArray(data?.items) ? data.items : [];
        items.forEach(item => {
          const normalized = normalizeGoogleEvent(item);
          if (normalized.status === "cancelled") return;
          events.push(normalized);
        });
      }
    } catch (err) {
      warnings.push(`Google Calendar fetch failed (${err?.message || "google_calendar_failed"}).`);
    }
  }

  if (providers.includes("outlook")) {
    try {
      const outlookStatus = getMicrosoftStatus(userId);
      if (!outlookStatus?.connected) {
        warnings.push("Microsoft Calendar not connected.");
      } else {
        const items = await listMicrosoftCalendarEvents({
          startISO: todayStart.toISOString(),
          endISO: weekEnd.toISOString(),
          max: 50,
          userId,
          timezone: config.timezone
        });
        items.forEach(item => {
          const normalized = normalizeOutlookEvent(item);
          if (normalized.status === "cancelled") return;
          events.push(normalized);
        });
      }
    } catch (err) {
      warnings.push(`Microsoft Calendar fetch failed (${err?.message || "microsoft_calendar_failed"}).`);
    }
  }

  const keywords = resolveKeywords(config);
  const scored = events
    .map(event => ({ event, score: eventScore(event, keywords) }))
    .sort((a, b) => {
      const aStart = new Date(a.event.start || 0).getTime();
      const bStart = new Date(b.event.start || 0).getTime();
      if (aStart !== bStart) return aStart - bStart;
      return b.score - a.score;
    });

  const todayEvents = [];
  const weekEvents = [];
  for (const item of scored) {
    const start = new Date(item.event.start || 0);
    if (Number.isNaN(start.getTime())) continue;
    const score = item.score;
    const isImportant = score >= 2;
    if (!isImportant) continue;
    if (start >= todayStart && start <= todayEnd) todayEvents.push(item.event);
    if (start > todayEnd && start <= weekEnd) weekEvents.push(item.event);
  }

  const limitedToday = todayEvents.slice(0, Math.max(1, config.maxEventsToday || 5));
  const limitedWeek = weekEvents.slice(0, Math.max(1, config.maxEventsWeek || 8));

  const prepTargets = [...limitedToday, ...limitedWeek].slice(0, Math.max(0, config.maxPrepEvents || 3));
  const prepBlocks = [];
  for (const event of prepTargets) {
    try {
      const block = await buildPrepBlock(event, config);
      if (block) prepBlocks.push(block);
    } catch {
      // ignore prep failures
    }
  }

  const contextText = buildBriefingText({
    today: limitedToday,
    week: limitedWeek,
    prepBlocks,
    timezone: config.timezone,
    warnings
  });

  return {
    contextText,
    outputText: contextText,
    warnings,
    config
  };
}

export async function injectCalendarBriefing(prompt, task) {
  const template = String(prompt || "");
  if (!template.includes("{{calendar_briefing_context}}")) {
    return { prompt: template, fallbackOutput: "" };
  }
  const briefing = await buildCalendarBriefing({ userId: task?.ownerId || "local" });
  const replaced = template.replace(/\{\{calendar_briefing_context\}\}/g, briefing.contextText || "");
  return { prompt: replaced, fallbackOutput: briefing.outputText || "" };
}

export function ensureCalendarBriefingTask({ userId = "local" } = {}) {
  const profile = getAssistantProfile(userId);
  const config = resolveConfig(profile);
  const recipients = resolveRecipients(profile, config);
  const enabled = Boolean(config.enabled && recipients.length);

  const schedule = {
    type: "daily",
    timeOfDay: config.timeOfDay || "07:00",
    timezone: config.timezone || profile?.timezone || "UTC"
  };

  const payload = {
    title: TASK_TITLE,
    prompt: buildPrompt(),
    schedule,
    status: enabled ? "active" : "paused",
    notificationChannels: ["email"],
    notificationTargets: { emailTo: recipients }
  };

  const existing = findAssistantTaskByTitle(userId, TASK_TITLE);
  if (!existing) {
    return createAssistantTask(userId, payload);
  }

  const shouldUpdate = (
    existing.prompt !== payload.prompt ||
    JSON.stringify(existing.schedule || {}) !== JSON.stringify(schedule) ||
    existing.status !== payload.status ||
    JSON.stringify(existing.notificationTargets || {}) !== JSON.stringify(payload.notificationTargets || {})
  );

  if (shouldUpdate) {
    return updateAssistantTask(userId, existing.id, payload);
  }

  return existing;
}
