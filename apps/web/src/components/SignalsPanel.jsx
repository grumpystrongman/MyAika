import { useEffect, useMemo, useState } from "react";

function buildUrl(base, path) {
  if (!base) return path;
  return `${base}${path}`;
}

function formatTime(value) {
  if (!value) return "--";
  const ts = Date.parse(value);
  if (!Number.isFinite(ts)) return value;
  return new Date(ts).toLocaleString();
}

function formatScore(value) {
  if (value == null || Number.isNaN(value)) return "--";
  return Number(value).toFixed(2);
}

function extractSnippet(doc) {
  if (doc.summary) return doc.summary.slice(0, 220);
  if (doc.cleaned_text) return doc.cleaned_text.slice(0, 220);
  const bullets = doc.summary_json?.bullets || [];
  if (bullets.length) return bullets.join(" ").slice(0, 220);
  return "";
}

function tagBadge(tag, key) {
  return (
    <span key={key} style={{ padding: "2px 6px", background: "var(--panel-bg-soft)", borderRadius: 999, fontSize: 11, color: "var(--text-muted)" }}>
      {tag}
    </span>
  );
}

export default function SignalsPanel({ serverUrl = "", fullPage = false }) {
  const [status, setStatus] = useState(null);
  const [docs, setDocs] = useState([]);
  const [trends, setTrends] = useState([]);
  const [loading, setLoading] = useState(false);
  const [runState, setRunState] = useState("");
  const [selectedDoc, setSelectedDoc] = useState(null);
  const [refreshKey, setRefreshKey] = useState(0);

  const baseUrl = serverUrl || "";

  const fetchStatus = async () => {
    const resp = await fetch(buildUrl(baseUrl, "/api/signals/status"));
    if (!resp.ok) throw new Error("status_failed");
    return resp.json();
  };

  const fetchDocs = async () => {
    const resp = await fetch(buildUrl(baseUrl, "/api/signals/docs?limit=80"));
    if (!resp.ok) throw new Error("docs_failed");
    const data = await resp.json();
    return data.items || [];
  };

  const fetchTrends = async () => {
    const resp = await fetch(buildUrl(baseUrl, "/api/signals/trends?limit=12"));
    if (!resp.ok) throw new Error("trends_failed");
    const data = await resp.json();
    return data.items || [];
  };

  const refresh = async () => {
    setLoading(true);
    try {
      const [statusData, docData, trendData] = await Promise.all([
        fetchStatus(),
        fetchDocs(),
        fetchTrends()
      ]);
      setStatus(statusData);
      setDocs(docData);
      setTrends(trendData);
    } catch (err) {
      setRunState(`Refresh failed: ${err?.message || "unknown"}`);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    refresh();
  }, [refreshKey]);

  const runNow = async () => {
    setRunState("Running signals ingestion...");
    try {
      const resp = await fetch(buildUrl(baseUrl, "/api/signals/run"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({})
      });
      const data = await resp.json();
      if (!resp.ok) throw new Error(data?.error || "run_failed");
      setRunState(`Run finished: ${data.status} (ingested ${data.ingested})`);
      setRefreshKey(prev => prev + 1);
    } catch (err) {
      setRunState(`Run failed: ${err?.message || "run_failed"}`);
    }
  };

  const lastRun = status?.latestRun || null;

  const topSignals = useMemo(() => {
    const signalTags = ["energy_supply", "energy_inventory", "shipping_disruption", "extreme_weather", "drought_risk", "wildfire_risk", "regulatory_risk"];
    return docs.filter(doc => (doc.signal_tags || []).some(tag => signalTags.includes(tag))).slice(0, 10);
  }, [docs]);

  return (
    <div style={{
      minHeight: fullPage ? "100vh" : "auto",
      padding: fullPage ? "32px 24px" : "16px",
      background: "var(--app-gradient)",
      color: "var(--text-primary)"
    }}>
      <div style={{ maxWidth: 1100, margin: "0 auto" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
          <div>
            <div style={{ fontSize: 28, fontWeight: 700 }}>Signals Ingestion</div>
            <div style={{ color: "var(--text-muted)", marginTop: 6 }}>
              Daily macro, energy, weather, and supply chain signals. Informational only — not financial advice.
            </div>
          </div>
          <div style={{ display: "flex", gap: 10 }}>
            <button
              onClick={() => setRefreshKey(prev => prev + 1)}
              disabled={loading}
              style={{ padding: "8px 14px", borderRadius: 10, border: "1px solid var(--panel-border-strong)", background: "var(--panel-bg)" }}
            >
              {loading ? "Refreshing..." : "Refresh"}
            </button>
            <button
              onClick={runNow}
              style={{ padding: "8px 14px", borderRadius: 10, border: "1px solid var(--accent)", background: "var(--accent)", color: "#0b0f1f", fontWeight: 600 }}
            >
              Run Now
            </button>
          </div>
        </div>

        {runState && (
          <div style={{ marginTop: 12, padding: 10, borderRadius: 10, background: "#fef3c7", color: "#92400e", fontSize: 12 }}>
            {runState}
          </div>
        )}

        <div style={{ display: "grid", gap: 16, gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))", marginTop: 20 }}>
          <div style={{ background: "var(--panel-bg)", borderRadius: 16, padding: 16, border: "1px solid var(--panel-border)" }}>
            <div style={{ fontWeight: 600, marginBottom: 8 }}>Last Run</div>
            <div style={{ fontSize: 12, color: "var(--text-muted)" }}>Status: {lastRun?.status || "--"}</div>
            <div style={{ fontSize: 12, color: "var(--text-muted)" }}>Started: {formatTime(lastRun?.started_at)}</div>
            <div style={{ fontSize: 12, color: "var(--text-muted)" }}>Finished: {formatTime(lastRun?.finished_at)}</div>
          </div>
          <div style={{ background: "var(--panel-bg)", borderRadius: 16, padding: 16, border: "1px solid var(--panel-border)" }}>
            <div style={{ fontWeight: 600, marginBottom: 8 }}>Counts</div>
            <div style={{ fontSize: 12, color: "var(--text-muted)" }}>Ingested: {lastRun?.ingested_count ?? 0}</div>
            <div style={{ fontSize: 12, color: "var(--text-muted)" }}>Skipped: {lastRun?.skipped_count ?? 0}</div>
            <div style={{ fontSize: 12, color: "var(--text-muted)" }}>Expired: {lastRun?.expired_count ?? 0}</div>
            <div style={{ fontSize: 12, color: "var(--text-muted)" }}>Errors: {lastRun?.error_count ?? 0}</div>
          </div>
          <div style={{ background: "var(--panel-bg)", borderRadius: 16, padding: 16, border: "1px solid var(--panel-border)" }}>
            <div style={{ fontWeight: 600, marginBottom: 8 }}>Sources Pulled</div>
            <div style={{ fontSize: 12, color: "var(--text-muted)" }}>Configured: {status?.config?.source_count ?? "--"}</div>
            <div style={{ fontSize: 12, color: "var(--text-muted)" }}>Report: {lastRun?.report_path ? lastRun.report_path.split(/[\\/]/).pop() : "--"}</div>
            {lastRun?.sources?.length ? (
              <div style={{ marginTop: 8, display: "grid", gap: 4, fontSize: 11, color: "var(--text-muted)" }}>
                {lastRun.sources.slice(0, 6).map(source => (
                  <div key={source.source_id}>
                    {source.source_id}: {source.ingested} ingested / {source.pulled} pulled
                  </div>
                ))}
              </div>
            ) : null}
          </div>
        </div>

        <div style={{ marginTop: 24, display: "grid", gap: 16, gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))" }}>
          <div style={{ background: "var(--panel-bg)", borderRadius: 16, padding: 16, border: "1px solid var(--panel-border)" }}>
            <div style={{ fontWeight: 600, marginBottom: 10 }}>Top Trends</div>
            {trends.length === 0 ? (
              <div style={{ fontSize: 12, color: "var(--text-muted)" }}>No trend clusters yet.</div>
            ) : (
              <div style={{ display: "grid", gap: 10 }}>
                {trends.map(trend => (
                  <div key={trend.trend_id} style={{ border: "1px solid var(--panel-border)", borderRadius: 12, padding: 10 }}>
                    <div style={{ fontWeight: 600 }}>{trend.label || "Trend"}</div>
                    <div style={{ fontSize: 11, color: "var(--text-muted)" }}>Docs: {trend.doc_count}</div>
                    {trend.top_entities?.length ? (
                      <div style={{ fontSize: 11, color: "var(--text-muted)", marginTop: 6 }}>
                        Entities: {trend.top_entities.join(", ")}
                      </div>
                    ) : null}
                    {trend.note ? (
                      <div style={{ fontSize: 11, color: "var(--text-muted)", marginTop: 6 }}>{trend.note}</div>
                    ) : null}
                  </div>
                ))}
              </div>
            )}
          </div>

          <div style={{ background: "var(--panel-bg)", borderRadius: 16, padding: 16, border: "1px solid var(--panel-border)" }}>
            <div style={{ fontWeight: 600, marginBottom: 10 }}>Top Signals</div>
            {topSignals.length === 0 ? (
              <div style={{ fontSize: 12, color: "var(--text-muted)" }}>No signal-tagged docs yet.</div>
            ) : (
              <div style={{ display: "grid", gap: 10 }}>
                {topSignals.map(doc => (
                  <button
                    key={doc.doc_id}
                    type="button"
                    onClick={() => setSelectedDoc(doc)}
                    style={{ textAlign: "left", background: "var(--panel-bg-soft)", border: "1px solid var(--panel-border)", borderRadius: 10, padding: 10, cursor: "pointer" }}
                  >
                    <div style={{ fontWeight: 600 }}>{doc.title || "Signal"}</div>
                    <div style={{ fontSize: 11, color: "var(--text-muted)" }}>{extractSnippet(doc)}</div>
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>

        <div style={{ marginTop: 24, background: "var(--panel-bg)", borderRadius: 16, padding: 16, border: "1px solid var(--panel-border)" }}>
          <div style={{ fontWeight: 600, marginBottom: 10 }}>Latest Documents</div>
          {docs.length === 0 ? (
            <div style={{ fontSize: 12, color: "var(--text-muted)" }}>No documents ingested yet.</div>
          ) : (
            <div style={{ display: "grid", gap: 10 }}>
              {docs.slice(0, 25).map(doc => (
                <button
                  key={doc.doc_id}
                  type="button"
                  onClick={() => setSelectedDoc(doc)}
                  style={{ textAlign: "left", background: "var(--panel-bg)", border: "1px solid var(--panel-border)", borderRadius: 12, padding: 12, cursor: "pointer" }}
                >
                  <div style={{ display: "flex", justifyContent: "space-between", gap: 10 }}>
                    <div style={{ fontWeight: 600 }}>{doc.title || "Document"}</div>
                    <div style={{ fontSize: 11, color: "var(--text-muted)" }}>{formatTime(doc.published_at)}</div>
                  </div>
                  <div style={{ fontSize: 11, color: "var(--text-muted)", marginTop: 4 }}>{extractSnippet(doc)}</div>
                  <div style={{ display: "flex", gap: 6, marginTop: 6, flexWrap: "wrap" }}>
                    {(doc.signal_tags || []).slice(0, 4).map(tag => tagBadge(tag, `${doc.doc_id}-${tag}`))}
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      {selectedDoc && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(15,23,42,0.4)", display: "flex", alignItems: "center", justifyContent: "center", padding: 16, zIndex: 80 }}>
          <div style={{ width: "min(840px, 94vw)", maxHeight: "85vh", overflow: "auto", background: "var(--panel-bg)", borderRadius: 16, padding: 18, border: "1px solid var(--panel-border)" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
              <div>
                <div style={{ fontWeight: 700, fontSize: 16 }}>{selectedDoc.title || "Signal Doc"}</div>
                <div style={{ fontSize: 12, color: "var(--text-muted)" }}>{selectedDoc.source_title || selectedDoc.source_id} · {formatTime(selectedDoc.published_at)}</div>
              </div>
              <button onClick={() => setSelectedDoc(null)} style={{ border: "1px solid var(--panel-border)", padding: "6px 10px", borderRadius: 8, background: "var(--panel-bg)" }}>
                Close
              </button>
            </div>
            <div style={{ fontSize: 12, color: "var(--text-muted)", marginBottom: 10 }}>
              Freshness: {formatScore(selectedDoc.freshness_score)} · Reliability: {formatScore(selectedDoc.reliability_score)}
            </div>
            <div style={{ fontSize: 12, color: "var(--text-muted)", whiteSpace: "pre-wrap" }}>
              {selectedDoc.cleaned_text || selectedDoc.summary || selectedDoc.raw_text || "No text available."}
            </div>
            {(selectedDoc.signal_tags || []).length ? (
              <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginTop: 10 }}>
                {selectedDoc.signal_tags.map(tag => tagBadge(tag, `detail-${tag}`))}
              </div>
            ) : null}
          </div>
        </div>
      )}
    </div>
  );
}




