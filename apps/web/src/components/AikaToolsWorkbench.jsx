import { useEffect, useState } from "react";

function parseTagList(value) {
  return String(value || "")
    .split(",")
    .map(t => t.trim())
    .filter(Boolean);
}

export default function AikaToolsWorkbench({ serverUrl }) {
  const [active, setActive] = useState("meetings");
  const [error, setError] = useState("");
  const [meetingTitle, setMeetingTitle] = useState("Meeting Summary");
  const [meetingTranscript, setMeetingTranscript] = useState("");
  const [meetingResult, setMeetingResult] = useState(null);
  const [notesForm, setNotesForm] = useState({ title: "", body: "", tags: "" });
  const [notesResult, setNotesResult] = useState(null);
  const [notesSearch, setNotesSearch] = useState({ query: "", tags: "" });
  const [notesSearchResults, setNotesSearchResults] = useState([]);
  const [todosForm, setTodosForm] = useState({ title: "", details: "", due: "", priority: "medium", tags: "" });
  const [todoFilters, setTodoFilters] = useState({ status: "open", dueWithinDays: 14, tag: "" });
  const [todoResults, setTodoResults] = useState([]);
  const [calendarForm, setCalendarForm] = useState({ title: "", start: "", end: "", timezone: "UTC", attendees: "", location: "", description: "" });
  const [calendarResult, setCalendarResult] = useState(null);
  const [emailDraftForm, setEmailDraftForm] = useState({ from: "", to: "", subject: "", body: "", tone: "friendly", context: "", signOffName: "" });
  const [emailDraftResult, setEmailDraftResult] = useState(null);
  const [emailSendForm, setEmailSendForm] = useState({ draftId: "", sendTo: "", cc: "", bcc: "" });
  const [emailSendResult, setEmailSendResult] = useState(null);
  const [sheetForm, setSheetForm] = useState({ type: "localFile", pathOrId: "", changes: "[]" });
  const [sheetResult, setSheetResult] = useState(null);
  const [memoryForm, setMemoryForm] = useState({ tier: 1, title: "", content: "", tags: "", containsPHI: false });
  const [memoryResult, setMemoryResult] = useState(null);
  const [memorySearchForm, setMemorySearchForm] = useState({ tier: 1, query: "", tags: "" });
  const [memorySearchResults, setMemorySearchResults] = useState([]);
  const [integrationResult, setIntegrationResult] = useState(null);
  const [messageForm, setMessageForm] = useState({ tool: "messaging.slackPost", channel: "", chatId: "", channelId: "", message: "" });
  const [messageResult, setMessageResult] = useState(null);
  const [configStatus, setConfigStatus] = useState(null);
  const [integrationsStatus, setIntegrationsStatus] = useState(null);
  const [googleStatus, setGoogleStatus] = useState(null);

  async function runTool(name, params) {
    setError("");
    try {
      const r = await fetch(`${serverUrl}/api/tools/call`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, params })
      });
      return await r.json();
    } catch (err) {
      setError(err?.message || "tool_call_failed");
      return null;
    }
  }

  useEffect(() => {
    if (active !== "integrations") return;
    let cancelled = false;
    async function loadStatus() {
      try {
        const [statusResp, integrationsResp, googleResp] = await Promise.all([
          fetch(`${serverUrl}/api/status`),
          fetch(`${serverUrl}/api/integrations`),
          fetch(`${serverUrl}/api/integrations/google/status`)
        ]);
        const statusData = await statusResp.json();
        const integrationsData = await integrationsResp.json();
        const googleData = await googleResp.json();
        if (!cancelled) {
          setConfigStatus(statusData);
          setIntegrationsStatus(integrationsData.integrations || {});
          setGoogleStatus(googleData);
        }
      } catch (err) {
        if (!cancelled) {
          setConfigStatus(null);
          setIntegrationsStatus(null);
          setGoogleStatus(null);
        }
      }
    }
    loadStatus();
    return () => {
      cancelled = true;
    };
  }, [active, serverUrl]);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      <div style={{ fontSize: 14, fontWeight: 600, color: "#111827" }}>Aika Tools v1</div>
      {error && <div style={{ color: "#b91c1c", fontSize: 12 }}>{error}</div>}
      <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
        {["meetings", "notes", "todos", "calendar", "email", "spreadsheet", "memory", "integrations", "messaging"].map(tab => (
          <button
            key={tab}
            onClick={() => setActive(tab)}
            style={{
              padding: "6px 10px",
              borderRadius: 8,
              border: active === tab ? "2px solid #2b6cb0" : "1px solid #e5e7eb",
              background: active === tab ? "#e6f0ff" : "white",
              textTransform: "capitalize"
            }}
          >
            {tab}
          </button>
        ))}
      </div>
      {active === "meetings" && (
        <div style={{ border: "1px solid #e5e7eb", borderRadius: 12, padding: 12, background: "white" }}>
          <div style={{ fontWeight: 600, marginBottom: 6 }}>Summarize & Store</div>
          <label style={{ fontSize: 12 }}>
            Title
            <input value={meetingTitle} onChange={(e) => setMeetingTitle(e.target.value)} style={{ width: "100%", padding: 8, marginTop: 4, borderRadius: 8, border: "1px solid #d1d5db" }} />
          </label>
          <label style={{ fontSize: 12, marginTop: 8 }}>
            Transcript
            <textarea value={meetingTranscript} onChange={(e) => setMeetingTranscript(e.target.value)} rows={6} style={{ width: "100%", padding: 8, marginTop: 4, borderRadius: 8, border: "1px solid #d1d5db" }} />
          </label>
          <button
            onClick={async () => {
              const resp = await runTool("meeting.summarize", {
                transcript: meetingTranscript,
                title: meetingTitle,
                store: { googleDocs: true, localMarkdown: true }
              });
              setMeetingResult(resp);
            }}
            style={{ marginTop: 8, padding: "6px 10px", borderRadius: 8 }}
          >
            Summarize & Store
          </button>
          {meetingResult && (
            <pre style={{ marginTop: 8, background: "#0b1220", color: "#e5e7eb", padding: 8, borderRadius: 8, fontSize: 11 }}>
{JSON.stringify(meetingResult, null, 2)}
            </pre>
          )}
        </div>
      )}

      {active === "notes" && (
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
          <div style={{ border: "1px solid #e5e7eb", borderRadius: 12, padding: 12, background: "white" }}>
            <div style={{ fontWeight: 600, marginBottom: 6 }}>Create Note</div>
            <label style={{ fontSize: 12 }}>
              Title
              <input value={notesForm.title} onChange={(e) => setNotesForm({ ...notesForm, title: e.target.value })} style={{ width: "100%", padding: 8, marginTop: 4, borderRadius: 8, border: "1px solid #d1d5db" }} />
            </label>
            <label style={{ fontSize: 12, marginTop: 8 }}>
              Body
              <textarea value={notesForm.body} onChange={(e) => setNotesForm({ ...notesForm, body: e.target.value })} rows={5} style={{ width: "100%", padding: 8, marginTop: 4, borderRadius: 8, border: "1px solid #d1d5db" }} />
            </label>
            <label style={{ fontSize: 12, marginTop: 8 }}>
              Tags (comma)
              <input value={notesForm.tags} onChange={(e) => setNotesForm({ ...notesForm, tags: e.target.value })} style={{ width: "100%", padding: 8, marginTop: 4, borderRadius: 8, border: "1px solid #d1d5db" }} />
            </label>
            <button
              onClick={async () => {
                const resp = await runTool("notes.create", {
                  title: notesForm.title,
                  body: notesForm.body,
                  tags: parseTagList(notesForm.tags),
                  store: { googleDocs: true, localMarkdown: true }
                });
                setNotesResult(resp);
              }}
              style={{ marginTop: 8, padding: "6px 10px", borderRadius: 8 }}
            >
              Create Note
            </button>
            {notesResult && (
              <pre style={{ marginTop: 8, background: "#0b1220", color: "#e5e7eb", padding: 8, borderRadius: 8, fontSize: 11 }}>
{JSON.stringify(notesResult, null, 2)}
              </pre>
            )}
          </div>

          <div style={{ border: "1px solid #e5e7eb", borderRadius: 12, padding: 12, background: "white" }}>
            <div style={{ fontWeight: 600, marginBottom: 6 }}>Search Notes</div>
            <label style={{ fontSize: 12 }}>
              Query
              <input value={notesSearch.query} onChange={(e) => setNotesSearch({ ...notesSearch, query: e.target.value })} style={{ width: "100%", padding: 8, marginTop: 4, borderRadius: 8, border: "1px solid #d1d5db" }} />
            </label>
            <label style={{ fontSize: 12, marginTop: 8 }}>
              Tags (comma)
              <input value={notesSearch.tags} onChange={(e) => setNotesSearch({ ...notesSearch, tags: e.target.value })} style={{ width: "100%", padding: 8, marginTop: 4, borderRadius: 8, border: "1px solid #d1d5db" }} />
            </label>
            <button
              onClick={async () => {
                const resp = await runTool("notes.search", {
                  query: notesSearch.query,
                  tags: parseTagList(notesSearch.tags),
                  limit: 20
                });
                setNotesSearchResults(resp?.data || []);
              }}
              style={{ marginTop: 8, padding: "6px 10px", borderRadius: 8 }}
            >
              Search
            </button>
            <div style={{ marginTop: 8, fontSize: 12 }}>
              {notesSearchResults.map(n => (
                <div key={n.id} style={{ borderBottom: "1px solid #f3f4f6", padding: "6px 0" }}>
                  <div style={{ fontWeight: 600 }}>{n.title}</div>
                  <div style={{ color: "#6b7280" }}>{n.snippet}</div>
                  {n.googleDocUrl && (
                    <div>
                      <a href={n.googleDocUrl} target="_blank" rel="noreferrer">Open Google Doc</a>
                    </div>
                  )}
                </div>
              ))}
              {notesSearchResults.length === 0 && <div>No results yet.</div>}
            </div>
          </div>
        </div>
      )}

      {active === "todos" && (
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
          <div style={{ border: "1px solid #e5e7eb", borderRadius: 12, padding: 12, background: "white" }}>
            <div style={{ fontWeight: 600, marginBottom: 6 }}>Create Todo</div>
            <label style={{ fontSize: 12 }}>
              Title
              <input value={todosForm.title} onChange={(e) => setTodosForm({ ...todosForm, title: e.target.value })} style={{ width: "100%", padding: 8, marginTop: 4, borderRadius: 8, border: "1px solid #d1d5db" }} />
            </label>
            <label style={{ fontSize: 12, marginTop: 8 }}>
              Details
              <input value={todosForm.details} onChange={(e) => setTodosForm({ ...todosForm, details: e.target.value })} style={{ width: "100%", padding: 8, marginTop: 4, borderRadius: 8, border: "1px solid #d1d5db" }} />
            </label>
            <label style={{ fontSize: 12, marginTop: 8 }}>
              Due (ISO or date)
              <input value={todosForm.due} onChange={(e) => setTodosForm({ ...todosForm, due: e.target.value })} style={{ width: "100%", padding: 8, marginTop: 4, borderRadius: 8, border: "1px solid #d1d5db" }} />
            </label>
            <label style={{ fontSize: 12, marginTop: 8 }}>
              Priority
              <select value={todosForm.priority} onChange={(e) => setTodosForm({ ...todosForm, priority: e.target.value })} style={{ width: "100%", padding: 8, marginTop: 4, borderRadius: 8, border: "1px solid #d1d5db" }}>
                <option value="low">low</option>
                <option value="medium">medium</option>
                <option value="high">high</option>
              </select>
            </label>
            <label style={{ fontSize: 12, marginTop: 8 }}>
              Tags (comma)
              <input value={todosForm.tags} onChange={(e) => setTodosForm({ ...todosForm, tags: e.target.value })} style={{ width: "100%", padding: 8, marginTop: 4, borderRadius: 8, border: "1px solid #d1d5db" }} />
            </label>
            <button
              onClick={async () => {
                const resp = await runTool("todos.create", {
                  title: todosForm.title,
                  details: todosForm.details,
                  due: todosForm.due || null,
                  priority: todosForm.priority,
                  tags: parseTagList(todosForm.tags)
                });
                setTodoResults(resp?.data ? [resp.data] : []);
              }}
              style={{ marginTop: 8, padding: "6px 10px", borderRadius: 8 }}
            >
              Create Todo
            </button>
          </div>

          <div style={{ border: "1px solid #e5e7eb", borderRadius: 12, padding: 12, background: "white" }}>
            <div style={{ fontWeight: 600, marginBottom: 6 }}>List Todos</div>
            <label style={{ fontSize: 12 }}>
              Status
              <select value={todoFilters.status} onChange={(e) => setTodoFilters({ ...todoFilters, status: e.target.value })} style={{ width: "100%", padding: 8, marginTop: 4, borderRadius: 8, border: "1px solid #d1d5db" }}>
                <option value="open">open</option>
                <option value="done">done</option>
                <option value="all">all</option>
              </select>
            </label>
            <label style={{ fontSize: 12, marginTop: 8 }}>
              Due within days
              <input value={todoFilters.dueWithinDays} onChange={(e) => setTodoFilters({ ...todoFilters, dueWithinDays: e.target.value })} style={{ width: "100%", padding: 8, marginTop: 4, borderRadius: 8, border: "1px solid #d1d5db" }} />
            </label>
            <label style={{ fontSize: 12, marginTop: 8 }}>
              Tag
              <input value={todoFilters.tag} onChange={(e) => setTodoFilters({ ...todoFilters, tag: e.target.value })} style={{ width: "100%", padding: 8, marginTop: 4, borderRadius: 8, border: "1px solid #d1d5db" }} />
            </label>
            <button
              onClick={async () => {
                const resp = await runTool("todos.list", {
                  status: todoFilters.status,
                  dueWithinDays: Number(todoFilters.dueWithinDays || 14),
                  tag: todoFilters.tag || null
                });
                setTodoResults(resp?.data || []);
              }}
              style={{ marginTop: 8, padding: "6px 10px", borderRadius: 8 }}
            >
              List Todos
            </button>
            <div style={{ marginTop: 8, fontSize: 12 }}>
              {todoResults.map(t => (
                <div key={t.id} style={{ borderBottom: "1px solid #f3f4f6", padding: "6px 0" }}>
                  <div style={{ fontWeight: 600 }}>{t.title}</div>
                  <div style={{ color: "#6b7280" }}>{t.status} {t.due ? `- due ${t.due}` : ""}</div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {active === "calendar" && (
        <div style={{ border: "1px solid #e5e7eb", borderRadius: 12, padding: 12, background: "white" }}>
          <div style={{ fontWeight: 600, marginBottom: 6 }}>Propose Hold</div>
          <label style={{ fontSize: 12 }}>
            Title
            <input value={calendarForm.title} onChange={(e) => setCalendarForm({ ...calendarForm, title: e.target.value })} style={{ width: "100%", padding: 8, marginTop: 4, borderRadius: 8, border: "1px solid #d1d5db" }} />
          </label>
          <label style={{ fontSize: 12, marginTop: 8 }}>
            Start (ISO)
            <input value={calendarForm.start} onChange={(e) => setCalendarForm({ ...calendarForm, start: e.target.value })} style={{ width: "100%", padding: 8, marginTop: 4, borderRadius: 8, border: "1px solid #d1d5db" }} />
          </label>
          <label style={{ fontSize: 12, marginTop: 8 }}>
            End (ISO)
            <input value={calendarForm.end} onChange={(e) => setCalendarForm({ ...calendarForm, end: e.target.value })} style={{ width: "100%", padding: 8, marginTop: 4, borderRadius: 8, border: "1px solid #d1d5db" }} />
          </label>
          <label style={{ fontSize: 12, marginTop: 8 }}>
            Timezone
            <input value={calendarForm.timezone} onChange={(e) => setCalendarForm({ ...calendarForm, timezone: e.target.value })} style={{ width: "100%", padding: 8, marginTop: 4, borderRadius: 8, border: "1px solid #d1d5db" }} />
          </label>
          <label style={{ fontSize: 12, marginTop: 8 }}>
            Attendees (comma emails)
            <input value={calendarForm.attendees} onChange={(e) => setCalendarForm({ ...calendarForm, attendees: e.target.value })} style={{ width: "100%", padding: 8, marginTop: 4, borderRadius: 8, border: "1px solid #d1d5db" }} />
          </label>
          <button
            onClick={async () => {
              const resp = await runTool("calendar.proposeHold", {
                title: calendarForm.title,
                start: calendarForm.start,
                end: calendarForm.end,
                timezone: calendarForm.timezone,
                attendees: parseTagList(calendarForm.attendees)
              });
              setCalendarResult(resp);
            }}
            style={{ marginTop: 8, padding: "6px 10px", borderRadius: 8 }}
          >
            Save Draft Hold
          </button>
          {calendarResult && (
            <pre style={{ marginTop: 8, background: "#0b1220", color: "#e5e7eb", padding: 8, borderRadius: 8, fontSize: 11 }}>
{JSON.stringify(calendarResult, null, 2)}
            </pre>
          )}
        </div>
      )}

      {active === "email" && (
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
          <div style={{ border: "1px solid #e5e7eb", borderRadius: 12, padding: 12, background: "white" }}>
            <div style={{ fontWeight: 600, marginBottom: 6 }}>Draft Reply</div>
            <label style={{ fontSize: 12 }}>
              From
              <input value={emailDraftForm.from} onChange={(e) => setEmailDraftForm({ ...emailDraftForm, from: e.target.value })} style={{ width: "100%", padding: 8, marginTop: 4, borderRadius: 8, border: "1px solid #d1d5db" }} />
            </label>
            <label style={{ fontSize: 12, marginTop: 8 }}>
              To (comma)
              <input value={emailDraftForm.to} onChange={(e) => setEmailDraftForm({ ...emailDraftForm, to: e.target.value })} style={{ width: "100%", padding: 8, marginTop: 4, borderRadius: 8, border: "1px solid #d1d5db" }} />
            </label>
            <label style={{ fontSize: 12, marginTop: 8 }}>
              Subject
              <input value={emailDraftForm.subject} onChange={(e) => setEmailDraftForm({ ...emailDraftForm, subject: e.target.value })} style={{ width: "100%", padding: 8, marginTop: 4, borderRadius: 8, border: "1px solid #d1d5db" }} />
            </label>
            <label style={{ fontSize: 12, marginTop: 8 }}>
              Body
              <textarea value={emailDraftForm.body} onChange={(e) => setEmailDraftForm({ ...emailDraftForm, body: e.target.value })} rows={4} style={{ width: "100%", padding: 8, marginTop: 4, borderRadius: 8, border: "1px solid #d1d5db" }} />
            </label>
            <label style={{ fontSize: 12, marginTop: 8 }}>
              Tone
              <select value={emailDraftForm.tone} onChange={(e) => setEmailDraftForm({ ...emailDraftForm, tone: e.target.value })} style={{ width: "100%", padding: 8, marginTop: 4, borderRadius: 8, border: "1px solid #d1d5db" }}>
                <option value="friendly">friendly</option>
                <option value="direct">direct</option>
                <option value="executive">executive</option>
              </select>
            </label>
            <label style={{ fontSize: 12, marginTop: 8 }}>
              Context
              <input value={emailDraftForm.context} onChange={(e) => setEmailDraftForm({ ...emailDraftForm, context: e.target.value })} style={{ width: "100%", padding: 8, marginTop: 4, borderRadius: 8, border: "1px solid #d1d5db" }} />
            </label>
            <label style={{ fontSize: 12, marginTop: 8 }}>
              Sign off name
              <input value={emailDraftForm.signOffName} onChange={(e) => setEmailDraftForm({ ...emailDraftForm, signOffName: e.target.value })} style={{ width: "100%", padding: 8, marginTop: 4, borderRadius: 8, border: "1px solid #d1d5db" }} />
            </label>
            <button
              onClick={async () => {
                const resp = await runTool("email.draftReply", {
                  originalEmail: {
                    from: emailDraftForm.from,
                    to: parseTagList(emailDraftForm.to),
                    subject: emailDraftForm.subject,
                    body: emailDraftForm.body
                  },
                  tone: emailDraftForm.tone,
                  context: emailDraftForm.context,
                  signOffName: emailDraftForm.signOffName
                });
                setEmailDraftResult(resp);
                if (resp?.data?.id) setEmailSendForm({ ...emailSendForm, draftId: resp.data.id });
              }}
              style={{ marginTop: 8, padding: "6px 10px", borderRadius: 8 }}
            >
              Create Draft
            </button>
            {emailDraftResult && (
              <pre style={{ marginTop: 8, background: "#0b1220", color: "#e5e7eb", padding: 8, borderRadius: 8, fontSize: 11 }}>
{JSON.stringify(emailDraftResult, null, 2)}
              </pre>
            )}
          </div>

          <div style={{ border: "1px solid #e5e7eb", borderRadius: 12, padding: 12, background: "white" }}>
            <div style={{ fontWeight: 600, marginBottom: 6 }}>Send Draft (Approval Required)</div>
            <label style={{ fontSize: 12 }}>
              Draft ID
              <input value={emailSendForm.draftId} onChange={(e) => setEmailSendForm({ ...emailSendForm, draftId: e.target.value })} style={{ width: "100%", padding: 8, marginTop: 4, borderRadius: 8, border: "1px solid #d1d5db" }} />
            </label>
            <label style={{ fontSize: 12, marginTop: 8 }}>
              Send To (comma)
              <input value={emailSendForm.sendTo} onChange={(e) => setEmailSendForm({ ...emailSendForm, sendTo: e.target.value })} style={{ width: "100%", padding: 8, marginTop: 4, borderRadius: 8, border: "1px solid #d1d5db" }} />
            </label>
            <label style={{ fontSize: 12, marginTop: 8 }}>
              CC (comma)
              <input value={emailSendForm.cc} onChange={(e) => setEmailSendForm({ ...emailSendForm, cc: e.target.value })} style={{ width: "100%", padding: 8, marginTop: 4, borderRadius: 8, border: "1px solid #d1d5db" }} />
            </label>
            <label style={{ fontSize: 12, marginTop: 8 }}>
              BCC (comma)
              <input value={emailSendForm.bcc} onChange={(e) => setEmailSendForm({ ...emailSendForm, bcc: e.target.value })} style={{ width: "100%", padding: 8, marginTop: 4, borderRadius: 8, border: "1px solid #d1d5db" }} />
            </label>
            <button
              onClick={async () => {
                const resp = await runTool("email.send", {
                  draftId: emailSendForm.draftId,
                  sendTo: parseTagList(emailSendForm.sendTo),
                  cc: parseTagList(emailSendForm.cc),
                  bcc: parseTagList(emailSendForm.bcc)
                });
                setEmailSendResult(resp);
              }}
              style={{ marginTop: 8, padding: "6px 10px", borderRadius: 8 }}
            >
              Send
            </button>
            {emailSendResult && (
              <pre style={{ marginTop: 8, background: "#0b1220", color: "#e5e7eb", padding: 8, borderRadius: 8, fontSize: 11 }}>
{JSON.stringify(emailSendResult, null, 2)}
              </pre>
            )}
          </div>
        </div>
      )}

      {active === "spreadsheet" && (
        <div style={{ border: "1px solid #e5e7eb", borderRadius: 12, padding: 12, background: "white" }}>
          <div style={{ fontWeight: 600, marginBottom: 6 }}>Draft Spreadsheet Patch</div>
          <label style={{ fontSize: 12 }}>
            Target Type
            <select value={sheetForm.type} onChange={(e) => setSheetForm({ ...sheetForm, type: e.target.value })} style={{ width: "100%", padding: 8, marginTop: 4, borderRadius: 8, border: "1px solid #d1d5db" }}>
              <option value="localFile">localFile</option>
              <option value="googleSheet">googleSheet</option>
            </select>
          </label>
          <label style={{ fontSize: 12, marginTop: 8 }}>
            Path or ID
            <input value={sheetForm.pathOrId} onChange={(e) => setSheetForm({ ...sheetForm, pathOrId: e.target.value })} style={{ width: "100%", padding: 8, marginTop: 4, borderRadius: 8, border: "1px solid #d1d5db" }} />
          </label>
          <label style={{ fontSize: 12, marginTop: 8 }}>
            Changes (JSON)
            <textarea value={sheetForm.changes} onChange={(e) => setSheetForm({ ...sheetForm, changes: e.target.value })} rows={5} style={{ width: "100%", padding: 8, marginTop: 4, borderRadius: 8, border: "1px solid #d1d5db", fontFamily: "monospace" }} />
          </label>
          <button
            onClick={async () => {
              let changes = [];
              try { changes = JSON.parse(sheetForm.changes || "[]"); } catch { changes = []; }
              const resp = await runTool("spreadsheet.applyChanges", {
                target: { type: sheetForm.type, pathOrId: sheetForm.pathOrId },
                changes,
                draftOnly: true
              });
              setSheetResult(resp);
            }}
            style={{ marginTop: 8, padding: "6px 10px", borderRadius: 8 }}
          >
            Create Patch
          </button>
          {sheetResult && (
            <pre style={{ marginTop: 8, background: "#0b1220", color: "#e5e7eb", padding: 8, borderRadius: 8, fontSize: 11 }}>
{JSON.stringify(sheetResult, null, 2)}
            </pre>
          )}
        </div>
      )}

      {active === "memory" && (
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
          <div style={{ border: "1px solid #e5e7eb", borderRadius: 12, padding: 12, background: "white" }}>
            <div style={{ fontWeight: 600, marginBottom: 6 }}>Write Memory</div>
            <label style={{ fontSize: 12 }}>
              Tier
              <select value={memoryForm.tier} onChange={(e) => setMemoryForm({ ...memoryForm, tier: Number(e.target.value) })} style={{ width: "100%", padding: 8, marginTop: 4, borderRadius: 8, border: "1px solid #d1d5db" }}>
                <option value={1}>Tier 1</option>
                <option value={2}>Tier 2</option>
                <option value={3}>Tier 3</option>
              </select>
            </label>
            <label style={{ fontSize: 12, marginTop: 8 }}>
              Title
              <input value={memoryForm.title} onChange={(e) => setMemoryForm({ ...memoryForm, title: e.target.value })} style={{ width: "100%", padding: 8, marginTop: 4, borderRadius: 8, border: "1px solid #d1d5db" }} />
            </label>
            <label style={{ fontSize: 12, marginTop: 8 }}>
              Content
              <textarea value={memoryForm.content} onChange={(e) => setMemoryForm({ ...memoryForm, content: e.target.value })} rows={4} style={{ width: "100%", padding: 8, marginTop: 4, borderRadius: 8, border: "1px solid #d1d5db" }} />
            </label>
            <label style={{ fontSize: 12, marginTop: 8 }}>
              Tags (comma)
              <input value={memoryForm.tags} onChange={(e) => setMemoryForm({ ...memoryForm, tags: e.target.value })} style={{ width: "100%", padding: 8, marginTop: 4, borderRadius: 8, border: "1px solid #d1d5db" }} />
            </label>
            <label style={{ fontSize: 12, marginTop: 8, display: "flex", gap: 6, alignItems: "center" }}>
              <input type="checkbox" checked={memoryForm.containsPHI} onChange={(e) => setMemoryForm({ ...memoryForm, containsPHI: e.target.checked })} />
              Contains PHI
            </label>
            <button
              onClick={async () => {
                const resp = await runTool("memory.write", {
                  tier: memoryForm.tier,
                  title: memoryForm.title,
                  content: memoryForm.content,
                  tags: parseTagList(memoryForm.tags),
                  containsPHI: memoryForm.containsPHI
                });
                setMemoryResult(resp);
              }}
              style={{ marginTop: 8, padding: "6px 10px", borderRadius: 8 }}
            >
              Write Memory
            </button>
            {memoryResult && (
              <pre style={{ marginTop: 8, background: "#0b1220", color: "#e5e7eb", padding: 8, borderRadius: 8, fontSize: 11 }}>
{JSON.stringify(memoryResult, null, 2)}
              </pre>
            )}
          </div>

          <div style={{ border: "1px solid #e5e7eb", borderRadius: 12, padding: 12, background: "white" }}>
            <div style={{ fontWeight: 600, marginBottom: 6 }}>Search Memory</div>
            <label style={{ fontSize: 12 }}>
              Tier
              <select value={memorySearchForm.tier} onChange={(e) => setMemorySearchForm({ ...memorySearchForm, tier: Number(e.target.value) })} style={{ width: "100%", padding: 8, marginTop: 4, borderRadius: 8, border: "1px solid #d1d5db" }}>
                <option value={1}>Tier 1</option>
                <option value={2}>Tier 2</option>
                <option value={3}>Tier 3</option>
              </select>
            </label>
            <label style={{ fontSize: 12, marginTop: 8 }}>
              Query
              <input value={memorySearchForm.query} onChange={(e) => setMemorySearchForm({ ...memorySearchForm, query: e.target.value })} style={{ width: "100%", padding: 8, marginTop: 4, borderRadius: 8, border: "1px solid #d1d5db" }} />
            </label>
            <label style={{ fontSize: 12, marginTop: 8 }}>
              Tags (comma)
              <input value={memorySearchForm.tags} onChange={(e) => setMemorySearchForm({ ...memorySearchForm, tags: e.target.value })} style={{ width: "100%", padding: 8, marginTop: 4, borderRadius: 8, border: "1px solid #d1d5db" }} />
            </label>
            <button
              onClick={async () => {
                const resp = await runTool("memory.search", {
                  tier: memorySearchForm.tier,
                  query: memorySearchForm.query,
                  tags: parseTagList(memorySearchForm.tags),
                  limit: 20
                });
                setMemorySearchResults(resp?.data || []);
              }}
              style={{ marginTop: 8, padding: "6px 10px", borderRadius: 8 }}
            >
              Search
            </button>
            <div style={{ marginTop: 8, fontSize: 12 }}>
              {memorySearchResults.map(m => (
                <div key={m.id} style={{ borderBottom: "1px solid #f3f4f6", padding: "6px 0" }}>
                  <div style={{ fontWeight: 600 }}>{m.title}</div>
                  <div style={{ color: "#6b7280" }}>{m.snippet}</div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {active === "integrations" && (
        <div style={{ border: "1px solid #e5e7eb", borderRadius: 12, padding: 12, background: "white" }}>
          <div style={{ fontWeight: 600, marginBottom: 6 }}>Integration Checks</div>
          <div style={{ marginBottom: 10, fontSize: 12, color: "#6b7280" }}>
            Google status: {googleStatus?.connected ? "connected" : "not connected"}
            {integrationsStatus?.google_docs?.configured === false ? " (missing config)" : ""}
          </div>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 10 }}>
            <button
              onClick={() => window.open(`${serverUrl}/api/integrations/google/connect`, "_blank")}
              style={{ padding: "6px 10px", borderRadius: 8 }}
            >
              Connect Google Docs
            </button>
            <button
              onClick={async () => {
                try {
                  const integrationsResp = await fetch(`${serverUrl}/api/integrations`);
                  const integrationsData = await integrationsResp.json();
                  setIntegrationsStatus(integrationsData.integrations || {});
                  const googleResp = await fetch(`${serverUrl}/api/integrations/google/status`);
                  setGoogleStatus(await googleResp.json());
                } catch {
                  // ignore
                }
              }}
              style={{ padding: "6px 10px", borderRadius: 8 }}
            >
              Refresh Status
            </button>
          </div>
          {configStatus && (
            <div style={{ fontSize: 12, color: "#6b7280", marginBottom: 10 }}>
              Server: {configStatus?.server?.ok ? "ok" : "unknown"} | Tools: {configStatus?.skills?.total ?? 0} skills
            </div>
          )}
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <button onClick={async () => { const resp = await runTool("integrations.plexIdentity", { mode: "localStub" }); setIntegrationResult(resp); }} style={{ padding: "6px 10px", borderRadius: 8 }}>
              Plex Identity (stub)
            </button>
            <button onClick={async () => { const resp = await runTool("integrations.firefliesTranscripts", { mode: "stub", limit: 5 }); setIntegrationResult(resp); }} style={{ padding: "6px 10px", borderRadius: 8 }}>
              Fireflies Transcripts (stub)
            </button>
          </div>
          {integrationResult && (
            <pre style={{ marginTop: 8, background: "#0b1220", color: "#e5e7eb", padding: 8, borderRadius: 8, fontSize: 11 }}>
{JSON.stringify(integrationResult, null, 2)}
            </pre>
          )}
        </div>
      )}

      {active === "messaging" && (
        <div style={{ border: "1px solid #e5e7eb", borderRadius: 12, padding: 12, background: "white" }}>
          <div style={{ fontWeight: 600, marginBottom: 6 }}>Send Message (Approval Required)</div>
          <label style={{ fontSize: 12 }}>
            Tool
            <select value={messageForm.tool} onChange={(e) => setMessageForm({ ...messageForm, tool: e.target.value })} style={{ width: "100%", padding: 8, marginTop: 4, borderRadius: 8, border: "1px solid #d1d5db" }}>
              <option value="messaging.slackPost">Slack</option>
              <option value="messaging.telegramSend">Telegram</option>
              <option value="messaging.discordSend">Discord</option>
            </select>
          </label>
          {messageForm.tool === "messaging.slackPost" && (
            <label style={{ fontSize: 12, marginTop: 8 }}>
              Channel
              <input value={messageForm.channel} onChange={(e) => setMessageForm({ ...messageForm, channel: e.target.value })} style={{ width: "100%", padding: 8, marginTop: 4, borderRadius: 8, border: "1px solid #d1d5db" }} />
            </label>
          )}
          {messageForm.tool === "messaging.telegramSend" && (
            <label style={{ fontSize: 12, marginTop: 8 }}>
              Chat ID
              <input value={messageForm.chatId} onChange={(e) => setMessageForm({ ...messageForm, chatId: e.target.value })} style={{ width: "100%", padding: 8, marginTop: 4, borderRadius: 8, border: "1px solid #d1d5db" }} />
            </label>
          )}
          {messageForm.tool === "messaging.discordSend" && (
            <label style={{ fontSize: 12, marginTop: 8 }}>
              Channel ID (optional)
              <input value={messageForm.channelId} onChange={(e) => setMessageForm({ ...messageForm, channelId: e.target.value })} style={{ width: "100%", padding: 8, marginTop: 4, borderRadius: 8, border: "1px solid #d1d5db" }} />
            </label>
          )}
          <label style={{ fontSize: 12, marginTop: 8 }}>
            Message
            <textarea value={messageForm.message} onChange={(e) => setMessageForm({ ...messageForm, message: e.target.value })} rows={4} style={{ width: "100%", padding: 8, marginTop: 4, borderRadius: 8, border: "1px solid #d1d5db" }} />
          </label>
          <button
            onClick={async () => {
              const params = messageForm.tool === "messaging.slackPost"
                ? { channel: messageForm.channel, message: messageForm.message }
                : messageForm.tool === "messaging.telegramSend"
                  ? { chatId: messageForm.chatId, message: messageForm.message }
                  : { channelId: messageForm.channelId, message: messageForm.message };
              const resp = await runTool(messageForm.tool, params);
              setMessageResult(resp);
            }}
            style={{ marginTop: 8, padding: "6px 10px", borderRadius: 8 }}
          >
            Queue Message
          </button>
          {messageResult && (
            <pre style={{ marginTop: 8, background: "#0b1220", color: "#e5e7eb", padding: 8, borderRadius: 8, fontSize: 11 }}>
{JSON.stringify(messageResult, null, 2)}
            </pre>
          )}
        </div>
      )}
    </div>
  );
}
