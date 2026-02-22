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

function formatDateTime(value, timeZone) {
  if (!value) return "--";
  const ts = Date.parse(value);
  if (!Number.isFinite(ts)) return value;
  return new Date(ts).toLocaleString(undefined, { timeZone: timeZone || undefined });
}

function toDateInput(value) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60000);
  return local.toISOString().slice(0, 10);
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

function buildInitialRange() {
  const now = new Date();
  const end = new Date(now.getTime() + 7 * 86400000);
  return {
    start: toDateInput(now.toISOString()),
    end: toDateInput(end.toISOString())
  };
}

export default function CalendarPage() {
  const baseUrl = SERVER_URL || "";
  const initialRange = useMemo(() => buildInitialRange(), []);
  const [providerFilter, setProviderFilter] = useState("all");
  const [rangeStart, setRangeStart] = useState(initialRange.start);
  const [rangeEnd, setRangeEnd] = useState(initialRange.end);
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
          <div className="panel calendar-panel">
            <div className="panel-title">Events</div>
            <div className="filters">
              <label>
                Provider
                <select value={providerFilter} onChange={(e) => setProviderFilter(e.target.value)}>
                  <option value="all">All</option>
                  <option value="google">Google</option>
                  <option value="outlook">Microsoft</option>
                </select>
              </label>
              <label>
                Start
                <input type="date" value={rangeStart} onChange={(e) => setRangeStart(e.target.value)} />
              </label>
              <label>
                End
                <input type="date" value={rangeEnd} onChange={(e) => setRangeEnd(e.target.value)} />
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
            {loading && <div className="muted">Loading events...</div>}
            {!loading && events.length === 0 && (
              <div className="muted">No events found in this window.</div>
            )}
            <div className="event-list">
              {events.map(event => (
                <button
                  key={`${event.provider}-${event.id}`}
                  type="button"
                  className={`event-card ${editingEvent?.id === event.id && editingEvent?.provider === event.provider ? "active" : ""}`}
                  onClick={() => beginEdit(event)}
                >
                  <div className="event-top">
                    <div className="event-title">{event.summary}</div>
                    <div className="event-provider">{event.provider}</div>
                  </div>
                  <div className="event-time">{formatDateTime(event.start, timezone)}</div>
                  <div className="event-meta">
                    {event.location || "No location"}
                  </div>
                </button>
              ))}
            </div>
          </div>

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
          grid-template-columns: minmax(280px, 1fr) minmax(320px, 1fr) minmax(260px, 0.8fr);
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

        .filters {
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(140px, 1fr));
          gap: 10px;
          font-size: 12px;
        }

        .filters label {
          display: flex;
          flex-direction: column;
          gap: 6px;
        }

        .event-list {
          display: grid;
          gap: 10px;
          max-height: 560px;
          overflow-y: auto;
          padding-right: 4px;
        }

        .event-card {
          text-align: left;
          background: var(--panel-bg-soft);
          border: 1px solid transparent;
          border-radius: 14px;
          padding: 12px;
        }

        .event-card.active {
          border-color: var(--accent);
          box-shadow: 0 0 16px rgba(59, 130, 246, 0.25);
        }

        .event-top {
          display: flex;
          justify-content: space-between;
          gap: 8px;
          align-items: center;
        }

        .event-title {
          font-weight: 600;
          font-size: 13px;
        }

        .event-provider {
          font-size: 10px;
          letter-spacing: 0.12em;
          text-transform: uppercase;
          color: var(--accent-3);
        }

        .event-time {
          margin-top: 6px;
          font-size: 12px;
          color: var(--text-muted);
        }

        .event-meta {
          margin-top: 6px;
          font-size: 11px;
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

          .event-list {
            max-height: none;
          }
        }
      `}</style>
    </div>
  );
}
