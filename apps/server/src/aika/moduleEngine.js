import { executor } from "../../mcp/index.js";
import { createSafetyApproval } from "../safety/approvals.js";
import { appendAuditEvent } from "../safety/auditLog.js";
import { detectPhi } from "../safety/redact.js";
import { createModuleRun, updateModuleRun } from "../../storage/module_runs.js";
import { createRunStep, updateRunStep } from "../../storage/run_steps.js";
import { createManualAction } from "../../storage/manual_actions.js";
import { createConfirmation } from "../../storage/confirmations.js";
import { upsertMemoryItem } from "../../storage/memory_items.js";
import { listModuleRegistry, findModuleByNameOrTrigger } from "./moduleRegistry.js";
import { getSettings } from "../../storage/settings.js";

function nowIso() {
  return new Date().toISOString();
}

function resolveNoIntegrations({ modeFlags } = {}) {
  if (modeFlags && modeFlags.no_integrations === true) return true;
  if (String(process.env.AIKA_NO_INTEGRATIONS || "0") === "1") return true;
  return false;
}

function getValueByPath(input, path) {
  const parts = String(path || "").split(".").filter(Boolean);
  let current = input;
  for (const part of parts) {
    if (!current || typeof current !== "object") return undefined;
    current = current[part];
  }
  return current;
}

function renderTemplate(value, input) {
  if (typeof value !== "string") return value;
  return value.replace(/\{\{\s*([^}]+)\s*\}\}/g, (_match, expr) => {
    const trimmed = String(expr || "").trim();
    const mapped = getValueByPath(input, trimmed);
    return mapped == null ? "" : String(mapped);
  });
}

function resolveInputMapping(mapping, input) {
  if (!mapping || typeof mapping !== "object") return {};
  const out = {};
  for (const [key, value] of Object.entries(mapping)) {
    out[key] = renderTemplate(value, input);
  }
  return out;
}

function defaultChecklist(moduleDef) {
  const name = moduleDef?.name || "this module";
  return [
    `Collect inputs for ${name}.`,
    `Draft the ${name} output and validate assumptions.`,
    "Send to Jeff for confirmation or next steps."
  ];
}

function buildDecisionBrief(input = {}) {
  const options = Array.isArray(input?.options) ? input.options : [];
  const criteria = Array.isArray(input?.criteria) ? input.criteria : [];
  const recommendation = options[0] ? `Recommend ${options[0]}.` : "Recommend the strongest option based on criteria.";
  const pros = options[0] ? `Pros: aligns with ${criteria[0] || "priority outcomes"}.` : "Pros: aligns with priorities.";
  const cons = options[1] ? `Cons: ${options[1]} may introduce tradeoffs.` : "Cons: tradeoffs require validation.";
  const risks = "Risks: dependency timing and stakeholder alignment.";
  const choices = options.length ? options.slice(0, 3).map(item => `- ${item}`).join("\n") : "- Option A\n- Option B";
  return [
    recommendation,
    `- ${pros}`,
    `- ${cons}`,
    `- ${risks}`,
    "Options:",
    choices,
    "What I need from Jeff: confirm preferred option or provide missing constraints."
  ].join("\n");
}

function buildAnalysisOutput(moduleDef, inputPayload = {}) {
  if (!moduleDef) return { summary: "Module not found.", details: "" };
  const contextText = String(inputPayload.context_text || "").trim();
  const baseSummary = contextText
    ? `${moduleDef.name}: processed request "${contextText.slice(0, 120)}${contextText.length > 120 ? "..." : ""}".`
    : `${moduleDef.name}: prepared initial analysis.`;
  if (moduleDef.id === "decision_brief_generator") {
    return {
      summary: "Decision brief drafted.",
      details: buildDecisionBrief(inputPayload.structured_input || {})
    };
  }
  if (moduleDef.id === "counterfactual_engine") {
    return {
      summary: "Counterfactual analysis outline prepared.",
      details: "30/60/90-day outcomes drafted with assumptions and leading indicators."
    };
  }
  if (moduleDef.id === "strategy_lab") {
    return {
      summary: "Strategy set drafted.",
      details: "Included bold, conservative, and hybrid strategies with failure modes."
    };
  }
  return {
    summary: baseSummary,
    details: moduleDef.description || ""
  };
}

function sanitizeMemoryPayload(payload = {}) {
  const text = JSON.stringify(payload);
  if (detectPhi(text)) {
    return { blocked: true, reason: "phi_detected" };
  }
  return { blocked: false };
}

