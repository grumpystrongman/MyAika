import fs from "node:fs";
import os from "node:os";
import path from "node:path";

function isTestEnv() {
  return process.env.NODE_ENV === "test" || process.argv.includes("--test") || process.env.AIKA_TEST_MODE === "1";
}

function resolveRepoRoot() {
  const override = process.env.AIKA_REPO_ROOT || "";
  if (override) return path.isAbsolute(override) ? override : path.resolve(process.cwd(), override);
  if (isTestEnv()) return path.join(os.tmpdir(), "aika_test_repo");
  return path.resolve(process.cwd(), "..", "..");
}

const repoRoot = resolveRepoRoot();
const dataDir = path.join(repoRoot, "data");
const storePath = path.join(dataDir, "agent_action_runs.json");

function ensureDir() {
  if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });
}

function readStore() {
  try {
    if (!fs.existsSync(storePath)) return { runs: {} };
    const raw = fs.readFileSync(storePath, "utf8");
    const parsed = raw ? JSON.parse(raw) : { runs: {} };
    if (!parsed || typeof parsed !== "object") return { runs: {} };
    if (!parsed.runs || typeof parsed.runs !== "object") return { runs: {} };
    return parsed;
  } catch {
    return { runs: {} };
  }
}

function writeStore(store) {
  ensureDir();
  fs.writeFileSync(storePath, JSON.stringify(store, null, 2));
}

export function getActionRun(idempotencyKey) {
  if (!idempotencyKey) return null;
  const store = readStore();
  return store.runs?.[idempotencyKey] || null;
}

export function setActionRun(idempotencyKey, record) {
  if (!idempotencyKey) return null;
  const store = readStore();
  store.runs[idempotencyKey] = record;
  writeStore(store);
  return record;
}

export function clearActionRun(idempotencyKey) {
  if (!idempotencyKey) return null;
  const store = readStore();
  delete store.runs[idempotencyKey];
  writeStore(store);
  return true;
}
