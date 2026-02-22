import Head from "next/head";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

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

function buildEmailMeta(email) {
  if (!email) return null;
  return {
    subject: email.subject || "",
    from: email.from || "",
    to: email.to || "",
    snippet: email.snippet || "",
    receivedAt: email.receivedAt || ""
  };
}

function buildEmailKey(email) {
  return `${email?.provider || "gmail"}:${email?.id || ""}`;
}

function sanitizeEmailHtml(rawHtml) {
  return String(rawHtml || "").replace(/<script[\s\S]*?<\/script>/gi, "");
}

function buildEmailHtmlDoc(rawHtml) {
  const safe = sanitizeEmailHtml(rawHtml);
  if (!safe) return "";
  const baseTag = "<base target=\"_blank\" />";
  const styleTag = `<style>
    @import url("https://fonts.googleapis.com/css2?family=Manrope:wght@300;400;500;600;700&display=swap");
    :root { color-scheme: light; }
    body { margin: 0; padding: 18px; font-family: "Manrope", "Segoe UI", sans-serif; color: #0f172a; background: #f8fafc; }
    img { max-width: 100%; height: auto; }
    table { max-width: 100%; }
    a { color: #2563eb; }
  </style>`;
  if (/<html[\s>]/i.test(safe)) {
    if (/<head[\s>]/i.test(safe)) {
      return safe.replace(/<head[^>]*>/i, match => `${match}${baseTag}${styleTag}`);
    }
    return safe.replace(/<html[^>]*>/i, match => `${match}<head>${baseTag}${styleTag}</head>`);
  }
  return `<!doctype html><html><head>${baseTag}${styleTag}</head><body>${safe}</body></html>`;
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
  const [triageLoading, setTriageLoading] = useState(false);
  const [triageResults, setTriageResults] = useState([]);
  const [triageSource, setTriageSource] = useState("");
  const [triageError, setTriageError] = useState("");
  const [applyLoading, setApplyLoading] = useState(false);
  const [undoToast, setUndoToast] = useState(null);
  const [undoLoading, setUndoLoading] = useState(false);
  const [fullViewOpen, setFullViewOpen] = useState(false);
  const [fullMessage, setFullMessage] = useState(null);
  const [fullMessageLoading, setFullMessageLoading] = useState(false);
  const [fullMessageError, setFullMessageError] = useState("");

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

  const undoTimerRef = useRef(null);

  const baseUrl = SERVER_URL || "";
  const gmailConnected = Boolean(status?.scopes?.some(scope => String(scope).includes("gmail")));
  const fullDetail = fullMessage || selectedEmail || null;
  const fullEmailDoc = useMemo(() => buildEmailHtmlDoc(fullMessage?.html || ""), [fullMessage?.html]);

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

  const selectedIndex = useMemo(() => {
    if (!selectedEmail) return -1;
    const key = buildEmailKey(selectedEmail);
    return filteredEmails.findIndex(item => buildEmailKey(item) === key);
  }, [filteredEmails, selectedEmail]);

  const canMovePrev = selectedIndex > 0;
  const canMoveNext = selectedIndex >= 0 && selectedIndex < filteredEmails.length - 1;

  const selectEmail = useCallback((item) => {
    if (!item) {
      setSelectedEmail(null);
      setContextAnswer("");
      setContextCitations([]);
      setDraftResult(null);
      setTodoResult(null);
      setFollowResult(null);
      setActionError("");
      setFullMessage(null);
      setFullMessageError("");
      setFullViewOpen(false);
      return;
    }
    setSelectedEmail(item);
    setContextAnswer("");
    setContextCitations([]);
    setDraftResult(null);
    setTodoResult(null);
    setFollowResult(null);
    setActionError("");
    setFullMessage(null);
    setFullMessageError("");
  }, []);

  useEffect(() => {
    if (!fullViewOpen) return;
    if (!filteredEmails.length) return;
    if (!selectedEmail) {
      selectEmail(filteredEmails[0]);
      return;
    }
    const key = buildEmailKey(selectedEmail);
    const match = filteredEmails.some(item => buildEmailKey(item) === key);
    if (!match) {
      selectEmail(filteredEmails[0]);
    }
  }, [fullViewOpen, filteredEmails, selectedEmail, selectEmail]);

  const moveSelection = (direction) => {
    if (!filteredEmails.length) return;
    if (direction < 0 && canMovePrev) {
      selectEmail(filteredEmails[selectedIndex - 1]);
    }
    if (direction > 0 && canMoveNext) {
      selectEmail(filteredEmails[selectedIndex + 1]);
    }
  };

  const loadFullMessage = async (email) => {
    if (!email?.id) return;
    setFullMessageLoading(true);
    setFullMessageError("");
    setFullMessage(null);
    try {
      const params = new URLSearchParams({
        provider: email.provider || "gmail",
        messageId: email.id
      });
      const resp = await fetchWithCreds(buildUrl(baseUrl, `/api/email/message?${params.toString()}`));
      const data = await resp.json();
      if (!resp.ok) throw new Error(data?.error || "email_message_failed");
      setFullMessage(data?.message || null);
    } catch (err) {
      setFullMessage(null);
      setFullMessageError(err?.message || "email_message_failed");
    } finally {
      setFullMessageLoading(false);
    }
  };

  const openFullView = (email) => {
    if (!email) return;
    selectEmail(email);
    setFullViewOpen(true);
  };

  const closeFullView = () => {
    setFullViewOpen(false);
  };

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
    setTriageResults([]);
    setTriageSource("");
    setTriageError("");
    const currentKey = selectedEmail ? buildEmailKey(selectedEmail) : "";
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
      const next = items.find(item => buildEmailKey(item) === currentKey) || items[0] || null;
      selectEmail(next);
    } catch (err) {
      setEmails([]);
      selectEmail(null);
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

  const runTriage = async () => {
    if (!emails.length) {
      setTriageResults([]);
      setTriageSource("");
      setTriageError("No emails available to review.");
      return;
    }
    setTriageLoading(true);
    setTriageError("");
    try {
      const resp = await fetchWithCreds(buildUrl(baseUrl, "/api/email/triage"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ emails: emails.slice(0, 40) })
      });
      const data = await resp.json();
      if (!resp.ok) throw new Error(data?.error || "triage_failed");
      setTriageResults(Array.isArray(data?.results) ? data.results : []);
      setTriageSource(data?.provider || "");
    } catch (err) {
      setTriageResults([]);
      setTriageSource("");
      setTriageError(err?.message || "triage_failed");
    } finally {
      setTriageLoading(false);
    }
  };

  const bulkAction = async (action, messageIds, options = {}) => {
    const resp = await fetchWithCreds(buildUrl(baseUrl, "/api/email/gmail/bulk"), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action, messageIds, ...options })
    });
    const data = await resp.json();
    if (!resp.ok) throw new Error(data?.error || "bulk_action_failed");
    return data;
  };

  const clearUndoToast = () => {
    if (undoTimerRef.current) {
      clearTimeout(undoTimerRef.current);
      undoTimerRef.current = null;
    }
    setUndoToast(null);
    setUndoLoading(false);
  };

  const showUndoToast = (toast) => {
    if (!toast) return;
    if (undoTimerRef.current) {
      clearTimeout(undoTimerRef.current);
      undoTimerRef.current = null;
    }
    const durationMs = toast.durationMs || 6500;
    setUndoToast({ ...toast, durationMs });
    undoTimerRef.current = setTimeout(() => {
      setUndoToast(null);
      undoTimerRef.current = null;
    }, durationMs);
  };

  const handleUndo = async () => {
    if (!undoToast?.items?.length) return;
    setUndoLoading(true);
    setActionError("");
    try {
      for (const item of undoToast.items) {
        const ids = Array.isArray(item?.messageIds) ? item.messageIds : [];
        if (!ids.length || !item?.action) continue;
        await bulkAction(item.action, ids, { source: "undo" });
      }
      setNotice("Undo completed. Inbox refreshed.");
      await loadInbox();
    } catch (err) {
      setActionError(err?.message || "undo_failed");
    } finally {
      clearUndoToast();
    }
  };

  const applyTriage = async () => {
    const trashTargets = triageResults.filter(item => item.action === "trash").map(item => item.id);
    const spamTargets = triageResults.filter(item => item.action === "spam").map(item => item.id);
    if (!trashTargets.length && !spamTargets.length) {
      setNotice("No junk or spam flagged in this review.");
      return;
    }
    setApplyLoading(true);
    try {
      if (trashTargets.length) await bulkAction("trash", trashTargets, { source: "triage" });
      if (spamTargets.length) await bulkAction("spam", spamTargets, { source: "triage" });
      const summary = `Applied cleanup: ${trashTargets.length} trashed, ${spamTargets.length} marked spam.`;
      setNotice(summary);
      const undoItems = [];
      if (trashTargets.length) {
        undoItems.push({ action: "untrash", messageIds: trashTargets });
      }
      if (spamTargets.length) {
        undoItems.push({ action: "unspam", messageIds: spamTargets });
      }
      if (undoItems.length) {
        showUndoToast({
          title: "Cleanup applied",
          description: summary,
          items: undoItems,
          durationMs: 8000
        });
      }
      await loadInbox();
    } catch (err) {
      setActionError(err?.message || "cleanup_failed");
    } finally {
      setApplyLoading(false);
    }
  };

  const handleMessageAction = async (action) => {
    if (!selectedEmail?.id) return;
    const confirmMap = {
      delete: "Delete this email forever? This cannot be undone."
    };
    if (confirmMap[action]) {
      const ok = window.confirm(confirmMap[action]);
      if (!ok) return;
    }
    setActionError("");
    try {
      const meta = buildEmailMeta(selectedEmail);
      const resp = await fetchWithCreds(buildUrl(baseUrl, `/api/email/gmail/${action}`), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messageId: selectedEmail.id, meta, source: "user" })
      });
      const data = await resp.json();
      if (!resp.ok) throw new Error(data?.error || `${action}_failed`);
      const actionLabels = {
        archive: "Archived",
        trash: "Moved to Trash",
        spam: "Marked as spam",
        delete: "Deleted forever"
      };
      const label = actionLabels[action] || "Action complete";
      setNotice(`${label}.`);
      if (action === "trash" || action === "spam") {
        showUndoToast({
          title: label,
          description: selectedEmail.subject || selectedEmail.from || "Email updated.",
          items: [
            {
              action: action === "trash" ? "untrash" : "unspam",
              messageIds: [selectedEmail.id]
            }
          ],
          durationMs: 6500
        });
      }
      await loadInbox();
    } catch (err) {
      setActionError(err?.message || `${action}_failed`);
    }
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

  useEffect(() => {
    return () => {
      if (undoTimerRef.current) {
        clearTimeout(undoTimerRef.current);
        undoTimerRef.current = null;
      }
    };
  }, []);

  useEffect(() => {
    if (!fullViewOpen || !selectedEmail) return;
    loadFullMessage(selectedEmail);
  }, [fullViewOpen, selectedEmail?.id, selectedEmail?.provider]);

  useEffect(() => {
    if (!fullViewOpen) return;
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const handler = (event) => {
      if (event.key === "Escape") {
        closeFullView();
      }
      if (event.key === "ArrowUp") {
        event.preventDefault();
        moveSelection(-1);
      }
      if (event.key === "ArrowDown") {
        event.preventDefault();
        moveSelection(1);
      }
    };
    window.addEventListener("keydown", handler);
    return () => {
      document.body.style.overflow = prevOverflow;
      window.removeEventListener("keydown", handler);
    };
  }, [fullViewOpen, moveSelection]);

  const messageDetailBody = !selectedEmail ? (
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
        <div className="button-row">
          <button type="button" onClick={() => handleMessageAction("archive")}>
            Archive
          </button>
          <button type="button" className="warn" onClick={() => handleMessageAction("trash")}>
            Trash
          </button>
          <button type="button" className="warn" onClick={() => handleMessageAction("spam")}>
            Mark Spam
          </button>
          <button type="button" className="danger" onClick={() => handleMessageAction("delete")}>
            Delete Forever
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
  );

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
            <div className="divider" />
            <div className="panel-title">Aika Review</div>
            <div className="muted">Aika flags junk, spam, and solicitations so you can clean fast.</div>
            <div className="button-row">
              <button type="button" onClick={runTriage} disabled={triageLoading}>
                {triageLoading ? "Reviewing..." : "Review Inbox"}
              </button>
              <button type="button" onClick={applyTriage} disabled={applyLoading || !triageResults.length}>
                {applyLoading ? "Applying..." : "Apply Cleanup"}
              </button>
            </div>
            {triageSource && (
              <div className="muted">Review source: {triageSource}</div>
            )}
            {triageError && (
              <div className="muted error-text">{triageError}</div>
            )}
            {triageResults.length > 0 && (
              <div className="triage-list">
                {triageResults.map(item => (
                  <div key={item.id} className="triage-item">
                    <div>
                      <div className="triage-subject">{item.subject || "(no subject)"}</div>
                      <div className="triage-meta">{item.from || "Unknown sender"}</div>
                      {item.reason && <div className="triage-reason">{item.reason}</div>}
                    </div>
                    <div className={`triage-badge ${item.action || "keep"}`}>{item.action || "keep"}</div>
                  </div>
                ))}
              </div>
            )}
          </section>

          <section className="panel" style={{ animationDelay: "0.12s" }}>
            <div className="panel-title">Inbox</div>
            <div className="muted">Tip: Double-click an email to open the full view.</div>
            {loading && <div className="muted">Loading inbox...</div>}
            {!loading && filteredEmails.length === 0 && (
              <div className="muted">No emails found for this window.</div>
            )}
            <div className="email-list">
              {filteredEmails.map(item => (
                <button
                  key={`${item.provider}-${item.id}`}
                  type="button"
                  onClick={() => selectEmail(item)}
                  onDoubleClick={() => openFullView(item)}
                  className={`email-card ${selectedEmail && buildEmailKey(selectedEmail) === buildEmailKey(item) ? "active" : ""}`}
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
            {messageDetailBody}
          </section>
        </div>
      </div>

      {fullViewOpen && selectedEmail && (
        <div className="email-modal-backdrop" role="dialog" aria-modal="true" onClick={closeFullView}>
          <div className="email-modal" onClick={(event) => event.stopPropagation()}>
            <div className="email-modal-header">
              <div>
                <div className="modal-kicker">Full Message</div>
                <div className="modal-subject">{fullDetail?.subject || "(no subject)"}</div>
                <div className="modal-meta">
                  <span>{fullDetail?.from || "Unknown sender"}</span>
                  <span aria-hidden="true">&bull;</span>
                  <span>{formatTime(fullDetail?.receivedAt)}</span>
                  {selectedIndex >= 0 && (
                    <>
                      <span aria-hidden="true">&bull;</span>
                      <span>{selectedIndex + 1} of {filteredEmails.length}</span>
                    </>
                  )}
                </div>
              </div>
              <div className="modal-actions">
                <button
                  type="button"
                  className="nav-arrow"
                  onClick={() => moveSelection(-1)}
                  disabled={!canMovePrev}
                  title="Previous email"
                >
                  &uarr;
                </button>
                <button
                  type="button"
                  className="nav-arrow"
                  onClick={() => moveSelection(1)}
                  disabled={!canMoveNext}
                  title="Next email"
                >
                  &darr;
                </button>
                <button type="button" onClick={closeFullView}>
                  Close
                </button>
              </div>
            </div>
            <div className="email-modal-body">
              <div className="email-modal-view">
                <div className="email-modal-view-header">
                  <div>
                    <div className="modal-from">{fullDetail?.from || "Unknown sender"}</div>
                    <div className="modal-to">To: {fullDetail?.to || "--"}</div>
                  </div>
                  {fullDetail?.webLink && (
                    <a className="link-button" href={fullDetail.webLink} target="_blank" rel="noreferrer">
                      Open in Gmail
                    </a>
                  )}
                </div>
                <div className="email-modal-view-body">
                  {fullMessageLoading && <div className="muted">Loading full message...</div>}
                  {!fullMessageLoading && fullMessageError && (
                    <div className="muted error-text">{fullMessageError}</div>
                  )}
                  {!fullMessageLoading && !fullMessageError && fullEmailDoc && (
                    <iframe
                      title="Full email content"
                      className="email-html-frame"
                      sandbox="allow-popups allow-popups-to-escape-sandbox"
                      srcDoc={fullEmailDoc}
                    />
                  )}
                  {!fullMessageLoading && !fullMessageError && !fullEmailDoc && (
                    <div className="email-text-fallback">
                      {fullMessage?.text || fullDetail?.snippet || "No content available."}
                    </div>
                  )}
                </div>
              </div>
              <div className="email-modal-controls">
                <div className="panel-title">Training & Actions</div>
                {messageDetailBody}
              </div>
            </div>
          </div>
        </div>
      )}

      {undoToast && (
        <div className="undo-toast" role="status" aria-live="polite">
          <div>
            <div className="undo-title">{undoToast.title}</div>
            {undoToast.description && <div className="undo-body">{undoToast.description}</div>}
          </div>
          <div className="undo-actions">
            <button type="button" className="primary" onClick={handleUndo} disabled={undoLoading}>
              {undoLoading ? "Undoing..." : "Undo"}
            </button>
            <button type="button" onClick={clearUndoToast}>
              Dismiss
            </button>
          </div>
          <div className="undo-bar" style={{ "--undo-duration": `${undoToast.durationMs}ms` }} />
        </div>
      )}

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

        button.warn {
          border-color: rgba(245, 158, 11, 0.6);
          color: #fde68a;
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

        .email-modal-backdrop {
          position: fixed;
          inset: 0;
          background: rgba(2, 6, 23, 0.75);
          display: flex;
          align-items: center;
          justify-content: center;
          padding: 24px;
          z-index: 40;
        }

        .email-modal {
          width: min(1400px, 96vw);
          height: min(90vh, 920px);
          background: rgba(15, 23, 42, 0.95);
          border: 1px solid var(--panel-border-strong);
          border-radius: 20px;
          box-shadow: var(--shadow-soft);
          display: flex;
          flex-direction: column;
          overflow: hidden;
        }

        .email-modal-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          gap: 16px;
          padding: 16px 20px;
          border-bottom: 1px solid var(--panel-border);
          background: rgba(15, 23, 42, 0.85);
        }

        .modal-kicker {
          text-transform: uppercase;
          letter-spacing: 0.16em;
          font-size: 10px;
          color: var(--accent-2);
        }

        .modal-subject {
          font-family: var(--font-display);
          font-size: 18px;
          margin-top: 4px;
        }

        .modal-meta {
          margin-top: 6px;
          display: flex;
          gap: 8px;
          font-size: 12px;
          color: var(--text-muted);
          align-items: center;
          flex-wrap: wrap;
        }

        .modal-actions {
          display: flex;
          gap: 8px;
          align-items: center;
        }

        .nav-arrow {
          width: 36px;
          height: 36px;
          padding: 0;
          border-radius: 12px;
          font-size: 16px;
        }

        .email-modal-body {
          display: grid;
          grid-template-columns: minmax(0, 1.2fr) minmax(320px, 0.8fr);
          gap: 16px;
          padding: 16px;
          height: 100%;
          overflow: hidden;
        }

        .email-modal-view {
          display: flex;
          flex-direction: column;
          border: 1px solid var(--panel-border);
          border-radius: 16px;
          background: rgba(15, 23, 42, 0.6);
          overflow: hidden;
        }

        .email-modal-view-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          gap: 12px;
          padding: 12px 14px;
          border-bottom: 1px solid var(--panel-border);
        }

        .modal-from {
          font-size: 13px;
          font-weight: 600;
        }

        .modal-to {
          font-size: 11px;
          color: var(--text-muted);
          margin-top: 2px;
        }

        .email-modal-view-body {
          flex: 1;
          background: #f8fafc;
          position: relative;
          overflow: hidden;
        }

        .email-html-frame {
          width: 100%;
          height: 100%;
          border: none;
          background: #f8fafc;
        }

        .email-text-fallback {
          padding: 16px;
          font-size: 13px;
          color: #0f172a;
          white-space: pre-wrap;
        }

        .email-modal-controls {
          background: rgba(15, 23, 42, 0.6);
          border: 1px solid var(--panel-border);
          border-radius: 16px;
          padding: 12px;
          overflow-y: auto;
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

        .triage-list {
          margin-top: 12px;
          display: grid;
          gap: 8px;
          max-height: 280px;
          overflow-y: auto;
          padding-right: 4px;
        }

        .triage-item {
          display: flex;
          justify-content: space-between;
          gap: 10px;
          padding: 10px;
          border-radius: 12px;
          border: 1px solid var(--panel-border);
          background: rgba(15, 23, 42, 0.65);
        }

        .triage-subject {
          font-size: 12px;
          font-weight: 600;
        }

        .triage-meta {
          font-size: 11px;
          color: var(--text-muted);
          margin-top: 2px;
        }

        .triage-reason {
          font-size: 11px;
          color: var(--text-muted);
          margin-top: 6px;
        }

        .triage-badge {
          align-self: flex-start;
          padding: 4px 8px;
          border-radius: 999px;
          font-size: 10px;
          letter-spacing: 0.1em;
          text-transform: uppercase;
          background: var(--chip-bg);
          color: #fde68a;
        }

        .triage-badge.keep {
          background: rgba(34, 211, 238, 0.18);
          color: #a5f3fc;
        }

        .triage-badge.archive {
          background: rgba(59, 130, 246, 0.2);
          color: #bfdbfe;
        }

        .triage-badge.trash {
          background: rgba(239, 68, 68, 0.22);
          color: #fecaca;
        }

        .triage-badge.spam {
          background: rgba(244, 63, 94, 0.22);
          color: #fecdd3;
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
          white-space: pre-wrap;
          overflow-wrap: anywhere;
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

        .undo-toast {
          position: fixed;
          right: 24px;
          bottom: 24px;
          display: flex;
          align-items: center;
          gap: 16px;
          padding: 12px 14px 18px;
          border-radius: 16px;
          background: var(--panel-bg);
          border: 1px solid var(--panel-border-strong);
          box-shadow: var(--shadow-soft);
          z-index: 30;
          max-width: 460px;
          overflow: hidden;
        }

        .undo-title {
          font-size: 13px;
          font-weight: 600;
        }

        .undo-body {
          font-size: 11px;
          color: var(--text-muted);
          margin-top: 4px;
        }

        .undo-actions {
          display: flex;
          gap: 8px;
          flex-shrink: 0;
        }

        .undo-bar {
          position: absolute;
          left: 14px;
          right: 14px;
          bottom: 8px;
          height: 2px;
          border-radius: 999px;
          background: rgba(148, 163, 184, 0.2);
          overflow: hidden;
        }

        .undo-bar::after {
          content: "";
          position: absolute;
          inset: 0;
          background: linear-gradient(90deg, var(--accent), var(--accent-2));
          transform-origin: left;
          animation: undoShrink var(--undo-duration, 6500ms) linear forwards;
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

        @keyframes undoShrink {
          from {
            transform: scaleX(1);
          }
          to {
            transform: scaleX(0);
          }
        }

        @media (max-width: 1200px) {
          .email-grid {
            grid-template-columns: 1fr;
          }

          .email-modal-body {
            grid-template-columns: 1fr;
            height: auto;
          }

          .email-modal-controls {
            max-height: 45vh;
          }
        }

        @media (max-width: 720px) {
          .email-modal {
            height: 94vh;
          }

          .email-modal-header {
            flex-direction: column;
            align-items: flex-start;
          }

          .modal-actions {
            width: 100%;
            justify-content: space-between;
          }

          .undo-toast {
            left: 16px;
            right: 16px;
            width: auto;
            flex-direction: column;
            align-items: flex-start;
          }

          .undo-actions {
            width: 100%;
            justify-content: flex-start;
          }
        }
      `}</style>
    </div>
  );
}
