import { AsyncLocalStorage } from "node:async_hooks";

const contextStore = new AsyncLocalStorage();

export function runWithContext(context, fn) {
  return contextStore.run(context || {}, fn);
}

export function getContext() {
  return contextStore.getStore() || null;
}

export function getContextUserId({ fallback = "" } = {}) {
  const ctx = getContext();
  return ctx?.userId || fallback;
}

export function getContextTenantId({ fallback = "" } = {}) {
  const ctx = getContext();
  return ctx?.tenantId || fallback;
}

export function getContextRoles() {
  const ctx = getContext();
  return Array.isArray(ctx?.roles) ? ctx.roles : [];
}
