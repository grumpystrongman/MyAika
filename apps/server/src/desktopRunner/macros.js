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
const macrosDir = path.join(repoRoot, "data", "desktop_macros");
const seedMacrosDir = path.join(repoRoot, "config", "macros", "desktop");
const DEFAULT_SAFETY = {
  requireApprovalFor: ["launch", "input", "key", "mouse", "clipboard", "screenshot", "new_app", "vision", "uia"],
  maxActions: 60,
  approvalMode: "per_run"
};

function ensureDir() {
  if (!fs.existsSync(macrosDir)) fs.mkdirSync(macrosDir, { recursive: true });
}

function nowIso() {
  return new Date().toISOString();
}

function safeSlug(value) {
  const base = String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48);
  return base || crypto.randomUUID().slice(0, 8);
}

function macroPath(id) {
  return path.join(macrosDir, `${id}.json`);
}

function listSeedMacros() {
  try {
    if (!fs.existsSync(seedMacrosDir)) return [];
    return fs.readdirSync(seedMacrosDir)
      .filter(name => name.endsWith(".json"))
      .map(name => {
        try {
          const raw = fs.readFileSync(path.join(seedMacrosDir, name), "utf8");
          return raw ? { ...JSON.parse(raw), seeded: true } : null;
        } catch {
          return null;
        }
      })
      .filter(Boolean);
  } catch {
    return [];
  }
}

export function listDesktopMacros() {
  try {
    const seeded = listSeedMacros();
    const user = fs.existsSync(macrosDir)
      ? fs.readdirSync(macrosDir)
        .filter(name => name.endsWith(".json"))
        .map(name => name.replace(/\.json$/, ""))
        .map(id => getDesktopMacro(id))
        .filter(Boolean)
      : [];
    const merged = new Map();
    for (const macro of seeded) merged.set(macro.id, macro);
    for (const macro of user) merged.set(macro.id, macro);
    return Array.from(merged.values())
      .sort((a, b) => (b.updatedAt || "").localeCompare(a.updatedAt || ""));
  } catch {
    return [];
  }
}

export function getDesktopMacro(id) {
  try {
    const raw = fs.readFileSync(macroPath(id), "utf8");
    return raw ? JSON.parse(raw) : null;
  } catch {
    const seeded = listSeedMacros().find(item => item.id === id);
    return seeded || null;
  }
}

export function saveDesktopMacro({
  id,
  name,
  description = "",
  tags = [],
  actions = [],
  safety,
  recording
} = {}) {
  if (!name) throw new Error("macro_name_required");
  if (!Array.isArray(actions) || !actions.length) throw new Error("macro_actions_required");
  ensureDir();
  const macroId = id || safeSlug(name);
  const existing = getDesktopMacro(macroId);
  const record = {
    id: macroId,
    name,
    description: description || "",
    tags: Array.isArray(tags) ? tags : [],
    actions,
    safety: safety || existing?.safety || DEFAULT_SAFETY,
    recording: recording || existing?.recording || null,
    createdAt: existing?.createdAt || nowIso(),
    updatedAt: nowIso()
  };
  fs.writeFileSync(macroPath(macroId), JSON.stringify(record, null, 2));
  return record;
}

export function deleteDesktopMacro(id) {
  try {
    if (!id) return false;
    const target = macroPath(id);
    if (!fs.existsSync(target)) return false;
    fs.unlinkSync(target);
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

export function applyDesktopMacroParams(macro, params = {}) {
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
    ...macro,
    actions: renderedActions
  };
}

export function buildDesktopMacroPlan(macro, { params = {} } = {}) {
  const resolved = params && Object.keys(params).length ? applyDesktopMacroParams(macro, params) : macro;
  return {
    taskName: resolved?.name || "Desktop Macro",
    actions: Array.isArray(resolved?.actions) ? resolved.actions : [],
    safety: resolved?.safety || DEFAULT_SAFETY
  };
}

export { DEFAULT_SAFETY as DEFAULT_DESKTOP_MACRO_SAFETY };
