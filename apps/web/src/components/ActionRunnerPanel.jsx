import { useEffect, useMemo, useState } from "react";

const MODE_CONFIG = {
  browser: {
    label: "Browser",
    description: "Headless Playwright browser automation with approvals.",
    planEndpoint: "/api/action/plan",
    runEndpoint: "/api/action/run",
    runStatusEndpoint: (id) => `/api/action/runs/${id}`,
    artifactEndpoint: (id, file) => `/api/action/runs/${id}/artifacts/${encodeURIComponent(file)}`
  },
  desktop: {
    label: "Desktop",
    description: "Local Windows desktop control. Requires an active session and explicit approval.",
    planEndpoint: "/api/desktop/plan",
    runEndpoint: "/api/desktop/run",
    runStatusEndpoint: (id) => `/api/desktop/runs/${id}`,
    artifactEndpoint: (id, file) => `/api/desktop/runs/${id}/artifacts/${encodeURIComponent(file)}`
  }
};

const SAMPLE_DESKTOP_PLAN = {
  taskName: "Sample: Notepad hello",
  actions: [
    { type: "launch", target: "notepad.exe" },
    { type: "wait", ms: 800 },
    { type: "type", text: "Hello from Aika Desktop Runner." },
    { type: "wait", ms: 300 },
    { type: "screenshot", name: "notepad_hello" }
  ],
  safety: { requireApprovalFor: ["launch", "input", "screenshot"], maxActions: 20, approvalMode: "per_run" }
};

const DEFAULT_DESKTOP_SAFETY = {
  requireApprovalFor: ["launch", "input", "key", "mouse", "clipboard", "screenshot", "new_app", "vision", "uia"],
  maxActions: 60,
  approvalMode: "per_run"
};
const DEFAULT_RECORD_OPTIONS = { stopKey: "F8", maxSeconds: 180, includeMoves: false };

