import { useEffect, useRef, useState } from "react";

function parseTagList(value) {
  return String(value || "")
    .split(",")
    .map(t => t.trim())
    .filter(Boolean);
}

const TOOL_HELP = {
  meetings: {
    title: "Meeting Summaries",
    why: "Turn raw transcripts into decisions, tasks, and summaries you can search later.",
    how: "Paste a title + transcript, then click Summarize & Store. Output is saved into the RAG and optional docs."
  },
  notesCreate: {
    title: "Create Notes",
    why: "Capture durable knowledge, SOPs, and ideas that Aika can retrieve later.",
    how: "Add a clear title, concise body, and tags for easier recall."
  },
  notesSearch: {
    title: "Search Notes",
    why: "Find previous notes quickly when you need context or a reminder.",
    how: "Search by keyword and optional tags; results return ranked matches."
  },
  todosHub: {
    title: "Todo Command Center",
    why: "Keep projects, work, and follow-ups organized with lists, steps, reminders, and tags.",
    how: "Pick a list, add tasks, and use the detail panel to edit, schedule, and complete."
  },
  vault: {
    title: "Knowledge Vault",
    why: "Ask questions across saved notes and todos with RAG retrieval.",
    how: "Pick a scope, enter a question, and review the answer plus citations."
  },
  calendar: {
    title: "Calendar Holds",
    why: "Reserve time on your calendar and avoid conflicts.",
    how: "Provide title, start/end, attendees, and click Create Calendar Event."
  },
  emailDraft: {
    title: "Email Drafts",
    why: "Generate a clean draft without sending so you can review first.",
    how: "Fill the fields and click Draft Email. You can edit before sending."
  },
  emailInbox: {
    title: "Inbox Preview",
    why: "Pull in recent emails without storing full mailboxes locally.",
    how: "Pick a provider, refresh the list, and open a message to see RAG context."
  },
  emailActions: {
    title: "Email Action Layer",
    why: "Turn messages into tasks, follow-ups, and contextual replies.",
    how: "Select an email, then create a todo, schedule a follow-up, or draft a reply with context."
  },
  emailSend: {
    title: "Send Email",
    why: "Send a vetted draft after review and approval.",
    how: "Enter the draft ID and recipients, then click Send Email."
  },
  spreadsheet: {
    title: "Spreadsheet Updates",
    why: "Apply structured updates to local or Google Sheets data.",
    how: "Provide the file path or sheet ID and a JSON array of changes."
  },
  memoryWrite: {
    title: "Store Memory",
    why: "Persist preferences or facts across sessions for better personalization.",
    how: "Pick the tier, add content + tags, and click Store Memory."
  },
  memorySearch: {
    title: "Search Memory",
    why: "Recall stored facts and preferences fast.",
    how: "Search by keyword and tags; results are ranked by relevance."
  },
  integrations: {
    title: "Integrations Status",
    why: "Verify external services are connected and healthy.",
    how: "Open the Integrations tab and refresh for current status."
  },
  messaging: {
    title: "Messaging",
    why: "Send alerts to Slack/Discord/Telegram for quick notifications.",
    how: "Pick the channel, add a message, and click Send."
  }
};

