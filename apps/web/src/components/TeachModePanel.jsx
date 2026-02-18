import { useEffect, useState } from "react";

const BROWSER_STEP_TYPES = ["goto", "click", "type", "press", "waitFor", "extractText", "screenshot"];
const DESKTOP_STEP_TYPES = ["launch", "wait", "type", "key", "mouseMove", "mouseClick", "clipboardSet", "screenshot", "visionOcr", "uiaClick", "uiaSetValue"];
const UIA_CONTROL_TYPES = ["", "button", "edit", "menuItem", "listItem", "tabItem"];

const DEFAULT_BROWSER_STEP = {
  type: "goto",
  url: "",
  selector: "",
  text: "",
  key: "",
  timeoutMs: 15000,
  name: ""
};

const DEFAULT_DESKTOP_STEP = {
  type: "launch",
  target: "",
  ms: 800,
  text: "",
  combo: "",
  x: 0,
  y: 0,
  button: "left",
  count: 1,
  name: "",
  lang: "eng",
  automationId: "",
  className: "",
  controlType: "",
  value: ""
};

const DEFAULT_DESKTOP_SAFETY = {
  requireApprovalFor: ["launch", "input", "key", "mouse", "clipboard", "screenshot", "new_app", "vision", "uia"],
  maxActions: 60,
  approvalMode: "per_run"
};

function newStepForMode(mode) {
  if (mode === "desktop") return { ...DEFAULT_DESKTOP_STEP };
  return { ...DEFAULT_BROWSER_STEP };
}

