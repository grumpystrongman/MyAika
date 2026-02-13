import { useEffect, useState } from "react";

export default function ActionRunnerPanel({ serverUrl }) {
  const [instruction, setInstruction] = useState("");
  const [startUrl, setStartUrl] = useState("");
  const [plan, setPlan] = useState(null);
  const [planExplanation, setPlanExplanation] = useState("");
  const [runId, setRunId] = useState("");
  const [runData, setRunData] = useState(null);
  const [error, setError] = useState("");
  const [approval, setApproval] = useState(null);
  const [loadingPlan, setLoadingPlan] = useState(false);
  const [running, setRunning] = useState(false);

  async function previewPlan() {
    setError("");
    setLoadingPlan(true);
    try {
      const resp = await fetch(`${serverUrl}/api/action/plan`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ instruction, startUrl: startUrl || undefined })
      });
      const data = await resp.json();
      if (!resp.ok) throw new Error(data?.error || "action_plan_failed");
      setPlan(data?.plan || null);
      setPlanExplanation(data?.explanation || "");
    } catch (err) {
      setError(err?.message || "action_plan_failed");
    } finally {
      setLoadingPlan(false);
    }
  }

  async function runPlan() {
    setError("");
    setApproval(null);
    setRunning(true);
    try {
      const payload = plan ? { ...plan } : {
        taskName: instruction.slice(0, 80) || "Action Run",
        startUrl: startUrl || "",
        actions: []
      };
      payload.actions = Array.isArray(payload.actions) ? [...payload.actions] : [];
      if (payload.actions.length === 0) {
        if (payload.startUrl) {
          payload.actions = [{ type: "goto", url: payload.startUrl }];
        } else {
          throw new Error("No actions to run. Preview a plan or provide a Start URL.");
        }
      }
      const resp = await fetch(`${serverUrl}/api/action/run`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...payload, async: true })
      });
      const data = await resp.json();
      if (!resp.ok) throw new Error(data?.error || "action_run_failed");
      if (data?.status === "approval_required") {
        setApproval(data.approval || null);
        return;
      }
      if (data?.data?.runId) {
        setRunId(data.data.runId);
      } else if (data?.runId) {
        setRunId(data.runId);
      }
    } catch (err) {
      setError(err?.message || "action_run_failed");
    } finally {
      setRunning(false);
    }
  }

  async function approveAndRun() {
    if (!approval?.id) return;
    setError("");
    setRunning(true);
    try {
      const approveResp = await fetch(`${serverUrl}/api/approvals/${approval.id}/approve`, { method: "POST" });
      const approved = await approveResp.json();
      if (!approveResp.ok) throw new Error(approved?.error || "approval_failed");
      const token = approved?.approval?.token;
      if (!token) throw new Error("approval_token_missing");
      const execResp = await fetch(`${serverUrl}/api/approvals/${approval.id}/execute`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token })
      });
      const execData = await execResp.json();
      if (!execResp.ok) throw new Error(execData?.error || "approval_execute_failed");
      if (execData?.data?.runId) {
        setRunId(execData.data.runId);
      }
      setApproval(null);
    } catch (err) {
      setError(err?.message || "approval_failed");
    } finally {
      setRunning(false);
    }
  }

  useEffect(() => {
    if (!runId) return;
    let active = true;
    const interval = setInterval(async () => {
      try {
        const resp = await fetch(`${serverUrl}/api/action/runs/${runId}`);
        const data = await resp.json();
        if (active) setRunData(data);
      } catch {
        // ignore
      }
    }, 2000);
    return () => {
      active = false;
      clearInterval(interval);
    };
  }, [runId, serverUrl]);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      <div style={{ fontSize: 14, fontWeight: 600, color: "#111827" }}>Action Runner</div>
      {error && <div style={{ color: "#b91c1c", fontSize: 12 }}>{error}</div>}

      <div style={{ border: "1px solid #e5e7eb", borderRadius: 12, padding: 12, background: "white" }}>
        <label style={{ fontSize: 12 }}>
          Instruction
          <textarea
            value={instruction}
            onChange={(e) => setInstruction(e.target.value)}
            rows={4}
            style={{ width: "100%", padding: 8, marginTop: 4, borderRadius: 8, border: "1px solid #d1d5db" }}
          />
        </label>
        <label style={{ fontSize: 12, marginTop: 8 }}>
          Start URL (optional)
          <input
            value={startUrl}
            onChange={(e) => setStartUrl(e.target.value)}
            style={{ width: "100%", padding: 8, marginTop: 4, borderRadius: 8, border: "1px solid #d1d5db" }}
          />
        </label>
        <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
          <button onClick={previewPlan} disabled={loadingPlan} style={{ padding: "6px 10px", borderRadius: 8 }}>
            {loadingPlan ? "Planning..." : "Preview Plan"}
          </button>
          <button onClick={runPlan} disabled={running} style={{ padding: "6px 10px", borderRadius: 8 }}>
            {running ? "Running..." : "Run"}
          </button>
        </div>
        {planExplanation && (
          <div style={{ marginTop: 8, fontSize: 12, color: "#6b7280" }}>{planExplanation}</div>
        )}
        {plan && (
          <pre style={{ marginTop: 8, background: "#0b1220", color: "#e5e7eb", padding: 8, borderRadius: 8, fontSize: 11, overflow: "auto" }}>
{JSON.stringify(plan, null, 2)}
          </pre>
        )}
        {approval && (
          <div style={{ marginTop: 10, padding: 10, border: "1px solid #f59e0b", borderRadius: 10, background: "#fff7ed", fontSize: 12 }}>
            <div style={{ fontWeight: 600 }}>Approval required</div>
            <div>Approval ID: {approval.id}</div>
            <div style={{ marginTop: 6 }}>{approval.humanSummary}</div>
            <button onClick={approveAndRun} style={{ marginTop: 8, padding: "6px 10px", borderRadius: 8 }}>
              Approve & Run
            </button>
          </div>
        )}
      </div>

      {runId && (
        <div style={{ border: "1px solid #e5e7eb", borderRadius: 12, padding: 12, background: "white" }}>
          <div style={{ fontWeight: 600, marginBottom: 6 }}>Run Status</div>
          <div style={{ fontSize: 12, color: "#6b7280", marginBottom: 6 }}>Run ID: {runId}</div>
          <div style={{ fontSize: 12, marginBottom: 8 }}>Status: {runData?.status || "running"}</div>

          <div style={{ fontWeight: 600, fontSize: 12, marginBottom: 6 }}>Timeline</div>
          <div style={{ display: "flex", flexDirection: "column", gap: 6, fontSize: 11 }}>
            {(runData?.timeline || []).map(step => (
              <div key={`${step.step}-${step.type}`} style={{ borderBottom: "1px solid #f3f4f6", paddingBottom: 6 }}>
                <div><b>#{step.step}</b> {step.type} - {step.status}</div>
                {step.error && <div style={{ color: "#b91c1c" }}>{step.error}</div>}
              </div>
            ))}
            {(!runData?.timeline || runData.timeline.length === 0) && <div>No steps yet.</div>}
          </div>

          <div style={{ fontWeight: 600, fontSize: 12, margin: "12px 0 6px" }}>Extracted</div>
          <div style={{ display: "flex", flexDirection: "column", gap: 6, fontSize: 11 }}>
            {(runData?.extracted || []).map((item, idx) => (
              <div key={`${item.step}-${idx}`} style={{ borderBottom: "1px solid #f3f4f6", paddingBottom: 6 }}>
                <div><b>{item.name || item.selector}</b></div>
                <div>{item.text}</div>
              </div>
            ))}
            {(!runData?.extracted || runData.extracted.length === 0) && <div>No extracted text yet.</div>}
          </div>

          <div style={{ fontWeight: 600, fontSize: 12, margin: "12px 0 6px" }}>Artifacts</div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
            {(runData?.artifacts || []).map((artifact, idx) => {
              const url = `${serverUrl}/api/action/runs/${runId}/artifacts/${encodeURIComponent(artifact.file)}`;
              return (
                <div key={`${artifact.file}-${idx}`} style={{ width: 140 }}>
                  {artifact.type === "screenshot" ? (
                    <img src={url} alt={artifact.file} style={{ width: "100%", borderRadius: 8, border: "1px solid #e5e7eb" }} />
                  ) : (
                    <a href={url} target="_blank" rel="noreferrer" style={{ fontSize: 11 }}>
                      {artifact.file}
                    </a>
                  )}
                </div>
              );
            })}
            {(!runData?.artifacts || runData.artifacts.length === 0) && <div style={{ fontSize: 11 }}>No artifacts yet.</div>}
          </div>
        </div>
      )}
    </div>
  );
}
