import path from "node:path";
import fs from "node:fs";
import { spawnSync } from "node:child_process";
import { listAllowedApps, recordApps } from "./allowlist.js";
import {
  createRunRecord,
  appendTimeline,
  appendArtifact,
  setRunStatus,
  getRunRecord,
  getRunDir,
  setRunPendingApproval,
  setRunStopRequested
} from "./runStore.js";
import { createSafetyApproval, getSafetyApproval } from "../safety/approvals.js";
import { isKillSwitchEnabled } from "../safety/killSwitch.js";

const DEFAULT_REQUIRE_APPROVAL = ["launch", "input", "key", "mouse", "clipboard", "screenshot", "new_app", "vision", "uia"];
const DEFAULT_MAX_ACTIONS = 40;
const DEFAULT_APPROVAL_MODE = "per_run";

function resolveRepoRoot() {
  const cwd = process.cwd();
  const marker = path.join(cwd, "apps", "server");
  if (fs.existsSync(marker)) return cwd;
  return path.resolve(cwd, "..", "..");
}

const repoRoot = resolveRepoRoot();
const scriptPath = path.join(repoRoot, "apps", "server", "scripts", "desktop_action.ps1");

function nowIso() {
  return new Date().toISOString();
}

function normalizeTarget(value) {
  return String(value || "").trim();
}

function normalizeTargetKey(value) {
  return normalizeTarget(value).toLowerCase();
}

function extractTargetsFromPlan({ actions } = {}) {
  const targets = [];
  for (const action of actions || []) {
    if (String(action?.type || "").toLowerCase() !== "launch") continue;
    const target = normalizeTarget(action?.target || action?.app || action?.path || "");
    if (target) targets.push(target);
  }
  return Array.from(new Set(targets));
}

function detectRiskTags(action) {
  const tags = new Set();
  const type = String(action?.type || "").toLowerCase();
  if (type === "launch") tags.add("launch");
  if (type === "type") tags.add("input");
  if (type === "key") tags.add("key");
  if (type === "mousemove" || type === "mouseclick") tags.add("mouse");
  if (type === "clipboardset") tags.add("clipboard");
  if (type === "screenshot") tags.add("screenshot");
  if (type === "visionocr") tags.add("vision");
  if (type === "uiaclick" || type === "uiasetvalue") tags.add("uia");
  if (!type) tags.add("unknown");
  return tags;
}

function assessDesktopStep({ action, safety, workspaceId } = {}) {
  const requireList = new Set(
    (safety?.requireApprovalFor || DEFAULT_REQUIRE_APPROVAL).map(item => String(item).toLowerCase())
  );
  const tags = detectRiskTags(action);
  const reasons = [];
  const type = String(action?.type || "").toLowerCase();
  let newApp = null;
  if (type === "launch") {
    const target = normalizeTarget(action?.target || action?.app || action?.path || "");
    const allowed = listAllowedApps(workspaceId || "default").map(item => normalizeTargetKey(item));
    if (target && !allowed.includes(normalizeTargetKey(target))) {
      tags.add("new_app");
      newApp = target;
      reasons.push(`New app: ${target}`);
    }
  }
  const requiresApproval = Array.from(tags).some(tag => requireList.has(tag));
  return { requiresApproval, tags: Array.from(tags), reasons, newApp };
}

export function assessDesktopPlan({ taskName, actions, safety, workspaceId } = {}) {
  const requireList = new Set(
    (safety?.requireApprovalFor || DEFAULT_REQUIRE_APPROVAL).map(item => String(item).toLowerCase())
  );
  const envMax = Number(process.env.DESKTOP_RUNNER_MAX_ACTIONS || DEFAULT_MAX_ACTIONS);
  const maxActions = Math.min(Number(safety?.maxActions || envMax || DEFAULT_MAX_ACTIONS), envMax || DEFAULT_MAX_ACTIONS);
  const items = Array.isArray(actions) ? actions : [];

  const targets = extractTargetsFromPlan({ actions: items });
  const allowed = listAllowedApps(workspaceId || "default").map(item => normalizeTargetKey(item));
  const newApps = targets.filter(target => !allowed.includes(normalizeTargetKey(target)));

  const riskTags = new Set();
  const reasons = [];
  if (newApps.length) {
    riskTags.add("new_app");
    reasons.push(`New apps: ${newApps.join(", ")}`);
  }
  for (const action of items) {
    const tags = detectRiskTags(action);
    for (const tag of tags) riskTags.add(tag);
  }

  const requiresApproval = newApps.length > 0 || Array.from(riskTags).some(tag => requireList.has(tag));

  return {
    requiresApproval,
    riskTags: Array.from(riskTags),
    newApps,
    maxActions,
    totalActions: items.length,
    taskName: taskName || "Desktop Run",
    reasons
  };
}

