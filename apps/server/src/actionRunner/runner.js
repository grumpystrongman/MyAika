import fs from "node:fs";
import path from "node:path";
import { chromium } from "playwright";
import { listAllowedDomains, recordDomains } from "./allowlist.js";
import {
  createRunRecord,
  appendTimeline,
  appendExtracted,
  appendArtifact,
  setRunStatus,
  getRunRecord,
  getRunDir
} from "./runStore.js";

const DEFAULT_REQUIRE_APPROVAL = ["purchase", "send", "delete", "auth", "download", "upload", "new_domain"];
const DEFAULT_MAX_ACTIONS = 60;
const lastRunByWorkspace = new Map();

function nowIso() {
  return new Date().toISOString();
}

function safeFilename(value) {
  return String(value || "")
    .trim()
    .replace(/[^a-zA-Z0-9-_]+/g, "-")
    .replace(/-+/g, "-")
    .slice(0, 64) || "artifact";
}

function extractDomain(url) {
  try {
    return new URL(url).hostname;
  } catch {
    return "";
  }
}

function enforceRateLimit(workspaceId) {
  const minIntervalMs = Number(process.env.ACTION_RUNNER_MIN_INTERVAL_MS || 3000);
  if (!minIntervalMs || minIntervalMs <= 0) return;
  const now = Date.now();
  const lastRun = lastRunByWorkspace.get(workspaceId) || 0;
  if (now - lastRun < minIntervalMs) {
    const err = new Error("action_runner_rate_limited");
    err.status = 429;
    err.retryAt = new Date(lastRun + minIntervalMs).toISOString();
    throw err;
  }
  lastRunByWorkspace.set(workspaceId, now);
}

export function extractDomainsFromPlan({ startUrl, actions } = {}) {
  const domains = [];
  if (startUrl) domains.push(extractDomain(startUrl));
  for (const action of actions || []) {
    if (action?.type === "goto" && action?.url) {
      domains.push(extractDomain(action.url));
    }
  }
  return Array.from(new Set(domains.filter(Boolean)));
}

function detectRiskTags(action, previousAction) {
  const tags = new Set();
  const type = String(action?.type || "").toLowerCase();
  const selector = String(action?.selector || "").toLowerCase();
  const text = String(action?.text || "").toLowerCase();
  const url = String(action?.url || "").toLowerCase();
  const key = String(action?.key || "").toLowerCase();

  if (type === "goto" && /login|signin|oauth|auth/.test(url)) tags.add("auth");
  if (type === "click") {
    if (/buy|purchase|checkout|order|cart/.test(selector)) tags.add("purchase");
    if (/send|submit|post|publish/.test(selector)) tags.add("send");
    if (/delete|remove|destroy/.test(selector)) tags.add("delete");
    if (/login|sign-?in|auth/.test(selector)) tags.add("auth");
  }
  if (type === "type") {
    if (/password|passwd/.test(selector) || /password|passwd/.test(text)) tags.add("auth");
    if (previousAction?.type === "click" && /login|sign-?in/.test(String(previousAction.selector || "").toLowerCase())) {
      tags.add("auth");
    }
  }
  if (type === "press" && key === "enter" && previousAction?.type === "type") {
    if (/password|passwd/.test(String(previousAction.selector || "").toLowerCase())) tags.add("auth");
  }
  if (type === "download") tags.add("download");
  if (type === "upload") tags.add("upload");
  return tags;
}

export function assessActionPlan({ taskName, startUrl, actions, safety, workspaceId } = {}) {
  const requireList = new Set(
    (safety?.requireApprovalFor || DEFAULT_REQUIRE_APPROVAL).map(item => String(item).toLowerCase())
  );
  const envMax = Number(process.env.ACTION_RUNNER_MAX_ACTIONS || DEFAULT_MAX_ACTIONS);
  const maxActions = Math.min(Number(safety?.maxActions || envMax || DEFAULT_MAX_ACTIONS), envMax || DEFAULT_MAX_ACTIONS);

  const riskTags = new Set();
  const reasons = [];
  const allDomains = extractDomainsFromPlan({ startUrl, actions });
  const allowedDomains = listAllowedDomains(workspaceId);
  const newDomains = allDomains.filter(domain => !allowedDomains.includes(domain));
  if (newDomains.length) {
    riskTags.add("new_domain");
    reasons.push(`New domains: ${newDomains.join(", ")}`);
  }

  const items = Array.isArray(actions) ? actions : [];
  let previous = null;
  for (const action of items) {
    const tags = detectRiskTags(action, previous);
    for (const tag of tags) riskTags.add(tag);
    previous = action;
  }

  const requiresApproval = newDomains.length > 0 || Array.from(riskTags).some(tag => requireList.has(tag));

  return {
    requiresApproval,
    riskTags: Array.from(riskTags),
    newDomains,
    maxActions,
    totalActions: items.length,
    taskName: taskName || "Action Run",
    reasons
  };
}