async function runToolStep(step, inputPayload, context = {}, options = {}) {
  const toolName = step.tool_name || step.toolName;
  if (!toolName) return { status: "skipped", result: { error: "tool_missing" } };
  const params = resolveInputMapping(step.input_mapping || step.inputMapping || {}, inputPayload);
  const executionContext = {
    userId: context.userId || "local",
    source: context.source || "aika_module"
  };
  const result = await (options.toolExecutor || executor).callTool({
    name: toolName,
    params,
    context: executionContext
  });
  return result;
}

function createManualChecklistAction({ moduleDef, runId, checklist, userId }) {
  const instructions = Array.isArray(checklist) ? checklist.join("\n") : String(checklist || "");
  return createManualAction({
    userId,
    sourceRunId: runId,
    priority: "medium",
    title: `${moduleDef?.name || "Module"} manual steps`,
    instructions,
    copyReadyPayload: {
      moduleId: moduleDef?.id || "",
      checklist: Array.isArray(checklist) ? checklist : []
    },
    status: "pending"
  });
}

function createStepConfirmation({ moduleDef, step, runId, userId }) {
  const summary = `${moduleDef?.name || "Module"} requires confirmation for ${step.name || "action"}.`;
  const approval = createSafetyApproval({
    actionType: step.tool_name || step.toolName || moduleDef?.id || "module.confirmation",
    summary,
    payloadRedacted: { moduleId: moduleDef?.id || "", step: step.name || "" },
    createdBy: userId || "local"
  });
  const confirmation = createConfirmation({
    userId,
    runId,
    actionType: step.tool_name || step.toolName || moduleDef?.id || "module.confirmation",
    summary,
    details: { moduleId: moduleDef?.id || "", step: step.name || "" },
    status: "pending",
    approvalId: approval?.id || ""
  });
  return { approval, confirmation };
}