function normalizeAction(action) {
  const type = String(action?.type || "").trim();
  if (!type) return null;
  const lower = type.toLowerCase();
  if (lower === "launch") {
    const target = normalizeTarget(action?.target || action?.app || action?.path || "");
    return target ? { type: "launch", target } : null;
  }
  if (lower === "wait") {
    return { type: "wait", ms: Number(action?.ms || 500) };
  }
  if (lower === "type") {
    return { type: "type", text: String(action?.text || "") };
  }
  if (lower === "key") {
    return { type: "key", combo: String(action?.combo || action?.key || "") };
  }
  if (lower === "mousemove") {
    return { type: "mouseMove", x: Number(action?.x || 0), y: Number(action?.y || 0) };
  }
  if (lower === "mouseclick") {
    return {
      type: "mouseClick",
      x: Number(action?.x ?? 0),
      y: Number(action?.y ?? 0),
      button: String(action?.button || "left"),
      count: Number(action?.count || 1)
    };
  }
  if (lower === "screenshot") {
    return { type: "screenshot", name: String(action?.name || "desktop") };
  }
  if (lower === "visionocr" || lower === "ocr") {
    return { type: "visionOcr", name: String(action?.name || "vision"), lang: String(action?.lang || "eng") };
  }
  if (lower === "uiaclick") {
    return {
      type: "uiaClick",
      name: String(action?.name || ""),
      automationId: String(action?.automationId || ""),
      className: String(action?.className || ""),
      controlType: String(action?.controlType || "")
    };
  }
  if (lower === "uiasetvalue") {
    return {
      type: "uiaSetValue",
      name: String(action?.name || ""),
      automationId: String(action?.automationId || ""),
      className: String(action?.className || ""),
      controlType: String(action?.controlType || ""),
      value: String(action?.value || action?.text || "")
    };
  }
  if (lower === "clipboardset") {
    return { type: "clipboardSet", text: String(action?.text || "") };
  }
  return { type };
}

function runDesktopAction(action, runDir) {
  if (!fs.existsSync(scriptPath)) {
    throw new Error("desktop_action_script_missing");
  }
  const payload = JSON.stringify(action);
  const args = [
    "-NoProfile",
    "-ExecutionPolicy",
    "Bypass",
    "-File",
    scriptPath,
    "-ActionJson",
    payload,
    "-ArtifactDir",
    runDir
  ];
  const result = spawnSync("powershell", args, { encoding: "utf8" });
  if (result.error) throw result.error;
  if (result.status !== 0) {
    const err = new Error(result.stderr?.trim() || "desktop_action_failed");
    err.code = result.status;
    throw err;
  }
  const stdout = String(result.stdout || "").trim();
  if (!stdout) return { ok: true };
  try {
    return JSON.parse(stdout);
  } catch {
    return { ok: true, raw: stdout };
  }
}

async function runVisionOcr(action, runDir, stepIndex) {
  const screenshotResult = runDesktopAction({ type: "screenshot", name: action?.name || "vision" }, runDir);
  const fileName = screenshotResult?.artifact;
  if (!fileName) return { ok: false, error: "vision_screenshot_failed" };
  const filePath = path.join(runDir, fileName);
  let text = "";
  try {
    const mod = await import("tesseract.js");
    const createWorker = mod.createWorker || mod.default?.createWorker || mod.default;
    const worker = await createWorker(action?.lang || "eng");
    const result = await worker.recognize(filePath);
    text = String(result?.data?.text || "");
    await worker.terminate();
  } catch (err) {
    return { ok: false, error: err?.message || "vision_ocr_failed", screenshot: fileName };
  }

  const textFile = `vision_${stepIndex + 1}_${action?.name || "ocr"}.txt`;
  const textPath = path.join(runDir, textFile);
  fs.writeFileSync(textPath, text);
  return { ok: true, artifact: textFile, artifactType: "ocr", screenshot: fileName, text };
}