function InfoTip({ help }) {
  const [open, setOpen] = useState(false);
  const containerRef = useRef(null);

  useEffect(() => {
    if (!open) return undefined;
    function handleClick(event) {
      if (containerRef.current && !containerRef.current.contains(event.target)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [open]);

  if (!help) return null;
  return (
    <span ref={containerRef} style={{ position: "relative", display: "inline-flex" }}>
      <button
        type="button"
        onClick={() => setOpen(!open)}
        style={{
          border: "1px solid var(--panel-border-strong)",
          background: "var(--panel-bg-soft)",
          borderRadius: 999,
          width: 18,
          height: 18,
          fontSize: 11,
          color: "var(--text-primary)",
          cursor: "pointer",
          lineHeight: "16px",
          textAlign: "center"
        }}
      >
        i
      </button>
      {open && (
        <div style={{
          position: "absolute",
          top: 24,
          right: 0,
          zIndex: 20,
          width: 260,
          background: "#0f172a",
          color: "#e2e8f0",
          padding: 10,
          borderRadius: 10,
          fontSize: 11,
          boxShadow: "0 10px 30px rgba(15, 23, 42, 0.2)"
        }}>
          <div style={{ fontWeight: 600, marginBottom: 6 }}>{help.title}</div>
          <div style={{ marginBottom: 6 }}><strong>Why:</strong> {help.why}</div>
          <div><strong>How:</strong> {help.how}</div>
        </div>
      )}
    </span>
  );
}

function SectionHeader({ title, helpKey }) {
  return (
    <div style={{ fontWeight: 600, marginBottom: 6, display: "flex", alignItems: "center", gap: 6 }}>
      <span>{title}</span>
      <InfoTip help={TOOL_HELP[helpKey]} />
    </div>
  );
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
  const [todoLists, setTodoLists] = useState([]);
  const [activeTodoListId, setActiveTodoListId] = useState("");
  const [todoDraft, setTodoDraft] = useState({ title: "", details: "", due: "", priority: "medium", tags: "" });
  const [todoFilters, setTodoFilters] = useState({ status: "open", dueWithinDays: 14, tag: "", query: "" });
  const [todoResults, setTodoResults] = useState([]);
  const [selectedTodoId, setSelectedTodoId] = useState("");
  const [todoEditor, setTodoEditor] = useState(null);
  const [todoNewStep, setTodoNewStep] = useState("");
  const [todoListForm, setTodoListForm] = useState({ name: "", color: "", icon: "" });
  const [todoLoading, setTodoLoading] = useState(false);
  const [calendarForm, setCalendarForm] = useState({ title: "", start: "", end: "", timezone: "UTC", attendees: "", location: "", description: "" });
  const [calendarResult, setCalendarResult] = useState(null);
  const [emailDraftForm, setEmailDraftForm] = useState({ from: "", to: "", subject: "", body: "", tone: "friendly", context: "", signOffName: "" });
  const [emailDraftResult, setEmailDraftResult] = useState(null);
  const [emailSendForm, setEmailSendForm] = useState({ draftId: "", sendTo: "", cc: "", bcc: "" });
  const [emailSendResult, setEmailSendResult] = useState(null);
  const [emailProvider, setEmailProvider] = useState("all");
  const [emailLookbackDays, setEmailLookbackDays] = useState(14);
  const [emailInbox, setEmailInbox] = useState([]);
  const [emailInboxLoading, setEmailInboxLoading] = useState(false);
  const [emailSelected, setEmailSelected] = useState(null);
  const [emailContextResult, setEmailContextResult] = useState(null);
  const [emailContextLoading, setEmailContextLoading] = useState(false);
  const [emailSyncResult, setEmailSyncResult] = useState(null);
  const [emailSyncing, setEmailSyncing] = useState(false);
  const [emailRulesResult, setEmailRulesResult] = useState(null);
  const [emailRulesRunning, setEmailRulesRunning] = useState(false);
  const [emailTodoForm, setEmailTodoForm] = useState({ title: "", due: "", reminderAt: "", priority: "medium", tags: "", listId: "", notes: "" });
  const [emailFollowUpForm, setEmailFollowUpForm] = useState({
    followUpAt: "",
    reminderAt: "",
    priority: "medium",
    tags: "",
    listId: "",
    notes: "",
    createHold: false,
    holdTitle: "",
    holdStart: "",
    holdEnd: "",
    holdTimezone: "UTC",
    holdAttendees: "",
    holdLocation: "",
    holdDescription: ""
  });
  const [emailActionResult, setEmailActionResult] = useState(null);
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
  const [microsoftStatus, setMicrosoftStatus] = useState(null);
  const [vaultScope, setVaultScope] = useState("vault");
  const [vaultQuery, setVaultQuery] = useState("");
  const [vaultResult, setVaultResult] = useState(null);
  const [vaultError, setVaultError] = useState("");
  const [vaultLoading, setVaultLoading] = useState(false);

  function toTagText(tags = []) {
    return Array.isArray(tags) ? tags.join(", ") : "";
  }

  function mapTodoToEditor(todo) {
    if (!todo) return null;
    return {
      ...todo,
      tagsText: toTagText(todo.tags || []),
      steps: Array.isArray(todo.steps) ? todo.steps : []
    };
  }

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

  async function loadTodoLists() {
    const resp = await runTool("todos.listLists", {});
    const lists = resp?.data || [];
    setTodoLists(lists);
    if (!lists.length) return;
    if (!activeTodoListId || !lists.find(list => list.id === activeTodoListId)) {
      setActiveTodoListId(lists[0].id);
    }
  }

  async function loadTodos(listOverride = "") {
    const listId = listOverride || activeTodoListId || "";
    if (!listId) return;
    const dueWindow = todoFilters.dueWithinDays === "" ? null : Number(todoFilters.dueWithinDays);
    const resp = await runTool("todos.list", {
      status: todoFilters.status,
      dueWithinDays: dueWindow,
      tag: todoFilters.tag || null,
      listId,
      query: todoFilters.query || "",
      limit: 200
    });
    const rows = resp?.data || [];
    setTodoResults(rows);
    if (selectedTodoId) {
      const match = rows.find(row => row.id === selectedTodoId);
      setTodoEditor(match ? mapTodoToEditor(match) : null);
    }
  }

  async function handleCreateTodoList() {
    const name = todoListForm.name.trim();
    if (!name) return;
    const resp = await runTool("todos.createList", {
      name,
      color: todoListForm.color || "",
      icon: todoListForm.icon || ""
    });
    if (resp?.data?.id) {
      setTodoListForm({ name: "", color: "", icon: "" });
      await loadTodoLists();
      setActiveTodoListId(resp.data.id);
    }
  }

  async function handleCreateTodo() {
    const title = todoDraft.title.trim();
    if (!title) {
      setError("title_required");
      return;
    }
    const resp = await runTool("todos.create", {
      title,
      details: todoDraft.details || "",
      due: todoDraft.due || null,
      priority: todoDraft.priority || "medium",
      tags: parseTagList(todoDraft.tags),
      listId: activeTodoListId || null
    });
    if (resp?.data) {
      setTodoDraft({ title: "", details: "", due: "", priority: "medium", tags: "" });
      setSelectedTodoId(resp.data.id);
      setTodoEditor(mapTodoToEditor(resp.data));
      await loadTodos(activeTodoListId);
    }
  }

  async function handleSaveTodo() {
    if (!todoEditor?.id) return;
    const resp = await runTool("todos.update", {
      id: todoEditor.id,
      title: todoEditor.title,
      details: todoEditor.details,
      notes: todoEditor.notes,
      due: todoEditor.due || null,
      reminderAt: todoEditor.reminderAt || null,
      repeatRule: todoEditor.repeatRule || "",
      priority: todoEditor.priority || "medium",
      status: todoEditor.status || "open",
      tags: parseTagList(todoEditor.tagsText || ""),
      steps: todoEditor.steps || [],
      pinned: Boolean(todoEditor.pinned),
      listId: todoEditor.listId || activeTodoListId || null
    });
    if (resp?.data) {
      const updated = mapTodoToEditor(resp.data);
      setTodoEditor(updated);
      setSelectedTodoId(updated.id);
      if (updated.listId && updated.listId !== activeTodoListId) {
        setActiveTodoListId(updated.listId);
      } else {
        await loadTodos(activeTodoListId);
      }
    }
  }

  async function toggleTodoStatus(todo) {
    if (!todo?.id) return;
    const resp = todo.status === "done"
      ? await runTool("todos.update", { id: todo.id, status: "open" })
      : await runTool("todos.complete", { id: todo.id });
    if (resp?.data) {
      setSelectedTodoId(resp.data.id);
      setTodoEditor(mapTodoToEditor(resp.data));
      await loadTodos(activeTodoListId);
    }
  }

  async function askVault() {
    const query = vaultQuery.trim();
    if (!query) {
      setVaultError("question_required");
      return;
    }
    setVaultError("");
    setVaultLoading(true);
    const payload = { question: query, topK: 8 };
    if (vaultScope === "vault") {
      payload.ragModel = "all";
      payload.filters = { meetingIdPrefix: "rag:" };
    } else if (vaultScope === "notes") {
      payload.ragModel = "notes";
    } else if (vaultScope === "todos") {
      payload.ragModel = "todos";
    } else if (vaultScope === "all") {
      payload.ragModel = "all";
    }
    try {
      const resp = await fetch(`${serverUrl}/api/rag/ask`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
      });
      const data = await resp.json();
      if (!resp.ok) throw new Error(data?.error || "rag_query_failed");
      setVaultResult(data);
    } catch (err) {
      setVaultResult(null);
      setVaultError(err?.message || "rag_query_failed");
    } finally {
      setVaultLoading(false);
    }
  }

  async function loadEmailInbox() {
    setEmailInboxLoading(true);
    try {
      const params = new URLSearchParams({
        provider: emailProvider,
        limit: "30",
        lookbackDays: String(emailLookbackDays || 14)
      });
      const resp = await fetch(`${serverUrl}/api/email/inbox?${params.toString()}`);
      const data = await resp.json();
      if (!resp.ok) throw new Error(data?.error || "email_inbox_failed");
      setEmailInbox(data.items || []);
    } catch (err) {
      setEmailInbox([]);
    } finally {
      setEmailInboxLoading(false);
    }
  }

  async function askEmailContext(message) {
    if (!message) return;
    setEmailContextLoading(true);
    try {
      const prompt = `Find any relevant notes or todos related to this email.\nSubject: ${message.subject}\nFrom: ${message.from}\nSnippet: ${message.snippet}`;
      const resp = await fetch(`${serverUrl}/api/rag/ask`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          question: prompt,
          topK: 6,
          ragModel: "all",
          filters: { meetingIdPrefix: "rag:" }
        })
      });
      const data = await resp.json();
      if (!resp.ok) throw new Error(data?.error || "rag_query_failed");
      setEmailContextResult(data);
    } catch {
      setEmailContextResult(null);
    } finally {
      setEmailContextLoading(false);
    }
  }

  async function syncEmailConnector(provider) {
    const targets = provider === "all" ? ["gmail", "outlook"] : [provider];
    if (!targets.length) return;
    setEmailSyncing(true);
    setEmailSyncResult(null);
    const results = {};
    try {
      for (const target of targets) {
        try {
          const resp = await fetch(`${serverUrl}/api/connectors/${target}/sync`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({})
          });
          const data = await resp.json();
          if (!resp.ok) throw new Error(data?.error || "sync_failed");
          results[target] = data;
        } catch (err) {
          results[target] = { ok: false, error: err?.message || "sync_failed" };
        }
      }
      setEmailSyncResult({ ok: true, results });
      await loadEmailInbox();
    } finally {
      setEmailSyncing(false);
    }
  }

  async function runEmailRules() {
    setEmailRulesRunning(true);
    setEmailRulesResult(null);
    try {
      const resp = await fetch(`${serverUrl}/api/email/rules/run`, { method: "POST" });
      const data = await resp.json();
      if (!resp.ok) throw new Error(data?.error || "email_rules_failed");
      setEmailRulesResult(data);
    } catch (err) {
      setEmailRulesResult({ ok: false, error: err?.message || "email_rules_failed" });
    } finally {
      setEmailRulesRunning(false);
    }
  }

  useEffect(() => {
    if (active !== "integrations" && active !== "email") return;
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
        let microsoftData = null;
        try {
          const microsoftResp = await fetch(`${serverUrl}/api/integrations/microsoft/status`);
          microsoftData = await microsoftResp.json();
        } catch {
          microsoftData = null;
        }
        if (!cancelled) {
          setConfigStatus(statusData);
          setIntegrationsStatus(integrationsData.integrations || {});
          setGoogleStatus(googleData);
          setMicrosoftStatus(microsoftData);
        }
      } catch (err) {
        if (!cancelled) {
          setConfigStatus(null);
          setIntegrationsStatus(null);
          setGoogleStatus(null);
          setMicrosoftStatus(null);
        }
      }
    }
    loadStatus();
    return () => {
      cancelled = true;
    };
  }, [active, serverUrl]);

  useEffect(() => {
    if (active !== "email") return;
    let cancelled = false;
    async function load() {
      await loadEmailInbox();
      if (!cancelled) {
        // keep selection if possible
        if (emailSelected) {
          const match = emailInbox.find(item => item.id === emailSelected.id);
          if (match) setEmailSelected(match);
        }
      }
    }
    load();
    return () => {
      cancelled = true;
    };
  }, [active]);

  useEffect(() => {
    if (active !== "email") return;
    loadEmailInbox();
  }, [active, emailProvider, emailLookbackDays]);

  useEffect(() => {
    if (active !== "email") return;
    if (!emailSelected) {
      setEmailContextResult(null);
      return;
    }
    setEmailContextResult(null);
    askEmailContext(emailSelected);
  }, [active, emailSelected?.id]);

  useEffect(() => {
    if (active !== "email") return;
    if (!emailSelected) return;
    const fallbackTitle = emailSelected.subject
      ? `Follow up: ${emailSelected.subject}`
      : "Email follow-up";
    setEmailTodoForm(prev => ({
      ...prev,
      title: prev.title || fallbackTitle
    }));
    setEmailFollowUpForm(prev => ({
      ...prev,
      holdTitle: prev.holdTitle || fallbackTitle
    }));
  }, [active, emailSelected?.id]);

  useEffect(() => {
    if (active !== "todos") return;
    let cancelled = false;
    async function load() {
      setTodoLoading(true);
      await loadTodoLists();
      if (!cancelled) setTodoLoading(false);
    }
    load();
    return () => {
      cancelled = true;
    };
  }, [active]);

  useEffect(() => {
    if (active !== "todos") return;
    if (!activeTodoListId) return;
    let cancelled = false;
    async function load() {
      setTodoLoading(true);
      await loadTodos();
      if (!cancelled) setTodoLoading(false);
    }
    load();
    return () => {
      cancelled = true;
    };
  }, [active, activeTodoListId, todoFilters.status, todoFilters.dueWithinDays, todoFilters.tag, todoFilters.query]);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      <div style={{ fontSize: 14, fontWeight: 600, color: "#111827" }}>Aika Tools v2</div>
      {error && <div style={{ color: "#b91c1c", fontSize: 12 }}>{error}</div>}
      <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
        {["meetings", "notes", "todos", "vault", "calendar", "email", "spreadsheet", "memory", "integrations", "messaging"].map(tab => (
          <button
            key={tab}
            onClick={() => setActive(tab)}
            style={{
              padding: "6px 10px",
              borderRadius: 8,
              border: active === tab ? "1px solid var(--accent)" : "1px solid var(--panel-border)",
              background: active === tab ? "var(--chip-bg)" : "var(--panel-bg)",
              textTransform: "capitalize"
            }}
          >
            {tab}
          </button>
        ))}
      </div>
      {active === "meetings" && (
        <div style={{ border: "1px solid var(--panel-border)", borderRadius: 12, padding: 12, background: "var(--panel-bg)" }}>
          <SectionHeader title="Summarize & Store" helpKey="meetings" />
          <label style={{ fontSize: 12 }}>
            Title
            <input value={meetingTitle} onChange={(e) => setMeetingTitle(e.target.value)} style={{ width: "100%", padding: 8, marginTop: 4, borderRadius: 8, border: "1px solid var(--panel-border-strong)" }} />
          </label>
          <label style={{ fontSize: 12, marginTop: 8 }}>
            Transcript
            <textarea value={meetingTranscript} onChange={(e) => setMeetingTranscript(e.target.value)} rows={6} style={{ width: "100%", padding: 8, marginTop: 4, borderRadius: 8, border: "1px solid var(--panel-border-strong)" }} />
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
            <pre style={{ marginTop: 8, background: "var(--code-bg)", color: "#e5e7eb", padding: 8, borderRadius: 8, fontSize: 11 }}>
{JSON.stringify(meetingResult, null, 2)}
            </pre>
          )}
        </div>
      )}

      {active === "notes" && (
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
          <div style={{ border: "1px solid var(--panel-border)", borderRadius: 12, padding: 12, background: "var(--panel-bg)" }}>
            <SectionHeader title="Create Note" helpKey="notesCreate" />
            <label style={{ fontSize: 12 }}>
              Title
              <input value={notesForm.title} onChange={(e) => setNotesForm({ ...notesForm, title: e.target.value })} style={{ width: "100%", padding: 8, marginTop: 4, borderRadius: 8, border: "1px solid var(--panel-border-strong)" }} />
            </label>
            <label style={{ fontSize: 12, marginTop: 8 }}>
              Body
              <textarea value={notesForm.body} onChange={(e) => setNotesForm({ ...notesForm, body: e.target.value })} rows={5} style={{ width: "100%", padding: 8, marginTop: 4, borderRadius: 8, border: "1px solid var(--panel-border-strong)" }} />
            </label>
            <label style={{ fontSize: 12, marginTop: 8 }}>
              Tags (comma)
              <input value={notesForm.tags} onChange={(e) => setNotesForm({ ...notesForm, tags: e.target.value })} style={{ width: "100%", padding: 8, marginTop: 4, borderRadius: 8, border: "1px solid var(--panel-border-strong)" }} />
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
              <pre style={{ marginTop: 8, background: "var(--code-bg)", color: "#e5e7eb", padding: 8, borderRadius: 8, fontSize: 11 }}>
{JSON.stringify(notesResult, null, 2)}
              </pre>
            )}
          </div>

          <div style={{ border: "1px solid var(--panel-border)", borderRadius: 12, padding: 12, background: "var(--panel-bg)" }}>
            <SectionHeader title="Search Notes" helpKey="notesSearch" />
            <label style={{ fontSize: 12 }}>
              Query
              <input value={notesSearch.query} onChange={(e) => setNotesSearch({ ...notesSearch, query: e.target.value })} style={{ width: "100%", padding: 8, marginTop: 4, borderRadius: 8, border: "1px solid var(--panel-border-strong)" }} />
            </label>
            <label style={{ fontSize: 12, marginTop: 8 }}>
              Tags (comma)
              <input value={notesSearch.tags} onChange={(e) => setNotesSearch({ ...notesSearch, tags: e.target.value })} style={{ width: "100%", padding: 8, marginTop: 4, borderRadius: 8, border: "1px solid var(--panel-border-strong)" }} />
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
                <div key={n.id} style={{ borderBottom: "1px solid var(--panel-border-subtle)", padding: "6px 0" }}>
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
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          <SectionHeader title="Todo Command Center" helpKey="todosHub" />
          <div style={{ display: "grid", gridTemplateColumns: "220px 1fr 1fr", gap: 12 }}>
            <div style={{ border: "1px solid var(--panel-border)", borderRadius: 12, padding: 12, background: "var(--panel-bg)" }}>
              <div style={{ fontSize: 12, fontWeight: 600, marginBottom: 8 }}>Lists</div>
              <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                {todoLists.map(list => (
                  <button
                    key={list.id}
                    onClick={() => {
                      setActiveTodoListId(list.id);
                      setSelectedTodoId("");
                      setTodoEditor(null);
                    }}
                    style={{
                      textAlign: "left",
                      padding: "6px 8px",
                      borderRadius: 8,
                      border: list.id === activeTodoListId ? "1px solid var(--accent)" : "1px solid var(--panel-border)",
                      background: list.id === activeTodoListId ? "var(--chip-bg)" : "var(--panel-bg-soft)",
                      color: "var(--text-primary)",
                      fontWeight: list.id === activeTodoListId ? 600 : 500
                    }}
                  >
                    {list.name || "Untitled"}
                  </button>
                ))}
                {todoLists.length === 0 && (
                  <div style={{ fontSize: 12, color: "var(--text-muted)" }}>No lists yet.</div>
                )}
              </div>
              <div style={{ marginTop: 12, borderTop: "1px solid var(--panel-border-subtle)", paddingTop: 10 }}>
                <div style={{ fontSize: 12, fontWeight: 600, marginBottom: 6 }}>New List</div>
                <input
                  value={todoListForm.name}
                  onChange={(e) => setTodoListForm({ ...todoListForm, name: e.target.value })}
                  placeholder="List name"
                  style={{ width: "100%", padding: 8, marginTop: 4, borderRadius: 8, border: "1px solid var(--panel-border-strong)" }}
                />
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 6, marginTop: 6 }}>
                  <input
                    value={todoListForm.color}
                    onChange={(e) => setTodoListForm({ ...todoListForm, color: e.target.value })}
                    placeholder="Color"
                    style={{ width: "100%", padding: 8, borderRadius: 8, border: "1px solid var(--panel-border-strong)" }}
                  />
                  <input
                    value={todoListForm.icon}
                    onChange={(e) => setTodoListForm({ ...todoListForm, icon: e.target.value })}
                    placeholder="Icon"
                    style={{ width: "100%", padding: 8, borderRadius: 8, border: "1px solid var(--panel-border-strong)" }}
                  />
                </div>
                <button
                  onClick={handleCreateTodoList}
                  style={{ marginTop: 8, padding: "6px 10px", borderRadius: 8 }}
                >
                  Add List
                </button>
              </div>
            </div>

            <div style={{ border: "1px solid var(--panel-border)", borderRadius: 12, padding: 12, background: "var(--panel-bg)" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
                <div style={{ fontSize: 12, fontWeight: 600 }}>Tasks</div>
                {todoLoading && <div style={{ fontSize: 11, color: "var(--text-muted)" }}>Loading...</div>}
              </div>
              <label style={{ fontSize: 12 }}>
                Title
                <input value={todoDraft.title} onChange={(e) => setTodoDraft({ ...todoDraft, title: e.target.value })} placeholder="New task" style={{ width: "100%", padding: 8, marginTop: 4, borderRadius: 8, border: "1px solid var(--panel-border-strong)" }} />
              </label>
              <label style={{ fontSize: 12, marginTop: 6 }}>
                Details
                <input value={todoDraft.details} onChange={(e) => setTodoDraft({ ...todoDraft, details: e.target.value })} placeholder="Short detail" style={{ width: "100%", padding: 8, marginTop: 4, borderRadius: 8, border: "1px solid var(--panel-border-strong)" }} />
              </label>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 6, marginTop: 6 }}>
                <label style={{ fontSize: 12 }}>
                  Due
                  <input value={todoDraft.due} onChange={(e) => setTodoDraft({ ...todoDraft, due: e.target.value })} placeholder="2026-02-19" style={{ width: "100%", padding: 8, marginTop: 4, borderRadius: 8, border: "1px solid var(--panel-border-strong)" }} />
                </label>
                <label style={{ fontSize: 12 }}>
                  Priority
                  <select value={todoDraft.priority} onChange={(e) => setTodoDraft({ ...todoDraft, priority: e.target.value })} style={{ width: "100%", padding: 8, marginTop: 4, borderRadius: 8, border: "1px solid var(--panel-border-strong)" }}>
                    <option value="low">low</option>
                    <option value="medium">medium</option>
                    <option value="high">high</option>
                    <option value="urgent">urgent</option>
                  </select>
                </label>
              </div>
              <label style={{ fontSize: 12, marginTop: 6 }}>
                Tags (comma)
                <input value={todoDraft.tags} onChange={(e) => setTodoDraft({ ...todoDraft, tags: e.target.value })} placeholder="client, finance" style={{ width: "100%", padding: 8, marginTop: 4, borderRadius: 8, border: "1px solid var(--panel-border-strong)" }} />
              </label>
              <button
                onClick={handleCreateTodo}
                style={{ marginTop: 8, padding: "6px 10px", borderRadius: 8 }}
              >
                Add Todo
              </button>

              <div style={{ marginTop: 10, borderTop: "1px solid var(--panel-border-subtle)", paddingTop: 10 }}>
                <div style={{ fontSize: 12, fontWeight: 600, marginBottom: 6 }}>Filters</div>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 6 }}>
                  <label style={{ fontSize: 12 }}>
                    Status
                    <select value={todoFilters.status} onChange={(e) => setTodoFilters({ ...todoFilters, status: e.target.value })} style={{ width: "100%", padding: 8, marginTop: 4, borderRadius: 8, border: "1px solid var(--panel-border-strong)" }}>
                      <option value="open">open</option>
                      <option value="done">done</option>
                      <option value="all">all</option>
                    </select>
                  </label>
                  <label style={{ fontSize: 12 }}>
                    Due within days
                    <input value={todoFilters.dueWithinDays} onChange={(e) => setTodoFilters({ ...todoFilters, dueWithinDays: e.target.value })} style={{ width: "100%", padding: 8, marginTop: 4, borderRadius: 8, border: "1px solid var(--panel-border-strong)" }} />
                  </label>
                  <label style={{ fontSize: 12 }}>
                    Tag
                    <input value={todoFilters.tag} onChange={(e) => setTodoFilters({ ...todoFilters, tag: e.target.value })} style={{ width: "100%", padding: 8, marginTop: 4, borderRadius: 8, border: "1px solid var(--panel-border-strong)" }} />
                  </label>
                  <label style={{ fontSize: 12 }}>
                    Search
                    <input value={todoFilters.query} onChange={(e) => setTodoFilters({ ...todoFilters, query: e.target.value })} placeholder="keyword" style={{ width: "100%", padding: 8, marginTop: 4, borderRadius: 8, border: "1px solid var(--panel-border-strong)" }} />
                  </label>
                </div>
              </div>

              <div style={{ marginTop: 10, display: "flex", flexDirection: "column", gap: 6, maxHeight: 260, overflowY: "auto" }}>
                {todoResults.map(todo => (
                  <div
                    key={todo.id}
                    onClick={() => {
                      setSelectedTodoId(todo.id);
                      setTodoEditor(mapTodoToEditor(todo));
                    }}
                    style={{
                      display: "flex",
                      gap: 8,
                      alignItems: "flex-start",
                      padding: 8,
                      borderRadius: 10,
                      border: "1px solid var(--panel-border-subtle)",
                      background: todo.id === selectedTodoId ? "var(--panel-bg-soft)" : "transparent",
                      cursor: "pointer"
                    }}
                  >
                    <input
                      type="checkbox"
                      checked={todo.status === "done"}
                      onChange={(e) => {
                        e.stopPropagation();
                        toggleTodoStatus(todo);
                      }}
                      style={{ marginTop: 2 }}
                    />
                    <div style={{ flex: 1 }}>
                      <div style={{ fontWeight: 600, textDecoration: todo.status === "done" ? "line-through" : "none" }}>{todo.title}</div>
                      <div style={{ fontSize: 11, color: "var(--text-muted)" }}>
                        {todo.due ? `Due ${todo.due}` : "No due date"}
                        {todo.priority ? ` | ${todo.priority}` : ""}
                        {todo.tags?.length ? ` | ${todo.tags.join(", ")}` : ""}
                      </div>
                    </div>
                  </div>
                ))}
                {todoResults.length === 0 && (
                  <div style={{ fontSize: 12, color: "var(--text-muted)" }}>No tasks found.</div>
                )}
              </div>
            </div>

            <div style={{ border: "1px solid var(--panel-border)", borderRadius: 12, padding: 12, background: "var(--panel-bg)" }}>
              <div style={{ fontSize: 12, fontWeight: 600, marginBottom: 8 }}>Details</div>
              {!todoEditor && (
                <div style={{ fontSize: 12, color: "var(--text-muted)" }}>Select a task to view details.</div>
              )}
              {todoEditor && (
                <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                  <label style={{ fontSize: 12 }}>
                    Title
                    <input value={todoEditor.title} onChange={(e) => setTodoEditor({ ...todoEditor, title: e.target.value })} style={{ width: "100%", padding: 8, marginTop: 4, borderRadius: 8, border: "1px solid var(--panel-border-strong)" }} />
                  </label>
                  <label style={{ fontSize: 12 }}>
                    Details
                    <input value={todoEditor.details} onChange={(e) => setTodoEditor({ ...todoEditor, details: e.target.value })} style={{ width: "100%", padding: 8, marginTop: 4, borderRadius: 8, border: "1px solid var(--panel-border-strong)" }} />
                  </label>
                  <label style={{ fontSize: 12 }}>
                    Notes
                    <textarea value={todoEditor.notes} onChange={(e) => setTodoEditor({ ...todoEditor, notes: e.target.value })} rows={3} style={{ width: "100%", padding: 8, marginTop: 4, borderRadius: 8, border: "1px solid var(--panel-border-strong)" }} />
                  </label>
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 6 }}>
                    <label style={{ fontSize: 12 }}>
                      Due
                      <input value={todoEditor.due || ""} onChange={(e) => setTodoEditor({ ...todoEditor, due: e.target.value })} placeholder="2026-02-19" style={{ width: "100%", padding: 8, marginTop: 4, borderRadius: 8, border: "1px solid var(--panel-border-strong)" }} />
                    </label>
                    <label style={{ fontSize: 12 }}>
                      Reminder
                      <input value={todoEditor.reminderAt || ""} onChange={(e) => setTodoEditor({ ...todoEditor, reminderAt: e.target.value })} placeholder="2026-02-19T09:00" style={{ width: "100%", padding: 8, marginTop: 4, borderRadius: 8, border: "1px solid var(--panel-border-strong)" }} />
                    </label>
                  </div>
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 6 }}>
                    <label style={{ fontSize: 12 }}>
                      Priority
                      <select value={todoEditor.priority} onChange={(e) => setTodoEditor({ ...todoEditor, priority: e.target.value })} style={{ width: "100%", padding: 8, marginTop: 4, borderRadius: 8, border: "1px solid var(--panel-border-strong)" }}>
                        <option value="low">low</option>
                        <option value="medium">medium</option>
                        <option value="high">high</option>
                        <option value="urgent">urgent</option>
                      </select>
                    </label>
                    <label style={{ fontSize: 12 }}>
                      Status
                      <select value={todoEditor.status} onChange={(e) => setTodoEditor({ ...todoEditor, status: e.target.value })} style={{ width: "100%", padding: 8, marginTop: 4, borderRadius: 8, border: "1px solid var(--panel-border-strong)" }}>
                        <option value="open">open</option>
                        <option value="done">done</option>
                      </select>
                    </label>
                  </div>
                  <label style={{ fontSize: 12 }}>
                    Repeat Rule
                    <input value={todoEditor.repeatRule || ""} onChange={(e) => setTodoEditor({ ...todoEditor, repeatRule: e.target.value })} placeholder="weekly" style={{ width: "100%", padding: 8, marginTop: 4, borderRadius: 8, border: "1px solid var(--panel-border-strong)" }} />
                  </label>
                  <label style={{ fontSize: 12 }}>
                    Tags (comma)
                    <input value={todoEditor.tagsText || ""} onChange={(e) => setTodoEditor({ ...todoEditor, tagsText: e.target.value })} style={{ width: "100%", padding: 8, marginTop: 4, borderRadius: 8, border: "1px solid var(--panel-border-strong)" }} />
                  </label>
                  <label style={{ fontSize: 12 }}>
                    List
                    <select value={todoEditor.listId || activeTodoListId} onChange={(e) => setTodoEditor({ ...todoEditor, listId: e.target.value })} style={{ width: "100%", padding: 8, marginTop: 4, borderRadius: 8, border: "1px solid var(--panel-border-strong)" }}>
                      {todoLists.map(list => (
                        <option key={list.id} value={list.id}>{list.name}</option>
                      ))}
                    </select>
                  </label>
                  <label style={{ fontSize: 12, display: "flex", alignItems: "center", gap: 6 }}>
                    <input type="checkbox" checked={Boolean(todoEditor.pinned)} onChange={(e) => setTodoEditor({ ...todoEditor, pinned: e.target.checked })} />
                    Pin to top
                  </label>

                  <div style={{ borderTop: "1px solid var(--panel-border-subtle)", paddingTop: 8 }}>
                    <div style={{ fontSize: 12, fontWeight: 600, marginBottom: 6 }}>Steps</div>
                    {todoEditor.steps.map((step, idx) => (
                      <div key={step.id || idx} style={{ display: "flex", gap: 6, alignItems: "center", marginBottom: 6 }}>
                        <input
                          type="checkbox"
                          checked={Boolean(step.done)}
                          onChange={() => {
                            const next = [...todoEditor.steps];
                            next[idx] = { ...next[idx], done: !next[idx].done };
                            setTodoEditor({ ...todoEditor, steps: next });
                          }}
                        />
                        <input
                          value={step.title || ""}
                          onChange={(e) => {
                            const next = [...todoEditor.steps];
                            next[idx] = { ...next[idx], title: e.target.value };
                            setTodoEditor({ ...todoEditor, steps: next });
                          }}
                          style={{ flex: 1, padding: 6, borderRadius: 8, border: "1px solid var(--panel-border-strong)" }}
                        />
                        <button
                          onClick={() => {
                            const next = todoEditor.steps.filter((_, stepIdx) => stepIdx !== idx);
                            setTodoEditor({ ...todoEditor, steps: next });
                          }}
                          style={{ padding: "4px 8px", borderRadius: 8 }}
                        >
                          Remove
                        </button>
                      </div>
                    ))}
                    <div style={{ display: "flex", gap: 6 }}>
                      <input
                        value={todoNewStep}
                        onChange={(e) => setTodoNewStep(e.target.value)}
                        placeholder="New step"
                        style={{ flex: 1, padding: 6, borderRadius: 8, border: "1px solid var(--panel-border-strong)" }}
                      />
                      <button
                        onClick={() => {
                          const title = todoNewStep.trim();
                          if (!title) return;
                          const next = [...todoEditor.steps, { title, done: false }];
                          setTodoEditor({ ...todoEditor, steps: next });
                          setTodoNewStep("");
                        }}
                        style={{ padding: "6px 10px", borderRadius: 8 }}
                      >
                        Add
                      </button>
                    </div>
                  </div>

                  <div style={{ display: "flex", gap: 8, marginTop: 6 }}>
                    <button onClick={handleSaveTodo} style={{ padding: "6px 10px", borderRadius: 8 }}>
                      Save
                    </button>
                    <button onClick={() => toggleTodoStatus(todoEditor)} style={{ padding: "6px 10px", borderRadius: 8 }}>
                      {todoEditor.status === "done" ? "Reopen" : "Mark Complete"}
                    </button>
                  </div>
                  <div style={{ fontSize: 11, color: "var(--text-muted)" }}>
                    Updated {todoEditor.updatedAt || "just now"}
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {active === "vault" && (
        <div style={{ border: "1px solid var(--panel-border)", borderRadius: 12, padding: 12, background: "var(--panel-bg)", display: "flex", flexDirection: "column", gap: 12 }}>
          <SectionHeader title="Knowledge Vault" helpKey="vault" />
          <div style={{ display: "grid", gridTemplateColumns: "1fr 220px", gap: 12 }}>
            <div>
              <label style={{ fontSize: 12 }}>
                Question
                <input value={vaultQuery} onChange={(e) => setVaultQuery(e.target.value)} placeholder="What have I said about the onboarding checklist?" style={{ width: "100%", padding: 8, marginTop: 4, borderRadius: 8, border: "1px solid var(--panel-border-strong)" }} />
              </label>
              <button onClick={askVault} disabled={vaultLoading} style={{ marginTop: 8, padding: "6px 10px", borderRadius: 8 }}>
                {vaultLoading ? "Searching..." : "Ask"}
              </button>
              {vaultError && <div style={{ marginTop: 6, fontSize: 12, color: "#b91c1c" }}>{vaultError}</div>}
            </div>
            <div>
              <label style={{ fontSize: 12 }}>
                Scope
                <select value={vaultScope} onChange={(e) => setVaultScope(e.target.value)} style={{ width: "100%", padding: 8, marginTop: 4, borderRadius: 8, border: "1px solid var(--panel-border-strong)" }}>
                  <option value="vault">Notes + Todos</option>
                  <option value="notes">Notes only</option>
                  <option value="todos">Todos only</option>
                  <option value="all">All sources</option>
                </select>
              </label>
              <div style={{ fontSize: 11, color: "var(--text-muted)", marginTop: 6 }}>
                Vault scope stays inside your saved knowledge.
              </div>
            </div>
          </div>

          {vaultResult && (
            <div style={{ borderTop: "1px solid var(--panel-border-subtle)", paddingTop: 10 }}>
              <div style={{ fontSize: 12, fontWeight: 600, marginBottom: 6 }}>Answer</div>
              <div style={{ fontSize: 13, color: "var(--text-primary)", lineHeight: 1.5 }}>{vaultResult.answer}</div>
              <div style={{ marginTop: 10 }}>
                <div style={{ fontSize: 12, fontWeight: 600, marginBottom: 6 }}>Citations</div>
                <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                  {(vaultResult.citations || []).map((c, idx) => (
                    <div key={`${c.chunk_id}-${idx}`} style={{ border: "1px solid var(--panel-border-subtle)", borderRadius: 10, padding: 8, background: "var(--panel-bg-soft)" }}>
                      <div style={{ fontSize: 11, fontWeight: 600 }}>{c.meeting_title || "Source"}</div>
                      {c.occurred_at && <div style={{ fontSize: 10, color: "var(--text-muted)" }}>{c.occurred_at}</div>}
                      <div style={{ fontSize: 11, marginTop: 4, color: "var(--text-primary)" }}>{String(c.snippet || "").slice(0, 280)}</div>
                    </div>
                  ))}
                  {(!vaultResult.citations || vaultResult.citations.length === 0) && (
                    <div style={{ fontSize: 12, color: "var(--text-muted)" }}>No citations returned.</div>
                  )}
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {active === "calendar" && (
        <div style={{ border: "1px solid var(--panel-border)", borderRadius: 12, padding: 12, background: "var(--panel-bg)" }}>
          <SectionHeader title="Propose Hold" helpKey="calendar" />
          <label style={{ fontSize: 12 }}>
            Title
            <input value={calendarForm.title} onChange={(e) => setCalendarForm({ ...calendarForm, title: e.target.value })} style={{ width: "100%", padding: 8, marginTop: 4, borderRadius: 8, border: "1px solid var(--panel-border-strong)" }} />
          </label>
          <label style={{ fontSize: 12, marginTop: 8 }}>
            Start (ISO)
            <input value={calendarForm.start} onChange={(e) => setCalendarForm({ ...calendarForm, start: e.target.value })} style={{ width: "100%", padding: 8, marginTop: 4, borderRadius: 8, border: "1px solid var(--panel-border-strong)" }} />
          </label>
          <label style={{ fontSize: 12, marginTop: 8 }}>
            End (ISO)
            <input value={calendarForm.end} onChange={(e) => setCalendarForm({ ...calendarForm, end: e.target.value })} style={{ width: "100%", padding: 8, marginTop: 4, borderRadius: 8, border: "1px solid var(--panel-border-strong)" }} />
          </label>
          <label style={{ fontSize: 12, marginTop: 8 }}>
            Timezone
            <input value={calendarForm.timezone} onChange={(e) => setCalendarForm({ ...calendarForm, timezone: e.target.value })} style={{ width: "100%", padding: 8, marginTop: 4, borderRadius: 8, border: "1px solid var(--panel-border-strong)" }} />
          </label>
          <label style={{ fontSize: 12, marginTop: 8 }}>
            Attendees (comma emails)
            <input value={calendarForm.attendees} onChange={(e) => setCalendarForm({ ...calendarForm, attendees: e.target.value })} style={{ width: "100%", padding: 8, marginTop: 4, borderRadius: 8, border: "1px solid var(--panel-border-strong)" }} />
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
            <pre style={{ marginTop: 8, background: "var(--code-bg)", color: "#e5e7eb", padding: 8, borderRadius: 8, fontSize: 11 }}>
{JSON.stringify(calendarResult, null, 2)}
            </pre>
          )}
        </div>
      )}

      {active === "email" && (
        <div style={{ display: "grid", gridTemplateColumns: "1.1fr 1fr", gap: 12 }}>
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            <div style={{ border: "1px solid var(--panel-border)", borderRadius: 12, padding: 12, background: "var(--panel-bg)" }}>
              <SectionHeader title="Inbox Preview" helpKey="emailInbox" />
              <div style={{ fontSize: 12, color: "var(--text-muted)", marginBottom: 8 }}>
                Gmail: {googleStatus?.scopes?.some(scope => String(scope).includes("gmail")) ? "connected" : "not connected"} | Microsoft: {microsoftStatus?.connected ? "connected" : "not connected"}
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 6 }}>
                <label style={{ fontSize: 12 }}>
                  Provider
                  <select value={emailProvider} onChange={(e) => setEmailProvider(e.target.value)} style={{ width: "100%", padding: 8, marginTop: 4, borderRadius: 8, border: "1px solid var(--panel-border-strong)" }}>
                    <option value="all">all</option>
                    <option value="gmail">gmail</option>
                    <option value="outlook">outlook</option>
                  </select>
                </label>
                <label style={{ fontSize: 12 }}>
                  Lookback days
                  <input value={emailLookbackDays} onChange={(e) => setEmailLookbackDays(Number(e.target.value || 0))} style={{ width: "100%", padding: 8, marginTop: 4, borderRadius: 8, border: "1px solid var(--panel-border-strong)" }} />
                </label>
              </div>
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 8 }}>
                <button
                  onClick={() => window.open(`${serverUrl}/api/integrations/google/connect?preset=gmail_readonly&ui_base=${encodeURIComponent(window.location.origin)}`, "_blank")}
                  style={{ padding: "6px 10px", borderRadius: 8 }}
                >
                  Connect Gmail
                </button>
                <button
                  onClick={() => window.open(`${serverUrl}/api/integrations/microsoft/connect?preset=mail_read&ui_base=${encodeURIComponent(window.location.origin)}`, "_blank")}
                  style={{ padding: "6px 10px", borderRadius: 8 }}
                >
                  Connect Microsoft
                </button>
                <button
                  onClick={loadEmailInbox}
                  style={{ padding: "6px 10px", borderRadius: 8 }}
                >
                  Refresh Inbox
                </button>
                <button
                  onClick={() => syncEmailConnector(emailProvider)}
                  style={{ padding: "6px 10px", borderRadius: 8 }}
                  disabled={emailSyncing}
                >
                  {emailSyncing
                    ? "Syncing..."
                    : emailProvider === "all"
                      ? "Sync Gmail + Outlook"
                      : `Sync ${emailProvider}`}
                </button>
                <button
                  onClick={runEmailRules}
                  style={{ padding: "6px 10px", borderRadius: 8 }}
                  disabled={emailRulesRunning}
                >
                  {emailRulesRunning ? "Running Rules..." : "Run Auto Follow-ups"}
                </button>
              </div>
              {emailSyncResult && (
                <pre style={{ marginTop: 8, background: "var(--code-bg)", color: "#e5e7eb", padding: 8, borderRadius: 8, fontSize: 11 }}>
{JSON.stringify(emailSyncResult, null, 2)}
                </pre>
              )}
              {emailRulesResult && (
                <pre style={{ marginTop: 8, background: "var(--code-bg)", color: "#e5e7eb", padding: 8, borderRadius: 8, fontSize: 11 }}>
{JSON.stringify(emailRulesResult, null, 2)}
                </pre>
              )}
              <div style={{ marginTop: 10, display: "flex", flexDirection: "column", gap: 6, maxHeight: 320, overflowY: "auto" }}>
                {emailInboxLoading && <div style={{ fontSize: 12, color: "var(--text-muted)" }}>Loading inbox...</div>}
                {!emailInboxLoading && emailInbox.length === 0 && (
                  <div style={{ fontSize: 12, color: "var(--text-muted)" }}>No emails found for the selected window.</div>
                )}
                {emailInbox.map(item => (
                  <div
                    key={`${item.provider}-${item.id}`}
                    onClick={() => setEmailSelected(item)}
                    style={{
                      border: "1px solid var(--panel-border-subtle)",
                      borderRadius: 10,
                      padding: 8,
                      background: emailSelected?.id === item.id && emailSelected?.provider === item.provider ? "var(--panel-bg-soft)" : "transparent",
                      cursor: "pointer"
                    }}
                  >
                    <div style={{ display: "flex", justifyContent: "space-between", gap: 8, marginBottom: 4 }}>
                      <div style={{ fontWeight: 600, fontSize: 12 }}>{item.subject || "(no subject)"}</div>
                      <div style={{ fontSize: 10, textTransform: "uppercase", color: "var(--text-muted)" }}>{item.provider}</div>
                    </div>
                    <div style={{ fontSize: 11, color: "var(--text-muted)" }}>{item.from}</div>
                    <div style={{ fontSize: 11, color: "var(--text-muted)" }}>{item.receivedAt ? new Date(item.receivedAt).toLocaleString() : ""}</div>
                    <div style={{ fontSize: 12, marginTop: 4 }}>{item.snippet}</div>
                  </div>
                ))}
              </div>
            </div>

            <div style={{ border: "1px solid var(--panel-border)", borderRadius: 12, padding: 12, background: "var(--panel-bg)" }}>
              <SectionHeader title="Message Context" helpKey="emailInbox" />
              {emailSelected ? (
                <>
                  <div style={{ fontSize: 12, fontWeight: 600 }}>{emailSelected.subject || "(no subject)"}</div>
                  <div style={{ fontSize: 11, color: "var(--text-muted)" }}>From: {emailSelected.from}</div>
                  <div style={{ fontSize: 11, color: "var(--text-muted)" }}>To: {emailSelected.to}</div>
                  <div style={{ fontSize: 11, color: "var(--text-muted)" }}>Received: {emailSelected.receivedAt ? new Date(emailSelected.receivedAt).toLocaleString() : "unknown"}</div>
                  <div style={{ fontSize: 12, marginTop: 6 }}>{emailSelected.snippet}</div>
                  {emailSelected.webLink && (
                    <div style={{ marginTop: 6 }}>
                      <a href={emailSelected.webLink} target="_blank" rel="noreferrer">Open in provider</a>
                    </div>
                  )}
                  <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 8 }}>
                    <button onClick={() => askEmailContext(emailSelected)} style={{ padding: "6px 10px", borderRadius: 8 }}>
                      Find Context
                    </button>
                    <button
                      onClick={() => {
                        const subject = String(emailSelected.subject || "").trim();
                        setEmailDraftForm(prev => ({
                          ...prev,
                          to: emailSelected.from || prev.to,
                          subject: subject ? (subject.toLowerCase().startsWith("re:") ? subject : `Re: ${subject}`) : prev.subject,
                          context: emailSelected.snippet || prev.context
                        }));
                      }}
                      style={{ padding: "6px 10px", borderRadius: 8 }}
                    >
                      Use in Draft
                    </button>
                  </div>
                </>
              ) : (
                <div style={{ fontSize: 12, color: "var(--text-muted)" }}>Select an email to preview details and context.</div>
              )}
              <div style={{ marginTop: 10, borderTop: "1px solid var(--panel-border-subtle)", paddingTop: 10 }}>
                <div style={{ fontSize: 12, fontWeight: 600, marginBottom: 6 }}>RAG Context</div>
                {emailContextLoading && <div style={{ fontSize: 12, color: "var(--text-muted)" }}>Looking for related notes and todos...</div>}
                {!emailContextLoading && !emailContextResult?.answer && (
                  <div style={{ fontSize: 12, color: "var(--text-muted)" }}>No context yet. Select an email and click Find Context.</div>
                )}
                {emailContextResult?.answer && (
                  <div style={{ fontSize: 12, whiteSpace: "pre-wrap" }}>{emailContextResult.answer}</div>
                )}
                {emailContextResult?.citations?.length > 0 && (
                  <div style={{ marginTop: 6, fontSize: 11, color: "var(--text-muted)" }}>
                    Sources: {emailContextResult.citations.map(c => c?.title || c?.id).filter(Boolean).join(", ")}
                  </div>
                )}
                {emailContextResult?.answer && (
                  <button
                    onClick={() => setEmailDraftForm(prev => ({ ...prev, context: emailContextResult.answer }))}
                    style={{ marginTop: 8, padding: "6px 10px", borderRadius: 8 }}
                  >
                    Use Context in Draft
                  </button>
                )}
              </div>
            </div>

            <div style={{ border: "1px solid var(--panel-border)", borderRadius: 12, padding: 12, background: "var(--panel-bg)" }}>
              <SectionHeader title="Action Layer" helpKey="emailActions" />
              {!emailSelected && (
                <div style={{ fontSize: 12, color: "var(--text-muted)" }}>
                  Select an email to create a todo, schedule a follow-up, or draft a reply with context.
                </div>
              )}
              {emailSelected && (
                <>
                  <div style={{ fontSize: 12, fontWeight: 600, marginBottom: 6 }}>Convert to Todo</div>
                  <label style={{ fontSize: 12 }}>
                    Title
                    <input value={emailTodoForm.title} onChange={(e) => setEmailTodoForm({ ...emailTodoForm, title: e.target.value })} style={{ width: "100%", padding: 8, marginTop: 4, borderRadius: 8, border: "1px solid var(--panel-border-strong)" }} />
                  </label>
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 6, marginTop: 6 }}>
                    <label style={{ fontSize: 12 }}>
                      Due (ISO)
                      <input value={emailTodoForm.due} onChange={(e) => setEmailTodoForm({ ...emailTodoForm, due: e.target.value })} style={{ width: "100%", padding: 8, marginTop: 4, borderRadius: 8, border: "1px solid var(--panel-border-strong)" }} />
                    </label>
                    <label style={{ fontSize: 12 }}>
                      Reminder (ISO)
                      <input value={emailTodoForm.reminderAt} onChange={(e) => setEmailTodoForm({ ...emailTodoForm, reminderAt: e.target.value })} style={{ width: "100%", padding: 8, marginTop: 4, borderRadius: 8, border: "1px solid var(--panel-border-strong)" }} />
                    </label>
                  </div>
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 6, marginTop: 6 }}>
                    <label style={{ fontSize: 12 }}>
                      Priority
                      <select value={emailTodoForm.priority} onChange={(e) => setEmailTodoForm({ ...emailTodoForm, priority: e.target.value })} style={{ width: "100%", padding: 8, marginTop: 4, borderRadius: 8, border: "1px solid var(--panel-border-strong)" }}>
                        <option value="low">low</option>
                        <option value="medium">medium</option>
                        <option value="high">high</option>
                        <option value="urgent">urgent</option>
                      </select>
                    </label>
                    <label style={{ fontSize: 12 }}>
                      List ID (optional)
                      <input value={emailTodoForm.listId} onChange={(e) => setEmailTodoForm({ ...emailTodoForm, listId: e.target.value })} style={{ width: "100%", padding: 8, marginTop: 4, borderRadius: 8, border: "1px solid var(--panel-border-strong)" }} />
                    </label>
                  </div>
                  <label style={{ fontSize: 12, marginTop: 6 }}>
                    Tags (comma)
                    <input value={emailTodoForm.tags} onChange={(e) => setEmailTodoForm({ ...emailTodoForm, tags: e.target.value })} style={{ width: "100%", padding: 8, marginTop: 4, borderRadius: 8, border: "1px solid var(--panel-border-strong)" }} />
                  </label>
                  <label style={{ fontSize: 12, marginTop: 6 }}>
                    Notes
                    <input value={emailTodoForm.notes} onChange={(e) => setEmailTodoForm({ ...emailTodoForm, notes: e.target.value })} style={{ width: "100%", padding: 8, marginTop: 4, borderRadius: 8, border: "1px solid var(--panel-border-strong)" }} />
                  </label>
                  <button
                    onClick={async () => {
                      const resp = await runTool("email.convertToTodo", {
                        email: emailSelected,
                        title: emailTodoForm.title,
                        due: emailTodoForm.due || null,
                        reminderAt: emailTodoForm.reminderAt || null,
                        priority: emailTodoForm.priority,
                        tags: parseTagList(emailTodoForm.tags),
                        listId: emailTodoForm.listId || null,
                        notes: emailTodoForm.notes || ""
                      });
                      setEmailActionResult(resp);
                    }}
                    style={{ marginTop: 8, padding: "6px 10px", borderRadius: 8 }}
                  >
                    Create Todo
                  </button>

                  <div style={{ marginTop: 12, borderTop: "1px solid var(--panel-border-subtle)", paddingTop: 10 }}>
                    <div style={{ fontSize: 12, fontWeight: 600, marginBottom: 6 }}>Schedule Follow-up</div>
                    <label style={{ fontSize: 12 }}>
                      Follow-up At (ISO)
                      <input value={emailFollowUpForm.followUpAt} onChange={(e) => setEmailFollowUpForm({ ...emailFollowUpForm, followUpAt: e.target.value })} style={{ width: "100%", padding: 8, marginTop: 4, borderRadius: 8, border: "1px solid var(--panel-border-strong)" }} />
                    </label>
                    <label style={{ fontSize: 12, marginTop: 6 }}>
                      Reminder At (ISO)
                      <input value={emailFollowUpForm.reminderAt} onChange={(e) => setEmailFollowUpForm({ ...emailFollowUpForm, reminderAt: e.target.value })} style={{ width: "100%", padding: 8, marginTop: 4, borderRadius: 8, border: "1px solid var(--panel-border-strong)" }} />
                    </label>
                    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 6, marginTop: 6 }}>
                      <label style={{ fontSize: 12 }}>
                        Priority
                        <select value={emailFollowUpForm.priority} onChange={(e) => setEmailFollowUpForm({ ...emailFollowUpForm, priority: e.target.value })} style={{ width: "100%", padding: 8, marginTop: 4, borderRadius: 8, border: "1px solid var(--panel-border-strong)" }}>
                          <option value="low">low</option>
                          <option value="medium">medium</option>
                          <option value="high">high</option>
                          <option value="urgent">urgent</option>
                        </select>
                      </label>
                      <label style={{ fontSize: 12 }}>
                        List ID (optional)
                        <input value={emailFollowUpForm.listId} onChange={(e) => setEmailFollowUpForm({ ...emailFollowUpForm, listId: e.target.value })} style={{ width: "100%", padding: 8, marginTop: 4, borderRadius: 8, border: "1px solid var(--panel-border-strong)" }} />
                      </label>
                    </div>
                    <label style={{ fontSize: 12, marginTop: 6 }}>
                      Tags (comma)
                      <input value={emailFollowUpForm.tags} onChange={(e) => setEmailFollowUpForm({ ...emailFollowUpForm, tags: e.target.value })} style={{ width: "100%", padding: 8, marginTop: 4, borderRadius: 8, border: "1px solid var(--panel-border-strong)" }} />
                    </label>
                    <label style={{ fontSize: 12, marginTop: 6 }}>
                      Notes
                      <input value={emailFollowUpForm.notes} onChange={(e) => setEmailFollowUpForm({ ...emailFollowUpForm, notes: e.target.value })} style={{ width: "100%", padding: 8, marginTop: 4, borderRadius: 8, border: "1px solid var(--panel-border-strong)" }} />
                    </label>
                    <label style={{ fontSize: 12, marginTop: 8, display: "flex", gap: 6, alignItems: "center" }}>
                      <input type="checkbox" checked={emailFollowUpForm.createHold} onChange={(e) => setEmailFollowUpForm({ ...emailFollowUpForm, createHold: e.target.checked })} />
                      Create calendar hold
                    </label>
                    {emailFollowUpForm.createHold && (
                      <div style={{ marginTop: 6, display: "grid", gridTemplateColumns: "1fr 1fr", gap: 6 }}>
                        <label style={{ fontSize: 12 }}>
                          Hold Title
                          <input value={emailFollowUpForm.holdTitle} onChange={(e) => setEmailFollowUpForm({ ...emailFollowUpForm, holdTitle: e.target.value })} style={{ width: "100%", padding: 8, marginTop: 4, borderRadius: 8, border: "1px solid var(--panel-border-strong)" }} />
                        </label>
                        <label style={{ fontSize: 12 }}>
                          Timezone
                          <input value={emailFollowUpForm.holdTimezone} onChange={(e) => setEmailFollowUpForm({ ...emailFollowUpForm, holdTimezone: e.target.value })} style={{ width: "100%", padding: 8, marginTop: 4, borderRadius: 8, border: "1px solid var(--panel-border-strong)" }} />
                        </label>
                        <label style={{ fontSize: 12 }}>
                          Start (ISO)
                          <input value={emailFollowUpForm.holdStart} onChange={(e) => setEmailFollowUpForm({ ...emailFollowUpForm, holdStart: e.target.value })} style={{ width: "100%", padding: 8, marginTop: 4, borderRadius: 8, border: "1px solid var(--panel-border-strong)" }} />
                        </label>
                        <label style={{ fontSize: 12 }}>
                          End (ISO)
                          <input value={emailFollowUpForm.holdEnd} onChange={(e) => setEmailFollowUpForm({ ...emailFollowUpForm, holdEnd: e.target.value })} style={{ width: "100%", padding: 8, marginTop: 4, borderRadius: 8, border: "1px solid var(--panel-border-strong)" }} />
                        </label>
                        <label style={{ fontSize: 12 }}>
                          Attendees (comma)
                          <input value={emailFollowUpForm.holdAttendees} onChange={(e) => setEmailFollowUpForm({ ...emailFollowUpForm, holdAttendees: e.target.value })} style={{ width: "100%", padding: 8, marginTop: 4, borderRadius: 8, border: "1px solid var(--panel-border-strong)" }} />
                        </label>
                        <label style={{ fontSize: 12 }}>
                          Location
                          <input value={emailFollowUpForm.holdLocation} onChange={(e) => setEmailFollowUpForm({ ...emailFollowUpForm, holdLocation: e.target.value })} style={{ width: "100%", padding: 8, marginTop: 4, borderRadius: 8, border: "1px solid var(--panel-border-strong)" }} />
                        </label>
                        <label style={{ fontSize: 12, gridColumn: "1 / -1" }}>
                          Description
                          <input value={emailFollowUpForm.holdDescription} onChange={(e) => setEmailFollowUpForm({ ...emailFollowUpForm, holdDescription: e.target.value })} style={{ width: "100%", padding: 8, marginTop: 4, borderRadius: 8, border: "1px solid var(--panel-border-strong)" }} />
                        </label>
                      </div>
                    )}
                    <button
                      onClick={async () => {
                        const hold = emailFollowUpForm.createHold ? {
                          title: emailFollowUpForm.holdTitle || "",
                          start: emailFollowUpForm.holdStart || "",
                          end: emailFollowUpForm.holdEnd || "",
                          timezone: emailFollowUpForm.holdTimezone || "UTC",
                          attendees: parseTagList(emailFollowUpForm.holdAttendees),
                          location: emailFollowUpForm.holdLocation || "",
                          description: emailFollowUpForm.holdDescription || ""
                        } : null;
                        const resp = await runTool("email.scheduleFollowUp", {
                          email: emailSelected,
                          followUpAt: emailFollowUpForm.followUpAt,
                          reminderAt: emailFollowUpForm.reminderAt || null,
                          priority: emailFollowUpForm.priority,
                          tags: parseTagList(emailFollowUpForm.tags),
                          listId: emailFollowUpForm.listId || null,
                          notes: emailFollowUpForm.notes || "",
                          hold
                        });
                        setEmailActionResult(resp);
                      }}
                      style={{ marginTop: 8, padding: "6px 10px", borderRadius: 8 }}
                    >
                      Schedule Follow-up
                    </button>
                  </div>
                </>
              )}
              {emailActionResult && (
                <pre style={{ marginTop: 10, background: "var(--code-bg)", color: "#e5e7eb", padding: 8, borderRadius: 8, fontSize: 11 }}>
{JSON.stringify(emailActionResult, null, 2)}
                </pre>
              )}
            </div>
          </div>

          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            <div style={{ border: "1px solid var(--panel-border)", borderRadius: 12, padding: 12, background: "var(--panel-bg)" }}>
              <SectionHeader title="Draft Reply" helpKey="emailDraft" />
              <label style={{ fontSize: 12 }}>
                From
                <input value={emailDraftForm.from} onChange={(e) => setEmailDraftForm({ ...emailDraftForm, from: e.target.value })} style={{ width: "100%", padding: 8, marginTop: 4, borderRadius: 8, border: "1px solid var(--panel-border-strong)" }} />
              </label>
              <label style={{ fontSize: 12, marginTop: 8 }}>
                To (comma)
                <input value={emailDraftForm.to} onChange={(e) => setEmailDraftForm({ ...emailDraftForm, to: e.target.value })} style={{ width: "100%", padding: 8, marginTop: 4, borderRadius: 8, border: "1px solid var(--panel-border-strong)" }} />
              </label>
              <label style={{ fontSize: 12, marginTop: 8 }}>
                Subject
                <input value={emailDraftForm.subject} onChange={(e) => setEmailDraftForm({ ...emailDraftForm, subject: e.target.value })} style={{ width: "100%", padding: 8, marginTop: 4, borderRadius: 8, border: "1px solid var(--panel-border-strong)" }} />
              </label>
              <label style={{ fontSize: 12, marginTop: 8 }}>
                Body
                <textarea value={emailDraftForm.body} onChange={(e) => setEmailDraftForm({ ...emailDraftForm, body: e.target.value })} rows={4} style={{ width: "100%", padding: 8, marginTop: 4, borderRadius: 8, border: "1px solid var(--panel-border-strong)" }} />
              </label>
              <label style={{ fontSize: 12, marginTop: 8 }}>
                Tone
                <select value={emailDraftForm.tone} onChange={(e) => setEmailDraftForm({ ...emailDraftForm, tone: e.target.value })} style={{ width: "100%", padding: 8, marginTop: 4, borderRadius: 8, border: "1px solid var(--panel-border-strong)" }}>
                  <option value="friendly">friendly</option>
                  <option value="direct">direct</option>
                  <option value="executive">executive</option>
                </select>
              </label>
              <label style={{ fontSize: 12, marginTop: 8 }}>
                Context
                <input value={emailDraftForm.context} onChange={(e) => setEmailDraftForm({ ...emailDraftForm, context: e.target.value })} style={{ width: "100%", padding: 8, marginTop: 4, borderRadius: 8, border: "1px solid var(--panel-border-strong)" }} />
              </label>
              <label style={{ fontSize: 12, marginTop: 8 }}>
                Sign off name
                <input value={emailDraftForm.signOffName} onChange={(e) => setEmailDraftForm({ ...emailDraftForm, signOffName: e.target.value })} style={{ width: "100%", padding: 8, marginTop: 4, borderRadius: 8, border: "1px solid var(--panel-border-strong)" }} />
              </label>
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 8 }}>
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
                  style={{ padding: "6px 10px", borderRadius: 8 }}
                >
                  Create Draft
                </button>
                <button
                  onClick={async () => {
                    if (!emailSelected) {
                      setError("select_email_first");
                      return;
                    }
                    const resp = await runTool("email.replyWithContext", {
                      email: emailSelected,
                      tone: emailDraftForm.tone,
                      signOffName: emailDraftForm.signOffName
                    });
                    setEmailDraftResult(resp);
                    const draft = resp?.data?.draft || null;
                    if (draft?.id) {
                      setEmailSendForm({ ...emailSendForm, draftId: draft.id });
                      setEmailDraftForm(prev => ({
                        ...prev,
                        subject: draft.subject || prev.subject,
                        body: draft.body || prev.body,
                        context: resp?.data?.context || prev.context
                      }));
                    }
                  }}
                  style={{ padding: "6px 10px", borderRadius: 8 }}
                >
                  Reply With Context
                </button>
              </div>
              {emailDraftResult && (
                <pre style={{ marginTop: 8, background: "var(--code-bg)", color: "#e5e7eb", padding: 8, borderRadius: 8, fontSize: 11 }}>
{JSON.stringify(emailDraftResult, null, 2)}
                </pre>
              )}
            </div>

            <div style={{ border: "1px solid var(--panel-border)", borderRadius: 12, padding: 12, background: "var(--panel-bg)" }}>
              <SectionHeader title="Send Draft (Approval Required)" helpKey="emailSend" />
              <label style={{ fontSize: 12 }}>
                Draft ID
                <input value={emailSendForm.draftId} onChange={(e) => setEmailSendForm({ ...emailSendForm, draftId: e.target.value })} style={{ width: "100%", padding: 8, marginTop: 4, borderRadius: 8, border: "1px solid var(--panel-border-strong)" }} />
              </label>
              <label style={{ fontSize: 12, marginTop: 8 }}>
                Send To (comma)
                <input value={emailSendForm.sendTo} onChange={(e) => setEmailSendForm({ ...emailSendForm, sendTo: e.target.value })} style={{ width: "100%", padding: 8, marginTop: 4, borderRadius: 8, border: "1px solid var(--panel-border-strong)" }} />
              </label>
              <label style={{ fontSize: 12, marginTop: 8 }}>
                CC (comma)
                <input value={emailSendForm.cc} onChange={(e) => setEmailSendForm({ ...emailSendForm, cc: e.target.value })} style={{ width: "100%", padding: 8, marginTop: 4, borderRadius: 8, border: "1px solid var(--panel-border-strong)" }} />
              </label>
              <label style={{ fontSize: 12, marginTop: 8 }}>
                BCC (comma)
                <input value={emailSendForm.bcc} onChange={(e) => setEmailSendForm({ ...emailSendForm, bcc: e.target.value })} style={{ width: "100%", padding: 8, marginTop: 4, borderRadius: 8, border: "1px solid var(--panel-border-strong)" }} />
              </label>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 8 }}>
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
                style={{ padding: "6px 10px", borderRadius: 8 }}
              >
                Send
              </button>
              <button
                onClick={async () => {
                  if (!emailSelected) {
                    setError("select_email_first");
                    return;
                  }
                  const resp = await runTool("email.sendWithContext", {
                    email: emailSelected,
                    tone: emailDraftForm.tone,
                    signOffName: emailDraftForm.signOffName,
                    sendTo: parseTagList(emailSendForm.sendTo),
                    cc: parseTagList(emailSendForm.cc),
                    bcc: parseTagList(emailSendForm.bcc)
                  });
                  setEmailSendResult(resp);
                }}
                style={{ padding: "6px 10px", borderRadius: 8 }}
              >
                Send With Context
              </button>
            </div>
              {emailSendResult && (
                <pre style={{ marginTop: 8, background: "var(--code-bg)", color: "#e5e7eb", padding: 8, borderRadius: 8, fontSize: 11 }}>
{JSON.stringify(emailSendResult, null, 2)}
                </pre>
              )}
            </div>
          </div>
        </div>
      )}

      {active === "spreadsheet" && (
        <div style={{ border: "1px solid var(--panel-border)", borderRadius: 12, padding: 12, background: "var(--panel-bg)" }}>
          <SectionHeader title="Draft Spreadsheet Patch" helpKey="spreadsheet" />
          <label style={{ fontSize: 12 }}>
            Target Type
            <select value={sheetForm.type} onChange={(e) => setSheetForm({ ...sheetForm, type: e.target.value })} style={{ width: "100%", padding: 8, marginTop: 4, borderRadius: 8, border: "1px solid var(--panel-border-strong)" }}>
              <option value="localFile">localFile</option>
              <option value="googleSheet">googleSheet</option>
            </select>
          </label>
          <label style={{ fontSize: 12, marginTop: 8 }}>
            Path or ID
            <input value={sheetForm.pathOrId} onChange={(e) => setSheetForm({ ...sheetForm, pathOrId: e.target.value })} style={{ width: "100%", padding: 8, marginTop: 4, borderRadius: 8, border: "1px solid var(--panel-border-strong)" }} />
          </label>
          <label style={{ fontSize: 12, marginTop: 8 }}>
            Changes (JSON)
            <textarea value={sheetForm.changes} onChange={(e) => setSheetForm({ ...sheetForm, changes: e.target.value })} rows={5} style={{ width: "100%", padding: 8, marginTop: 4, borderRadius: 8, border: "1px solid var(--panel-border-strong)", fontFamily: "monospace" }} />
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
            <pre style={{ marginTop: 8, background: "var(--code-bg)", color: "#e5e7eb", padding: 8, borderRadius: 8, fontSize: 11 }}>
{JSON.stringify(sheetResult, null, 2)}
            </pre>
          )}
        </div>
      )}

      {active === "memory" && (
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
          <div style={{ border: "1px solid var(--panel-border)", borderRadius: 12, padding: 12, background: "var(--panel-bg)" }}>
            <SectionHeader title="Write Memory" helpKey="memoryWrite" />
            <label style={{ fontSize: 12 }}>
              Tier
              <select value={memoryForm.tier} onChange={(e) => setMemoryForm({ ...memoryForm, tier: Number(e.target.value) })} style={{ width: "100%", padding: 8, marginTop: 4, borderRadius: 8, border: "1px solid var(--panel-border-strong)" }}>
                <option value={1}>Tier 1</option>
                <option value={2}>Tier 2</option>
                <option value={3}>Tier 3</option>
              </select>
            </label>
            <label style={{ fontSize: 12, marginTop: 8 }}>
              Title
              <input value={memoryForm.title} onChange={(e) => setMemoryForm({ ...memoryForm, title: e.target.value })} style={{ width: "100%", padding: 8, marginTop: 4, borderRadius: 8, border: "1px solid var(--panel-border-strong)" }} />
            </label>
            <label style={{ fontSize: 12, marginTop: 8 }}>
              Content
              <textarea value={memoryForm.content} onChange={(e) => setMemoryForm({ ...memoryForm, content: e.target.value })} rows={4} style={{ width: "100%", padding: 8, marginTop: 4, borderRadius: 8, border: "1px solid var(--panel-border-strong)" }} />
            </label>
            <label style={{ fontSize: 12, marginTop: 8 }}>
              Tags (comma)
              <input value={memoryForm.tags} onChange={(e) => setMemoryForm({ ...memoryForm, tags: e.target.value })} style={{ width: "100%", padding: 8, marginTop: 4, borderRadius: 8, border: "1px solid var(--panel-border-strong)" }} />
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
              <pre style={{ marginTop: 8, background: "var(--code-bg)", color: "#e5e7eb", padding: 8, borderRadius: 8, fontSize: 11 }}>
{JSON.stringify(memoryResult, null, 2)}
              </pre>
            )}
          </div>

          <div style={{ border: "1px solid var(--panel-border)", borderRadius: 12, padding: 12, background: "var(--panel-bg)" }}>
            <SectionHeader title="Search Memory" helpKey="memorySearch" />
            <label style={{ fontSize: 12 }}>
              Tier
              <select value={memorySearchForm.tier} onChange={(e) => setMemorySearchForm({ ...memorySearchForm, tier: Number(e.target.value) })} style={{ width: "100%", padding: 8, marginTop: 4, borderRadius: 8, border: "1px solid var(--panel-border-strong)" }}>
                <option value={1}>Tier 1</option>
                <option value={2}>Tier 2</option>
                <option value={3}>Tier 3</option>
              </select>
            </label>
            <label style={{ fontSize: 12, marginTop: 8 }}>
              Query
              <input value={memorySearchForm.query} onChange={(e) => setMemorySearchForm({ ...memorySearchForm, query: e.target.value })} style={{ width: "100%", padding: 8, marginTop: 4, borderRadius: 8, border: "1px solid var(--panel-border-strong)" }} />
            </label>
            <label style={{ fontSize: 12, marginTop: 8 }}>
              Tags (comma)
              <input value={memorySearchForm.tags} onChange={(e) => setMemorySearchForm({ ...memorySearchForm, tags: e.target.value })} style={{ width: "100%", padding: 8, marginTop: 4, borderRadius: 8, border: "1px solid var(--panel-border-strong)" }} />
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
                <div key={m.id} style={{ borderBottom: "1px solid var(--panel-border-subtle)", padding: "6px 0" }}>
                  <div style={{ fontWeight: 600 }}>{m.title}</div>
                  <div style={{ color: "#6b7280" }}>{m.snippet}</div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {active === "integrations" && (
        <div style={{ border: "1px solid var(--panel-border)", borderRadius: 12, padding: 12, background: "var(--panel-bg)" }}>
          <SectionHeader title="Integration Checks" helpKey="integrations" />
          <div style={{ marginBottom: 10, fontSize: 12, color: "#6b7280" }}>
            Google status: {googleStatus?.connected ? "connected" : "not connected"}
            {integrationsStatus?.google_docs?.configured === false ? " (missing config)" : ""}
          </div>
          <div style={{ marginBottom: 10, fontSize: 12, color: "#6b7280" }}>
            Gmail scope: {googleStatus?.scopes?.some(s => String(s).includes("gmail")) ? "enabled" : "not enabled"}
          </div>
          <div style={{ marginBottom: 10, fontSize: 12, color: "#6b7280" }}>
            Microsoft status: {microsoftStatus?.connected ? "connected" : "not connected"}
            {integrationsStatus?.microsoft?.configured === false ? " (missing config)" : ""}
          </div>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 10 }}>
            <button
              onClick={() => window.open(`${serverUrl}/api/auth/google/connect?ui_base=${encodeURIComponent(window.location.origin)}`, "_blank")}
              style={{ padding: "6px 10px", borderRadius: 8 }}
            >
              Connect Google Docs
            </button>
            <button
              onClick={() => window.open(`${serverUrl}/api/integrations/google/connect?preset=gmail_readonly&ui_base=${encodeURIComponent(window.location.origin)}`, "_blank")}
              style={{ padding: "6px 10px", borderRadius: 8 }}
            >
              Connect Gmail (Read)
            </button>
            <button
              onClick={() => window.open(`${serverUrl}/api/integrations/microsoft/connect?preset=mail_read&ui_base=${encodeURIComponent(window.location.origin)}`, "_blank")}
              style={{ padding: "6px 10px", borderRadius: 8 }}
            >
              Connect Microsoft
            </button>
            <button
              onClick={async () => {
                try {
                  const integrationsResp = await fetch(`${serverUrl}/api/integrations`);
                  const integrationsData = await integrationsResp.json();
                  setIntegrationsStatus(integrationsData.integrations || {});
                  const googleResp = await fetch(`${serverUrl}/api/integrations/google/status`);
                  setGoogleStatus(await googleResp.json());
                  const microsoftResp = await fetch(`${serverUrl}/api/integrations/microsoft/status`);
                  setMicrosoftStatus(await microsoftResp.json());
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
            <pre style={{ marginTop: 8, background: "var(--code-bg)", color: "#e5e7eb", padding: 8, borderRadius: 8, fontSize: 11 }}>
{JSON.stringify(integrationResult, null, 2)}
            </pre>
          )}
        </div>
      )}

      {active === "messaging" && (
        <div style={{ border: "1px solid var(--panel-border)", borderRadius: 12, padding: 12, background: "var(--panel-bg)" }}>
          <SectionHeader title="Send Message (Approval Required)" helpKey="messaging" />
          <label style={{ fontSize: 12 }}>
            Tool
            <select value={messageForm.tool} onChange={(e) => setMessageForm({ ...messageForm, tool: e.target.value })} style={{ width: "100%", padding: 8, marginTop: 4, borderRadius: 8, border: "1px solid var(--panel-border-strong)" }}>
              <option value="messaging.slackPost">Slack</option>
              <option value="messaging.telegramSend">Telegram</option>
              <option value="messaging.discordSend">Discord</option>
            </select>
          </label>
          {messageForm.tool === "messaging.slackPost" && (
            <label style={{ fontSize: 12, marginTop: 8 }}>
              Channel
              <input value={messageForm.channel} onChange={(e) => setMessageForm({ ...messageForm, channel: e.target.value })} style={{ width: "100%", padding: 8, marginTop: 4, borderRadius: 8, border: "1px solid var(--panel-border-strong)" }} />
            </label>
          )}
          {messageForm.tool === "messaging.telegramSend" && (
            <label style={{ fontSize: 12, marginTop: 8 }}>
              Chat ID
              <input value={messageForm.chatId} onChange={(e) => setMessageForm({ ...messageForm, chatId: e.target.value })} style={{ width: "100%", padding: 8, marginTop: 4, borderRadius: 8, border: "1px solid var(--panel-border-strong)" }} />
            </label>
          )}
          {messageForm.tool === "messaging.discordSend" && (
            <label style={{ fontSize: 12, marginTop: 8 }}>
              Channel ID (optional)
              <input value={messageForm.channelId} onChange={(e) => setMessageForm({ ...messageForm, channelId: e.target.value })} style={{ width: "100%", padding: 8, marginTop: 4, borderRadius: 8, border: "1px solid var(--panel-border-strong)" }} />
            </label>
          )}
          <label style={{ fontSize: 12, marginTop: 8 }}>
            Message
            <textarea value={messageForm.message} onChange={(e) => setMessageForm({ ...messageForm, message: e.target.value })} rows={4} style={{ width: "100%", padding: 8, marginTop: 4, borderRadius: 8, border: "1px solid var(--panel-border-strong)" }} />
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
            <pre style={{ marginTop: 8, background: "var(--code-bg)", color: "#e5e7eb", padding: 8, borderRadius: 8, fontSize: 11 }}>
{JSON.stringify(messageResult, null, 2)}
            </pre>
          )}
        </div>
      )}
    </div>
  );
}