async function runSteps(runId, plan, context = {}) {
  const { taskName, startUrl, actions, safety } = plan;
  const workspaceId = context.workspaceId || "default";

  const envMax = Number(process.env.ACTION_RUNNER_MAX_ACTIONS || DEFAULT_MAX_ACTIONS);
  const maxActions = Math.min(Number(safety?.maxActions || envMax || DEFAULT_MAX_ACTIONS), envMax || DEFAULT_MAX_ACTIONS);
  const initialActions = Array.isArray(actions) ? actions : [];
  if (initialActions.length > maxActions) {
    throw new Error("action_runner_max_actions_exceeded");
  }

  const runDir = getRunDir(runId);
  recordDomains(extractDomainsFromPlan({ startUrl, actions: initialActions }), workspaceId);

  const steps = [...initialActions];
  if (startUrl && (!steps.length || steps[0]?.type !== "goto")) {
    if (steps.length + 1 > maxActions) {
      throw new Error("action_runner_max_actions_exceeded");
    }
    steps.unshift({ type: "goto", url: startUrl, timeoutMs: 30000, _auto: true });
  }

  const browser = await chromium.launch({ headless: true });
  try {
    const context = await browser.newContext({ viewport: { width: 1280, height: 720 } });
    const page = await context.newPage();

    for (let index = 0; index < steps.length; index += 1) {
      const action = steps[index] || {};
      const startedAt = nowIso();
      let status = "ok";
      let error = "";
      try {
        switch (action.type) {
          case "goto":
            await page.goto(action.url, { waitUntil: "domcontentloaded", timeout: action.timeoutMs || 30000 });
            break;
          case "click":
            await page.click(action.selector, { timeout: action.timeoutMs || 15000 });
            break;
          case "type":
            await page.fill(action.selector, action.text || "");
            break;
          case "press":
            await page.keyboard.press(action.key || "Enter");
            break;
          case "waitFor":
            await page.waitForSelector(action.selector, { timeout: action.timeoutMs || 15000 });
            break;
          case "extractText": {
            const text = await page.$eval(action.selector, el => el.innerText || "");
            const extracted = {
              selector: action.selector,
              text: text || "",
              name: action.name || null,
              step: index + 1,
              at: nowIso()
            };
            appendExtracted(runId, extracted);
            const htmlName = `step_${index + 1}_${safeFilename(action.name || "extract")}.html`;
            const htmlPath = path.join(runDir, htmlName);
            fs.writeFileSync(htmlPath, await page.content());
            appendArtifact(runId, { type: "html", file: htmlName, step: index + 1, createdAt: nowIso() });
            break;
          }
          case "screenshot": {
            const fileName = `step_${index + 1}_${safeFilename(action.name || "screenshot")}.png`;
            const filePath = path.join(runDir, fileName);
            await page.screenshot({ path: filePath, fullPage: true });
            appendArtifact(runId, { type: "screenshot", file: fileName, step: index + 1, createdAt: nowIso() });
            break;
          }
          default:
            throw new Error(`unknown_action_type_${action.type}`);
        }
      } catch (err) {
        status = "error";
        error = err?.message || "action_failed";
      }

      appendTimeline(runId, {
        step: index + 1,
        type: action.type,
        status,
        startedAt,
        finishedAt: nowIso(),
        error,
        action
      });

      if (status === "error") {
        setRunStatus(runId, "error", { error });
        await browser.close();
        return getRunRecord(runId);
      }
    }

    setRunStatus(runId, "completed", { finishedAt: nowIso() });
    await browser.close();
    return getRunRecord(runId);
  } catch (err) {
    setRunStatus(runId, "error", { error: err?.message || "action_runner_failed" });
    await browser.close();
    return getRunRecord(runId);
  }
}

export async function runActionPlan(plan, context = {}) {
  enforceRateLimit(context.workspaceId || "default");
  const run = createRunRecord({
    taskName: plan?.taskName,
    startUrl: plan?.startUrl,
    actions: plan?.actions,
    safety: plan?.safety,
    workspaceId: context.workspaceId,
    createdBy: context.userId
  });
  setRunStatus(run.id, "running", { startedAt: nowIso() });
  return await runSteps(run.id, plan, context);
}

export function startActionRun(plan, context = {}) {
  enforceRateLimit(context.workspaceId || "default");
  const run = createRunRecord({
    taskName: plan?.taskName,
    startUrl: plan?.startUrl,
    actions: plan?.actions,
    safety: plan?.safety,
    workspaceId: context.workspaceId,
    createdBy: context.userId
  });
  setRunStatus(run.id, "running", { startedAt: nowIso() });
  runSteps(run.id, plan, context).catch(() => {});
  return { runId: run.id, status: "running" };
}

export function getActionRun(runId) {
  return getRunRecord(runId);
}
