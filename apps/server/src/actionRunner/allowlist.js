import fs from "node:fs";
import path from "node:path";

function resolveRepoRoot() {
  const cwd = process.cwd();
  const marker = path.join(cwd, "apps", "server");
  if (fs.existsSync(marker)) return cwd;
  return path.resolve(cwd, "..", "..");
}

const repoRoot = resolveRepoRoot();
const dataDir = path.join(repoRoot, "data");
const storePath = path.join(dataDir, "action_runner_allowlist.json");

function ensureDir() {
  if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });
}

function loadStore() {
  try {
    if (!fs.existsSync(storePath)) return { workspaces: {} };
    const raw = fs.readFileSync(storePath, "utf8");
    return raw ? JSON.parse(raw) : { workspaces: {} };
  } catch {
    return { workspaces: {} };
  }
}

function saveStore(store) {
  ensureDir();
  fs.writeFileSync(storePath, JSON.stringify(store, null, 2));
}

export function listAllowedDomains(workspaceId = "default") {
  const store = loadStore();
  return store.workspaces?.[workspaceId]?.allowed || [];
}

export function isDomainAllowed(domain, workspaceId = "default") {
  if (!domain) return false;
  const allowed = listAllowedDomains(workspaceId);
  return allowed.includes(domain);
}

export function recordDomains(domains = [], workspaceId = "default") {
  const store = loadStore();
  if (!store.workspaces) store.workspaces = {};
  if (!store.workspaces[workspaceId]) {
    store.workspaces[workspaceId] = { allowed: [], updatedAt: new Date().toISOString() };
  }
  const workspace = store.workspaces[workspaceId];
  const set = new Set(workspace.allowed || []);
  for (const domain of domains) {
    if (!domain) continue;
    set.add(domain);
  }
  workspace.allowed = Array.from(set);
  workspace.updatedAt = new Date().toISOString();
  saveStore(store);
  return workspace.allowed;
}

export function resetAllowedDomains(workspaceId = "default") {
  const store = loadStore();
  if (!store.workspaces) store.workspaces = {};
  store.workspaces[workspaceId] = { allowed: [], updatedAt: new Date().toISOString() };
  saveStore(store);
  return store.workspaces[workspaceId];
}

export function getAllowlistState() {
  return loadStore();
}
