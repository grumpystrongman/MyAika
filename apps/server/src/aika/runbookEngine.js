import { readConfigList } from "./config.js";
import { createModuleRun, updateModuleRun } from "../../storage/module_runs.js";
import { createRunStep, updateRunStep } from "../../storage/run_steps.js";
import { createManualAction } from "../../storage/manual_actions.js";
import { appendAuditEvent } from "../safety/auditLog.js";

const RUNBOOKS_CONFIG = "aika_runbooks.json";

function nowIso() {
  return new Date().toISOString();
}

function normalizeText(value) {
  return String(value || "").trim().toLowerCase();
}

export function loadRunbookDefinitions() {
  const raw = readConfigList(RUNBOOKS_CONFIG);
  return raw.filter(item => item && item.name);
}

export function listRunbooks() {
  return loadRunbookDefinitions();
}

export function findRunbookByNameOrTrigger(text = "") {
  const normalized = normalizeText(text);
  if (!normalized) return null;
  const runbooks = loadRunbookDefinitions();
  for (const runbook of runbooks) {
    if (normalizeText(runbook.name) === normalized) return runbook;
    const triggers = Array.isArray(runbook.triggers) ? runbook.triggers : [];
    for (const trigger of triggers) {
      if (normalized.includes(normalizeText(trigger))) return runbook;
    }
  }
  return null;
}

function buildRunbookChecklist(runbook) {
  const deliverables = Array.isArray(runbook.deliverables) ? runbook.deliverables : [];
  return [
    "Gather required inputs.",
    "Execute each phase and capture notes.",
    ...deliverables.map(item => `Finalize deliverable: ${item}.`),
    "Review with Jeff for confirmation."
  ];
}

export async function executeRunbook({ name, inputPayload = {}, context = {} } = {}) {
  const runbook = findRunbookByNameOrTrigger(name || "");
  if (!runbook) {
    return { status: "error", error: "runbook_not_found", reply: "Runbook not found." };
  }

  const run = createModuleRun({
    userId: context.userId || "local",
    moduleId: `runbook:${runbook.name}`,
    channel: context.channel || "",
    status: "running",
    inputPayload
  });

  const output = {
    summary: `${runbook.name} initiated.`,
    details: runbook.description || "",
    action_items: [],
    manual_checklist: [],
    artifacts: { deliverables: runbook.deliverables || [] }
  };

  const phases = Array.isArray(runbook.phases) ? runbook.phases : [];
  let stepIndex = 0;
  for (const phase of phases) {
    const steps = Array.isArray(phase.steps) ? phase.steps : [];
    for (const step of steps) {
      const record = createRunStep({
        moduleRunId: run.id,
        stepIndex,
        stepType: step.step_type || "analysis",
        status: "running",
        request: { phase: phase.phase_name || "", description: step.description || "" }
      });
      const response = { phase: phase.phase_name || "", description: step.description || "" };
      updateRunStep(record.id, { status: "completed", response, endedAt: nowIso() });
      stepIndex += 1;
    }
  }

  const checklist = buildRunbookChecklist(runbook);
  output.manual_checklist = checklist;
  createManualAction({
    userId: context.userId || "local",
    sourceRunId: run.id,
    title: `${runbook.name} manual steps`,
    instructions: checklist.join("\n"),
    copyReadyPayload: { runbook: runbook.name, checklist },
    status: "pending"
  });

  updateModuleRun(run.id, { status: "completed", outputPayload: output, completedAt: nowIso() });
  appendAuditEvent({
    action_type: "runbook.run",
    decision: "completed",
    reason: runbook.name,
    user: context.userId || "local",
    session: context.sessionId || "",
    redacted_payload: { runbook: runbook.name },
    result_redacted: { status: "completed" }
  });

  return { status: "completed", run, output };
}
