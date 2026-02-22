import Head from "next/head";
import { useEffect, useMemo, useState } from "react";

function resolveServerUrl() {
  if (process.env.NEXT_PUBLIC_SERVER_URL) return process.env.NEXT_PUBLIC_SERVER_URL;
  return "";
}

const SERVER_URL = resolveServerUrl();

function fetchWithCreds(url, options = {}) {
  return fetch(url, { ...options, credentials: "include" });
}

async function readJsonResponse(response) {
  const text = await response.text();
  if (!text) return {};
  try {
    return JSON.parse(text);
  } catch (err) {
    const snippet = text.replace(/\s+/g, " ").slice(0, 160);
    throw new Error(`Invalid JSON response (${response.status}). ${snippet}`);
  }
}

function toDateInput(value) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60000);
  return local.toISOString().slice(0, 10);
}

function parseDateInput(value) {
  if (!value) return null;
  const [year, month, day] = value.split("-").map(Number);
  if (!year || !month || !day) return null;
  return new Date(year, month - 1, day, 0, 0, 0, 0);
}

function startOfDay(date) {
  if (!date) return null;
  return new Date(date.getFullYear(), date.getMonth(), date.getDate(), 0, 0, 0, 0);
}

function addDays(date, delta) {
  const next = new Date(date);
  next.setDate(next.getDate() + delta);
  return next;
}

function startOfWeek(date, weekStartsOn = 0) {
  const start = startOfDay(date);
  const diff = (start.getDay() - weekStartsOn + 7) % 7;
  return addDays(start, -diff);
}

function endOfWeek(date, weekStartsOn = 0) {
  return addDays(startOfWeek(date, weekStartsOn), 6);
}

function startOfMonth(date) {
  return new Date(date.getFullYear(), date.getMonth(), 1, 0, 0, 0, 0);
}

function endOfMonth(date) {
  return new Date(date.getFullYear(), date.getMonth() + 1, 0, 0, 0, 0, 0);
}

function formatDateLabel(date) {
  if (!date) return "";
  return date.toLocaleDateString(undefined, { weekday: "long", month: "long", day: "numeric" });
}

function formatRangeLabel(start, end) {
  if (!start || !end) return "";
  if (start.toDateString() === end.toDateString()) return formatDateLabel(start);
  const startLabel = start.toLocaleDateString(undefined, { month: "short", day: "numeric" });
  const endLabel = end.toLocaleDateString(undefined, { month: "short", day: "numeric" });
  const yearLabel = end.toLocaleDateString(undefined, { year: "numeric" });
  return `${startLabel} - ${endLabel}, ${yearLabel}`;
}

function formatTime(value, timeZone) {
  if (!value) return "--";
  const ts = Date.parse(value);
  if (!Number.isFinite(ts)) return value;
  return new Date(ts).toLocaleTimeString(undefined, {
    hour: "2-digit",
    minute: "2-digit",
    timeZone: timeZone || undefined
  });
}

function toDateTimeInput(value) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60000);
  return local.toISOString().slice(0, 16);
}

function fromDateInput(value, endOfDay = false) {
  if (!value) return "";
  const suffix = endOfDay ? "T23:59:59" : "T00:00:00";
  const date = new Date(`${value}${suffix}`);
  return Number.isNaN(date.getTime()) ? "" : date.toISOString();
}

function fromDateTimeInput(value) {
  if (!value) return "";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "" : date.toISOString();
}

function parseAttendees(raw) {
  return String(raw || "")
    .split(",")
    .map(item => item.trim())
    .filter(Boolean);
}

function getViewRange(viewMode, focusDate, weekStartsOn = 0) {
  const base = parseDateInput(focusDate) || new Date();
  if (viewMode === "week") {
    const start = startOfWeek(base, weekStartsOn);
    const end = endOfWeek(base, weekStartsOn);
    return { start, end };
  }
  if (viewMode === "month") {
    const startMonth = startOfMonth(base);
    const endMonth = endOfMonth(base);
    return { start: startOfWeek(startMonth, weekStartsOn), end: endOfWeek(endMonth, weekStartsOn) };
  }
  return { start: startOfDay(base), end: startOfDay(base) };
}

function buildMonthGrid(focusDate, weekStartsOn = 0) {
  const base = parseDateInput(focusDate) || new Date();
  const monthStart = startOfMonth(base);
  const monthEnd = endOfMonth(base);
  const gridStart = startOfWeek(monthStart, weekStartsOn);
  const gridEnd = endOfWeek(monthEnd, weekStartsOn);
  const days = [];
  for (let d = new Date(gridStart); d <= gridEnd; d = addDays(d, 1)) {
    days.push({
      date: new Date(d),
      inMonth: d.getMonth() === base.getMonth()
    });
  }
  return days;
}

function buildWeekDays(focusDate, weekStartsOn = 0) {
  const base = parseDateInput(focusDate) || new Date();
  const start = startOfWeek(base, weekStartsOn);
  return Array.from({ length: 7 }, (_, idx) => addDays(start, idx));
}

function formatDayHeader(date) {
  return date.toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" });
}

