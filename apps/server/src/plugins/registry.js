import fs from "node:fs";
import path from "node:path";

function resolveRepoRoot() {
  const cwd = process.cwd();
  const marker = path.join(cwd, "apps", "server");
  if (fs.existsSync(marker)) return cwd;
  return path.resolve(cwd, "..", "..");
}

const repoRoot = resolveRepoRoot();
const pluginsDir = path.join(repoRoot, "data", "plugins");

function ensureDir() {
  if (!fs.existsSync(pluginsDir)) fs.mkdirSync(pluginsDir, { recursive: true });
}

function nowIso() {
  return new Date().toISOString();
}

function manifestPath(id) {
  return path.join(pluginsDir, id, "manifest.json");
}

function readManifest(id) {
  try {
    const raw = fs.readFileSync(manifestPath(id), "utf8");
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

export function listPlugins() {
  ensureDir();
  return fs.readdirSync(pluginsDir, { withFileTypes: true })
    .filter(entry => entry.isDirectory())
    .map(entry => {
      const manifest = readManifest(entry.name) || {};
      return {
        id: entry.name,
        name: manifest.name || entry.name,
        version: manifest.version || "0.0.1",
        description: manifest.description || "",
        permissions: manifest.permissions || [],
        capabilities: manifest.capabilities || [],
        updatedAt: manifest.updatedAt || null
      };
    })
    .sort((a, b) => (b.updatedAt || "").localeCompare(a.updatedAt || ""));
}

export function getPlugin(id) {
  const manifest = readManifest(id);
  if (!manifest) return null;
  return { id, manifest };
}

export function savePlugin({ id, manifest = {} } = {}) {
  if (!id) throw new Error("plugin_id_required");
  ensureDir();
  const dir = path.join(pluginsDir, id);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  const existing = readManifest(id) || {};
  const record = {
    id,
    name: manifest.name || existing.name || id,
    version: manifest.version || existing.version || "0.0.1",
    description: manifest.description || existing.description || "",
    permissions: manifest.permissions || existing.permissions || [],
    capabilities: manifest.capabilities || existing.capabilities || [],
    entrypoint: manifest.entrypoint || existing.entrypoint || "index.js",
    updatedAt: nowIso(),
    createdAt: existing.createdAt || nowIso()
  };
  fs.writeFileSync(manifestPath(id), JSON.stringify(record, null, 2));
  return { id, manifest: record };
}
