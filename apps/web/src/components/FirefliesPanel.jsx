import { useEffect, useState } from "react";

function parseSummary(summaryJson) {
  if (!summaryJson) return "";
  try {
    const summary = typeof summaryJson === "string" ? JSON.parse(summaryJson) : summaryJson;
    if (!summary) return "";
    if (summary.tldr) return summary.tldr;
    if (Array.isArray(summary.overview) && summary.overview.length) return summary.overview.join(" ");
    return summary.summary || "";
  } catch {
    return "";
  }
}

export default function FirefliesPanel({ serverUrl }) {
  const [status, setStatus] = useState(null);
  const [meetings, setMeetings] = useState([]);
  const [recordingEntries, setRecordingEntries] = useState([]);
  const [memoryEntries, setMemoryEntries] = useState([]);
  const [feedbackEntries, setFeedbackEntries] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const [syncLimit, setSyncLimit] = useState(0);
  const [forceSync, setForceSync] = useState(false);
  const [syncStatus, setSyncStatus] = useState("");
  const [syncResult, setSyncResult] = useState(null);

  const [question, setQuestion] = useState("");
  const [answer, setAnswer] = useState("");
  const [citations, setCitations] = useState([]);
  const [asking, setAsking] = useState(false);

  async function loadStatus() {
    const resp = await fetch(`${serverUrl}/api/rag/status`);
    const data = await resp.json();
    if (!resp.ok) throw new Error(data?.error || "rag_status_failed");
    setStatus(data);
  }

  async function loadMeetings(type, setter, search = "") {
    const query = new URLSearchParams({ type, limit: "12" });
    if (search) query.set("search", search);
    const resp = await fetch(`${serverUrl}/api/rag/meetings?${query.toString()}`);
    const data = await resp.json();
    if (!resp.ok) throw new Error(data?.error || "rag_meetings_failed");
    setter(Array.isArray(data.meetings) ? data.meetings : []);
  }

  async function refreshAll() {
    setError("");
    setLoading(true);
    try {
      await loadStatus();
      await loadMeetings("fireflies", setMeetings);
      await loadMeetings("recordings", setRecordingEntries);
      await loadMeetings("memory", setMemoryEntries);
      await loadMeetings("feedback", setFeedbackEntries, "thumbs_up");
    } catch (err) {
      setError(err?.message || "fireflies_panel_failed");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (!serverUrl) return;
    refreshAll();
  }, [serverUrl]);

  const handleSync = async () => {
    setSyncStatus("Syncing Fireflies transcripts...");
    setSyncResult(null);
    try {
      const resp = await fetch(`${serverUrl}/api/fireflies/sync`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ limit: Number(syncLimit), force: Boolean(forceSync) })
      });
      const data = await resp.json();
      if (!resp.ok) {
        const retryNote = data?.retryAt ? ` (retry after ${data.retryAt})` : "";
        throw new Error(`${data?.error || "sync_failed"}${retryNote}`);
      }
      setSyncResult(data);
      setSyncStatus("Sync complete.");
      await refreshAll();
    } catch (err) {
      setSyncStatus(`Sync failed: ${err?.message || "sync_failed"}`);
    }
  };

  const handleAsk = async () => {
    const trimmed = String(question || "").trim();
    if (!trimmed) return;
    setAsking(true);
    setAnswer("");
    setCitations([]);
    try {
      const resp = await fetch(`${serverUrl}/api/rag/ask`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ question: trimmed })
      });
      const data = await resp.json();
      if (!resp.ok) throw new Error(data?.error || "ask_failed");
      setAnswer(data?.answer || "");
      setCitations(Array.isArray(data?.citations) ? data.citations : []);
    } catch (err) {
      setAnswer(`Error: ${err?.message || "ask_failed"}`);
    } finally {
      setAsking(false);
    }
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      <div style={{ fontSize: 14, fontWeight: 600, color: "#111827" }}>Fireflies RAG</div>
      {error && <div style={{ color: "#b91c1c", fontSize: 12 }}>{error}</div>}

      <div style={{ border: "1px solid #e5e7eb", borderRadius: 12, padding: 12, background: "white" }}>
        <div style={{ fontWeight: 600, marginBottom: 6 }}>Status</div>
        {status ? (
          <div style={{ fontSize: 12, color: "#6b7280" }}>
            Meetings: {status.firefliesMeetings} · Recordings: {status.recordingMeetings || 0} · Memory: {status.memoryMeetings} · Feedback: {status.feedbackMeetings} · Chunks: {status.totalChunks}
            {status.vectorStore?.vecEnabled === false ? " · sqlite-vec: fallback" : " · sqlite-vec: on"}
          </div>
        ) : (
          <div style={{ fontSize: 12, color: "#6b7280" }}>{loading ? "Loading..." : "No status yet."}</div>
        )}
      </div>

      <div style={{ display: "grid", gap: 12, gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))" }}>
        <div style={{ border: "1px solid #e5e7eb", borderRadius: 12, padding: 12, background: "white" }}>
          <div style={{ fontWeight: 600, marginBottom: 8 }}>Sync Fireflies</div>
          <label style={{ display: "block", fontSize: 12, color: "#6b7280" }}>Limit (0 = all)</label>
          <input
            type="number"
            value={syncLimit}
            onChange={(e) => setSyncLimit(e.target.value)}
            style={{ width: "100%", padding: 8, borderRadius: 8, border: "1px solid #d1d5db", marginTop: 6 }}
          />
          <label style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 10, fontSize: 12 }}>
            <input type="checkbox" checked={forceSync} onChange={(e) => setForceSync(e.target.checked)} />
            Force re-sync
          </label>
          <button onClick={handleSync} style={{ marginTop: 10, padding: "6px 10px", borderRadius: 8 }}>
            Sync Fireflies
          </button>
          {syncStatus && <div style={{ marginTop: 8, fontSize: 12, color: "#374151" }}>{syncStatus}</div>}
          {syncResult && (
            <pre style={{ marginTop: 8, fontSize: 11, background: "#f9fafb", padding: 8, borderRadius: 8, overflowX: "auto" }}>
              {JSON.stringify(syncResult, null, 2)}
            </pre>
          )}
        </div>

        <div style={{ border: "1px solid #e5e7eb", borderRadius: 12, padding: 12, background: "white" }}>
          <div style={{ fontWeight: 600, marginBottom: 8 }}>Ask Fireflies RAG</div>
          <textarea
            value={question}
            onChange={(e) => setQuestion(e.target.value)}
            rows={4}
            placeholder="Summarize my last week of recordings."
            style={{ width: "100%", padding: 8, borderRadius: 8, border: "1px solid #d1d5db" }}
          />
          <button
            onClick={handleAsk}
            disabled={asking}
            style={{ marginTop: 10, padding: "6px 10px", borderRadius: 8 }}
          >
            {asking ? "Asking..." : "Ask"}
          </button>
          {answer && (
            <div style={{ marginTop: 10, fontSize: 12, whiteSpace: "pre-wrap" }}>{answer}</div>
          )}
        </div>
      </div>

      <div style={{ border: "1px solid #e5e7eb", borderRadius: 12, padding: 12, background: "white" }}>
        <div style={{ fontWeight: 600, marginBottom: 8 }}>Recent Meeting Summaries</div>
        {meetings.length === 0 ? (
          <div style={{ fontSize: 12, color: "#6b7280" }}>No meetings indexed yet.</div>
        ) : (
          <div style={{ display: "grid", gap: 8 }}>
            {meetings.map(item => {
              const summary = parseSummary(item.summary_json);
              return (
                <div key={item.id} style={{ border: "1px solid #f3f4f6", borderRadius: 10, padding: 10 }}>
                  <div style={{ fontWeight: 600 }}>{item.title || "Meeting"}</div>
                  <div style={{ fontSize: 11, color: "#6b7280" }}>{item.occurred_at || "Unknown date"}</div>
                  {summary && <div style={{ marginTop: 6, fontSize: 12 }}>{summary}</div>}
                  {item.source_url && (
                    <a href={item.source_url} target="_blank" rel="noreferrer" style={{ fontSize: 12, color: "#2563eb" }}>
                      Open transcript
                    </a>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      <div style={{ border: "1px solid #e5e7eb", borderRadius: 12, padding: 12, background: "white" }}>
        <div style={{ fontWeight: 600, marginBottom: 8 }}>Local Recordings</div>
        {recordingEntries.length === 0 ? (
          <div style={{ fontSize: 12, color: "#6b7280" }}>No recordings indexed yet.</div>
        ) : (
          <div style={{ display: "grid", gap: 8 }}>
            {recordingEntries.map(item => {
              const summary = parseSummary(item.summary_json);
              return (
                <div key={item.id} style={{ border: "1px solid #f3f4f6", borderRadius: 10, padding: 10 }}>
                  <div style={{ fontWeight: 600 }}>{item.title || "Recording"}</div>
                  <div style={{ fontSize: 11, color: "#6b7280" }}>{item.occurred_at || "Unknown date"}</div>
                  {summary && <div style={{ marginTop: 6, fontSize: 12 }}>{summary}</div>}
                  {item.source_url && (
                    <a href={item.source_url} target="_blank" rel="noreferrer" style={{ fontSize: 12, color: "#2563eb" }}>
                      Open audio
                    </a>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      <div style={{ display: "grid", gap: 12, gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))" }}>
        <div style={{ border: "1px solid #e5e7eb", borderRadius: 12, padding: 12, background: "white" }}>
          <div style={{ fontWeight: 600, marginBottom: 6 }}>Memory indexed into RAG</div>
          {memoryEntries.length === 0 ? (
            <div style={{ fontSize: 12, color: "#6b7280" }}>No memory entries yet.</div>
          ) : (
            <div style={{ display: "grid", gap: 6 }}>
              {memoryEntries.map(entry => (
                <div key={entry.id} style={{ fontSize: 12 }}>
                  <div style={{ fontWeight: 600 }}>{entry.title || "Memory"}</div>
                  <div style={{ color: "#6b7280" }}>{entry.occurred_at || ""}</div>
                </div>
              ))}
            </div>
          )}
        </div>

        <div style={{ border: "1px solid #e5e7eb", borderRadius: 12, padding: 12, background: "white" }}>
          <div style={{ fontWeight: 600, marginBottom: 6 }}>Thumbs‑up feedback indexed</div>
          {feedbackEntries.length === 0 ? (
            <div style={{ fontSize: 12, color: "#6b7280" }}>No feedback entries yet.</div>
          ) : (
            <div style={{ display: "grid", gap: 6 }}>
              {feedbackEntries.map(entry => (
                <div key={entry.id} style={{ fontSize: 12 }}>
                  <div style={{ fontWeight: 600 }}>{entry.title || "Feedback"}</div>
                  <div style={{ color: "#6b7280" }}>{entry.occurred_at || ""}</div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {citations.length > 0 && (
        <div style={{ border: "1px solid #e5e7eb", borderRadius: 12, padding: 12, background: "white" }}>
          <div style={{ fontWeight: 600, marginBottom: 6 }}>Citations</div>
          <div style={{ display: "grid", gap: 8 }}>
            {citations.map((cite, idx) => (
              <details key={`${cite.chunk_id}-${idx}`} style={{ border: "1px solid #f3f4f6", borderRadius: 10, padding: 8 }}>
                <summary style={{ cursor: "pointer", fontWeight: 600 }}>
                  {cite.meeting_title || "Meeting"} ({cite.occurred_at || "Unknown date"})
                </summary>
                <div style={{ fontSize: 11, color: "#6b7280", marginTop: 4 }}>{cite.chunk_id}</div>
                <div style={{ marginTop: 6, whiteSpace: "pre-wrap", fontSize: 12 }}>{cite.snippet}</div>
              </details>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
