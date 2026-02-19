import Head from "next/head";
import { useEffect, useMemo, useState } from "react";

function resolveServerUrl() {
  if (process.env.NEXT_PUBLIC_SERVER_URL) return process.env.NEXT_PUBLIC_SERVER_URL;
  return "";
}

const SERVER_URL = resolveServerUrl();

const TONE_OPTIONS = ["friendly", "direct", "empathetic", "executive"];
const PRIORITY_OPTIONS = ["low", "medium", "high", "urgent"];

function buildUrl(base, path) {
  if (!base) return path;
  return `${base}${path}`;
}

function fetchWithCreds(url, options = {}) {
  return fetch(url, { ...options, credentials: "include" });
}

function formatTime(value) {
  if (!value) return "--";
  const ts = Date.parse(value);
  if (!Number.isFinite(ts)) return value;
  return new Date(ts).toLocaleString();
}

function parseTags(raw) {
  return String(raw || "")
    .split(",")
    .map(t => t.trim())
    .filter(Boolean);
}

function toIso(value) {
  if (!value) return null;
  const parsed = new Date(value);
  if (!Number.isFinite(parsed.getTime())) return value;
  return parsed.toISOString();
}

export default function EmailPage() {
  const [provider, setProvider] = useState("gmail");
  const [lookbackDays, setLookbackDays] = useState(14);
  const [searchQuery, setSearchQuery] = useState("");
  const [emails, setEmails] = useState([]);
  const [selectedEmail, setSelectedEmail] = useState(null);
  const [loading, setLoading] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [syncResult, setSyncResult] = useState(null);
  const [status, setStatus] = useState(null);
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");

  const [contextLoading, setContextLoading] = useState(false);
  const [contextAnswer, setContextAnswer] = useState("");
  const [contextCitations, setContextCitations] = useState([]);

  const [draftLoading, setDraftLoading] = useState(false);
  const [draftResult, setDraftResult] = useState(null);

  const [todoLoading, setTodoLoading] = useState(false);
  const [todoResult, setTodoResult] = useState(null);
  const [followLoading, setFollowLoading] = useState(false);
  const [followResult, setFollowResult] = useState(null);
  const [actionError, setActionError] = useState("");

  const [tone, setTone] = useState("friendly");
  const [signOffName, setSignOffName] = useState("");
  const [ragTopK, setRagTopK] = useState(6);

  const [todoTitle, setTodoTitle] = useState("");
  const [todoDue, setTodoDue] = useState("");
  const [todoReminder, setTodoReminder] = useState("");
  const [todoPriority, setTodoPriority] = useState("medium");
  const [todoTags, setTodoTags] = useState("");
  const [todoListId, setTodoListId] = useState("");
  const [todoNotes, setTodoNotes] = useState("");

  const [followUpAt, setFollowUpAt] = useState("");
  const [followReminderAt, setFollowReminderAt] = useState("");

  const baseUrl = SERVER_URL || "";
  const gmailConnected = Boolean(status?.scopes?.some(scope => String(scope).includes("gmail")));

  const filteredEmails = useMemo(() => {
    const query = String(searchQuery || "").trim().toLowerCase();
    if (!query) return emails;
    return emails.filter(email => {
      const haystack = [
        email.subject,
        email.from,
        email.to,
        email.snippet
      ].join(" ").toLowerCase();
      return haystack.includes(query);
    });
  }, [emails, searchQuery]);

  const loadStatus = async () => {
    try {
      const resp = await fetchWithCreds(buildUrl(baseUrl, "/api/integrations/google/status"));
      const data = await resp.json();
      if (!resp.ok) throw new Error(data?.error || "google_status_failed");
      setStatus(data);
    } catch (err) {
      setStatus(null);
      setError(err?.message || "google_status_failed");
    }
  };

  const loadInbox = async () => {
    setLoading(true);
    setError("");
    try {
      const params = new URLSearchParams({
        provider,
        limit: "40",
        lookbackDays: String(lookbackDays || 14)
      });
      const resp = await fetchWithCreds(buildUrl(baseUrl, `/api/email/inbox?${params.toString()}`));
      const data = await resp.json();
      if (!resp.ok) throw new Error(data?.error || "email_inbox_failed");
      const items = Array.isArray(data.items) ? data.items : [];
      setEmails(items);
      setSelectedEmail(items[0] || null);
    } catch (err) {
      setEmails([]);
      setSelectedEmail(null);
      setError(err?.message || "email_inbox_failed");
    } finally {
      setLoading(false);
    }
  };

  const connectGmail = () => {
    const origin = typeof window !== "undefined" ? window.location.origin : "";
    const redirect = "/email";
    const url = `${baseUrl}/api/integrations/google/connect?preset=gmail_full&ui_base=${encodeURIComponent(origin)}&redirect=${encodeURIComponent(redirect)}`;
    window.open(url, "_blank", "width=520,height=680");
  };

  const syncGmail = async () => {
    setSyncing(true);
    setSyncResult(null);
    setError("");
    try {
      const resp = await fetchWithCreds(buildUrl(baseUrl, "/api/connectors/gmail/sync"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({})
      });
      const data = await resp.json();
      if (!resp.ok) throw new Error(data?.error || "gmail_sync_failed");
      setSyncResult(data);
      await loadInbox();
    } catch (err) {
      setSyncResult({ ok: false, error: err?.message || "gmail_sync_failed" });
    } finally {
      setSyncing(false);
    }
  };

  const loadContext = async () => {
    if (!selectedEmail) return;
    setContextLoading(true);
    setContextAnswer("");
    setContextCitations([]);
    try {
      const prompt = `Find any relevant notes or todos related to this email.\nSubject: ${selectedEmail.subject}\nFrom: ${selectedEmail.from}\nSnippet: ${selectedEmail.snippet}`;
      const resp = await fetchWithCreds(buildUrl(baseUrl, "/api/rag/ask"), {
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
      setContextAnswer(data?.answer || "");
      setContextCitations(Array.isArray(data?.citations) ? data.citations : []);
    } catch (err) {
      setContextAnswer("");
      setContextCitations([]);
      setActionError(err?.message || "rag_query_failed");
    } finally {
      setContextLoading(false);
    }
  };

  const callTool = async (name, params) => {
    const resp = await fetchWithCreds(buildUrl(baseUrl, "/api/tools/call"), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, params })
    });
    const data = await resp.json();
    if (!resp.ok) throw new Error(data?.error || "tool_call_failed");
    return data;
  };

  const draftReply = async () => {
    if (!selectedEmail) return;
    setDraftLoading(true);
    setDraftResult(null);
    setActionError("");
    try {
      const data = await callTool("email.replyWithContext", {
        email: selectedEmail,
        tone,
        signOffName,
        ragTopK: Number(ragTopK || 6),
        ragModel: "all"
      });
      setDraftResult(data);
    } catch (err) {
      setActionError(err?.message || "draft_failed");
    } finally {
      setDraftLoading(false);
    }
  };

  const createTodo = async () => {
    if (!selectedEmail) return;
    setTodoLoading(true);
    setTodoResult(null);
    setActionError("");
    try {
      const data = await callTool("email.convertToTodo", {
        email: selectedEmail,
        title: todoTitle,
        notes: todoNotes,
        due: toIso(todoDue),
        reminderAt: toIso(todoReminder),
        priority: todoPriority,
        tags: parseTags(todoTags),
        listId: todoListId || null
      });
      setTodoResult(data);
    } catch (err) {
      setActionError(err?.message || "todo_failed");
    } finally {
      setTodoLoading(false);
    }
  };

  const scheduleFollowUp = async () => {
    if (!selectedEmail) return;
    if (!followUpAt) {
      setActionError("follow_up_date_required");
      return;
    }
    setFollowLoading(true);
    setFollowResult(null);
    setActionError("");
    try {
      const data = await callTool("email.scheduleFollowUp", {
        email: selectedEmail,
        followUpAt: toIso(followUpAt),
        reminderAt: toIso(followReminderAt),
        priority: todoPriority,
        tags: parseTags(todoTags),
        listId: todoListId || null,
        notes: todoNotes
      });
      setFollowResult(data);
    } catch (err) {
      setActionError(err?.message || "follow_up_failed");
    } finally {
      setFollowLoading(false);
    }
  };

  useEffect(() => {
    loadStatus();
    loadInbox();
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const params = new URLSearchParams(window.location.search);
    const integration = params.get("integration");
    const statusParam = params.get("status");
    if (integration === "google" && statusParam) {
      setNotice(statusParam === "success" ? "Gmail connected. Refresh the inbox to load messages." : "Gmail connection failed. Try again.");
      window.history.replaceState({}, "", "/email");
      loadStatus();
    }
  }, []);

  return (
    <div className="email-shell">
      <Head>
        <title>Aika Email Workspace</title>
      </Head>
      <div className="email-wrap">
        <header className="email-hero">
          <div>
            <div className="hero-kicker">Aika Mailroom</div>
            <h1>Email Workspace</h1>
            <p>Connect Gmail once, then review, sync, and turn inbox threads into knowledge and action.</p>
          </div>
          <div className="hero-actions">
            <div className="status-chip">
              <span className="status-dot" data-connected={gmailConnected ? "true" : "false"} />
              Gmail {gmailConnected ? "connected" : "not connected"}
            </div>
            <button type="button" onClick={connectGmail} className="primary">
              Connect Gmail (Inbox + Send)
            </button>
            <button type="button" onClick={loadInbox}>
              {loading ? "Refreshing..." : "Refresh Inbox"}
            </button>
          </div>
        </header>

        {notice && <div className="banner">{notice}</div>}
        {error && <div className="banner error">{error}</div>}

        <div className="email-grid">
          <section className="panel" style={{ animationDelay: "0.05s" }}>
            <div className="panel-title">Connection</div>
            <div className="muted">Use one connection to unlock inbox preview, knowledge sync, and action tools.</div>
            <div className="kv-row">
              <span>Scopes</span>
              <span>{status?.scopes?.length ? `${status.scopes.length} granted` : "None"}</span>
            </div>
            <div className="kv-row">
              <span>Last used</span>
              <span>{status?.lastUsedAt || "--"}</span>
            </div>
            <div className="divider" />
            <div className="panel-title">Inbox Controls</div>
            <label className="field">
              Provider
              <select value={provider} onChange={(e) => setProvider(e.target.value)}>
                <option value="gmail">Gmail</option>
                <option value="outlook">Outlook</option>
                <option value="all">All</option>
              </select>
            </label>
            <label className="field">
              Lookback days
              <input
                type="number"
                value={lookbackDays}
                onChange={(e) => setLookbackDays(Number(e.target.value || 0))}
              />
            </label>
            <label className="field">
              Search
              <input
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Filter by sender or subject"
              />
            </label>
            <div className="button-row">
              <button type="button" onClick={loadInbox}>
                Refresh
              </button>
              <button type="button" onClick={syncGmail} disabled={syncing}>
                {syncing ? "Syncing..." : "Sync to Knowledge"}
              </button>
            </div>
            {syncResult && (
              <pre className="panel-code">{JSON.stringify(syncResult, null, 2)}</pre>
            )}
          </section>

          <section className="panel" style={{ animationDelay: "0.12s" }}>
            <div className="panel-title">Inbox</div>
            {loading && <div className="muted">Loading inbox...</div>}
            {!loading && filteredEmails.length === 0 && (
              <div className="muted">No emails found for this window.</div>
            )}
            <div className="email-list">
              {filteredEmails.map(item => (
                <button
                  key={`${item.provider}-${item.id}`}
                  type="button"
                  onClick={() => {
                    setSelectedEmail(item);
                    setContextAnswer("");
                    setContextCitations([]);
                    setDraftResult(null);
                    setTodoResult(null);
                    setFollowResult(null);
                  }}
                  className={`email-card ${selectedEmail?.id === item.id ? "active" : ""}`}
                >
                  <div className="email-card-header">
                    <div className="email-subject">{item.subject || "(no subject)"}</div>
                    <div className="email-time">{formatTime(item.receivedAt)}</div>
                  </div>
                  <div className="email-from">{item.from || "Unknown sender"}</div>
                  <div className="email-snippet">{item.snippet || "No preview available."}</div>
                </button>
              ))}
            </div>
          </section>

          <section className="panel" style={{ animationDelay: "0.2s" }}>
            <div className="panel-title">Message Intelligence</div>
            {!selectedEmail ? (
              <div className="muted">Select a message to inspect details and run actions.</div>
            ) : (
              <>
                <div className="detail-card">
                  <div className="detail-subject">{selectedEmail.subject || "(no subject)"}</div>
                  <div className="detail-row">
                    <span>From</span>
                    <span>{selectedEmail.from || "Unknown"}</span>
                  </div>
                  <div className="detail-row">
                    <span>To</span>
                    <span>{selectedEmail.to || "--"}</span>
                  </div>
                  <div className="detail-row">
                    <span>Received</span>
                    <span>{formatTime(selectedEmail.receivedAt)}</span>
                  </div>
                  <div className="detail-snippet">{selectedEmail.snippet || "No snippet."}</div>
                  <div className="button-row">
                    {selectedEmail.webLink && (
                      <a className="link-button" href={selectedEmail.webLink} target="_blank" rel="noreferrer">
                        Open in Gmail
                      </a>
                    )}
                    <button type="button" onClick={loadContext} disabled={contextLoading}>
                      {contextLoading ? "Finding context..." : "Find Context"}
                    </button>
                  </div>
                  {contextAnswer && (
                    <div className="context-box">
                      <div className="context-title">Context Snapshot</div>
                      <div className="context-body">{contextAnswer}</div>
                      {contextCitations.length > 0 && (
                        <div className="context-citations">
                          {contextCitations.slice(0, 4).map((cite, idx) => (
                            <div key={`${cite.chunk_id || idx}`} className="citation">
                              {cite.meeting_title || "Memory"}: {cite.snippet || ""}
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  )}
                </div>

                <div className="detail-card">
                  <div className="panel-title">Draft Reply</div>
                  <label className="field">
                    Tone
                    <select value={tone} onChange={(e) => setTone(e.target.value)}>
                      {TONE_OPTIONS.map(option => (
                        <option key={option} value={option}>{option}</option>
                      ))}
                    </select>
                  </label>
                  <label className="field">
                    Sign-off name
                    <input value={signOffName} onChange={(e) => setSignOffName(e.target.value)} placeholder="Aika" />
                  </label>
                  <label className="field">
                    RAG top K
                    <input
                      type="number"
                      value={ragTopK}
                      onChange={(e) => setRagTopK(Number(e.target.value || 0))}
                    />
                  </label>
                  <div className="button-row">
                    <button type="button" onClick={draftReply} disabled={draftLoading}>
                      {draftLoading ? "Drafting..." : "Draft Reply with Context"}
                    </button>
                  </div>
                  {draftResult && (
                    <pre className="panel-code">{JSON.stringify(draftResult, null, 2)}</pre>
                  )}
                </div>

                <div className="detail-card">
                  <div className="panel-title">Action Studio</div>
                  <label className="field">
                    Todo title
                    <input value={todoTitle} onChange={(e) => setTodoTitle(e.target.value)} placeholder="Follow up on this email" />
                  </label>
                  <label className="field">
                    Due
                    <input type="datetime-local" value={todoDue} onChange={(e) => setTodoDue(e.target.value)} />
                  </label>
                  <label className="field">
                    Reminder
                    <input type="datetime-local" value={todoReminder} onChange={(e) => setTodoReminder(e.target.value)} />
                  </label>
                  <label className="field">
                    Priority
                    <select value={todoPriority} onChange={(e) => setTodoPriority(e.target.value)}>
                      {PRIORITY_OPTIONS.map(option => (
                        <option key={option} value={option}>{option}</option>
                      ))}
                    </select>
                  </label>
                  <label className="field">
                    Tags
                    <input value={todoTags} onChange={(e) => setTodoTags(e.target.value)} placeholder="client, billing, urgent" />
                  </label>
                  <label className="field">
                    List ID
                    <input value={todoListId} onChange={(e) => setTodoListId(e.target.value)} placeholder="Optional list id" />
                  </label>
                  <label className="field">
                    Notes
                    <textarea rows={3} value={todoNotes} onChange={(e) => setTodoNotes(e.target.value)} />
                  </label>
                  <label className="field">
                    Follow-up date
                    <input type="datetime-local" value={followUpAt} onChange={(e) => setFollowUpAt(e.target.value)} />
                  </label>
                  <label className="field">
                    Follow-up reminder
                    <input type="datetime-local" value={followReminderAt} onChange={(e) => setFollowReminderAt(e.target.value)} />
                  </label>
                  <div className="button-row">
                    <button type="button" onClick={createTodo} disabled={todoLoading}>
                      {todoLoading ? "Creating..." : "Create Todo"}
                    </button>
                    <button type="button" onClick={scheduleFollowUp} disabled={followLoading}>
                      {followLoading ? "Scheduling..." : "Schedule Follow-up"}
                    </button>
                  </div>
                  {actionError && <div className="muted error-text">{actionError}</div>}
                  {todoResult && (
                    <pre className="panel-code">{JSON.stringify(todoResult, null, 2)}</pre>
                  )}
                  {followResult && (
                    <pre className="panel-code">{JSON.stringify(followResult, null, 2)}</pre>
                  )}
                </div>
              </>
            )}
          </section>
        </div>
      </div>

      <style jsx global>{`
        @import url("https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@300;400;500;600;700&family=Manrope:wght@300;400;500;600;700&display=swap");

        :root {
          --font-body: "Manrope", "Segoe UI", sans-serif;
          --font-display: "Space Grotesk", "Segoe UI", sans-serif;
          --app-bg: #0b1018;
          --app-gradient: radial-gradient(1200px 700px at 10% 5%, rgba(34, 211, 238, 0.18), transparent 60%),
            radial-gradient(900px 600px at 90% 10%, rgba(245, 158, 11, 0.18), transparent 60%),
            radial-gradient(1200px 700px at 50% 100%, rgba(16, 185, 129, 0.14), transparent 65%),
            linear-gradient(135deg, #0b1018, #121b2b 45%, #0e1522);
          --panel-bg: rgba(15, 23, 42, 0.82);
          --panel-bg-soft: rgba(148, 163, 184, 0.08);
          --panel-border: rgba(148, 163, 184, 0.22);
          --panel-border-strong: rgba(148, 163, 184, 0.4);
          --text-primary: #f8fafc;
          --text-muted: #9aa3b2;
          --accent: #f59e0b;
          --accent-2: #22d3ee;
          --accent-3: #34d399;
          --button-bg: rgba(30, 41, 59, 0.7);
          --input-bg: rgba(15, 23, 42, 0.7);
          --chip-bg: rgba(245, 158, 11, 0.2);
          --shadow-soft: 0 18px 40px rgba(2, 6, 23, 0.45);
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

        .email-shell {
          min-height: 100vh;
          background: var(--app-gradient);
          padding: 32px 20px 48px;
          position: relative;
          overflow: hidden;
        }

        .email-shell::before {
          content: "";
          position: absolute;
          inset: -20% -10% -20% -10%;
          background: radial-gradient(600px 400px at 20% 20%, rgba(245, 158, 11, 0.16), transparent 60%),
            radial-gradient(700px 500px at 80% 30%, rgba(34, 211, 238, 0.14), transparent 60%);
          opacity: 0.8;
          filter: blur(10px);
          pointer-events: none;
          animation: floatGlow 18s ease-in-out infinite;
        }

        .email-wrap {
          max-width: 1400px;
          margin: 0 auto;
          position: relative;
          z-index: 1;
        }

        .email-hero {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 24px;
          flex-wrap: wrap;
          margin-bottom: 18px;
        }

        .email-hero h1 {
          margin: 0;
          font-family: var(--font-display);
          font-size: 32px;
        }

        .email-hero p {
          margin: 6px 0 0;
          color: var(--text-muted);
          max-width: 520px;
        }

        .hero-kicker {
          font-size: 12px;
          letter-spacing: 0.18em;
          text-transform: uppercase;
          color: var(--accent-2);
          margin-bottom: 6px;
        }

        .hero-actions {
          display: flex;
          align-items: center;
          gap: 10px;
          flex-wrap: wrap;
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
          box-shadow: 0 0 20px rgba(245, 158, 11, 0.25);
          transform: translateY(-1px);
        }

        button:disabled {
          opacity: 0.6;
          cursor: not-allowed;
          transform: none;
          box-shadow: none;
        }

        button.primary {
          background: linear-gradient(120deg, rgba(245, 158, 11, 0.9), rgba(34, 211, 238, 0.9));
          border: none;
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

        .email-grid {
          display: grid;
          grid-template-columns: minmax(260px, 0.7fr) minmax(320px, 1fr) minmax(320px, 1.1fr);
          gap: 16px;
        }

        .panel {
          background: var(--panel-bg);
          border: 1px solid var(--panel-border);
          border-radius: 18px;
          padding: 16px;
          box-shadow: var(--shadow-soft);
          animation: fadeUp 0.6s ease both;
        }

        .panel-title {
          font-family: var(--font-display);
          font-weight: 600;
          margin-bottom: 10px;
        }

        .muted {
          color: var(--text-muted);
          font-size: 12px;
        }

        .muted.error-text {
          color: #fca5a5;
        }

        .divider {
          height: 1px;
          background: var(--panel-border);
          margin: 14px 0;
        }

        .field {
          display: flex;
          flex-direction: column;
          gap: 6px;
          font-size: 12px;
          margin-top: 10px;
        }

        .button-row {
          display: flex;
          gap: 8px;
          flex-wrap: wrap;
          margin-top: 12px;
        }

        .panel-code {
          margin-top: 12px;
          background: rgba(15, 23, 42, 0.9);
          border-radius: 12px;
          padding: 12px;
          font-size: 11px;
          color: #e2e8f0;
          white-space: pre-wrap;
          max-height: 240px;
          overflow: auto;
        }

        .email-list {
          display: flex;
          flex-direction: column;
          gap: 10px;
          max-height: 720px;
          overflow-y: auto;
          padding-right: 4px;
        }

        .email-card {
          text-align: left;
          background: var(--panel-bg-soft);
          border: 1px solid transparent;
          border-radius: 14px;
          padding: 12px;
          transition: border-color 0.2s ease, transform 0.2s ease;
        }

        .email-card.active {
          border-color: var(--accent);
          box-shadow: 0 0 20px rgba(245, 158, 11, 0.15);
        }

        .email-card-header {
          display: flex;
          justify-content: space-between;
          gap: 8px;
        }

        .email-subject {
          font-weight: 600;
          font-size: 13px;
        }

        .email-time {
          font-size: 11px;
          color: var(--text-muted);
          white-space: nowrap;
        }

        .email-from {
          font-size: 12px;
          color: var(--accent-2);
          margin-top: 6px;
        }

        .email-snippet {
          font-size: 12px;
          color: var(--text-muted);
          margin-top: 6px;
          line-height: 1.4;
        }

        .detail-card {
          background: rgba(15, 23, 42, 0.6);
          border: 1px solid var(--panel-border);
          border-radius: 16px;
          padding: 14px;
          margin-top: 12px;
        }

        .detail-subject {
          font-family: var(--font-display);
          font-size: 16px;
          margin-bottom: 10px;
        }

        .detail-row {
          display: flex;
          justify-content: space-between;
          font-size: 12px;
          color: var(--text-muted);
          margin-bottom: 6px;
        }

        .detail-snippet {
          margin-top: 10px;
          font-size: 12px;
          line-height: 1.5;
          color: var(--text-primary);
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

        .context-box {
          margin-top: 12px;
          padding: 12px;
          border-radius: 12px;
          background: rgba(34, 211, 238, 0.08);
          border: 1px solid rgba(34, 211, 238, 0.3);
        }

        .context-title {
          font-size: 12px;
          text-transform: uppercase;
          letter-spacing: 0.12em;
          color: var(--accent-2);
          margin-bottom: 8px;
        }

        .context-body {
          font-size: 12px;
          line-height: 1.5;
        }

        .context-citations {
          margin-top: 10px;
          display: grid;
          gap: 6px;
        }

        .citation {
          font-size: 11px;
          color: var(--text-muted);
          padding: 6px 8px;
          border-radius: 8px;
          background: rgba(15, 23, 42, 0.6);
        }

        .kv-row {
          display: flex;
          justify-content: space-between;
          font-size: 12px;
          color: var(--text-muted);
          margin-top: 8px;
        }

        @keyframes fadeUp {
          from {
            opacity: 0;
            transform: translateY(12px);
          }
          to {
            opacity: 1;
            transform: translateY(0);
          }
        }

        @keyframes floatGlow {
          0%,
          100% {
            transform: translateY(0px);
          }
          50% {
            transform: translateY(12px);
          }
        }

        @media (max-width: 1200px) {
          .email-grid {
            grid-template-columns: 1fr;
          }
        }
      `}</style>
    </div>
  );
}
