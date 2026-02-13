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
const macrosDir = path.join(repoRoot, "data", "skills", "macros");

function ensureDir() {
  if (!fs.existsSync(macrosDir)) fs.mkdirSync(macrosDir, { recursive: true });
}

function nowIso() {
  return new Date().toISOString();
}

function macroPath(id) {
  return path.join(macrosDir, `${id}.json`);
}

export function listMacros() {
  try {
    if (!fs.existsSync(macrosDir)) return [];
    return fs.readdirSync(macrosDir)
      .filter(name => name.endsWith(".json"))
      .map(name => {
        try {
          const raw = fs.readFileSync(path.join(macrosDir, name), "utf8");
          return raw ? JSON.parse(raw) : null;
        } catch {
          return null;
        }
      })
      .filter(Boolean)
      .sort((a, b) => (b.updatedAt || "").localeCompare(a.updatedAt || ""));
  } catch {
    return [];
  }
}

export function getMacro(id) {
  try {
    const raw = fs.readFileSync(macroPath(id), "utf8");
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

export function saveMacro(payload) {
  ensureDir();
  const id = payload.id || crypto.randomUUID();
  const existing = payload.id ? getMacro(id) : null;
  const record = {
    id,
    name: payload.name || existing?.name || "Untitled Macro",
    description: payload.description || existing?.description || "",
    tags: payload.tags || existing?.tags || [],
    version: Number(existing?.version || 0) + 1,
    startUrl: payload.startUrl || existing?.startUrl || "",
    actions: Array.isArray(payload.actions) ? payload.actions : existing?.actions || [],
    createdAt: existing?.createdAt || nowIso(),
    updatedAt: nowIso()
  };
  fs.writeFileSync(macroPath(id), JSON.stringify(record, null, 2));
  return record;
}

export function deleteMacro(id) {
  try {
    fs.unlinkSync(macroPath(id));
    return true;
  } catch {
    return false;
  }
}

function renderTemplate(input, params = {}) {
  return String(input || "").replace(/\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/g, (_match, key) => {
    const value = params[key];
    return value === undefined || value === null ? "" : String(value);
  });
}

export function applyMacroParams(macro, params = {}) {
  const renderedActions = (macro?.actions || []).map(action => {
    const next = { ...action };
    for (const key of Object.keys(next)) {
      if (typeof next[key] === "string") {
        next[key] = renderTemplate(next[key], params);
      }
    }
    return next;
  });
  return {
    taskName: macro?.name || "Macro",
    startUrl: renderTemplate(macro?.startUrl || "", params),
    actions: renderedActions,
    safety: macro?.safety || { requireApprovalFor: ["purchase", "send", "delete", "auth", "download", "upload"], maxActions: 60 }
  };
}

export function extractMacroParams(macro) {
  const params = new Set();
  const collect = (value) => {
    if (typeof value !== "string") return;
    const matches = value.match(/\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/g) || [];
    for (const match of matches) {
      const key = match.replace(/[\{\}\s]/g, "");
      if (key) params.add(key);
    }
  };
  collect(macro?.startUrl || "");
  for (const action of macro?.actions || []) {
    Object.values(action || {}).forEach(collect);
  }
  return Array.from(params);
}
