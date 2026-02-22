import { useEffect, useMemo, useState } from "react";

const ACTION_TYPES = [
  "email.send",
  "file.delete",
  "system.modify",
  "install.software",
  "api.external_post",
  "messaging.slackPost",
  "messaging.telegramSend",
  "messaging.telegramVoiceSend",
  "messaging.discordSend",
  "messaging.whatsapp.send",
  "messaging.sms.send",
  "desktop.run",
  "desktop.launch",
  "desktop.input",
  "desktop.key",
  "desktop.mouse",
  "desktop.clipboard",
  "desktop.screenshot",
  "desktop.vision",
  "desktop.uia",
  "desktop.step",
  "finance.transfer",
  "finance.trade",
  "kill_switch.disable"
];

export default function SafetyPanel({ serverUrl }) {
  const [policy, setPolicy] = useState(null);
  const [policyError, setPolicyError] = useState("");
  const [approvals, setApprovals] = useState([]);
  const [auditEvents, setAuditEvents] = useState([]);
  const [killSwitch, setKillSwitch] = useState({ enabled: false });
  const [message, setMessage] = useState("");
  const [adminToken, setAdminToken] = useState("");

  const protectedPathsText = useMemo(() => (policy?.protected_paths || []).join("\n"), [policy]);
  const allowlistText = useMemo(() => (policy?.network_rules?.allowlist_domains || []).join("\n"), [policy]);

  function authHeaders() {
    const headers = { "Content-Type": "application/json" };
    if (adminToken) headers["x-admin-token"] = adminToken;
    return headers;
  }

  async function loadPolicy() {
    const resp = await fetch(`${serverUrl}/api/safety/policy`, { headers: authHeaders() });
    const data = await resp.json();
    if (!resp.ok) throw new Error(data?.error || "policy_load_failed");
    setPolicy(data.policy);
  }

  async function loadApprovals() {
    const resp = await fetch(`${serverUrl}/api/approvals?status=pending`, { headers: authHeaders() });
    const data = await resp.json();
    setApprovals(Array.isArray(data.approvals) ? data.approvals : []);
  }

  async function loadAudit() {
    const resp = await fetch(`${serverUrl}/api/audit?limit=50`, { headers: authHeaders() });
    const data = await resp.json();
    setAuditEvents(Array.isArray(data.events) ? data.events : []);
  }

  async function loadKillSwitch() {
    const resp = await fetch(`${serverUrl}/api/safety/kill-switch`, { headers: authHeaders() });
    const data = await resp.json();
    setKillSwitch(data.killSwitch || { enabled: false });
  }

  async function refreshAll() {
    setPolicyError("");
    try {
      await loadPolicy();
      await loadApprovals();
      await loadAudit();
      await loadKillSwitch();
    } catch (err) {
      setPolicyError(err?.message || "safety_load_failed");
    }
  }

  useEffect(() => {
    if (!serverUrl) return;
    try {
      const stored = window.localStorage.getItem("aika_admin_token") || "";
      setAdminToken(stored);
    } catch {
      // ignore storage errors
    }
  }, [serverUrl]);

  useEffect(() => {
    if (!serverUrl) return;
    refreshAll();
  }, [serverUrl, adminToken]);

  async function savePolicy(nextPolicy) {
    setMessage("");
    const resp = await fetch(`${serverUrl}/api/safety/policy`, {
      method: "POST",
      headers: authHeaders(),
      body: JSON.stringify({ policy: nextPolicy })
    });
    const data = await resp.json();
    if (!resp.ok) {
      if (data?.approval) {
        setMessage("Approval required to apply this change.");
        await loadApprovals();
        return;
      }
      throw new Error(data?.error || "policy_save_failed");
    }
    setPolicy(data.policy);
    setMessage("Policy saved.");
  }

  async function handleApproval(id, action) {
    const endpoint = action === "approve" ? "approve" : "deny";
    const resp = await fetch(`${serverUrl}/api/approvals/${id}/${endpoint}`, {
      method: "POST",
      headers: authHeaders(),
      body: JSON.stringify({})
    });
    await resp.json();
    await loadApprovals();
  }

  async function handleApproveExecute(id) {
    setMessage("");
    try {
      const approveResp = await fetch(`${serverUrl}/api/approvals/${id}/approve`, {
        method: "POST",
        headers: authHeaders()
      });
      const approved = await approveResp.json();
      if (!approveResp.ok) throw new Error(approved?.error || "approval_failed");
      const token = approved?.approval?.token;
      if (!token) {
        setMessage("Approved.");
        await loadApprovals();
        return;
      }
      const execResp = await fetch(`${serverUrl}/api/approvals/${id}/execute`, {
        method: "POST",
        headers: authHeaders(),
        body: JSON.stringify({ token })
      });
      const execData = await execResp.json();
      if (!execResp.ok) throw new Error(execData?.error || "approval_execute_failed");
      setMessage("Approved action executed.");
    } catch (err) {
      setMessage(err?.message || "approval_execute_failed");
    }
    await loadApprovals();
  }

  async function toggleKillSwitch(next) {
    const resp = await fetch(`${serverUrl}/api/safety/kill-switch`, {
      method: "POST",
      headers: authHeaders(),
      body: JSON.stringify({ enabled: next })
    });
    const data = await resp.json();
    if (!resp.ok) {
      if (data?.approval) {
        setMessage("Approval required to disable kill switch.");
        await loadApprovals();
        return;
      }
      throw new Error(data?.error || "kill_switch_failed");
    }
    setKillSwitch(data.killSwitch);
  }

  if (!policy) {
    return <div style={{ fontSize: 12 }}>{policyError || "Loading safety policy..."}</div>;
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      {policyError && <div style={{ color: "#b91c1c", fontSize: 12 }}>{policyError}</div>}
      {message && <div style={{ fontSize: 12, color: "var(--accent)" }}>{message}</div>}

      <div style={{ border: "1px solid var(--panel-border)", borderRadius: 12, padding: 12, background: "var(--panel-bg)" }}>
        <div style={{ fontWeight: 600, marginBottom: 6 }}>Admin access</div>
        <label style={{ fontSize: 12, display: "block" }}>
          Admin token (local only)
          <input
            type="password"
            value={adminToken}
            onChange={(e) => {
              const next = e.target.value;
              setAdminToken(next);
              try {
                window.localStorage.setItem("aika_admin_token", next);
              } catch {
                // ignore storage errors
              }
            }}
            style={{ width: "100%", padding: 8, marginTop: 4, borderRadius: 8, border: "1px solid var(--panel-border-strong)" }}
          />
        </label>
      </div>

      <div style={{ border: "1px solid var(--panel-border)", borderRadius: 12, padding: 12, background: "var(--panel-bg)" }}>
        <div style={{ fontWeight: 600, marginBottom: 6 }}>Autonomy</div>
        <div style={{ display: "grid", gap: 8 }}>
          <label style={{ fontSize: 12 }}>Autonomy level</label>
          <select
            value={policy.autonomy_level}
            onChange={(e) => setPolicy({ ...policy, autonomy_level: e.target.value })}
            style={{ padding: 6, borderRadius: 6 }}
          >
            <option value="assistive_only">Assistive only</option>
            <option value="supervised">Supervised</option>
            <option value="autonomous">Autonomous</option>
          </select>
          <label style={{ fontSize: 12 }}>Risk threshold: {policy.risk_threshold}</label>
          <input
            type="range"
            min={0}
            max={100}
            value={policy.risk_threshold}
            onChange={(e) => setPolicy({ ...policy, risk_threshold: Number(e.target.value) })}
          />
          <button onClick={() => savePolicy(policy)} style={{ padding: "6px 10px", borderRadius: 8 }}>
            Save policy
          </button>
        </div>
      </div>

      <div style={{ border: "1px solid var(--panel-border)", borderRadius: 12, padding: 12, background: "var(--panel-bg)" }}>
        <div style={{ fontWeight: 600, marginBottom: 6 }}>Requires approval</div>
        <div style={{ display: "grid", gap: 6 }}>
          {ACTION_TYPES.map(action => (
            <label key={action} style={{ fontSize: 12, display: "flex", gap: 6, alignItems: "center" }}>
              <input
                type="checkbox"
                checked={policy.requires_approval?.includes(action)}
                onChange={(e) => {
                  const next = new Set(policy.requires_approval || []);
                  if (e.target.checked) next.add(action);
                  else next.delete(action);
                  setPolicy({ ...policy, requires_approval: Array.from(next) });
                }}
              />
              {action}
            </label>
          ))}
          <button onClick={() => savePolicy(policy)} style={{ padding: "6px 10px", borderRadius: 8 }}>
            Save approval rules
          </button>
        </div>
      </div>

      <div style={{ border: "1px solid var(--panel-border)", borderRadius: 12, padding: 12, background: "var(--panel-bg)" }}>
        <div style={{ fontWeight: 600, marginBottom: 6 }}>Protected paths</div>
        <textarea
          rows={6}
          defaultValue={protectedPathsText}
          onBlur={(e) => setPolicy({ ...policy, protected_paths: e.target.value.split("\n").map(line => line.trim()).filter(Boolean) })}
          style={{ width: "100%", padding: 8, borderRadius: 8, border: "1px solid var(--panel-border-strong)" }}
        />
        <button onClick={() => savePolicy(policy)} style={{ marginTop: 8, padding: "6px 10px", borderRadius: 8 }}>
          Save paths
        </button>
      </div>

      <div style={{ border: "1px solid var(--panel-border)", borderRadius: 12, padding: 12, background: "var(--panel-bg)" }}>
        <div style={{ fontWeight: 600, marginBottom: 6 }}>Network allowlist</div>
        <textarea
          rows={4}
          defaultValue={allowlistText}
          onBlur={(e) => setPolicy({
            ...policy,
            network_rules: {
              ...policy.network_rules,
              allowlist_domains: e.target.value.split("\n").map(line => line.trim()).filter(Boolean)
            }
          })}
          style={{ width: "100%", padding: 8, borderRadius: 8, border: "1px solid var(--panel-border-strong)" }}
        />
        <button onClick={() => savePolicy(policy)} style={{ marginTop: 8, padding: "6px 10px", borderRadius: 8 }}>
          Save network rules
        </button>
      </div>

      <div style={{ border: "1px solid var(--panel-border)", borderRadius: 12, padding: 12, background: "var(--panel-bg)" }}>
        <div style={{ fontWeight: 600, marginBottom: 6 }}>Memory tiers</div>
        <div style={{ fontSize: 12, color: "#6b7280" }}>
          Tier4 (PHI) is read-only by default. Enabling writes requires approval.
        </div>
        <label style={{ display: "flex", gap: 8, alignItems: "center", marginTop: 8 }}>
          <input
            type="checkbox"
            checked={policy.memory_tiers?.tier4?.allow_write || false}
            onChange={(e) => setPolicy({
              ...policy,
              memory_tiers: {
                ...policy.memory_tiers,
                tier4: { ...policy.memory_tiers?.tier4, allow_write: e.target.checked }
              }
            })}
          />
          Allow Tier4 writes
        </label>
        <button onClick={() => savePolicy(policy)} style={{ marginTop: 8, padding: "6px 10px", borderRadius: 8 }}>
          Save memory policy
        </button>
      </div>

      <div style={{ border: "1px solid var(--panel-border)", borderRadius: 12, padding: 12, background: "var(--panel-bg)" }}>
        <div style={{ fontWeight: 600, marginBottom: 6 }}>Kill switch</div>
        <div style={{ fontSize: 12, color: "#6b7280", marginBottom: 8 }}>
          Status: {killSwitch?.enabled ? "ACTIVE" : "inactive"}
        </div>
        <button
          onClick={() => toggleKillSwitch(!killSwitch?.enabled)}
          style={{ padding: "6px 10px", borderRadius: 8 }}
        >
          {killSwitch?.enabled ? "Disable kill switch" : "Stand down"}
        </button>
      </div>

      <div style={{ border: "1px solid var(--panel-border)", borderRadius: 12, padding: 12, background: "var(--panel-bg)" }}>
        <div style={{ fontWeight: 600, marginBottom: 6 }}>Pending approvals</div>
        {approvals.length === 0 ? (
          <div style={{ fontSize: 12, color: "#6b7280" }}>No pending approvals.</div>
        ) : (
          approvals.map(item => (
            <div key={item.id} style={{ border: "1px solid var(--panel-border-subtle)", borderRadius: 10, padding: 8, marginBottom: 8 }}>
              <div style={{ fontSize: 12, fontWeight: 600 }}>{item.summary || item.toolName || item.actionType}</div>
              <div style={{ fontSize: 11, color: "#6b7280" }}>Type: {item.actionType || item.toolName}</div>
              <div style={{ display: "flex", gap: 8, marginTop: 6 }}>
                <button onClick={() => handleApproval(item.id, "approve")} style={{ padding: "4px 8px", borderRadius: 6 }}>
                  Approve
                </button>
                <button onClick={() => handleApproveExecute(item.id)} style={{ padding: "4px 8px", borderRadius: 6 }}>
                  Approve + Execute
                </button>
                <button onClick={() => handleApproval(item.id, "reject")} style={{ padding: "4px 8px", borderRadius: 6 }}>
                  Reject
                </button>
              </div>
            </div>
          ))
        )}
      </div>

      <div style={{ border: "1px solid var(--panel-border)", borderRadius: 12, padding: 12, background: "var(--panel-bg)" }}>
        <div style={{ fontWeight: 600, marginBottom: 6 }}>Audit log</div>
        {auditEvents.length === 0 ? (
          <div style={{ fontSize: 12, color: "#6b7280" }}>No audit events yet.</div>
        ) : (
          <div style={{ display: "grid", gap: 6, fontSize: 11 }}>
            {auditEvents.map(event => (
              <div key={event.id} style={{ borderBottom: "1px solid var(--panel-border-subtle)", paddingBottom: 6 }}>
                <div><strong>{event.action_type}</strong> - {event.decision}</div>
                <div style={{ color: "#6b7280" }}>{event.ts} - {event.reason}</div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}