async function runSteps(runId, plan, context = {}, options = {}) {
  const { taskName, actions, safety } = plan;
  const workspaceId = context.workspaceId || "default";
  const envMax = Number(process.env.DESKTOP_RUNNER_MAX_ACTIONS || DEFAULT_MAX_ACTIONS);
  const maxActions = Math.min(Number(safety?.maxActions || envMax || DEFAULT_MAX_ACTIONS), envMax || DEFAULT_MAX_ACTIONS);
  const initialActions = Array.isArray(actions) ? actions : [];
  if (initialActions.length > maxActions) {
    throw new Error("desktop_runner_max_actions_exceeded");
  }

  const runDir = getRunDir(runId);
  const approvalMode = String(safety?.approvalMode || DEFAULT_APPROVAL_MODE).toLowerCase();
  if (approvalMode !== "per_step") {
    const launchTargets = extractTargetsFromPlan({ actions: initialActions });
    if (launchTargets.length) {
      recordApps(launchTargets, workspaceId);
    }
  }

  const startIndex = Number.isFinite(options?.startIndex) ? options.startIndex : 0;
  for (let index = startIndex; index < initialActions.length; index += 1) {
    const rawAction = initialActions[index];
    const action = normalizeAction(rawAction);
    const startedAt = nowIso();
    let status = "ok";
    let error = "";
    try {
      if (isKillSwitchEnabled()) {
        setRunStatus(runId, "stopped", { error: "kill_switch_active", finishedAt: nowIso() });
        return getRunRecord(runId);
      }
      const current = getRunRecord(runId);
      if (current?.stopRequested) {
        setRunStatus(runId, "stopped", { error: "stop_requested", finishedAt: nowIso() });
        return getRunRecord(runId);
      }

      if (approvalMode === "per_step") {
        const decision = assessDesktopStep({ action, safety, workspaceId });
        if (decision.requiresApproval) {
          const summary = `Approve desktop step ${index + 1}: ${action?.type || "action"}`;
          const approval = createSafetyApproval({
            actionType: "desktop.step",
            summary,
            payloadRedacted: { action, step: index + 1, reasons: decision.reasons }
          });
          setRunPendingApproval(runId, {
            id: approval.id,
            step: index + 1,
            stepIndex: index,
            action,
            reasons: decision.reasons
          });
          appendTimeline(runId, {
            step: index + 1,
            type: action?.type || "unknown",
            status: "approval_required",
            startedAt,
            finishedAt: nowIso(),
            error: "",
            action: rawAction
          });
          setRunStatus(runId, "approval_required", { error: "approval_required" });
          return getRunRecord(runId);
        }
      }
      if (!action) throw new Error("desktop_action_invalid");
      if (action.type === "visionOcr") {
        const result = await runVisionOcr(action, runDir, index);
        if (result?.artifact) {
          appendArtifact(runId, {
            type: result.artifactType || "ocr",
            file: result.artifact,
            step: index + 1,
            createdAt: nowIso()
          });
        }
        if (result?.screenshot) {
          appendArtifact(runId, {
            type: "screenshot",
            file: result.screenshot,
            step: index + 1,
            createdAt: nowIso()
          });
        }
        if (!result?.ok) {
          throw new Error(result?.error || "vision_ocr_failed");
        }
      } else {
        const result = runDesktopAction(action, runDir);
        if (result?.artifact) {
          appendArtifact(runId, {
            type: result.artifactType || (action.type === "screenshot" ? "screenshot" : "artifact"),
            file: result.artifact,
            step: index + 1,
            createdAt: nowIso()
          });
        }
        if (action.type === "launch") {
          recordApps([action.target], workspaceId);
        }
      }
    } catch (err) {
      status = "error";
      error = err?.message || "desktop_action_failed";
    }

    appendTimeline(runId, {
      step: index + 1,
      type: action?.type || "unknown",
      status,
      startedAt,
      finishedAt: nowIso(),
      error,
      action: rawAction
    });

    if (status === "error") {
      setRunStatus(runId, "error", { error });
      return getRunRecord(runId);
    }
  }

  setRunStatus(runId, "completed", { finishedAt: nowIso(), taskName: taskName || "Desktop Run" });
  return getRunRecord(runId);
}

export async function runDesktopPlan(plan, context = {}) {
  if (process.platform !== "win32") {
    const err = new Error("desktop_runner_windows_only");
    err.status = 400;
    throw err;
  }
  const run = createRunRecord({
    taskName: plan?.taskName,
    actions: plan?.actions,
    safety: plan?.safety,
    workspaceId: context.workspaceId,
    createdBy: context.userId
  });
  setRunStatus(run.id, "running", { startedAt: nowIso() });
  return await runSteps(run.id, plan, context);
}

export function startDesktopRun(plan, context = {}) {
  if (process.platform !== "win32") {
    const err = new Error("desktop_runner_windows_only");
    err.status = 400;
    throw err;
  }
  const run = createRunRecord({
    taskName: plan?.taskName,
    actions: plan?.actions,
    safety: plan?.safety,
    workspaceId: context.workspaceId,
    createdBy: context.userId
  });
  setRunStatus(run.id, "running", { startedAt: nowIso() });
  setImmediate(() => {
    runSteps(run.id, plan, context).catch(err => {
      setRunStatus(run.id, "error", { error: err?.message || "desktop_run_failed" });
    });
  });
  return { runId: run.id, status: "running" };
}

export function getDesktopRun(runId) {
  return getRunRecord(runId);
}

export async function continueDesktopRun(runId, context = {}) {
  const run = getRunRecord(runId);
  if (!run) {
    const err = new Error("run_not_found");
    err.status = 404;
    throw err;
  }
  const pending = run.pendingApproval;
  if (!pending?.id) {
    const err = new Error("no_pending_approval");
    err.status = 400;
    throw err;
  }
  const approval = getSafetyApproval(pending.id);
  if (!approval || approval.status !== "approved") {
    const err = new Error("approval_not_approved");
    err.status = 403;
    throw err;
  }
  setRunPendingApproval(runId, null);
  setRunStatus(runId, "running", { startedAt: nowIso() });
  return await runSteps(runId, {
    taskName: run.taskName,
    actions: run.actions,
    safety: run.safety
  }, context, { startIndex: pending.stepIndex ?? 0 });
}

export function requestDesktopStop(runId) {
  const run = getRunRecord(runId);
  if (!run) return null;
  setRunStopRequested(runId, true);
  if (["running", "approval_required"].includes(run.status)) {
    setRunStatus(runId, "stopping", { error: "stop_requested" });
  }
  return getRunRecord(runId);
}
