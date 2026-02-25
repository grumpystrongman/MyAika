import { getContextRoles, getContextTenantId, getContextUserId, runWithContext } from "../../auth/context.js";

function isStrictUserScope() {
  return String(process.env.AIKA_STRICT_USER_SCOPE || process.env.AUTH_REQUIRED || "") === "1";
}

function normalizeId(value, fallback = "") {
  const trimmed = String(value || "").trim();
  return trimmed || fallback;
}

export function resolveStoreContext({ userId, tenantId } = {}) {
  const ctxUser = normalizeId(getContextUserId({ fallback: "" }));
  const ctxTenant = normalizeId(getContextTenantId({ fallback: "" }));
  const explicitUser = normalizeId(userId);
  const explicitTenant = normalizeId(tenantId);

  if (ctxUser && explicitUser && ctxUser !== explicitUser && isStrictUserScope()) {
    throw new Error("store_user_scope_mismatch");
  }

  const resolvedUser = ctxUser || explicitUser || normalizeId(process.env.AIKA_DEFAULT_USER_ID, "local");
  const resolvedTenant = ctxTenant || explicitTenant;
  const roles = Array.isArray(getContextRoles()) ? getContextRoles() : [];
  return { userId: resolvedUser, tenantId: resolvedTenant, roles };
}

export function withStoreContext(ctx, fn) {
  if (!ctx) return fn();
  return runWithContext(ctx, fn);
}
