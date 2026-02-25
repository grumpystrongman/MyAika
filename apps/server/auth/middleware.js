import { getSession } from "./session.js";
import { parseJwtFromRequest, verifyJwt } from "./jwt.js";
import { runWithContext } from "./context.js";
import { ensureUser } from "../storage/users.js";

export function isAuthRequired() {
  return String(process.env.AUTH_REQUIRED || process.env.AIKA_AUTH_REQUIRED || "") === "1";
}

function normalizeRoles(roles) {
  if (!Array.isArray(roles)) return [];
  return roles.map(r => String(r || "").trim()).filter(Boolean);
}

function buildUserFromPayload(payload) {
  if (!payload) return null;
  if (payload.user && payload.user.id) return payload.user;
  if (payload.sub) return { id: payload.sub };
  return null;
}

export function authMiddleware(req, _res, next) {
  const authRequired = isAuthRequired();
  let user = null;
  let roles = [];
  let tenantId = "";
  let sessionId = "";
  let authType = "anonymous";

  const token = parseJwtFromRequest(req);
  if (token) {
    try {
      const payload = verifyJwt(token);
      user = buildUserFromPayload(payload);
      roles = normalizeRoles(payload?.roles);
      tenantId = String(payload?.tenantId || "");
      sessionId = String(payload?.sid || "");
      authType = "jwt";
      req.aikaToken = token;
    } catch (err) {
      req.aikaAuthError = err?.message || "jwt_invalid";
    }
  }

  if (!user) {
    const session = getSession(req);
    if (session?.user) {
      user = session.user;
      roles = normalizeRoles(session.user.roles || (session.user.role ? [session.user.role] : []));
      sessionId = session.id || "";
      authType = "session";
    }
  }

  if (!user && !authRequired) {
    const headerUser = req.headers["x-user-id"] || req.headers["x-user"] || "";
    if (headerUser) {
      user = { id: String(headerUser).trim() };
      authType = "header";
    }
  }

  if (!user && !authRequired) {
    user = { id: "local", name: "Local" };
    authType = "local";
  }

  if (user?.id) {
    user.id = String(user.id).trim();
    if (user.email) user.email = String(user.email).toLowerCase();
    try {
      ensureUser(user.id, { name: user.name || user.email || user.id, email: user.email || "" });
    } catch {
      // ignore db init issues for middleware
    }
  }

  req.aikaUser = user || null;
  req.aikaRoles = roles;
  req.aikaTenantId = tenantId;
  req.aikaSessionId = sessionId;
  req.aikaAuthType = authType;

  const context = {
    userId: user?.id || "",
    tenantId,
    roles,
    sessionId,
    authType
  };
  req.aikaContext = context;
  return runWithContext(context, () => next());
}

export function requireAuth(req, res, next) {
  if (!isAuthRequired()) return next();
  if (!req.aikaUser?.id) {
    return res.status(401).json({ error: "auth_required" });
  }
  return next();
}

export function isAdmin(req) {
  const roles = Array.isArray(req?.aikaRoles) ? req.aikaRoles : [];
  return roles.includes("admin");
}
