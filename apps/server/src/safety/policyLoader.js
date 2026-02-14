import fs from "node:fs";
import path from "node:path";
import { policySchema, defaultPolicy } from "./policySchema.js";

let cachedPolicy = null;
let lastLoadedAt = 0;

function resolveRepoRoot() {
  const cwd = process.cwd();
  const candidate = path.join(cwd, "apps", "server");
  if (fs.existsSync(candidate)) return cwd;
  return path.resolve(cwd, "..", "..");
}

function ensureDir(dir) {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

export function getPolicyPath() {
  const repoRoot = resolveRepoRoot();
  return path.join(repoRoot, "config", "policy.json");
}

function loadPolicyFromDisk() {
  const policyPath = getPolicyPath();
  if (!fs.existsSync(policyPath)) {
    ensureDir(path.dirname(policyPath));
    fs.writeFileSync(policyPath, JSON.stringify(defaultPolicy, null, 2));
    return defaultPolicy;
  }
  const raw = fs.readFileSync(policyPath, "utf-8");
  const parsed = raw ? JSON.parse(raw) : {};
  return policySchema.parse(parsed);
}

export function getPolicy() {
  if (!cachedPolicy) {
    cachedPolicy = loadPolicyFromDisk();
    lastLoadedAt = Date.now();
  }
  return cachedPolicy;
}

export function reloadPolicy() {
  cachedPolicy = loadPolicyFromDisk();
  lastLoadedAt = Date.now();
  return cachedPolicy;
}

export function savePolicy(nextPolicy) {
  const policyPath = getPolicyPath();
  ensureDir(path.dirname(policyPath));
  const parsed = policySchema.parse(nextPolicy || {});
  fs.writeFileSync(policyPath, JSON.stringify(parsed, null, 2));
  cachedPolicy = parsed;
  lastLoadedAt = Date.now();
  return parsed;
}

export function getPolicyMeta() {
  return { loadedAt: lastLoadedAt, path: getPolicyPath() };
}