export default function TeachModePanel({ serverUrl }) {
  const [macros, setMacros] = useState([]);
  const [error, setError] = useState("");
  const [form, setForm] = useState({
    name: "",
    description: "",
    tags: "",
    startUrl: "",
    mode: "browser",
    approvalMode: "per_run"
  });
  const [steps, setSteps] = useState([]);
  const [selectedMacro, setSelectedMacro] = useState(null);
  const [macroParams, setMacroParams] = useState({});
  const [runResult, setRunResult] = useState(null);
  const [approval, setApproval] = useState(null);

  async function loadMacros() {
    try {
      const resp = await fetch(`${serverUrl}/api/teach/macros`);
      const data = await resp.json();
      if (!resp.ok) throw new Error(data?.error || "macro_load_failed");
      setMacros(data?.macros || []);
    } catch (err) {
      setError(err?.message || "macro_load_failed");
    }
  }

  useEffect(() => {
    loadMacros();
  }, []);

  function addStep() {
    setSteps(prev => [...prev, newStepForMode(form.mode)]);
  }

  function updateStep(index, updates) {
    setSteps(prev => prev.map((step, idx) => (idx === index ? { ...step, ...updates } : step)));
  }

  function handleModeChange(nextMode) {
    setForm(prev => ({
      ...prev,
      mode: nextMode,
      startUrl: nextMode === "browser" ? prev.startUrl : ""
    }));
    setSteps([]);
  }

  async function saveMacro() {
    setError("");
    try {
      const payload = {
        name: form.name,
        description: form.description,
        tags: form.tags.split(",").map(t => t.trim()).filter(Boolean),
        startUrl: form.mode === "browser" ? form.startUrl : "",
        mode: form.mode,
        safety: form.mode === "desktop"
          ? { ...DEFAULT_DESKTOP_SAFETY, approvalMode: form.approvalMode || "per_run" }
          : undefined,
        actions: steps
      };
      const resp = await fetch(`${serverUrl}/api/teach/macros`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
      });
      const data = await resp.json();
      if (!resp.ok) throw new Error(data?.error || "macro_save_failed");
      setForm({ name: "", description: "", tags: "", startUrl: "", mode: form.mode, approvalMode: form.approvalMode });
      setSteps([]);
      await loadMacros();
    } catch (err) {
      setError(err?.message || "macro_save_failed");
    }
  }

  async function runMacro() {
    if (!selectedMacro?.id) return;
    setError("");
    setApproval(null);
    try {
      const resp = await fetch(`${serverUrl}/api/teach/macros/${selectedMacro.id}/run`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ params: macroParams, async: true })
      });
      const data = await resp.json();
      if (!resp.ok) throw new Error(data?.error || "macro_run_failed");
      if (data?.status === "approval_required") {
        setApproval(data.approval || null);
        return;
      }
      setRunResult(data);
    } catch (err) {
      setError(err?.message || "macro_run_failed");
    }
  }

  async function approveAndRun() {
    if (!approval?.id) return;
    setError("");
    try {
      let adminToken = "";
      try {
        adminToken = window.localStorage.getItem("aika_admin_token") || "";
      } catch {
        adminToken = "";
      }
      const approveResp = await fetch(`${serverUrl}/api/approvals/${approval.id}/approve`, {
        method: "POST",
        headers: adminToken ? { "x-admin-token": adminToken } : undefined
      });
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
      setRunResult(execData);
      setApproval(null);
    } catch (err) {
      setError(err?.message || "approval_failed");
    }
  }

  function handleSelectMacro(id) {
    const macro = macros.find(m => m.id === id);
    setSelectedMacro(macro || null);
    setMacroParams({});
  }

  const isDesktop = form.mode === "desktop";

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      <div style={{ fontSize: 14, fontWeight: 600, color: "#111827" }}>Teach Mode</div>
      {error && <div style={{ color: "#b91c1c", fontSize: 12 }}>{error}</div>}

      <div style={{ border: "1px solid #e5e7eb", borderRadius: 12, padding: 12, background: "white" }}>
        <div style={{ fontWeight: 600, marginBottom: 6 }}>Create Macro</div>
        <label style={{ fontSize: 12 }}>
          Name
          <input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} style={{ width: "100%", padding: 8, marginTop: 4, borderRadius: 8, border: "1px solid #d1d5db" }} />
        </label>
        <label style={{ fontSize: 12, marginTop: 8 }}>
          Description
          <input value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} style={{ width: "100%", padding: 8, marginTop: 4, borderRadius: 8, border: "1px solid #d1d5db" }} />
        </label>
        <label style={{ fontSize: 12, marginTop: 8 }}>
          Tags (comma)
          <input value={form.tags} onChange={(e) => setForm({ ...form, tags: e.target.value })} style={{ width: "100%", padding: 8, marginTop: 4, borderRadius: 8, border: "1px solid #d1d5db" }} />
        </label>
        <label style={{ fontSize: 12, marginTop: 8 }}>
          Mode
          <select
            value={form.mode}
            onChange={(e) => handleModeChange(e.target.value)}
            style={{ width: "100%", padding: 8, marginTop: 4, borderRadius: 8, border: "1px solid #d1d5db" }}
          >
            <option value="browser">Browser</option>
            <option value="desktop">Desktop</option>
          </select>
        </label>

        {!isDesktop && (
          <label style={{ fontSize: 12, marginTop: 8 }}>
            Start URL
            <input value={form.startUrl} onChange={(e) => setForm({ ...form, startUrl: e.target.value })} style={{ width: "100%", padding: 8, marginTop: 4, borderRadius: 8, border: "1px solid #d1d5db" }} />
          </label>
        )}

        {isDesktop && (
          <label style={{ fontSize: 12, marginTop: 8 }}>
            Approval mode
            <select
              value={form.approvalMode}
              onChange={(e) => setForm({ ...form, approvalMode: e.target.value })}
              style={{ width: "100%", padding: 8, marginTop: 4, borderRadius: 8, border: "1px solid #d1d5db" }}
            >
              <option value="per_run">Per run</option>
              <option value="per_step">Per step</option>
            </select>
          </label>
        )}

        <div style={{ marginTop: 10, fontWeight: 600, fontSize: 12 }}>Steps</div>
        {steps.map((step, idx) => (
          <div key={idx} style={{ border: "1px solid #f3f4f6", borderRadius: 10, padding: 10, marginTop: 8 }}>
            <label style={{ fontSize: 12 }}>
              Type
              <select
                value={step.type}
                onChange={(e) => updateStep(idx, { type: e.target.value })}
                style={{ width: "100%", padding: 6, marginTop: 4, borderRadius: 8, border: "1px solid #d1d5db" }}
              >
                {(isDesktop ? DESKTOP_STEP_TYPES : BROWSER_STEP_TYPES).map((type) => (
                  <option key={type} value={type}>{type}</option>
                ))}
              </select>
            </label>

            {!isDesktop && step.type === "goto" && (
              <label style={{ fontSize: 12, marginTop: 6 }}>
                URL
                <input value={step.url} onChange={(e) => updateStep(idx, { url: e.target.value })} style={{ width: "100%", padding: 6, marginTop: 4, borderRadius: 8, border: "1px solid #d1d5db" }} />
              </label>
            )}
            {!isDesktop && ["click", "type", "waitFor", "extractText"].includes(step.type) && (
              <label style={{ fontSize: 12, marginTop: 6 }}>
                Selector
                <input value={step.selector} onChange={(e) => updateStep(idx, { selector: e.target.value })} style={{ width: "100%", padding: 6, marginTop: 4, borderRadius: 8, border: "1px solid #d1d5db" }} />
              </label>
            )}
            {!isDesktop && step.type === "type" && (
              <label style={{ fontSize: 12, marginTop: 6 }}>
                Text
                <input value={step.text} onChange={(e) => updateStep(idx, { text: e.target.value })} style={{ width: "100%", padding: 6, marginTop: 4, borderRadius: 8, border: "1px solid #d1d5db" }} />
              </label>
            )}
            {!isDesktop && step.type === "press" && (
              <label style={{ fontSize: 12, marginTop: 6 }}>
                Key
                <input value={step.key} onChange={(e) => updateStep(idx, { key: e.target.value })} style={{ width: "100%", padding: 6, marginTop: 4, borderRadius: 8, border: "1px solid #d1d5db" }} />
              </label>
            )}
            {!isDesktop && step.type === "screenshot" && (
              <label style={{ fontSize: 12, marginTop: 6 }}>
                Name
                <input value={step.name} onChange={(e) => updateStep(idx, { name: e.target.value })} style={{ width: "100%", padding: 6, marginTop: 4, borderRadius: 8, border: "1px solid #d1d5db" }} />
              </label>
            )}
            {!isDesktop && (
              <label style={{ fontSize: 12, marginTop: 6 }}>
                Timeout (ms)
                <input value={step.timeoutMs} onChange={(e) => updateStep(idx, { timeoutMs: Number(e.target.value || 0) })} style={{ width: "100%", padding: 6, marginTop: 4, borderRadius: 8, border: "1px solid #d1d5db" }} />
              </label>
            )}

            {isDesktop && step.type === "launch" && (
              <label style={{ fontSize: 12, marginTop: 6 }}>
                Target (exe/path)
                <input value={step.target} onChange={(e) => updateStep(idx, { target: e.target.value })} style={{ width: "100%", padding: 6, marginTop: 4, borderRadius: 8, border: "1px solid #d1d5db" }} />
              </label>
            )}
            {isDesktop && step.type === "wait" && (
              <label style={{ fontSize: 12, marginTop: 6 }}>
                Wait (ms)
                <input value={step.ms} onChange={(e) => updateStep(idx, { ms: Number(e.target.value || 0) })} style={{ width: "100%", padding: 6, marginTop: 4, borderRadius: 8, border: "1px solid #d1d5db" }} />
              </label>
            )}
            {isDesktop && step.type === "type" && (
              <label style={{ fontSize: 12, marginTop: 6 }}>
                Text
                <input value={step.text} onChange={(e) => updateStep(idx, { text: e.target.value })} style={{ width: "100%", padding: 6, marginTop: 4, borderRadius: 8, border: "1px solid #d1d5db" }} />
              </label>
            )}
            {isDesktop && step.type === "key" && (
              <label style={{ fontSize: 12, marginTop: 6 }}>
                Key combo
                <input value={step.combo} onChange={(e) => updateStep(idx, { combo: e.target.value })} style={{ width: "100%", padding: 6, marginTop: 4, borderRadius: 8, border: "1px solid #d1d5db" }} />
              </label>
            )}
            {isDesktop && step.type === "mouseMove" && (
              <div style={{ display: "grid", gap: 6, marginTop: 6 }}>
                <label style={{ fontSize: 12 }}>
                  X
                  <input value={step.x} onChange={(e) => updateStep(idx, { x: Number(e.target.value || 0) })} style={{ width: "100%", padding: 6, marginTop: 4, borderRadius: 8, border: "1px solid #d1d5db" }} />
                </label>
                <label style={{ fontSize: 12 }}>
                  Y
                  <input value={step.y} onChange={(e) => updateStep(idx, { y: Number(e.target.value || 0) })} style={{ width: "100%", padding: 6, marginTop: 4, borderRadius: 8, border: "1px solid #d1d5db" }} />
                </label>
              </div>
            )}
            {isDesktop && step.type === "mouseClick" && (
              <div style={{ display: "grid", gap: 6, marginTop: 6 }}>
                <label style={{ fontSize: 12 }}>
                  X
                  <input value={step.x} onChange={(e) => updateStep(idx, { x: Number(e.target.value || 0) })} style={{ width: "100%", padding: 6, marginTop: 4, borderRadius: 8, border: "1px solid #d1d5db" }} />
                </label>
                <label style={{ fontSize: 12 }}>
                  Y
                  <input value={step.y} onChange={(e) => updateStep(idx, { y: Number(e.target.value || 0) })} style={{ width: "100%", padding: 6, marginTop: 4, borderRadius: 8, border: "1px solid #d1d5db" }} />
                </label>
                <label style={{ fontSize: 12 }}>
                  Button
                  <select value={step.button || "left"} onChange={(e) => updateStep(idx, { button: e.target.value })} style={{ width: "100%", padding: 6, marginTop: 4, borderRadius: 8, border: "1px solid #d1d5db" }}>
                    <option value="left">left</option>
                    <option value="right">right</option>
                  </select>
                </label>
                <label style={{ fontSize: 12 }}>
                  Click count
                  <input value={step.count} onChange={(e) => updateStep(idx, { count: Number(e.target.value || 1) })} style={{ width: "100%", padding: 6, marginTop: 4, borderRadius: 8, border: "1px solid #d1d5db" }} />
                </label>
              </div>
            )}
            {isDesktop && step.type === "clipboardSet" && (
              <label style={{ fontSize: 12, marginTop: 6 }}>
                Clipboard text
                <input value={step.text} onChange={(e) => updateStep(idx, { text: e.target.value })} style={{ width: "100%", padding: 6, marginTop: 4, borderRadius: 8, border: "1px solid #d1d5db" }} />
              </label>
            )}
            {isDesktop && step.type === "screenshot" && (
              <label style={{ fontSize: 12, marginTop: 6 }}>
                Name
                <input value={step.name} onChange={(e) => updateStep(idx, { name: e.target.value })} style={{ width: "100%", padding: 6, marginTop: 4, borderRadius: 8, border: "1px solid #d1d5db" }} />
              </label>
            )}
            {isDesktop && step.type === "visionOcr" && (
              <div style={{ display: "grid", gap: 6, marginTop: 6 }}>
                <label style={{ fontSize: 12 }}>
                  Name
                  <input value={step.name} onChange={(e) => updateStep(idx, { name: e.target.value })} style={{ width: "100%", padding: 6, marginTop: 4, borderRadius: 8, border: "1px solid #d1d5db" }} />
                </label>
                <label style={{ fontSize: 12 }}>
                  Language
                  <input value={step.lang} onChange={(e) => updateStep(idx, { lang: e.target.value })} style={{ width: "100%", padding: 6, marginTop: 4, borderRadius: 8, border: "1px solid #d1d5db" }} />
                </label>
              </div>
            )}
            {isDesktop && step.type === "uiaClick" && (
              <div style={{ display: "grid", gap: 6, marginTop: 6 }}>
                <label style={{ fontSize: 12 }}>
                  Name
                  <input value={step.name} onChange={(e) => updateStep(idx, { name: e.target.value })} style={{ width: "100%", padding: 6, marginTop: 4, borderRadius: 8, border: "1px solid #d1d5db" }} />
                </label>
                <label style={{ fontSize: 12 }}>
                  Automation ID
                  <input value={step.automationId} onChange={(e) => updateStep(idx, { automationId: e.target.value })} style={{ width: "100%", padding: 6, marginTop: 4, borderRadius: 8, border: "1px solid #d1d5db" }} />
                </label>
                <label style={{ fontSize: 12 }}>
                  Class name
                  <input value={step.className} onChange={(e) => updateStep(idx, { className: e.target.value })} style={{ width: "100%", padding: 6, marginTop: 4, borderRadius: 8, border: "1px solid #d1d5db" }} />
                </label>
                <label style={{ fontSize: 12 }}>
                  Control type
                  <select value={step.controlType || ""} onChange={(e) => updateStep(idx, { controlType: e.target.value })} style={{ width: "100%", padding: 6, marginTop: 4, borderRadius: 8, border: "1px solid #d1d5db" }}>
                    {UIA_CONTROL_TYPES.map((ct) => (
                      <option key={ct} value={ct}>{ct || "(any)"}</option>
                    ))}
                  </select>
                </label>
              </div>
            )}
            {isDesktop && step.type === "uiaSetValue" && (
              <div style={{ display: "grid", gap: 6, marginTop: 6 }}>
                <label style={{ fontSize: 12 }}>
                  Name
                  <input value={step.name} onChange={(e) => updateStep(idx, { name: e.target.value })} style={{ width: "100%", padding: 6, marginTop: 4, borderRadius: 8, border: "1px solid #d1d5db" }} />
                </label>
                <label style={{ fontSize: 12 }}>
                  Automation ID
                  <input value={step.automationId} onChange={(e) => updateStep(idx, { automationId: e.target.value })} style={{ width: "100%", padding: 6, marginTop: 4, borderRadius: 8, border: "1px solid #d1d5db" }} />
                </label>
                <label style={{ fontSize: 12 }}>
                  Class name
                  <input value={step.className} onChange={(e) => updateStep(idx, { className: e.target.value })} style={{ width: "100%", padding: 6, marginTop: 4, borderRadius: 8, border: "1px solid #d1d5db" }} />
                </label>
                <label style={{ fontSize: 12 }}>
                  Control type
                  <select value={step.controlType || ""} onChange={(e) => updateStep(idx, { controlType: e.target.value })} style={{ width: "100%", padding: 6, marginTop: 4, borderRadius: 8, border: "1px solid #d1d5db" }}>
                    {UIA_CONTROL_TYPES.map((ct) => (
                      <option key={ct} value={ct}>{ct || "(any)"}</option>
                    ))}
                  </select>
                </label>
                <label style={{ fontSize: 12 }}>
                  Value
                  <input value={step.value} onChange={(e) => updateStep(idx, { value: e.target.value })} style={{ width: "100%", padding: 6, marginTop: 4, borderRadius: 8, border: "1px solid #d1d5db" }} />
                </label>
              </div>
            )}
          </div>
        ))}
        <button onClick={addStep} style={{ marginTop: 8, padding: "6px 10px", borderRadius: 8 }}>
          Add Step
        </button>
        <button onClick={saveMacro} style={{ marginTop: 8, marginLeft: 6, padding: "6px 10px", borderRadius: 8 }}>
          Save Macro
        </button>
      </div>

      <div style={{ border: "1px solid #e5e7eb", borderRadius: 12, padding: 12, background: "white" }}>
        <div style={{ fontWeight: 600, marginBottom: 6 }}>Run Macro</div>
        <select
          value={selectedMacro?.id || ""}
          onChange={(e) => handleSelectMacro(e.target.value)}
          style={{ width: "100%", padding: 8, borderRadius: 8, border: "1px solid #d1d5db" }}
        >
          <option value="">Select a macro</option>
          {macros.map(macro => (
            <option key={macro.id} value={macro.id}>{macro.name} ({macro.mode || "browser"})</option>
          ))}
        </select>
        {selectedMacro?.params?.length > 0 && (
          <div style={{ marginTop: 8, display: "grid", gap: 6 }}>
            {selectedMacro.params.map(param => (
              <label key={param} style={{ fontSize: 12 }}>
                {param}
                <input
                  value={macroParams[param] || ""}
                  onChange={(e) => setMacroParams(prev => ({ ...prev, [param]: e.target.value }))}
                  style={{ width: "100%", padding: 6, marginTop: 4, borderRadius: 8, border: "1px solid #d1d5db" }}
                />
              </label>
            ))}
          </div>
        )}
        <button onClick={runMacro} style={{ marginTop: 8, padding: "6px 10px", borderRadius: 8 }}>
          Run Macro
        </button>
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
        {runResult && (
          <pre style={{ marginTop: 8, background: "#0b1220", color: "#e5e7eb", padding: 8, borderRadius: 8, fontSize: 11, overflow: "auto" }}>
{JSON.stringify(runResult, null, 2)}
          </pre>
        )}
      </div>
    </div>
  );
}