export default function ActionRunnerPanel({ serverUrl }) {
  const [mode, setMode] = useState("browser");
  const [stateByMode, setStateByMode] = useState(() => ({
    browser: {
      instruction: "",
      startUrl: "",
      plan: null,
      planExplanation: "",
      runId: "",
      runData: null,
      error: "",
      approval: null,
      loadingPlan: false,
      running: false
    },
    desktop: {
      instruction: "",
      startUrl: "",
      plan: null,
      planExplanation: "",
      runId: "",
      runData: null,
      error: "",
      approval: null,
      approvalMode: "per_run",
      loadingPlan: false,
      running: false
    }
  }));
  const [desktopMacros, setDesktopMacros] = useState([]);
  const [macroLoading, setMacroLoading] = useState(false);
  const [macroError, setMacroError] = useState("");
  const [macroSaving, setMacroSaving] = useState(false);
  const [recordingState, setRecordingState] = useState({
    running: false,
    error: "",
    summary: null,
    actions: []
  });
  const [macroForm, setMacroForm] = useState({
    name: "",
    description: "",
    tags: "",
    stopKey: DEFAULT_RECORD_OPTIONS.stopKey,
    maxSeconds: DEFAULT_RECORD_OPTIONS.maxSeconds,
    includeMoves: DEFAULT_RECORD_OPTIONS.includeMoves
  });

  const activeState = stateByMode[mode];
  const config = MODE_CONFIG[mode];

  function parseTags(value) {
    return String(value || "")
      .split(/[;,]/)
      .map((item) => item.trim())
      .filter(Boolean);
  }

  function updateMacroForm(patch) {
    setMacroForm((prev) => ({ ...prev, ...patch }));
  }

  function updateModeState(patch) {
    setStateByMode((prev) => ({
      ...prev,
      [mode]: { ...prev[mode], ...patch }
    }));
  }

  async function loadDesktopMacros() {
    setMacroError("");
    setMacroLoading(true);
    try {
      const resp = await fetch(`${serverUrl}/api/desktop/macros`);
      const data = await resp.json();
      if (!resp.ok) throw new Error(data?.error || "macro_list_failed");
      setDesktopMacros(Array.isArray(data?.macros) ? data.macros : []);
    } catch (err) {
      setMacroError(err?.message || "macro_list_failed");
    } finally {
      setMacroLoading(false);
    }
  }

  async function startRecording() {
    setRecordingState({ running: true, error: "", summary: null, actions: [] });
    try {
      const payload = {
        options: {
          stopKey: macroForm.stopKey || DEFAULT_RECORD_OPTIONS.stopKey,
          maxSeconds: Number(macroForm.maxSeconds || DEFAULT_RECORD_OPTIONS.maxSeconds),
          includeMoves: Boolean(macroForm.includeMoves)
        }
      };
      const resp = await fetch(`${serverUrl}/api/desktop/record`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
      });
      const data = await resp.json();
      if (!resp.ok) throw new Error(data?.error || "record_failed");
      setRecordingState({
        running: false,
        error: "",
        summary: data?.summary || null,
        actions: Array.isArray(data?.actions) ? data.actions : []
      });
    } catch (err) {
      setRecordingState({ running: false, error: err?.message || "record_failed", summary: null, actions: [] });
    }
  }

  async function saveRecordedMacro() {
    if (!macroForm.name) {
      setRecordingState((prev) => ({ ...prev, error: "Macro name is required to save." }));
      return;
    }
    if (!recordingState.actions.length) {
      setRecordingState((prev) => ({ ...prev, error: "Record actions before saving." }));
      return;
    }
    setMacroSaving(true);
    setRecordingState((prev) => ({ ...prev, error: "" }));
    try {
      const payload = {
        name: macroForm.name,
        description: macroForm.description || "",
        tags: parseTags(macroForm.tags),
        safety: DEFAULT_DESKTOP_SAFETY,
        actions: recordingState.actions
      };
      const resp = await fetch(`${serverUrl}/api/desktop/macros`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
      });
      const data = await resp.json();
      if (!resp.ok) throw new Error(data?.error || "macro_save_failed");
      await loadDesktopMacros();
    } catch (err) {
      setRecordingState((prev) => ({ ...prev, error: err?.message || "macro_save_failed" }));
    } finally {
      setMacroSaving(false);
    }
  }

  async function runMacro(macroId) {
    updateModeState({ error: "", approval: null, running: true });
    try {
      const resp = await fetch(`${serverUrl}/api/desktop/macros/${macroId}/run`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ async: true })
      });
      const data = await resp.json();
      if (!resp.ok) throw new Error(data?.error || "macro_run_failed");
      if (data?.status === "approval_required") {
        updateModeState({ approval: data.approval || null, running: false });
        return;
      }
      if (data?.data?.runId) {
        updateModeState({ runId: data.data.runId });
      } else if (data?.runId) {
        updateModeState({ runId: data.runId });
      }
    } catch (err) {
      updateModeState({ error: err?.message || "macro_run_failed" });
    } finally {
      updateModeState({ running: false });
    }
  }

  async function deleteMacro(macroId) {
    setMacroError("");
    try {
      const resp = await fetch(`${serverUrl}/api/desktop/macros/${macroId}`, { method: "DELETE" });
      const data = await resp.json();
      if (!resp.ok) throw new Error(data?.error || "macro_delete_failed");
      await loadDesktopMacros();
    } catch (err) {
      setMacroError(err?.message || "macro_delete_failed");
    }
  }

  function loadMacroPlan(macro) {
    if (!macro) return;
    setMode("desktop");
    const approvalMode = macro?.safety?.approvalMode || DEFAULT_DESKTOP_SAFETY.approvalMode;
    setStateByMode((prev) => ({
      ...prev,
      desktop: {
        ...prev.desktop,
        plan: {
          taskName: macro.name || "Desktop Macro",
          actions: Array.isArray(macro.actions) ? macro.actions : [],
          safety: macro.safety || DEFAULT_DESKTOP_SAFETY
        },
        planExplanation: `Loaded macro: ${macro.name || macro.id}`,
        error: "",
        approvalMode
      }
    }));
  }

  async function previewPlan() {
    updateModeState({ error: "", loadingPlan: true });
    try {
      const payload = mode === "browser"
        ? { instruction: activeState.instruction, startUrl: activeState.startUrl || undefined }
        : { instruction: activeState.instruction };
      const resp = await fetch(`${serverUrl}${config.planEndpoint}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
      });
      const data = await resp.json();
      if (!resp.ok) throw new Error(data?.error || "plan_failed");
      let nextPlan = data?.plan || null;
      if (mode === "desktop" && nextPlan) {
        const approvalMode = activeState.approvalMode || DEFAULT_DESKTOP_SAFETY.approvalMode;
        nextPlan = {
          ...nextPlan,
          safety: {
            ...DEFAULT_DESKTOP_SAFETY,
            ...(nextPlan.safety || {}),
            approvalMode
          }
        };
      }
      updateModeState({ plan: nextPlan, planExplanation: data?.explanation || "" });
    } catch (err) {
      updateModeState({ error: err?.message || "plan_failed" });
    } finally {
      updateModeState({ loadingPlan: false });
    }
  }

  async function runPlan() {
    updateModeState({ error: "", approval: null, running: true });
    try {
      const payload = activeState.plan ? { ...activeState.plan } : {
        taskName: activeState.instruction.slice(0, 80) || "Action Run",
        startUrl: activeState.startUrl || "",
        actions: []
      };

      if (mode === "browser") {
        payload.actions = Array.isArray(payload.actions) ? [...payload.actions] : [];
        if (payload.actions.length === 0) {
          if (payload.startUrl) {
            payload.actions = [{ type: "goto", url: payload.startUrl }];
          } else {
            throw new Error("No actions to run. Preview a plan or provide a Start URL.");
          }
        }
      } else {
        if (!Array.isArray(payload.actions) || payload.actions.length === 0) {
          throw new Error("No actions to run. Preview a plan or load the sample.");
        }
        const approvalMode = activeState.approvalMode || payload.safety?.approvalMode || DEFAULT_DESKTOP_SAFETY.approvalMode;
        payload.safety = {
          ...DEFAULT_DESKTOP_SAFETY,
          ...(payload.safety || {}),
          approvalMode
        };
      }

      const resp = await fetch(`${serverUrl}${config.runEndpoint}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...payload, async: true })
      });
      const data = await resp.json();
      if (!resp.ok) throw new Error(data?.error || "run_failed");
      if (data?.status === "approval_required") {
        updateModeState({ approval: data.approval || null, running: false });
        return;
      }
      if (data?.data?.runId) {
        updateModeState({ runId: data.data.runId });
      } else if (data?.runId) {
        updateModeState({ runId: data.runId });
      }
    } catch (err) {
      updateModeState({ error: err?.message || "run_failed" });
    } finally {
      updateModeState({ running: false });
    }
  }

  async function approveAndRun() {
    if (!activeState.approval?.id) return;
    updateModeState({ error: "", running: true });
    try {
      let adminToken = "";
      try {
        adminToken = window.localStorage.getItem("aika_admin_token") || "";
      } catch {
        adminToken = "";
      }
      const approveResp = await fetch(`${serverUrl}/api/approvals/${activeState.approval.id}/approve`, {
        method: "POST",
        headers: adminToken ? { "x-admin-token": adminToken } : undefined
      });
      const approved = await approveResp.json();
      if (!approveResp.ok) throw new Error(approved?.error || "approval_failed");
      const token = approved?.approval?.token;
      if (!token) throw new Error("approval_token_missing");
      const execResp = await fetch(`${serverUrl}/api/approvals/${activeState.approval.id}/execute`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token })
      });
      const execData = await execResp.json();
      if (!execResp.ok) throw new Error(execData?.error || "approval_execute_failed");
      if (execData?.data?.runId) {
        updateModeState({ runId: execData.data.runId });
      }
      updateModeState({ approval: null });
    } catch (err) {
      updateModeState({ error: err?.message || "approval_failed" });
    } finally {
      updateModeState({ running: false });
    }
  }

  async function approveStepAndContinue() {
    if (!activeState.runId || !activeState.runData?.pendingApproval?.id) return;
    updateModeState({ error: "", running: true });
    try {
      let adminToken = "";
      try {
        adminToken = window.localStorage.getItem("aika_admin_token") || "";
      } catch {
        adminToken = "";
      }
      const approvalId = activeState.runData.pendingApproval.id;
      const approveResp = await fetch(`${serverUrl}/api/approvals/${approvalId}/approve`, {
        method: "POST",
        headers: adminToken ? { "x-admin-token": adminToken } : undefined
      });
      const approved = await approveResp.json();
      if (!approveResp.ok) throw new Error(approved?.error || "approval_failed");
      const continueResp = await fetch(`${serverUrl}/api/desktop/runs/${activeState.runId}/continue`, {
        method: "POST",
        headers: { "Content-Type": "application/json" }
      });
      const continueData = await continueResp.json();
      if (!continueResp.ok) throw new Error(continueData?.error || "continue_failed");
      updateModeState({ runData: continueData });
    } catch (err) {
      updateModeState({ error: err?.message || "approval_failed" });
    } finally {
      updateModeState({ running: false });
    }
  }

  async function requestPanicStop() {
    if (!activeState.runId) return;
    updateModeState({ error: "" });
    try {
      const resp = await fetch(`${serverUrl}/api/desktop/runs/${activeState.runId}/stop`, {
        method: "POST",
        headers: { "Content-Type": "application/json" }
      });
      const data = await resp.json();
      if (!resp.ok) throw new Error(data?.error || "stop_failed");
      updateModeState({ runData: data.run || activeState.runData });
    } catch (err) {
      updateModeState({ error: err?.message || "stop_failed" });
    }
  }

  function loadDesktopSample() {
    setMode("desktop");
    setStateByMode((prev) => ({
      ...prev,
      desktop: {
        ...prev.desktop,
        plan: SAMPLE_DESKTOP_PLAN,
        planExplanation: "Loaded the safe Notepad sample plan.",
        error: "",
        approvalMode: SAMPLE_DESKTOP_PLAN.safety?.approvalMode || DEFAULT_DESKTOP_SAFETY.approvalMode
      }
    }));
  }

  useEffect(() => {
    if (mode !== "desktop") return;
    loadDesktopMacros();
  }, [mode, serverUrl]);

  useEffect(() => {
    if (!stateByMode.browser.runId) return;
    let active = true;
    const interval = setInterval(async () => {
      try {
        const resp = await fetch(`${serverUrl}${MODE_CONFIG.browser.runStatusEndpoint(stateByMode.browser.runId)}`);
        const data = await resp.json();
        if (active) {
          setStateByMode((prev) => ({
            ...prev,
            browser: { ...prev.browser, runData: data }
          }));
        }
      } catch {
        // ignore
      }
    }, 2000);
    return () => {
      active = false;
      clearInterval(interval);
    };
  }, [stateByMode.browser.runId, serverUrl]);

  useEffect(() => {
    if (!stateByMode.desktop.runId) return;
    let active = true;
    const interval = setInterval(async () => {
      try {
        const resp = await fetch(`${serverUrl}${MODE_CONFIG.desktop.runStatusEndpoint(stateByMode.desktop.runId)}`);
        const data = await resp.json();
        if (active) {
          setStateByMode((prev) => ({
            ...prev,
            desktop: { ...prev.desktop, runData: data }
          }));
        }
      } catch {
        // ignore
      }
    }, 2000);
    return () => {
      active = false;
      clearInterval(interval);
    };
  }, [stateByMode.desktop.runId, serverUrl]);

  const runData = activeState.runData;
  const artifacts = Array.isArray(runData?.artifacts) ? runData.artifacts : [];

  const modeBadgeStyle = useMemo(() => ({
    display: "inline-flex",
    alignItems: "center",
    gap: 6,
    padding: "4px 10px",
    borderRadius: 999,
    fontSize: 11,
    background: mode === "browser" ? "#e0f2fe" : "#ede9fe",
    color: mode === "browser" ? "#0369a1" : "#6d28d9",
    fontWeight: 600
  }), [mode]);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      <div style={{
        borderRadius: 16,
        padding: "14px 16px",
        background: "linear-gradient(135deg, #0f172a 0%, #1e3a8a 55%, #2563eb 100%)",
        color: "white",
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        gap: 12
      }}>
        <div>
          <div style={{ fontSize: 14, fontWeight: 700 }}>Action Runner</div>
          <div style={{ fontSize: 12, opacity: 0.8 }}>Browser automation and desktop control with approvals.</div>
        </div>
        <div style={modeBadgeStyle}>{MODE_CONFIG[mode].label} mode</div>
      </div>

      {activeState.error && <div style={{ color: "#b91c1c", fontSize: 12 }}>{activeState.error}</div>}

      <div style={{ border: "1px solid #e5e7eb", borderRadius: 12, padding: 12, background: "white" }}>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 10 }}>
          {Object.entries(MODE_CONFIG).map(([key, entry]) => (
            <button
              key={key}
              onClick={() => setMode(key)}
              style={{
                padding: "6px 12px",
                borderRadius: 999,
                border: mode === key ? "2px solid #2563eb" : "1px solid #e5e7eb",
                background: mode === key ? "#eff6ff" : "white",
                fontSize: 12,
                fontWeight: 600
              }}
            >
              {entry.label}
            </button>
          ))}
          {mode === "desktop" && (
            <button
              onClick={loadDesktopSample}
              style={{
                padding: "6px 12px",
                borderRadius: 999,
                border: "1px solid #e5e7eb",
                background: "#f8fafc",
                fontSize: 12,
                fontWeight: 600
              }}
            >
              Load Sample
            </button>
          )}
        </div>
        <div style={{ fontSize: 12, color: "#6b7280", marginBottom: 12 }}>{config.description}</div>

        <label style={{ fontSize: 12 }}>
          Instruction
          <textarea
            value={activeState.instruction}
            onChange={(e) => updateModeState({ instruction: e.target.value })}
            rows={4}
            style={{ width: "100%", padding: 8, marginTop: 4, borderRadius: 8, border: "1px solid #d1d5db" }}
          />
        </label>

        {mode === "browser" && (
          <label style={{ fontSize: 12, marginTop: 8, display: "block" }}>
            Start URL (optional)
            <input
              value={activeState.startUrl}
              onChange={(e) => updateModeState({ startUrl: e.target.value })}
              style={{ width: "100%", padding: 8, marginTop: 4, borderRadius: 8, border: "1px solid #d1d5db" }}
            />
          </label>
        )}

        {mode === "desktop" && (
          <label style={{ fontSize: 12, marginTop: 8, display: "block" }}>
            Approval mode
            <select
              value={activeState.approvalMode || "per_run"}
              onChange={(e) => updateModeState({ approvalMode: e.target.value })}
              style={{ width: "100%", padding: 8, marginTop: 4, borderRadius: 8, border: "1px solid #d1d5db" }}
            >
              <option value="per_run">Per run (one approval for the plan)</option>
              <option value="per_step">Per step (approval at each risky action)</option>
            </select>
          </label>
        )}

        <div style={{ display: "flex", gap: 8, marginTop: 10 }}>
          <button onClick={previewPlan} disabled={activeState.loadingPlan} style={{ padding: "6px 10px", borderRadius: 8 }}>
            {activeState.loadingPlan ? "Planning..." : "Preview Plan"}
          </button>
          <button onClick={runPlan} disabled={activeState.running} style={{ padding: "6px 10px", borderRadius: 8 }}>
            {activeState.running ? "Running..." : "Run"}
          </button>
        </div>

        {activeState.planExplanation && (
          <div style={{ marginTop: 8, fontSize: 12, color: "#6b7280" }}>{activeState.planExplanation}</div>
        )}
        {activeState.plan && (
          <pre style={{ marginTop: 8, background: "#0b1220", color: "#e5e7eb", padding: 8, borderRadius: 8, fontSize: 11, overflow: "auto" }}>
{JSON.stringify(activeState.plan, null, 2)}
          </pre>
        )}

      {activeState.approval && (
        <div style={{ marginTop: 10, padding: 10, border: "1px solid #f59e0b", borderRadius: 10, background: "#fff7ed", fontSize: 12 }}>
          <div style={{ fontWeight: 600 }}>Approval required</div>
          <div>Approval ID: {activeState.approval.id}</div>
          <div style={{ marginTop: 6 }}>{activeState.approval.humanSummary}</div>
          <button onClick={approveAndRun} style={{ marginTop: 8, padding: "6px 10px", borderRadius: 8 }}>
            Approve & Run
          </button>
        </div>
      )}

      {mode === "desktop" && runData?.pendingApproval && (
        <div style={{ marginTop: 10, padding: 10, border: "1px solid #f59e0b", borderRadius: 10, background: "#fff7ed", fontSize: 12 }}>
          <div style={{ fontWeight: 600 }}>Step approval required</div>
          <div>Step {runData.pendingApproval.step}</div>
          {Array.isArray(runData.pendingApproval.reasons) && runData.pendingApproval.reasons.length > 0 && (
            <div style={{ marginTop: 6 }}>
              Reasons: {runData.pendingApproval.reasons.join("; ")}
            </div>
          )}
          <button onClick={approveStepAndContinue} style={{ marginTop: 8, padding: "6px 10px", borderRadius: 8 }}>
            Approve & Continue
          </button>
        </div>
      )}
    </div>

      {mode === "desktop" && (
        <div style={{ border: "1px solid #e5e7eb", borderRadius: 12, padding: 12, background: "white" }}>
          <div style={{ fontWeight: 600, marginBottom: 4 }}>Desktop Macro Recorder</div>
          <div style={{ fontSize: 12, color: "#6b7280" }}>
            Capture live mouse and keyboard input. Press {macroForm.stopKey || "F8"} to stop the recording.
          </div>

          <div style={{ display: "grid", gap: 10, gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", marginTop: 10 }}>
            <label style={{ fontSize: 12 }}>
              Macro name
              <input
                value={macroForm.name}
                onChange={(e) => updateMacroForm({ name: e.target.value })}
                placeholder="Daily login flow"
                style={{ width: "100%", padding: 8, marginTop: 4, borderRadius: 8, border: "1px solid #d1d5db" }}
              />
            </label>
            <label style={{ fontSize: 12 }}>
              Stop key
              <input
                value={macroForm.stopKey}
                onChange={(e) => updateMacroForm({ stopKey: e.target.value })}
                placeholder="F8"
                style={{ width: "100%", padding: 8, marginTop: 4, borderRadius: 8, border: "1px solid #d1d5db" }}
              />
            </label>
            <label style={{ fontSize: 12 }}>
              Max seconds
              <input
                type="number"
                value={macroForm.maxSeconds}
                onChange={(e) => updateMacroForm({ maxSeconds: e.target.value })}
                style={{ width: "100%", padding: 8, marginTop: 4, borderRadius: 8, border: "1px solid #d1d5db" }}
              />
            </label>
          </div>

          <label style={{ fontSize: 12, marginTop: 10, display: "block" }}>
            Description
            <input
              value={macroForm.description}
              onChange={(e) => updateMacroForm({ description: e.target.value })}
              placeholder="Login + open dashboard"
              style={{ width: "100%", padding: 8, marginTop: 4, borderRadius: 8, border: "1px solid #d1d5db" }}
            />
          </label>
          <label style={{ fontSize: 12, marginTop: 10, display: "block" }}>
            Tags (comma separated)
            <input
              value={macroForm.tags}
              onChange={(e) => updateMacroForm({ tags: e.target.value })}
              placeholder="daily, admin"
              style={{ width: "100%", padding: 8, marginTop: 4, borderRadius: 8, border: "1px solid #d1d5db" }}
            />
          </label>
          <label style={{ fontSize: 12, marginTop: 10, display: "flex", alignItems: "center", gap: 8 }}>
            <input
              type="checkbox"
              checked={Boolean(macroForm.includeMoves)}
              onChange={(e) => updateMacroForm({ includeMoves: e.target.checked })}
            />
            Include mouse moves (use sparingly to keep macros stable)
          </label>

          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 12 }}>
            <button onClick={startRecording} disabled={recordingState.running} style={{ padding: "6px 10px", borderRadius: 8 }}>
              {recordingState.running ? "Recording..." : "Start Recording"}
            </button>
            <button
              onClick={saveRecordedMacro}
              disabled={macroSaving || recordingState.running || recordingState.actions.length === 0}
              style={{ padding: "6px 10px", borderRadius: 8 }}
            >
              {macroSaving ? "Saving..." : "Save Macro"}
            </button>
            <button
              onClick={() => setRecordingState({ running: false, error: "", summary: null, actions: [] })}
              style={{ padding: "6px 10px", borderRadius: 8 }}
            >
              Clear
            </button>
          </div>

          {recordingState.error && (
            <div style={{ marginTop: 8, fontSize: 12, color: "#b91c1c" }}>{recordingState.error}</div>
          )}
          {recordingState.summary && (
            <div style={{ marginTop: 10, fontSize: 12, color: "#6b7280" }}>
              Recorded {recordingState.summary.actionCount} actions in {(recordingState.summary.durationMs / 1000).toFixed(1)}s.
            </div>
          )}
          {recordingState.actions.length > 0 && (
            <pre style={{ marginTop: 8, background: "#0b1220", color: "#e5e7eb", padding: 8, borderRadius: 8, fontSize: 11, overflow: "auto" }}>
{JSON.stringify(recordingState.actions, null, 2)}
            </pre>
          )}
        </div>
      )}

      {mode === "desktop" && (
        <div style={{ border: "1px solid #e5e7eb", borderRadius: 12, padding: 12, background: "white" }}>
          <div style={{ fontWeight: 600, marginBottom: 4 }}>Saved Desktop Macros</div>
          <div style={{ fontSize: 12, color: "#6b7280", marginBottom: 8 }}>
            Stored locally in data/desktop_macros. Use approvals to run safely.
          </div>
          <div style={{ display: "flex", gap: 8, marginBottom: 10 }}>
            <button onClick={loadDesktopMacros} disabled={macroLoading} style={{ padding: "6px 10px", borderRadius: 8 }}>
              {macroLoading ? "Refreshing..." : "Refresh"}
            </button>
            {macroError && <div style={{ fontSize: 12, color: "#b91c1c" }}>{macroError}</div>}
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {desktopMacros.map((macro) => (
              <div key={macro.id} style={{ border: "1px solid #f3f4f6", borderRadius: 10, padding: 10 }}>
                <div style={{ display: "flex", justifyContent: "space-between", gap: 10, flexWrap: "wrap" }}>
                  <div>
                    <div style={{ fontWeight: 600 }}>{macro.name || macro.id}</div>
                    <div style={{ fontSize: 11, color: "#6b7280" }}>
                      {(macro.actions || []).length} actions · {macro.updatedAt || "updated"}
                    </div>
                    {macro.description && (
                      <div style={{ fontSize: 11, color: "#6b7280", marginTop: 4 }}>{macro.description}</div>
                    )}
                    {Array.isArray(macro.tags) && macro.tags.length > 0 && (
                      <div style={{ fontSize: 11, marginTop: 4 }}>Tags: {macro.tags.join(", ")}</div>
                    )}
                  </div>
                  <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
                    <button onClick={() => loadMacroPlan(macro)} style={{ padding: "6px 10px", borderRadius: 8 }}>Load</button>
                    <button onClick={() => runMacro(macro.id)} style={{ padding: "6px 10px", borderRadius: 8 }}>Run</button>
                    <button onClick={() => deleteMacro(macro.id)} style={{ padding: "6px 10px", borderRadius: 8 }}>Delete</button>
                  </div>
                </div>
              </div>
            ))}
            {desktopMacros.length === 0 && !macroLoading && (
              <div style={{ fontSize: 12, color: "#6b7280" }}>No desktop macros yet. Record one above to get started.</div>
            )}
          </div>
        </div>
      )}

      {activeState.runId && (
        <div style={{ border: "1px solid #e5e7eb", borderRadius: 12, padding: 12, background: "white" }}>
          <div style={{ fontWeight: 600, marginBottom: 6 }}>Run Status</div>
          <div style={{ fontSize: 12, color: "#6b7280", marginBottom: 6 }}>Run ID: {activeState.runId}</div>
          <div style={{ fontSize: 12, marginBottom: 8 }}>Status: {runData?.status || "running"}</div>
          {mode === "desktop" && (
            <button
              onClick={requestPanicStop}
              style={{
                padding: "6px 10px",
                borderRadius: 8,
                background: "#fee2e2",
                border: "1px solid #fecaca",
                color: "#b91c1c",
                fontSize: 12,
                fontWeight: 600,
                marginBottom: 10
              }}
            >
              Panic Stop
            </button>
          )}

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

          {mode === "browser" && (
            <>
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
            </>
          )}

          <div style={{ fontWeight: 600, fontSize: 12, margin: "12px 0 6px" }}>Artifacts</div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
            {artifacts.map((artifact, idx) => {
              const url = `${serverUrl}${config.artifactEndpoint(activeState.runId, artifact.file)}`;
              return (
                <div key={`${artifact.file}-${idx}`} style={{ width: 140 }}>
                  {artifact.type === "screenshot" ? (
                    <img src={url} alt={artifact.file} style={{ width: "100%", borderRadius: 8, border: "1px solid #e5e7eb" }} />
                  ) : artifact.type === "ocr" ? (
                    <a href={url} target="_blank" rel="noreferrer" style={{ fontSize: 11 }}>
                      OCR: {artifact.file}
                    </a>
                  ) : (
                    <a href={url} target="_blank" rel="noreferrer" style={{ fontSize: 11 }}>
                      {artifact.file}
                    </a>
                  )}
                </div>
              );
            })}
            {artifacts.length === 0 && <div style={{ fontSize: 11 }}>No artifacts yet.</div>}
          </div>
        </div>
      )}
    </div>
  );
}
