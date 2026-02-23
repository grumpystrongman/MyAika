import { createHoldRecord } from "../../storage/calendar.js";
import { createCalendarEvent, getGoogleStatus } from "../../integrations/google.js";

function hasCalendarScope(status) {
  const scopes = new Set(Array.isArray(status?.scopes) ? status.scopes : []);
  return scopes.has("https://www.googleapis.com/auth/calendar.events");
}

function resolveTransportPreference() {
  const raw = String(process.env.CALENDAR_TOOL_TRANSPORT || "auto").trim().toLowerCase();
  if (["google", "stub", "auto"].includes(raw)) return raw;
  return "auto";
}

export async function proposeHold({ title, start, end, timezone, attendees = [], location = "", description = "" }, context = {}) {
  if (!title || !start || !end || !timezone) {
    const err = new Error("title_start_end_timezone_required");
    err.status = 400;
    throw err;
  }
  const userId = context.userId || "local";
  const transportPref = resolveTransportPreference();
  const googleStatus = transportPref === "stub" ? null : getGoogleStatus(userId);
  const canUseGoogle = transportPref === "google"
    || (transportPref === "auto" && googleStatus?.connected && hasCalendarScope(googleStatus));

  if (canUseGoogle) {
    const event = await createCalendarEvent({
      summary: title,
      start: { dateTime: start, timeZone: timezone },
      end: { dateTime: end, timeZone: timezone },
      attendees: Array.isArray(attendees) ? attendees.filter(Boolean).map(email => ({ email })) : [],
      location,
      description
    }, userId);
    return {
      status: "created",
      transport: "google",
      eventId: event?.id || null,
      htmlLink: event?.htmlLink || null,
      summary: event?.summary || title,
      start: event?.start?.dateTime || event?.start?.date || start,
      end: event?.end?.dateTime || event?.end?.date || end
    };
  }

  return {
    status: "draft",
    transport: "stub",
    hold: createHoldRecord({ title, start, end, timezone, attendees, location, description, userId })
  };
}
