import { useEffect, useState } from "react";

export default function ConnectionsPanel({ serverUrl }) {
  const [connections, setConnections] = useState([]);
  const [panicEnabled, setPanicEnabled] = useState(false);
  const [pairings, setPairings] = useState({ pending: [], allowlist: {} });
  const [error, setError] = useState("");

  async function loadConnections() {
    try {
      const resp = await fetch(`${serverUrl}/api/connections`);
      const data = await resp.json();
      if (!resp.ok) throw new Error(data?.error || "connections_failed");
      setConnections(data?.connections || []);
      setPanicEnabled(Boolean(data?.panic?.outboundToolsDisabled));
    } catch (err) {
      setError(err?.message || "connections_failed");
    }
  }

  async function loadPairings() {
    try {
      const resp = await fetch(`${serverUrl}/api/pairings`);
      const data = await resp.json();
      if (!resp.ok) throw new Error(data?.error || "pairings_failed");
      setPairings(data || { pending: [], allowlist: {} });
    } catch {
      // ignore
    }
  }

  useEffect(() => {
    loadConnections();
    loadPairings();
  }, []);

  async function revokeConnection(id) {
    setError("");
    try {
      const resp = await fetch(`${serverUrl}/api/connections/${id}/revoke`, { method: "POST" });
      const data = await resp.json();
      if (!resp.ok) throw new Error(data?.error || "revoke_failed");
      await loadConnections();
    } catch (err) {
      setError(err?.message || "revoke_failed");
    }
  }

  async function togglePanic(next) {
    try {
      const resp = await fetch(`${serverUrl}/api/connections/panic`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ enabled: next })
      });
      const data = await resp.json();
      if (!resp.ok) throw new Error(data?.error || "panic_failed");
      setPanicEnabled(Boolean(data?.enabled));
    } catch (err) {
      setError(err?.message || "panic_failed");
    }
  }

  async function approvePairing(id) {
    try {
      const resp = await fetch(`${serverUrl}/api/pairings/${id}/approve`, { method: "POST" });
      const data = await resp.json();
      if (!resp.ok) throw new Error(data?.error || "pairing_approve_failed");
      await loadPairings();
    } catch (err) {
      setError(err?.message || "pairing_approve_failed");
    }
  }

  async function denyPairing(id) {
    try {
      const resp = await fetch(`${serverUrl}/api/pairings/${id}/deny`, { method: "POST" });
      const data = await resp.json();
      if (!resp.ok) throw new Error(data?.error || "pairing_deny_failed");
      await loadPairings();
    } catch (err) {
      setError(err?.message || "pairing_deny_failed");
    }
  }

  function connectOauth(conn) {
    if (!conn?.connectUrl) return;
    const url = `${serverUrl}${conn.connectUrl}`;
    window.open(url, "_blank", "width=520,height=680");
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      {error && <div style={{ color: "#b91c1c", fontSize: 12 }}>{error}</div>}

      <div style={{ border: "1px solid #e5e7eb", borderRadius: 12, padding: 12, background: "white" }}>
        <div style={{ fontWeight: 600, marginBottom: 6 }}>Connections</div>
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {connections.map(conn => (
            <div key={conn.id} style={{ border: "1px solid #f3f4f6", borderRadius: 10, padding: 10 }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <div>
                  <div style={{ fontWeight: 600 }}>{conn.label}</div>
                  <div style={{ fontSize: 11, color: "#6b7280" }}>{conn.detail}</div>
                  {conn.method && (
                    <div style={{ fontSize: 10, color: "#94a3b8", textTransform: "uppercase", letterSpacing: 0.6 }}>
                      {conn.method}
                    </div>
                  )}
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <span style={{ fontSize: 11, color: conn.status === "connected" ? "#059669" : "#6b7280" }}>
                    {conn.status}
                  </span>
                  {conn.status === "connected" ? (
                    <button onClick={() => revokeConnection(conn.id)} style={{ padding: "4px 8px", borderRadius: 6 }}>
                      Revoke
                    </button>
                  ) : conn.connectUrl ? (
                    <button
                      onClick={() => connectOauth(conn)}
                      disabled={conn.configured === false}
                      style={{ padding: "4px 8px", borderRadius: 6 }}
                    >
                      {conn.connectLabel || "Connect"}
                    </button>
                  ) : (
                    <span style={{ fontSize: 11, color: "#6b7280" }}>{conn.connectLabel || "Setup required"}</span>
                  )}
                </div>
              </div>
              {conn.scopes?.length > 0 && (
                <div style={{ fontSize: 11, color: "#6b7280", marginTop: 6 }}>Scopes: {conn.scopes.join(", ")}</div>
              )}
              {conn.lastUsedAt && (
                <div style={{ fontSize: 11, color: "#6b7280" }}>Last used: {conn.lastUsedAt}</div>
              )}
              {conn.configured === false && (
                <div style={{ fontSize: 11, color: "#b91c1c", marginTop: 6 }}>Missing configuration</div>
              )}
              {conn.setupHint && (
                <div style={{ fontSize: 11, color: "#6b7280", marginTop: 4 }}>{conn.setupHint}</div>
              )}
            </div>
          ))}
          {connections.length === 0 && <div style={{ fontSize: 12 }}>No connections found.</div>}
        </div>
      </div>

      <div style={{ border: "1px solid #e5e7eb", borderRadius: 12, padding: 12, background: "white" }}>
        <div style={{ fontWeight: 600, marginBottom: 6 }}>Panic Switch</div>
        <div style={{ fontSize: 12, color: "#6b7280", marginBottom: 8 }}>
          Disable all outbound tools that can send or modify external systems.
        </div>
        <button onClick={() => togglePanic(!panicEnabled)} style={{ padding: "6px 10px", borderRadius: 8 }}>
          {panicEnabled ? "Disable Panic" : "Enable Panic"}
        </button>
      </div>

      <div style={{ border: "1px solid #e5e7eb", borderRadius: 12, padding: 12, background: "white" }}>
        <div style={{ fontWeight: 600, marginBottom: 6 }}>Pairing Requests</div>
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {(pairings.pending || []).map(request => (
            <div key={request.id} style={{ border: "1px solid #f3f4f6", borderRadius: 10, padding: 10 }}>
              <div style={{ fontWeight: 600 }}>{request.channel} · {request.senderName || request.senderId}</div>
              <div style={{ fontSize: 11, color: "#6b7280" }}>Code: {request.code}</div>
              <div style={{ fontSize: 11, color: "#6b7280" }}>{request.preview}</div>
              <div style={{ display: "flex", gap: 6, marginTop: 6 }}>
                <button onClick={() => approvePairing(request.id)} style={{ padding: "4px 8px", borderRadius: 6 }}>Approve</button>
                <button onClick={() => denyPairing(request.id)} style={{ padding: "4px 8px", borderRadius: 6 }}>Deny</button>
              </div>
            </div>
          ))}
          {(pairings.pending || []).length === 0 && <div style={{ fontSize: 12 }}>No pending pairings.</div>}
        </div>
      </div>
    </div>
  );
}
