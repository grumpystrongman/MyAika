import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";

function resolveRepoRoot() {
  const cwd = process.cwd();
  const marker = path.join(cwd, "apps", "server");
  if (fs.existsSync(marker)) return cwd;
  return path.resolve(cwd, "..", "..");
}

const repoRoot = resolveRepoRoot();
const runsDir = path.join(repoRoot, "data", "action_runs");

function ensureDir(dirPath) {
  if (!fs.existsSync(dirPath)) fs.mkdirSync(dirPath, { recursive: true });
}

function nowIso() {
  return new Date().toISOString();
}

function runPath(runId) {
  return path.join(runsDir, runId);
}

function runFilePath(runId) {
  return path.join(runPath(runId), "run.json");
}

export function createRunRecord({ taskName, startUrl, actions, safety, workspaceId, createdBy }) {
  const id = crypto.randomUUID();
  const record = {
    id,
    status: "pending",
    taskName: taskName || "Action Run",
    startUrl: startUrl || "",
    actions: Array.isArray(actions) ? actions : [],
    safety: safety || {},
    workspaceId: workspaceId || "default",
    createdBy: createdBy || "local",
    createdAt: nowIso(),
    updatedAt: nowIso(),
    timeline: [],
    extracted: [],
    artifacts: []
  };
  ensureDir(runPath(id));
  fs.writeFileSync(runFilePath(id), JSON.stringify(record, null, 2));
  return record;
}

export function getRunRecord(runId) {
  try {
    const raw = fs.readFileSync(runFilePath(runId), "utf8");
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

export function updateRunRecord(runId, updater) {
  const record = getRunRecord(runId);
  if (!record) return null;
  const next = typeof updater === "function" ? updater(record) : { ...record, ...(updater || {}) };
  next.updatedAt = nowIso();
  fs.writeFileSync(runFilePath(runId), JSON.stringify(next, null, 2));
  return next;
}

export function appendTimeline(runId, step) {
  return updateRunRecord(runId, record => {
    record.timeline = record.timeline || [];
    record.timeline.push(step);
    return record;
  });
}

export function appendExtracted(runId, item) {
  return updateRunRecord(runId, record => {
    record.extracted = record.extracted || [];
    record.extracted.push(item);
    return record;
  });
}

export function appendArtifact(runId, artifact) {
  return updateRunRecord(runId, record => {
    record.artifacts = record.artifacts || [];
    record.artifacts.push(artifact);
    return record;
  });
}

export function setRunStatus(runId, status, extra = {}) {
  return updateRunRecord(runId, record => ({
    ...record,
    status,
    ...extra
  }));
}

export function listRuns(limit = 20) {
  try {
    if (!fs.existsSync(runsDir)) return [];
    const entries = fs.readdirSync(runsDir, { withFileTypes: true })
      .filter(d => d.isDirectory())
      .map(d => d.name);
    const items = entries
      .map(id => getRunRecord(id))
      .filter(Boolean)
      .sort((a, b) => (b.createdAt || "").localeCompare(a.createdAt || ""));
    return items.slice(0, limit);
  } catch {
    return [];
  }
}

export function getRunDir(runId) {
  return runPath(runId);
}

export function getRunFilePath(runId, filename) {
  return path.join(runPath(runId), filename);
}
