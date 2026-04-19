function normalize(text) {
  return String(text || "").replace(/\s+/g, " ").trim();
}

export function summarizeAssistantOrchestration(orchestration = null) {
  if (!orchestration || typeof orchestration !== "object") return null;
  const items = Array.isArray(orchestration.items) ? orchestration.items : [];
  const actions = Array.isArray(orchestration.actions) ? orchestration.actions : [];
  const capabilities = Array.isArray(orchestration.capabilities) ? orchestration.capabilities : [];

  const summaryItems = items.map((item, index) => ({
    id: `${item.kind || "step"}-${index}`,
    kind: item.kind || "unknown",
    clause: normalize(item.clause || ""),
    label:
      item.kind === "execution"
        ? normalize(item.actionType || "Action")
        : normalize((item.capabilities || []).join(", ") || "Capability")
  }));

  const reads = summaryItems.filter(item => item.kind !== "execution");
  const executions = summaryItems.filter(item => item.kind === "execution");

  return {
    summaryItems,
    reads,
    executions,
    actionCount: actions.length,
    capabilityCount: capabilities.length,
    capabilities,
    actions
  };
}

export function formatApprovalStatusLabel(status = "") {
  const normalized = String(status || "").toLowerCase();
  if (normalized === "approved") return "Approved";
  if (normalized === "executed") return "Executed";
  if (normalized === "denied" || normalized === "rejected") return "Denied";
  return "Pending";
}

export function summarizeApprovalExecution(execution = null) {
  if (!execution || typeof execution !== "object") return null;
  const status = normalize(execution.status || execution.data?.status || "ok");
  const data = execution.data && typeof execution.data === "object" ? execution.data : {};
  const payload = data.data && typeof data.data === "object" ? data.data : data;
  const message =
    normalize(
      payload.summary ||
      payload.message ||
      payload.result ||
      payload.status ||
      execution.message ||
      ""
    ) || "Action executed.";
  return {
    status,
    message,
    payload
  };
}
