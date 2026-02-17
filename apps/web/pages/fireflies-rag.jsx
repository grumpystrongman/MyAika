import { useState } from "react";

const DEFAULTS = {
  topK: 8,
  limit: 0
};

export default function FirefliesRagPage() {
  const [syncLimit, setSyncLimit] = useState(DEFAULTS.limit);
  const [forceSync, setForceSync] = useState(false);
  const [syncStatus, setSyncStatus] = useState("");
  const [syncResult, setSyncResult] = useState(null);
  const [syncing, setSyncing] = useState(false);

  const [question, setQuestion] = useState("");
  const [topK, setTopK] = useState(DEFAULTS.topK);
  const [answer, setAnswer] = useState("");
  const [citations, setCitations] = useState([]);
  const [debug, setDebug] = useState(null);
  const [asking, setAsking] = useState(false);
  const [lastQuestion, setLastQuestion] = useState("");
  const [lastAnswer, setLastAnswer] = useState("");
  const [lastCitations, setLastCitations] = useState([]);
  const [feedbackRating, setFeedbackRating] = useState("");
  const [feedbackStatus, setFeedbackStatus] = useState("");

  const handleSync = async () => {
    setSyncing(true);
    setSyncStatus("Syncing Fireflies transcripts...");
    setSyncResult(null);
    try {
      const resp = await fetch("/api/fireflies/sync", {
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
    } catch (err) {
      setSyncStatus(`Sync failed: ${err?.message || "sync_failed"}`);
    } finally {
      setSyncing(false);
    }
  };

  const handleAsk = async () => {
    const trimmed = String(question || "").trim();
    if (!trimmed) return;
    setAsking(true);
    setAnswer("");
    setCitations([]);
    setDebug(null);
    try {
      const resp = await fetch("/api/rag/ask", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ question: trimmed, topK: Number(topK) || 8 })
      });
      const data = await resp.json();
      if (!resp.ok) throw new Error(data?.error || "ask_failed");
      setAnswer(data?.answer || "");
      const nextCitations = Array.isArray(data?.citations) ? data.citations : [];
      setCitations(nextCitations);
      setDebug(data?.debug || null);
      setLastQuestion(trimmed);
      setLastAnswer(data?.answer || "");
      setLastCitations(nextCitations);
      setFeedbackRating("");
      setFeedbackStatus("");
    } catch (err) {
      setAnswer(`Error: ${err?.message || "ask_failed"}`);
    } finally {
      setAsking(false);
    }
  };

  const submitFeedback = async (rating) => {
    if (!lastAnswer) return;
    setFeedbackStatus("Saving feedback...");
    setFeedbackRating(rating);
    try {
      const resp = await fetch("/api/feedback", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          source: "rag",
          rating,
          question: lastQuestion,
          answer: lastAnswer,
          messageId: `rag-${Date.now()}`,
          citations: lastCitations
        })
      });
      const data = await resp.json();
      if (!resp.ok) throw new Error(data?.error || "feedback_failed");
      setFeedbackStatus("Feedback saved.");
    } catch (err) {
      setFeedbackStatus(`Feedback failed: ${err?.message || "feedback_failed"}`);
    }
  };

  return (
    <div style={{ minHeight: "100vh", background: "#f4f6fb", color: "#111827", padding: "32px 20px" }}>
      <div style={{ maxWidth: 980, margin: "0 auto" }}>
        <h1 style={{ fontSize: 28, marginBottom: 6 }}>Fireflies RAG</h1>
        <p style={{ color: "#6b7280", marginBottom: 24 }}>
          Sync Fireflies transcripts locally, then ask questions with citations.
        </p>

        <div style={{ display: "grid", gap: 20, gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))" }}>
          <div style={{ background: "#ffffff", borderRadius: 16, padding: 20, border: "1px solid #e5e7eb" }}>
            <h2 style={{ fontSize: 18, marginBottom: 12 }}>Sync Fireflies</h2>
            <label style={{ display: "block", fontSize: 13, color: "#6b7280" }}>Limit (0 = all)</label>
            <input
              type="number"
              value={syncLimit}
              onChange={(e) => setSyncLimit(e.target.value)}
              style={{ width: "100%", padding: 10, borderRadius: 10, border: "1px solid #d1d5db", marginTop: 6 }}
            />
            <label style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 12, fontSize: 14 }}>
              <input
                type="checkbox"
                checked={forceSync}
                onChange={(e) => setForceSync(e.target.checked)}
              />
              Force re-sync
            </label>
            <button
              onClick={handleSync}
              disabled={syncing}
              style={{
                marginTop: 14,
                padding: "10px 14px",
                borderRadius: 10,
                border: "none",
                background: syncing ? "#93c5fd" : "#2563eb",
                color: "#fff",
                cursor: syncing ? "not-allowed" : "pointer"
              }}
            >
              {syncing ? "Syncing..." : "Sync Fireflies"}
            </button>
            {syncStatus && (
              <div style={{ marginTop: 12, fontSize: 13, color: "#374151" }}>{syncStatus}</div>
            )}
            {syncResult && (
              <pre style={{ marginTop: 12, fontSize: 12, background: "#f9fafb", padding: 12, borderRadius: 10, overflowX: "auto" }}>
                {JSON.stringify(syncResult, null, 2)}
              </pre>
            )}
          </div>

          <div style={{ background: "#ffffff", borderRadius: 16, padding: 20, border: "1px solid #e5e7eb" }}>
            <h2 style={{ fontSize: 18, marginBottom: 12 }}>Ask</h2>
            <label style={{ display: "block", fontSize: 13, color: "#6b7280" }}>Question</label>
            <textarea
              value={question}
              onChange={(e) => setQuestion(e.target.value)}
              rows={4}
              style={{ width: "100%", padding: 10, borderRadius: 10, border: "1px solid #d1d5db", marginTop: 6 }}
              placeholder="What did we decide about ED wait times?"
            />
            <label style={{ display: "block", fontSize: 13, color: "#6b7280", marginTop: 12 }}>Top K</label>
            <input
              type="number"
              value={topK}
              onChange={(e) => setTopK(e.target.value)}
              style={{ width: 120, padding: 8, borderRadius: 10, border: "1px solid #d1d5db", marginTop: 6 }}
            />
            <button
              onClick={handleAsk}
              disabled={asking}
              style={{
                marginTop: 14,
                padding: "10px 14px",
                borderRadius: 10,
                border: "none",
                background: asking ? "#93c5fd" : "#111827",
                color: "#fff",
                cursor: asking ? "not-allowed" : "pointer"
              }}
            >
              {asking ? "Asking..." : "Ask"}
            </button>
          </div>
        </div>

        <div style={{ marginTop: 24, background: "#ffffff", borderRadius: 16, padding: 20, border: "1px solid #e5e7eb" }}>
          <h2 style={{ fontSize: 18, marginBottom: 12 }}>Answer</h2>
          {answer ? (
            <div style={{ whiteSpace: "pre-wrap", lineHeight: 1.5, maxHeight: 320, overflowY: "auto", paddingRight: 6 }}>
              {answer}
            </div>
          ) : (
            <div style={{ color: "#6b7280" }}>No answer yet. Sync transcripts and ask a question.</div>
          )}
          {answer && (
            <div style={{ marginTop: 12, display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
              <button
                onClick={() => submitFeedback("up")}
                style={{
                  padding: "6px 10px",
                  borderRadius: 8,
                  border: "1px solid #d1d5db",
                  background: feedbackRating === "up" ? "#dcfce7" : "white",
                  fontSize: 12
                }}
              >
                Thumbs Up
              </button>
              <button
                onClick={() => submitFeedback("down")}
                style={{
                  padding: "6px 10px",
                  borderRadius: 8,
                  border: "1px solid #d1d5db",
                  background: feedbackRating === "down" ? "#fee2e2" : "white",
                  fontSize: 12
                }}
              >
                Thumbs Down
              </button>
              {feedbackStatus && (
                <div style={{ fontSize: 12, color: "#6b7280" }}>{feedbackStatus}</div>
              )}
            </div>
          )}
          {debug && (
            <pre style={{ marginTop: 12, fontSize: 12, background: "#f9fafb", padding: 12, borderRadius: 10, overflowX: "auto" }}>
              {JSON.stringify(debug, null, 2)}
            </pre>
          )}
        </div>

        <div style={{ marginTop: 24 }}>
          <h2 style={{ fontSize: 18, marginBottom: 12 }}>Citations</h2>
          {citations.length === 0 ? (
            <div style={{ color: "#6b7280" }}>No citations yet.</div>
          ) : (
            <div style={{ display: "grid", gap: 12 }}>
              {citations.map((cite, idx) => (
                <details key={`${cite.chunk_id}-${idx}`} style={{ background: "#ffffff", borderRadius: 12, border: "1px solid #e5e7eb", padding: 12 }}>
                  <summary style={{ cursor: "pointer", fontWeight: 600 }}>
                    {cite.meeting_title || "Meeting"} ({cite.occurred_at || "Unknown date"})
                  </summary>
                  <div style={{ fontSize: 12, color: "#6b7280", marginTop: 6 }}>{cite.chunk_id}</div>
                  <div style={{ marginTop: 8, whiteSpace: "pre-wrap", lineHeight: 1.5 }}>{cite.snippet}</div>
                </details>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
