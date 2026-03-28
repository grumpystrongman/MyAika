import { executor as defaultExecutor } from "../../mcp/index.js";

function normalize(text) {
  return String(text || "").trim();
}

function extractFirstUrl(text = "") {
  const match = String(text || "").match(/https?:\/\/[^\s)]+/i);
  return match ? match[0] : "";
}

function buildExecutionContext(context = {}) {
  return {
    userId: context.userId || "local",
    correlationId: context.sessionId || "",
    source: context.channel || "aika_protocol",
    workspaceId: context.workspaceId || "default"
  };
}

function summarizeLaneResult(toolName, result) {
  if (!result) return "";
  if (toolName === "web.search") {
    const list = Array.isArray(result?.data?.results) ? result.data.results : Array.isArray(result?.results) ? result.results : [];
    return `results=${list.length}`;
  }
  if (toolName === "action.run") {
    const runId = result?.data?.id || result?.id || result?.data?.runId || "";
    return runId ? `run=${runId}` : "action.run invoked";
  }
  if (toolName === "desktop.run") {
    const runId = result?.data?.id || result?.id || result?.data?.runId || "";
    return runId ? `run=${runId}` : "desktop.run invoked";
  }
  return "lane action executed";
}

async function callTool(toolExecutor, name, params, context = {}) {
  const result = await toolExecutor.callTool({
    name,
    params,
    context: buildExecutionContext(context)
  });
  if (result?.status === "approval_required") {
    return {
      status: "approval_required",
      tool: name,
      approval: result.approval || null,
      result
    };
  }
  if (result?.status === "error") {
    return {
      status: "error",
      tool: name,
      error: result?.error || null,
      result
    };
  }
  return {
    status: "completed",
    tool: name,
    result,
    evidence: summarizeLaneResult(name, result)
  };
}

export async function executeLaneIntent({
  classification = {},
  text = "",
  context = {},
  toolExecutor = null
} = {}) {
  const intent = classification?.intent || "";
  const lane = classification?.laneDecision?.lane || "";
  const cleanedText = normalize(text);
  const executor = toolExecutor || defaultExecutor;

  if (!intent || !lane) {
    return { status: "skipped", reason: "intent_or_lane_missing" };
  }

  if (intent === "STAGE" || intent === "SIMULATE" || intent === "ANALYZE" || intent === "PREPARE" || intent === "AUTOPILOT") {
    return { status: "skipped", reason: "intent_is_plan_or_analysis" };
  }

  if (lane === "code" || lane === "orchestration") {
    return { status: "skipped", reason: "handled_by_module_lane" };
  }

  if (lane === "observability") {
    return {
      status: "skipped",
      reason: "opik_lane_not_bound",
      note: "Opik lane selected but no direct runtime executor is configured yet."
    };
  }

  if (lane === "deterministic_web") {
    const url = extractFirstUrl(cleanedText);
    if (url) {
      const params = {
        taskName: `Aika control: ${cleanedText.slice(0, 80)}`,
        startUrl: url,
        actions: [
          { type: "waitFor", selector: "body", timeoutMs: 15000 },
          { type: "extractText", selector: "body", name: "page_text" }
        ],
        safety: { maxActions: 20 },
        async: true
      };
      return callTool(executor, "action.run", params, context);
    }
    return callTool(executor, "web.search", { query: cleanedText, limit: 5 }, context);
  }

  if (lane === "workflow_web") {
    const url = extractFirstUrl(cleanedText);
    if (!url) {
      return callTool(executor, "web.search", { query: cleanedText, limit: 5 }, context);
    }
    const params = {
      taskName: `Aika workflow: ${cleanedText.slice(0, 80)}`,
      startUrl: url,
      actions: [
        { type: "waitFor", selector: "body", timeoutMs: 15000 },
        { type: "screenshot", name: "workflow_landing" },
        { type: "extractText", selector: "body", name: "workflow_text" }
      ],
      safety: { maxActions: 30 },
      async: true
    };
    return callTool(executor, "action.run", params, context);
  }

  if (lane === "desktop") {
    const params = {
      taskName: `Aika desktop control: ${cleanedText.slice(0, 80)}`,
      actions: [
        { type: "screenshot", name: "desktop_probe" }
      ],
      safety: { maxActions: 5 },
      async: true
    };
    return callTool(executor, "desktop.run", params, context);
  }

  return { status: "skipped", reason: "unsupported_lane" };
}
