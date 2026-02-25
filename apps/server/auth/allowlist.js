import fs from "node:fs";
import path from "node:path";

let cached = null;
let cachedAt = 0;
const CACHE_TTL_MS = 30_000;

function resolveRepoRoot() {
  const cwd = process.cwd();
  const candidate = path.join(cwd, "apps", "server");
  if (fs.existsSync(candidate)) return cwd;
  return path.resolve(cwd, "..", "..");
}

function normalizeEmail(value) {
  return String(value || "").trim().toLowerCase();
}

function normalizeDomain(value) {
  return String(value || "").trim().toLowerCase();
}

function parseList(value = "") {
  return String(value || "")
    .split(/[,\s]+/)
    .map(item => item.trim())
    .filter(Boolean);
}

function loadAllowlistFile(filePath) {
  try {
    if (!fs.existsSync(filePath)) return null;
    const raw = fs.readFileSync(filePath, "utf-8");
    if (!raw) return null;
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

function mergeEntries(target, entry = {}) {
  if (!entry) return;
  const email = normalizeEmail(entry.email || entry.mail || "");
  const userId = String(entry.userId || entry.user_id || "").trim();
  const roles = Array.isArray(entry.roles) ? entry.roles : entry.role ? [entry.role] : [];
  const tenantId = String(entry.tenantId || entry.tenant_id || "").trim();
  if (email) {
    target.usersByEmail.set(email, { email, userId, roles, tenantId });
  }
  if (userId) {
    target.usersById.set(userId, { email, userId, roles, tenantId });
  }
}

function loadAllowlistConfig() {
  const now = Date.now();
  if (cached && now - cachedAt < CACHE_TTL_MS) return cached;

  const repoRoot = resolveRepoRoot();
  const defaultPath = path.join(repoRoot, "config", "auth_allowlist.json");
  const filePath = process.env.AUTH_ALLOWLIST_PATH || defaultPath;
  const fileData = loadAllowlistFile(filePath);

  const emails = new Set();
  const domains = new Set();
  const admins = new Set();
  const usersByEmail = new Map();
  const usersById = new Map();

  parseList(process.env.AUTH_ALLOWED_EMAILS).forEach(item => emails.add(normalizeEmail(item)));
  parseList(process.env.AUTH_ALLOWED_DOMAINS).forEach(item => domains.add(normalizeDomain(item)));
  parseList(process.env.AUTH_ADMIN_EMAILS).forEach(item => admins.add(normalizeEmail(item)));
  parseList(process.env.AUTH_ADMIN_USERS).forEach(item => usersById.set(String(item), { userId: String(item), roles: ["admin"], tenantId: "" }));

  if (fileData) {
    if (Array.isArray(fileData.emails)) {
      fileData.emails.forEach(item => emails.add(normalizeEmail(item)));
    }
    if (Array.isArray(fileData.domains)) {
      fileData.domains.forEach(item => domains.add(normalizeDomain(item)));
    }
    if (Array.isArray(fileData.admins)) {
      fileData.admins.forEach(item => admins.add(normalizeEmail(item)));
    }
    if (Array.isArray(fileData.users)) {
      fileData.users.forEach(entry => mergeEntries({ usersByEmail, usersById }, entry));
    }
  }

  const enabled = emails.size > 0 || domains.size > 0 || usersByEmail.size > 0 || usersById.size > 0
    || String(process.env.AUTH_ALLOWLIST_REQUIRED || "") === "1";

  cached = {
    enabled,
    emails,
    domains,
    admins,
    usersByEmail,
    usersById,
    filePath
  };
  cachedAt = now;
  return cached;
}

export function checkAllowlist({ email = "", userId = "" } = {}) {
  const config = loadAllowlistConfig();
  if (!config.enabled) {
    return { allowed: true, reason: "allowlist_disabled", roles: [], tenantId: "", userId: "" };
  }
  const normalizedEmail = normalizeEmail(email);
  const normalizedId = String(userId || "").trim();
  const domain = normalizedEmail.includes("@") ? normalizedEmail.split("@")[1] : "";

  const entryByEmail = normalizedEmail ? config.usersByEmail.get(normalizedEmail) : null;
  const entryById = normalizedId ? config.usersById.get(normalizedId) : null;
  const roles = new Set([...(entryByEmail?.roles || []), ...(entryById?.roles || [])]);
  const tenantId = entryByEmail?.tenantId || entryById?.tenantId || "";
  const userIdOverride = entryByEmail?.userId || entryById?.userId || "";

  if (normalizedEmail && config.admins.has(normalizedEmail)) {
    roles.add("admin");
  }

  if (entryByEmail || entryById) {
    return { allowed: true, reason: "allowlist_entry", roles: [...roles], tenantId, userId: userIdOverride };
  }
  if (normalizedEmail && config.emails.has(normalizedEmail)) {
    return { allowed: true, reason: "email_allowlisted", roles: [...roles], tenantId, userId: userIdOverride };
  }
  if (domain && config.domains.has(domain)) {
    return { allowed: true, reason: "domain_allowlisted", roles: [...roles], tenantId, userId: userIdOverride };
  }
  return { allowed: false, reason: "not_allowlisted", roles: [...roles], tenantId, userId: userIdOverride };
}

export function getAllowlistConfig() {
  return loadAllowlistConfig();
}
