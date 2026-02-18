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
const queueDir = path.join(repoRoot, "data", "workers");
const queueFile = path.join(queueDir, "queue.json");

function ensureDir() {
  if (!fs.existsSync(queueDir)) fs.mkdirSync(queueDir, { recursive: true });
}

function nowIso() {
  return new Date().toISOString();
}

function readQueue() {
  ensureDir();
  if (!fs.existsSync(queueFile)) {
    return { jobs: [] };
  }
  try {
    const raw = fs.readFileSync(queueFile, "utf8");
    return raw ? JSON.parse(raw) : { jobs: [] };
  } catch {
    return { jobs: [] };
  }
}

function writeQueue(data) {
  ensureDir();
  fs.writeFileSync(queueFile, JSON.stringify(data, null, 2));
}

export function enqueueWork({ type, payload = {}, priority = 0, runAt = null, maxRetries = 0 } = {}) {
  if (!type) throw new Error("work_type_required");
  const queue = readQueue();
  const job = {
    id: crypto.randomUUID(),
    type,
    payload,
    status: "pending",
    priority: Number(priority) || 0,
    runAt: runAt || null,
    attempt: 0,
    maxRetries: Number(maxRetries) || 0,
    createdAt: nowIso(),
    updatedAt: nowIso(),
    workerId: null,
    startedAt: null,
    completedAt: null,
    result: null,
    error: null
  };
  queue.jobs.push(job);
  writeQueue(queue);
  return job;
}

export function listWork({ status, limit = 50 } = {}) {
  const queue = readQueue();
  let jobs = Array.isArray(queue.jobs) ? queue.jobs : [];
  if (status) jobs = jobs.filter(job => job.status === status);
  jobs = jobs.sort((a, b) => {
    if (b.priority !== a.priority) return b.priority - a.priority;
    return (a.createdAt || "").localeCompare(b.createdAt || "");
  });
  return jobs.slice(0, limit);
}

export function getWork(id) {
  const queue = readQueue();
  return (queue.jobs || []).find(job => job.id === id) || null;
}

export function claimWork({ workerId = "worker", types = [], limit = 1 } = {}) {
  const queue = readQueue();
  const now = nowIso();
  const allowTypes = Array.isArray(types) && types.length ? new Set(types) : null;
  const candidates = (queue.jobs || []).filter(job => {
    if (job.status !== "pending") return false;
    if (allowTypes && !allowTypes.has(job.type)) return false;
    if (job.runAt && job.runAt > now) return false;
    return true;
  }).sort((a, b) => {
    if (b.priority !== a.priority) return b.priority - a.priority;
    return (a.createdAt || "").localeCompare(b.createdAt || "");
  });

  const claimed = [];
  for (const job of candidates.slice(0, limit)) {
    job.status = "in_progress";
    job.workerId = workerId;
    job.startedAt = nowIso();
    job.updatedAt = nowIso();
    job.attempt = Number(job.attempt || 0) + 1;
    claimed.push(job);
  }
  if (claimed.length) writeQueue(queue);
  return claimed;
}

export function completeWork({ id, status = "completed", result = null, error = null } = {}) {
  const queue = readQueue();
  const job = (queue.jobs || []).find(item => item.id === id);
  if (!job) return null;
  job.status = status;
  job.result = result;
  job.error = error;
  job.completedAt = status === "pending" ? null : nowIso();
  if (status === "pending") {
    job.workerId = null;
    job.startedAt = null;
  }
  job.updatedAt = nowIso();
  writeQueue(queue);
  return job;
}

export function resetStaleWork({ maxAgeMs = 30 * 60 * 1000 } = {}) {
  const queue = readQueue();
  const now = Date.now();
  let updated = 0;
  for (const job of queue.jobs || []) {
    if (job.status !== "in_progress" || !job.startedAt) continue;
    const age = now - Date.parse(job.startedAt);
    if (Number.isFinite(age) && age > maxAgeMs) {
      job.status = "pending";
      job.workerId = null;
      job.startedAt = null;
      job.updatedAt = nowIso();
      updated += 1;
    }
  }
  if (updated) writeQueue(queue);
  return { reset: updated };
}