export default function CalendarPage() {
  const baseUrl = SERVER_URL || "";
  const weekStartsOn = 0;
  const todayInput = useMemo(() => toDateInput(new Date().toISOString()), []);
  const [providerFilter, setProviderFilter] = useState("all");
  const [viewMode, setViewMode] = useState("day");
  const [focusDate, setFocusDate] = useState(todayInput);
  const [rangeStart, setRangeStart] = useState(todayInput);
  const [rangeEnd, setRangeEnd] = useState(todayInput);
  const [timezone, setTimezone] = useState("");
  const [events, setEvents] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [googleStatus, setGoogleStatus] = useState(null);
  const [microsoftStatus, setMicrosoftStatus] = useState(null);
  const [assistantEmail, setAssistantEmail] = useState("");
  const [assistantEmailInput, setAssistantEmailInput] = useState("");
  const [editingEvent, setEditingEvent] = useState(null);
  const [isFullscreen, setIsFullscreen] = useState(false);

  const viewRange = useMemo(() => getViewRange(viewMode, focusDate, weekStartsOn), [viewMode, focusDate, weekStartsOn]);
  const viewRangeLabel = useMemo(() => formatRangeLabel(viewRange.start, viewRange.end), [viewRange.start, viewRange.end]);
  const focusDateLabel = useMemo(() => {
    if (viewMode === "month") {
      const date = parseDateInput(focusDate) || new Date();
      return date.toLocaleDateString(undefined, { month: "long", year: "numeric" });
    }
    return viewRangeLabel;
  }, [viewMode, focusDate, viewRangeLabel]);
  const daysInView = useMemo(() => {
    if (viewMode === "week") return buildWeekDays(focusDate, weekStartsOn);
    if (viewMode === "day") return [parseDateInput(focusDate) || new Date()];
    return [];
  }, [viewMode, focusDate, weekStartsOn]);
  const monthGrid = useMemo(() => {
    if (viewMode !== "month") return [];
    return buildMonthGrid(focusDate, weekStartsOn);
  }, [viewMode, focusDate, weekStartsOn]);
  const weekDayLabels = useMemo(() => {
    const base = startOfWeek(new Date(), weekStartsOn);
    return Array.from({ length: 7 }, (_, idx) =>
      addDays(base, idx).toLocaleDateString(undefined, { weekday: "short" })
    );
  }, [weekStartsOn]);
  const hourHeight = 48;
  const hours = useMemo(() => Array.from({ length: 24 }, (_, idx) => idx), []);
  const normalizedEvents = useMemo(() => {
    return (events || [])
      .map(event => {
        const start = new Date(event.start);
        if (Number.isNaN(start.getTime())) return null;
        const end = event.end ? new Date(event.end) : start;
        return { ...event, _start: start, _end: end };
      })
      .filter(Boolean);
  }, [events]);
  const eventsByDay = useMemo(() => {
    const map = new Map();
    const addToDay = (dayKey, event) => {
      if (!map.has(dayKey)) map.set(dayKey, []);
      map.get(dayKey).push(event);
    };
    for (const event of normalizedEvents) {
      const startDay = startOfDay(event._start);
      if (!startDay) continue;
      const endDay = startOfDay(event._end || event._start) || startDay;
      let lastDay = endDay;
      if (event.allDay && event._end && event._end.getHours() === 0 && event._end.getMinutes() === 0) {
        lastDay = addDays(endDay, -1);
      }
      for (let d = new Date(startDay); d <= lastDay; d = addDays(d, 1)) {
        const key = toDateInput(d.toISOString());
        addToDay(key, event);
      }
    }
    return map;
  }, [normalizedEvents]);

  const [form, setForm] = useState({
    provider: "google",
    title: "",
    start: "",
    end: "",
    timezone: "",
    location: "",
    description: "",
    attendees: "",
    includeAssistant: true,
    createMeetingLink: true
  });

  const loadStatus = async () => {
    try {
      const [googleResp, msResp, profileResp] = await Promise.all([
        fetchWithCreds(`${baseUrl}/api/integrations/google/status`),
        fetchWithCreds(`${baseUrl}/api/integrations/microsoft/status`),
        fetchWithCreds(`${baseUrl}/api/assistant/profile`)
      ]);
      const googleData = await readJsonResponse(googleResp);
      const msData = await readJsonResponse(msResp);
      const profileData = await readJsonResponse(profileResp);
      setGoogleStatus(googleData);
      setMicrosoftStatus(msData);
      const profileEmail = profileData?.profile?.preferences?.calendar?.assistantEmail || "";
      setAssistantEmail(profileEmail);
      setAssistantEmailInput(profileEmail);
      if (!timezone) {
        const tz = profileData?.profile?.timezone || Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
        setTimezone(tz);
        setForm(prev => ({ ...prev, timezone: tz }));
      }
    } catch (err) {
      setError(err?.message || "status_failed");
    }
  };

  const dayKey = (date) => toDateInput(date.toISOString());

  const getEventsForDay = (date, { allDayOnly = false, timedOnly = false } = {}) => {
    if (!date) return [];
    const key = dayKey(date);
    const eventsForDay = eventsByDay.get(key) || [];
    if (allDayOnly) return eventsForDay.filter(event => event.allDay);
    if (timedOnly) return eventsForDay.filter(event => !event.allDay);
    return eventsForDay;
  };

  const getEventLayout = (event, dayDate, hourHeight) => {
    const dayStart = startOfDay(dayDate);
    if (!dayStart) return null;
    const dayEnd = addDays(dayStart, 1);
    const start = event._start < dayStart ? dayStart : event._start;
    const end = event._end > dayEnd ? dayEnd : event._end;
    const startMinutes = Math.max(0, (start - dayStart) / 60000);
    const endMinutes = Math.max(startMinutes + 15, (end - dayStart) / 60000);
    const top = (startMinutes / 60) * hourHeight;
    const height = Math.max(22, ((endMinutes - startMinutes) / 60) * hourHeight);
    return { top, height };
  };

  const toggleFullscreen = async () => {
    if (typeof document === "undefined") return;
    try {
      const doc = document;
      const el = document.documentElement;
      const isActive = Boolean(doc.fullscreenElement || doc.webkitFullscreenElement);
      if (!isActive) {
        const request = el.requestFullscreen || el.webkitRequestFullscreen;
        if (!request) throw new Error("fullscreen_unavailable");
        await request.call(el);
      } else {
        const exit = doc.exitFullscreen || doc.webkitExitFullscreen;
        if (!exit) throw new Error("fullscreen_unavailable");
        await exit.call(doc);
      }
    } catch (err) {
      setError(err?.message || "fullscreen_failed");
    }
  };

  const loadEvents = async () => {
    setLoading(true);
    setError("");
    try {
      const params = new URLSearchParams({
        providers: providerFilter,
        start: fromDateInput(rangeStart, false),
        end: fromDateInput(rangeEnd, true),
        timezone: timezone || ""
      });
      const resp = await fetchWithCreds(`${baseUrl}/api/calendar/events?${params.toString()}`);
      const data = await readJsonResponse(resp);
      if (!resp.ok) throw new Error(data?.error || "calendar_events_failed");
      setEvents(Array.isArray(data.events) ? data.events : []);
    } catch (err) {
      setEvents([]);
      setError(err?.message || "calendar_events_failed");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!viewRange?.start || !viewRange?.end) return;
    const nextStart = toDateInput(viewRange.start.toISOString());
    const nextEnd = toDateInput(viewRange.end.toISOString());
    setRangeStart(prev => (prev === nextStart ? prev : nextStart));
    setRangeEnd(prev => (prev === nextEnd ? prev : nextEnd));
  }, [viewRange.start, viewRange.end]);

  const resetForm = () => {
    setEditingEvent(null);
    setForm(prev => ({
      provider: prev.provider || "google",
      title: "",
      start: "",
      end: "",
      timezone: prev.timezone || timezone || "UTC",
      location: "",
      description: "",
      attendees: "",
      includeAssistant: true,
      createMeetingLink: true
    }));
  };

  const beginEdit = (event) => {
    if (!event) return;
    const attendees = Array.isArray(event.attendees) ? event.attendees.map(att => att.email || att.name).filter(Boolean) : [];
    const hasAssistant = assistantEmail ? attendees.some(email => email.toLowerCase() === assistantEmail.toLowerCase()) : false;
    setEditingEvent(event);
    setForm({
      provider: event.provider || "google",
      title: event.summary || "",
      start: toDateTimeInput(event.start),
      end: toDateTimeInput(event.end),
      timezone: timezone || "UTC",
      location: event.location || "",
      description: event.description || "",
      attendees: attendees.join(", "),
      includeAssistant: hasAssistant,
      createMeetingLink: Boolean(event.meetingLink)
    });
  };

  const saveAssistantEmail = async () => {
    setNotice("");
    setError("");
    try {
      const resp = await fetchWithCreds(`${baseUrl}/api/assistant/profile`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          preferences: { calendar: { assistantEmail: assistantEmailInput } }
        })
      });
      const data = await readJsonResponse(resp);
      if (!resp.ok) throw new Error(data?.error || "assistant_email_update_failed");
      const next = data?.profile?.preferences?.calendar?.assistantEmail || assistantEmailInput;
      setAssistantEmail(next);
      setNotice("Aika attendee email updated.");
    } catch (err) {
      setError(err?.message || "assistant_email_update_failed");
    }
  };

  const createEvent = async () => {
    setNotice("");
    setError("");
    try {
      const payload = {
        provider: form.provider,
        summary: form.title,
        startISO: fromDateTimeInput(form.start),
        endISO: fromDateTimeInput(form.end),
        timezone: form.timezone || timezone || "UTC",
        location: form.location,
        description: form.description,
        attendees: parseAttendees(form.attendees),
        includeAssistant: form.includeAssistant,
        createMeetingLink: form.createMeetingLink
      };
      const resp = await fetchWithCreds(`${baseUrl}/api/calendar/events`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
      });
      const data = await readJsonResponse(resp);
      if (!resp.ok) throw new Error(data?.error || "calendar_event_create_failed");
      setNotice("Event created.");
      resetForm();
      await loadEvents();
    } catch (err) {
      setError(err?.message || "calendar_event_create_failed");
    }
  };

  const updateEvent = async () => {
    if (!editingEvent) return;
    setNotice("");
    setError("");
    try {
      const payload = {
        provider: editingEvent.provider,
        eventId: editingEvent.id,
        summary: form.title,
        startISO: fromDateTimeInput(form.start),
        endISO: fromDateTimeInput(form.end),
        timezone: form.timezone || timezone || "UTC",
        location: form.location,
        description: form.description,
        attendees: parseAttendees(form.attendees),
        includeAssistant: form.includeAssistant,
        createMeetingLink: form.createMeetingLink
      };
      const resp = await fetchWithCreds(`${baseUrl}/api/calendar/events`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
      });
      const data = await readJsonResponse(resp);
      if (!resp.ok) throw new Error(data?.error || "calendar_event_update_failed");
      setNotice("Event updated.");
      resetForm();
      await loadEvents();
    } catch (err) {
      setError(err?.message || "calendar_event_update_failed");
    }
  };

  const deleteEvent = async () => {
    if (!editingEvent) return;
    const ok = window.confirm("Delete this event?");
    if (!ok) return;
    setNotice("");
    setError("");
    try {
      const params = new URLSearchParams({
        provider: editingEvent.provider,
        eventId: editingEvent.id
      });
      const resp = await fetchWithCreds(`${baseUrl}/api/calendar/events?${params.toString()}`, {
        method: "DELETE"
      });
      const data = await readJsonResponse(resp);
      if (!resp.ok) throw new Error(data?.error || "calendar_event_delete_failed");
      setNotice("Event deleted.");
      resetForm();
      await loadEvents();
    } catch (err) {
      setError(err?.message || "calendar_event_delete_failed");
    }
  };

  useEffect(() => {
    loadStatus();
  }, []);

  useEffect(() => {
    if (typeof document === "undefined") return;
    const handler = () => {
      const isActive = Boolean(document.fullscreenElement || document.webkitFullscreenElement);
      setIsFullscreen(isActive);
    };
    handler();
    document.addEventListener("fullscreenchange", handler);
    document.addEventListener("webkitfullscreenchange", handler);
    return () => {
      document.removeEventListener("fullscreenchange", handler);
      document.removeEventListener("webkitfullscreenchange", handler);
    };
  }, []);

  useEffect(() => {
    if (!timezone) return;
    loadEvents();
  }, [providerFilter, rangeStart, rangeEnd, timezone]);

  const timezones = useMemo(() => {
    return [
      timezone || "UTC",
      "America/New_York",
      "America/Chicago",
      "America/Denver",
      "America/Los_Angeles",
      "Europe/London",
      "Europe/Berlin",
      "Asia/Singapore",
      "Asia/Tokyo"
    ].filter((value, idx, list) => value && list.indexOf(value) === idx);
  }, [timezone]);

  return (
    <div className="calendar-shell">
      <Head>
        <title>Aika Calendar Studio</title>
      </Head>
      <div className="calendar-wrap">
        <header className="calendar-hero">
          <div>
            <div className="hero-kicker">Aika Ops</div>
            <h1>Calendar Studio</h1>
            <p>Sync Google + Microsoft, craft events, and add Aika as a live attendee for meeting prep.</p>
          </div>
          <div className="hero-actions">
            <div className="status-chip">
              <span className="status-dot" data-connected={googleStatus?.connected ? "true" : "false"} />
              Google {googleStatus?.connected ? "connected" : "not connected"}
            </div>
            <div className="status-chip">
              <span className="status-dot" data-connected={microsoftStatus?.connected ? "true" : "false"} />
              Microsoft {microsoftStatus?.connected ? "connected" : "not connected"}
            </div>
            <button
              type="button"
              onClick={toggleFullscreen}
            >
              {isFullscreen ? "Exit Full Screen" : "Full Screen"}
            </button>
            <button
              type="button"
              className="primary"
              onClick={() => {
                const origin = window.location.origin;
                window.open(`${baseUrl}/api/integrations/google/connect?preset=core&ui_base=${encodeURIComponent(origin)}&redirect=${encodeURIComponent("/calendar")}`, "_blank");
              }}
            >
              Connect Google
            </button>
            <button
              type="button"
              onClick={() => {
                const origin = window.location.origin;
                window.open(`${baseUrl}/api/integrations/microsoft/connect?preset=mail_calendar_readwrite&ui_base=${encodeURIComponent(origin)}&redirect=${encodeURIComponent("/calendar")}`, "_blank");
              }}
            >
              Connect Microsoft
            </button>
          </div>
        </header>

        {notice && <div className="banner">{notice}</div>}
        {error && <div className="banner error">{error}</div>}

        <section className="calendar-grid">
          <div className="panel calendar-panel calendar-view">
            <div className="panel-title">Calendar</div>
            <div className="calendar-toolbar">
              <div className="view-toggle">
                {["day", "week", "month"].map(mode => (
                  <button
                    key={mode}
                    type="button"
                    className={viewMode === mode ? "active" : ""}
                    onClick={() => setViewMode(mode)}
                  >
                    {mode.toUpperCase()}
                  </button>
                ))}
              </div>
              <div className="calendar-nav">
                <button
                  type="button"
                  onClick={() => {
                    const base = parseDateInput(focusDate) || new Date();
                    const next = viewMode === "month" ? new Date(base.getFullYear(), base.getMonth() - 1, 1) : addDays(base, viewMode === "week" ? -7 : -1);
                    setFocusDate(toDateInput(next.toISOString()));
                  }}
                >
                  Prev
                </button>
                <button
                  type="button"
                  onClick={() => setFocusDate(todayInput)}
                >
                  Today
                </button>
                <button
                  type="button"
                  onClick={() => {
                    const base = parseDateInput(focusDate) || new Date();
                    const next = viewMode === "month" ? new Date(base.getFullYear(), base.getMonth() + 1, 1) : addDays(base, viewMode === "week" ? 7 : 1);
                    setFocusDate(toDateInput(next.toISOString()));
                  }}
                >
                  Next
                </button>
                <div className="calendar-range">{focusDateLabel}</div>
              </div>
            </div>

            <div className="filters">
              <label>
                Focus Date
                <input type="date" value={focusDate} onChange={(e) => setFocusDate(e.target.value || todayInput)} />
              </label>
              <label>
                Provider
                <select value={providerFilter} onChange={(e) => setProviderFilter(e.target.value)}>
                  <option value="all">All</option>
                  <option value="google">Google</option>
                  <option value="outlook">Microsoft</option>
                </select>
              </label>
              <label>
                Timezone
                <select value={timezone} onChange={(e) => setTimezone(e.target.value)}>
                  {timezones.map(tz => (
                    <option key={tz} value={tz}>{tz}</option>
                  ))}
                </select>
              </label>
            </div>
            <div className="calendar-range small">Showing {rangeStart} → {rangeEnd}</div>

            {loading && <div className="muted">Loading events...</div>}
            {!loading && events.length === 0 && (
              <div className="muted">No events found in this window.</div>
            )}

            {!loading && viewMode === "month" && (
              <>
                <div className="month-header">
                  {weekDayLabels.map(label => (
                    <div key={label} className="month-header-cell">{label}</div>
                  ))}
                </div>
                <div className="month-grid">
                  {monthGrid.map(cell => {
                    const dayEvents = getEventsForDay(cell.date);
                    const visible = dayEvents.slice(0, 3);
                    const overflow = dayEvents.length - visible.length;
                    return (
                      <div
                        key={cell.date.toISOString()}
                        className={`month-cell ${cell.inMonth ? "" : "outside"}`}
                        onClick={() => {
                          setFocusDate(toDateInput(cell.date.toISOString()));
                          setViewMode("day");
                        }}
                      >
                        <div className="month-day">{cell.date.getDate()}</div>
                        <div className="month-events">
                          {visible.map(event => (
                            <button
                              key={`${event.provider}-${event.id}-${cell.date.toISOString()}`}
                              type="button"
                              className={`event-chip ${event.allDay ? "all-day" : ""}`}
                              data-provider={event.provider}
                              onClick={(e) => {
                                e.stopPropagation();
                                beginEdit(event);
                              }}
                              title={event.allDay ? `${event.summary} (All day)` : `${event.summary} ${formatTime(event.start, timezone)}`}
                            >
                              {event.summary}
                            </button>
                          ))}
                          {overflow > 0 && <div className="more-events">+{overflow} more</div>}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </>
            )}

            {!loading && viewMode !== "month" && (
              <div className="time-grid" style={{ "--hour-height": `${hourHeight}px` }}>
                <div className="all-day-row" style={{ gridTemplateColumns: `60px repeat(${daysInView.length}, 1fr)` }}>
                  <div className="all-day-label">All day</div>
                  {daysInView.map(day => (
                    <div key={day.toISOString()} className="all-day-cell">
                      {getEventsForDay(day, { allDayOnly: true }).map(event => (
                        <button
                          key={`${event.provider}-${event.id}-${day.toISOString()}`}
                          type="button"
                          className="event-chip all-day"
                          data-provider={event.provider}
                          onClick={() => beginEdit(event)}
                        >
                          {event.summary}
                        </button>
                      ))}
                    </div>
                  ))}
                </div>
                <div className="time-grid-header" style={{ gridTemplateColumns: `60px repeat(${daysInView.length}, 1fr)` }}>
                  <div className="time-grid-corner" />
                  {daysInView.map(day => (
                    <div key={day.toISOString()} className="time-grid-day">
                      {formatDayHeader(day)}
                    </div>
                  ))}
                </div>
                <div className="time-grid-body" style={{ gridTemplateColumns: `60px repeat(${daysInView.length}, 1fr)` }}>
                  <div className="time-grid-times">
                    {hours.map(hour => (
                      <div key={hour} className="time-grid-time">
                        {hour === 0 ? "12 AM" : hour < 12 ? `${hour} AM` : hour === 12 ? "12 PM" : `${hour - 12} PM`}
                      </div>
                    ))}
                  </div>
                  {daysInView.map(day => (
                    <div key={day.toISOString()} className="time-grid-daycol" style={{ height: hourHeight * 24 }}>
                      {hours.map(hour => (
                        <div key={`${day.toISOString()}-${hour}`} className="time-grid-line" />
                      ))}
                      {getEventsForDay(day, { timedOnly: true }).map(event => {
                        const layout = getEventLayout(event, day, hourHeight);
                        if (!layout) return null;
                        const timeLabel = event.end
                          ? `${formatTime(event.start, timezone)} - ${formatTime(event.end, timezone)}`
                          : formatTime(event.start, timezone);
                        return (
                          <button
                            key={`${event.provider}-${event.id}-${day.toISOString()}`}
                            type="button"
                            className="event-block"
                            data-provider={event.provider}
                            style={{ top: layout.top, height: layout.height }}
                            onClick={() => beginEdit(event)}
                          >
                            <div className="event-title">{event.summary}</div>
                            <div className="event-time">{timeLabel}</div>
                          </button>
                        );
                      })}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

          <div className="panel-stack">
            <div className="panel calendar-panel">
            <div className="panel-title">{editingEvent ? "Edit Event" : "Create Event"}</div>
            <label className="field">
              Provider
              <select value={form.provider} onChange={(e) => setForm(prev => ({ ...prev, provider: e.target.value }))}>
                <option value="google">Google</option>
                <option value="outlook">Microsoft</option>
              </select>
            </label>
            <label className="field">
              Title
              <input value={form.title} onChange={(e) => setForm(prev => ({ ...prev, title: e.target.value }))} placeholder="Vendor sync" />
            </label>
            <label className="field">
              Start
              <input type="datetime-local" value={form.start} onChange={(e) => setForm(prev => ({ ...prev, start: e.target.value }))} />
            </label>
            <label className="field">
              End
              <input type="datetime-local" value={form.end} onChange={(e) => setForm(prev => ({ ...prev, end: e.target.value }))} />
            </label>
            <label className="field">
              Timezone
              <select value={form.timezone} onChange={(e) => setForm(prev => ({ ...prev, timezone: e.target.value }))}>
                {timezones.map(tz => (
                  <option key={tz} value={tz}>{tz}</option>
                ))}
              </select>
            </label>
            <label className="field">
              Location
              <input value={form.location} onChange={(e) => setForm(prev => ({ ...prev, location: e.target.value }))} placeholder="Zoom or Office" />
            </label>
            <label className="field">
              Attendees
              <input value={form.attendees} onChange={(e) => setForm(prev => ({ ...prev, attendees: e.target.value }))} placeholder="name@email.com, partner@vendor.com" />
            </label>
            <label className="field">
              Notes
              <textarea rows={4} value={form.description} onChange={(e) => setForm(prev => ({ ...prev, description: e.target.value }))} />
            </label>

            <div className="toggle-row">
              <label className="toggle">
                <input
                  type="checkbox"
                  checked={form.includeAssistant}
                  onChange={(e) => setForm(prev => ({ ...prev, includeAssistant: e.target.checked }))}
                />
                <span>Add Aika as attendee {assistantEmail ? `(${assistantEmail})` : ""}</span>
              </label>
              <label className="toggle">
                <input
                  type="checkbox"
                  checked={form.createMeetingLink}
                  onChange={(e) => setForm(prev => ({ ...prev, createMeetingLink: e.target.checked }))}
                />
                <span>Create meeting link</span>
              </label>
            </div>

            <div className="button-row">
              {!editingEvent ? (
                <button type="button" className="primary" onClick={createEvent}>
                  Create Event
                </button>
              ) : (
                <>
                  <button type="button" className="primary" onClick={updateEvent}>
                    Update Event
                  </button>
                  <button type="button" className="danger" onClick={deleteEvent}>
                    Delete Event
                  </button>
                  <button type="button" onClick={resetForm}>
                    New Event
                  </button>
                </>
              )}
            </div>
          </div>

          <div className="panel calendar-panel">
            <div className="panel-title">Assistant Settings</div>
            <label className="field">
              Aika attendee email
              <input value={assistantEmailInput} onChange={(e) => setAssistantEmailInput(e.target.value)} placeholder="cmajeff+aika@gmail.com" />
            </label>
            <div className="button-row">
              <button type="button" onClick={saveAssistantEmail}>
                Save Attendee Email
              </button>
            </div>
            {editingEvent?.webLink && (
              <a className="link-button" href={editingEvent.webLink} target="_blank" rel="noreferrer">
                Open in provider
              </a>
            )}
          </div>
          </div>
        </section>
      </div>

      <style jsx global>{`
        @import url("https://fonts.googleapis.com/css2?family=Outfit:wght@300;400;500;600;700&family=Fraunces:wght@500;600;700&display=swap");

        :root {
          --font-body: "Outfit", "Segoe UI", sans-serif;
          --font-display: "Fraunces", serif;
          --app-bg: #070b12;
          --app-gradient: radial-gradient(1200px 700px at 15% 10%, rgba(59, 130, 246, 0.2), transparent 60%),
            radial-gradient(900px 600px at 85% 0%, rgba(248, 113, 113, 0.18), transparent 65%),
            radial-gradient(900px 700px at 50% 100%, rgba(16, 185, 129, 0.18), transparent 70%),
            linear-gradient(140deg, #070b12, #0f1a2c 45%, #0a1220);
          --panel-bg: rgba(11, 19, 32, 0.86);
          --panel-bg-soft: rgba(148, 163, 184, 0.08);
          --panel-border: rgba(148, 163, 184, 0.2);
          --panel-border-strong: rgba(148, 163, 184, 0.35);
          --panel-border-subtle: rgba(148, 163, 184, 0.12);
          --text-primary: #f8fafc;
          --text-muted: #9aa3b2;
          --accent: #3b82f6;
          --accent-2: #f87171;
          --accent-3: #34d399;
          --button-bg: rgba(30, 41, 59, 0.7);
          --input-bg: rgba(15, 23, 42, 0.8);
          --shadow-soft: 0 20px 50px rgba(2, 6, 23, 0.45);
        }

        * {
          box-sizing: border-box;
        }

        html,
        body,
        #__next {
          height: 100%;
        }

        body {
          margin: 0;
          font-family: var(--font-body);
          color: var(--text-primary);
          background: var(--app-bg);
        }

        .calendar-shell {
          min-height: 100vh;
          padding: 32px 20px 56px;
          background: var(--app-gradient);
        }

        .calendar-wrap {
          max-width: 1400px;
          margin: 0 auto;
        }

        .calendar-hero {
          display: flex;
          justify-content: space-between;
          align-items: center;
          gap: 24px;
          flex-wrap: wrap;
          margin-bottom: 18px;
        }

        .calendar-hero h1 {
          margin: 0;
          font-family: var(--font-display);
          font-size: 34px;
        }

        .calendar-hero p {
          margin: 6px 0 0;
          max-width: 520px;
          color: var(--text-muted);
        }

        .hero-kicker {
          font-size: 12px;
          letter-spacing: 0.2em;
          text-transform: uppercase;
          color: var(--accent-3);
          margin-bottom: 6px;
        }

        .hero-actions {
          display: flex;
          align-items: center;
          gap: 10px;
          flex-wrap: wrap;
        }

        .status-chip {
          display: flex;
          align-items: center;
          gap: 8px;
          padding: 6px 10px;
          border-radius: 999px;
          background: var(--panel-bg);
          border: 1px solid var(--panel-border);
          font-size: 12px;
        }

        .status-dot {
          width: 8px;
          height: 8px;
          border-radius: 50%;
          background: #ef4444;
        }

        .status-dot[data-connected="true"] {
          background: #22c55e;
        }

        button,
        select,
        input,
        textarea {
          font-family: var(--font-body);
          color: var(--text-primary);
        }

        button {
          background: var(--button-bg);
          border: 1px solid var(--panel-border);
          padding: 8px 12px;
          border-radius: 10px;
          cursor: pointer;
          transition: transform 0.15s ease, border-color 0.2s ease, box-shadow 0.2s ease;
        }

        button:hover {
          border-color: var(--accent);
          box-shadow: 0 0 18px rgba(59, 130, 246, 0.3);
          transform: translateY(-1px);
        }

        button.primary {
          background: linear-gradient(120deg, rgba(59, 130, 246, 0.95), rgba(34, 211, 238, 0.9));
          border: none;
        }

        button.danger {
          border-color: rgba(239, 68, 68, 0.7);
          color: #fecaca;
        }

        select,
        input,
        textarea {
          background: var(--input-bg);
          border: 1px solid var(--panel-border-strong);
          border-radius: 10px;
          padding: 8px 10px;
          outline: none;
        }

        .banner {
          margin: 10px 0 16px;
          padding: 10px 12px;
          border-radius: 12px;
          background: rgba(16, 185, 129, 0.15);
          border: 1px solid rgba(16, 185, 129, 0.4);
          color: #ecfdf3;
          font-size: 13px;
        }

        .banner.error {
          background: rgba(239, 68, 68, 0.18);
          border-color: rgba(239, 68, 68, 0.45);
          color: #fee2e2;
        }

        .calendar-grid {
          display: grid;
          grid-template-columns: minmax(320px, 2.3fr) minmax(280px, 1fr);
          gap: 16px;
        }

        .panel-stack {
          display: flex;
          flex-direction: column;
          gap: 16px;
        }

        .panel {
          background: var(--panel-bg);
          border: 1px solid var(--panel-border);
          border-radius: 18px;
          padding: 16px;
          box-shadow: var(--shadow-soft);
        }

        .panel-title {
          font-family: var(--font-display);
          font-weight: 600;
          margin-bottom: 12px;
        }

        .calendar-panel {
          display: flex;
          flex-direction: column;
          gap: 12px;
        }

        .calendar-view {
          min-height: 720px;
        }

        .calendar-toolbar {
          display: flex;
          flex-wrap: wrap;
          gap: 12px;
          justify-content: space-between;
          align-items: center;
        }

        .view-toggle {
          display: inline-flex;
          gap: 6px;
          flex-wrap: wrap;
        }

        .view-toggle button {
          padding: 6px 10px;
          border-radius: 999px;
          font-size: 11px;
          letter-spacing: 0.08em;
        }

        .view-toggle button.active {
          border-color: var(--accent);
          background: rgba(59, 130, 246, 0.2);
        }

        .calendar-nav {
          display: inline-flex;
          gap: 8px;
          align-items: center;
          flex-wrap: wrap;
        }

        .calendar-range {
          font-size: 12px;
          color: var(--text-muted);
        }

        .calendar-range.small {
          font-size: 11px;
        }

        .filters {
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(160px, 1fr));
          gap: 10px;
          font-size: 12px;
        }

        .filters label {
          display: flex;
          flex-direction: column;
          gap: 6px;
        }

        .month-grid {
          display: grid;
          grid-template-columns: repeat(7, minmax(0, 1fr));
          gap: 10px;
        }

        .month-header {
          display: grid;
          grid-template-columns: repeat(7, minmax(0, 1fr));
          gap: 10px;
          margin-bottom: 10px;
          font-size: 11px;
          text-transform: uppercase;
          letter-spacing: 0.12em;
          color: var(--text-muted);
        }

        .month-header-cell {
          text-align: center;
        }

        .month-cell {
          background: var(--panel-bg-soft);
          border: 1px solid var(--panel-border);
          border-radius: 14px;
          padding: 10px;
          min-height: 120px;
          display: flex;
          flex-direction: column;
          gap: 6px;
          cursor: pointer;
        }

        .month-cell:hover {
          border-color: var(--accent);
        }

        .month-cell.outside {
          opacity: 0.55;
        }

        .month-day {
          font-size: 12px;
          font-weight: 600;
          color: var(--text-primary);
        }

        .month-events {
          display: flex;
          flex-direction: column;
          gap: 6px;
        }

        .more-events {
          font-size: 11px;
          color: var(--text-muted);
        }

        .event-chip {
          text-align: left;
          font-size: 11px;
          padding: 4px 6px;
          border-radius: 8px;
          border: 1px solid rgba(59, 130, 246, 0.45);
          background: rgba(59, 130, 246, 0.18);
          color: var(--text-primary);
        }

        .event-chip:hover {
          transform: none;
          box-shadow: none;
        }

        .event-chip[data-provider="outlook"] {
          border-color: rgba(16, 185, 129, 0.45);
          background: rgba(16, 185, 129, 0.18);
        }

        .event-chip.all-day {
          font-weight: 600;
        }

        .time-grid {
          border: 1px solid var(--panel-border);
          border-radius: 14px;
          overflow: hidden;
          background: rgba(15, 23, 42, 0.35);
        }

        .all-day-row {
          display: grid;
          background: var(--panel-bg-soft);
          border-bottom: 1px solid var(--panel-border);
        }

        .all-day-label {
          padding: 8px 10px;
          font-size: 11px;
          color: var(--text-muted);
          border-right: 1px solid var(--panel-border);
        }

        .all-day-cell {
          padding: 6px;
          min-height: 48px;
          display: flex;
          flex-direction: column;
          gap: 4px;
          border-left: 1px solid var(--panel-border-subtle);
        }

        .time-grid-header {
          display: grid;
          background: var(--panel-bg-soft);
          border-bottom: 1px solid var(--panel-border);
        }

        .time-grid-corner {
          border-right: 1px solid var(--panel-border);
        }

        .time-grid-day {
          padding: 8px 10px;
          font-size: 12px;
          font-weight: 600;
          text-align: center;
          border-left: 1px solid var(--panel-border);
        }

        .time-grid-body {
          display: grid;
        }

        .time-grid-times {
          display: flex;
          flex-direction: column;
          border-right: 1px solid var(--panel-border);
          background: rgba(15, 23, 42, 0.5);
        }

        .time-grid-time {
          height: var(--hour-height);
          padding: 2px 6px;
          font-size: 10px;
          color: var(--text-muted);
          border-bottom: 1px solid var(--panel-border-subtle);
        }

        .time-grid-daycol {
          position: relative;
          border-left: 1px solid var(--panel-border-subtle);
          overflow: hidden;
        }

        .time-grid-line {
          height: var(--hour-height);
          border-bottom: 1px solid var(--panel-border-subtle);
        }

        .event-block {
          position: absolute;
          left: 6px;
          right: 6px;
          padding: 6px;
          border-radius: 10px;
          border: 1px solid rgba(59, 130, 246, 0.45);
          background: rgba(59, 130, 246, 0.18);
          color: var(--text-primary);
          font-size: 11px;
          overflow: hidden;
          text-align: left;
          z-index: 2;
        }

        .event-block:hover {
          transform: none;
          box-shadow: none;
        }

        .event-block[data-provider="outlook"] {
          border-color: rgba(16, 185, 129, 0.45);
          background: rgba(16, 185, 129, 0.18);
        }

        .event-title {
          font-weight: 600;
          font-size: 11px;
        }

        .event-time {
          font-size: 10px;
          color: var(--text-muted);
        }

        .field {
          display: flex;
          flex-direction: column;
          gap: 6px;
          font-size: 12px;
        }

        .toggle-row {
          display: flex;
          flex-direction: column;
          gap: 8px;
          font-size: 12px;
        }

        .toggle {
          display: flex;
          gap: 8px;
          align-items: center;
        }

        .button-row {
          display: flex;
          gap: 8px;
          flex-wrap: wrap;
        }

        .link-button {
          display: inline-flex;
          align-items: center;
          padding: 8px 12px;
          border-radius: 10px;
          border: 1px solid var(--panel-border);
          background: var(--button-bg);
          color: var(--text-primary);
          text-decoration: none;
          font-size: 12px;
        }

        .muted {
          color: var(--text-muted);
          font-size: 12px;
        }

        @media (max-width: 1200px) {
          .calendar-grid {
            grid-template-columns: 1fr;
          }

          .calendar-view {
            min-height: 640px;
          }

          .time-grid {
            overflow-x: auto;
          }

          .time-grid-header,
          .all-day-row,
          .time-grid-body {
            min-width: 620px;
          }
        }
      `}</style>
    </div>
  );
}