export async function executeModule({
  moduleId,
  moduleName,
  inputPayload = {},
  context = {},
  modeFlags = null,
  toolExecutor = null
} = {}) {
  const modules = listModuleRegistry({ includeDisabled: true });
  const moduleDef = moduleId
    ? modules.find(m => m.id === moduleId)
    : findModuleByNameOrTrigger(moduleName || "", modules);
  if (!moduleDef) {
    return { status: "error", error: "module_not_found", reply: "I couldn't find that module." };
  }

  const settings = getSettings(context.userId || "local");
  const noIntegrations = resolveNoIntegrations({ modeFlags: modeFlags || settings.modeFlags })
    || inputPayload?.options?.no_integrations === true;
  const run = createModuleRun({
    userId: context.userId || "local",
    moduleId: moduleDef.id,
    channel: context.channel || "",
    status: "running",
    inputPayload
  });

  const output = {
    summary: "",
    details: "",
    action_items: [],
    manual_checklist: [],
    artifacts: {}
  };

  let runStatus = "completed";
  let approval = null;

  const steps = Array.isArray(moduleDef.actionDefinition?.steps)
    ? moduleDef.actionDefinition.steps
    : Array.isArray(moduleDef.action_definition?.steps)
      ? moduleDef.action_definition.steps
      : [];

  for (let index = 0; index < steps.length; index += 1) {
    const step = steps[index] || {};
    const stepRecord = createRunStep({
      moduleRunId: run.id,
      stepIndex: index,
      stepType: step.step_type || "",
      status: "running",
      request: step
    });
    try {
      if (step.step_type === "analysis") {
        const analysis = buildAnalysisOutput(moduleDef, inputPayload);
        output.summary = output.summary || analysis.summary;
        output.details = output.details || analysis.details;
        updateRunStep(stepRecord.id, { status: "completed", response: analysis, endedAt: nowIso() });
        continue;
      }

      if (step.step_type === "manual") {
        const checklist = moduleDef.templates?.manual_checklist || defaultChecklist(moduleDef);
        output.manual_checklist = checklist;
        createManualChecklistAction({
          moduleDef,
          runId: run.id,
          checklist,
          userId: context.userId || "local"
        });
        updateRunStep(stepRecord.id, { status: "completed", response: { checklist }, endedAt: nowIso() });
        continue;
      }

      if (step.step_type === "confirmation") {
        const confirmation = createStepConfirmation({
          moduleDef,
          step,
          runId: run.id,
          userId: context.userId || "local"
        });
        approval = confirmation.approval;
        runStatus = "approval_required";
        updateRunStep(stepRecord.id, {
          status: "approval_required",
          response: { approval: confirmation.approval, confirmation: confirmation.confirmation },
          endedAt: nowIso()
        });
        break;
      }

      if (step.step_type === "notify") {
        if (noIntegrations) {
          updateRunStep(stepRecord.id, { status: "skipped", response: { reason: "no_integrations" }, endedAt: nowIso() });
          continue;
        }
        const result = await runToolStep(step, inputPayload, context, { toolExecutor });
        if (result?.status === "approval_required") {
          approval = result.approval || null;
          runStatus = "approval_required";
          updateRunStep(stepRecord.id, { status: "approval_required", response: result, endedAt: nowIso() });
          break;
        }
        updateRunStep(stepRecord.id, { status: "completed", response: result, endedAt: nowIso() });
        output.artifacts[step.output_key || `step_${index}`] = result?.data || result;
        continue;
      }

      if (step.step_type === "tool_call") {
        if (noIntegrations) {
          const checklist = moduleDef.templates?.manual_checklist || defaultChecklist(moduleDef);
          output.manual_checklist = checklist;
          createManualChecklistAction({
            moduleDef,
            runId: run.id,
            checklist,
            userId: context.userId || "local"
          });
          updateRunStep(stepRecord.id, { status: "skipped", response: { reason: "no_integrations" }, endedAt: nowIso() });
          continue;
        }

        if (step.requires_confirmation || moduleDef.requiresConfirmation) {
          const confirmation = createStepConfirmation({
            moduleDef,
            step,
            runId: run.id,
            userId: context.userId || "local"
          });
          approval = confirmation.approval;
          runStatus = "approval_required";
          updateRunStep(stepRecord.id, {
            status: "approval_required",
            response: { approval: confirmation.approval, confirmation: confirmation.confirmation },
            endedAt: nowIso()
          });
          break;
        }

        const result = await runToolStep(step, inputPayload, context, { toolExecutor });
        if (result?.status === "approval_required") {
          approval = result.approval || null;
          runStatus = "approval_required";
          updateRunStep(stepRecord.id, { status: "approval_required", response: result, endedAt: nowIso() });
          break;
        }
        if (result?.status === "error") {
          runStatus = "error";
          updateRunStep(stepRecord.id, { status: "error", response: result, endedAt: nowIso() });
          break;
        }
        const resolvedToolName = step.tool_name || step.toolName;
        if (resolvedToolName === "memory.write") {
          const sanitized = sanitizeMemoryPayload(result?.data || {});
          const sensitivity = inputPayload?.structured_input?.sensitivity || "normal";
          if (sensitivity === "do_not_store") {
            runStatus = "partial";
            updateRunStep(stepRecord.id, { status: "blocked", response: { reason: "do_not_store" }, endedAt: nowIso() });
          } else if (sanitized.blocked) {
            runStatus = "partial";
            updateRunStep(stepRecord.id, { status: "blocked", response: { reason: sanitized.reason }, endedAt: nowIso() });
          } else if (inputPayload?.structured_input?.key) {
            upsertMemoryItem({
              userId: context.userId || "local",
              scope: "memory",
              key: String(inputPayload.structured_input.key),
              value: inputPayload.structured_input.value || {},
              sensitivity,
              source: "module"
            });
          }
        }
        updateRunStep(stepRecord.id, { status: "completed", response: result, endedAt: nowIso() });
        output.artifacts[step.output_key || `step_${index}`] = result?.data || result;
        continue;
      }

      updateRunStep(stepRecord.id, { status: "skipped", response: { reason: "unsupported_step" }, endedAt: nowIso() });
    } catch (err) {
      runStatus = "error";
      updateRunStep(stepRecord.id, { status: "error", response: { error: err?.message || "step_failed" }, endedAt: nowIso() });
      break;
    }
  }

  const completedAt = runStatus === "completed" ? nowIso() : null;
  updateModuleRun(run.id, { status: runStatus, outputPayload: output, completedAt });
  appendAuditEvent({
    action_type: "module.run",
    decision: runStatus,
    reason: moduleDef.id,
    user: context.userId || "local",
    session: context.sessionId || "",
    redacted_payload: { moduleId: moduleDef.id },
    result_redacted: { status: runStatus }
  });

  return {
    status: runStatus,
    run,
    output,
    approval
  };
}
