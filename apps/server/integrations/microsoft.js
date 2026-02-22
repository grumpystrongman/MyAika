import crypto from "node:crypto";
import { getProvider, setProvider } from "./store.js";

const DEFAULT_AUTHORITY = "https://login.microsoftonline.com";
const DEFAULT_TENANT = "common";
const GRAPH_BASE = process.env.MICROSOFT_GRAPH_BASE || "https://graph.microsoft.com/v1.0";

export const MICROSOFT_SCOPE_PRESETS = {
  mail_read: [
    "openid",
    "profile",
    "email",
    "offline_access",
    "https://graph.microsoft.com/User.Read",
    "https://graph.microsoft.com/Mail.Read"
  ],
  mail_read_basic: [
    "openid",
    "profile",
    "email",
    "offline_access",
    "https://graph.microsoft.com/User.Read",
    "https://graph.microsoft.com/Mail.ReadBasic"
  ],
  mail_calendar_read: [
    "openid",
    "profile",
    "email",
    "offline_access",
    "https://graph.microsoft.com/User.Read",
    "https://graph.microsoft.com/Mail.Read",
    "https://graph.microsoft.com/Calendars.Read"
  ],
  mail_calendar_readwrite: [
    "openid",
    "profile",
    "email",
    "offline_access",
    "https://graph.microsoft.com/User.Read",
    "https://graph.microsoft.com/Mail.Read",
    "https://graph.microsoft.com/Calendars.ReadWrite"
  ]
};

function getMicrosoftEnv() {
  return {
    clientId: process.env.MICROSOFT_CLIENT_ID || "",
    clientSecret: process.env.MICROSOFT_CLIENT_SECRET || "",
    tenantId: process.env.MICROSOFT_TENANT_ID || DEFAULT_TENANT,
    authorityHost: process.env.MICROSOFT_AUTHORITY_HOST || DEFAULT_AUTHORITY,
    redirectUri: process.env.MICROSOFT_REDIRECT_URI || "",
    redirectUriLocal: process.env.MICROSOFT_REDIRECT_URI_LOCAL || "",
    redirectUris: (process.env.MICROSOFT_REDIRECT_URIS || "")
      .split(",")
      .map(uri => uri.trim())
      .filter(Boolean),
    prompt: process.env.MICROSOFT_PROMPT || "consent",
    domainHint: process.env.MICROSOFT_DOMAIN_HINT || "",
    loginHint: process.env.MICROSOFT_LOGIN_HINT || ""
  };
}

function buildAuthorityUrl(tenantId) {
  const { authorityHost } = getMicrosoftEnv();
  const tenant = tenantId || DEFAULT_TENANT;
  return `${authorityHost.replace(/\/$/, "")}/${tenant}`;
}

function generateState() {
  return crypto.randomBytes(16).toString("hex");
}

function storeState(state, meta = {}) {
  const current = getProvider("microsoft_oauth_state") || {};
  current[state] = { ...meta, createdAt: Date.now() };
  setProvider("microsoft_oauth_state", current);
}

function consumeState(state) {
  const stored = getProvider("microsoft_oauth_state") || {};
  const meta = stored[state];
  if (!meta) return null;
  delete stored[state];
  setProvider("microsoft_oauth_state", stored);
  return meta;
}

function toBase64Url(buffer) {
  return Buffer.from(buffer)
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");
}

function createPkce() {
  const verifier = toBase64Url(crypto.randomBytes(32));
  const challenge = toBase64Url(crypto.createHash("sha256").update(verifier).digest());
  return { verifier, challenge };
}

function resolveRedirectUri(meta = {}) {
  const { redirectUri, redirectUriLocal, redirectUris } = getMicrosoftEnv();
  if (meta?.redirectUri) return meta.redirectUri;
  if (meta?.uiBase && redirectUris.length) {
    try {
      const candidates = [
        new URL("/api/auth/microsoft/callback", meta.uiBase).toString(),
        new URL("/api/integrations/microsoft/callback", meta.uiBase).toString()
      ];
      const match = candidates.find(candidate => redirectUris.includes(candidate));
      if (match) return match;
    } catch {
      // ignore
    }
  }
  if (meta?.uiBase && redirectUris.length) {
    try {
      const uiHost = new URL(meta.uiBase).hostname;
      const matched = redirectUris.find(uri => {
        try {
          return new URL(uri).hostname === uiHost;
        } catch {
          return false;
        }
      });
      if (matched) return matched;
    } catch {
      // ignore
    }
  }
  if (meta?.uiBase && redirectUriLocal) {
    try {
      const uiHost = new URL(meta.uiBase).hostname;
      if (["localhost", "127.0.0.1"].includes(uiHost)) {
        return redirectUriLocal;
      }
    } catch {
      // ignore
    }
  }
  return redirectUri || redirectUris[0] || "";
}

function parseScopes(scopeStr) {
  if (!scopeStr) return [];
  return scopeStr.split(" ").map(s => s.trim()).filter(Boolean);
}

function normalizeScope(scope) {
  const raw = String(scope || "").trim();
  if (!raw) return "";
  if (raw.startsWith("https://graph.microsoft.com/")) {
    return raw.replace("https://graph.microsoft.com/", "").toLowerCase();
  }
  return raw.toLowerCase();
}

function scopeSatisfied(current, required) {
  const normalizedRequired = normalizeScope(required);
  if (!normalizedRequired) return true;
  if (current.has(normalizedRequired)) return true;
  const aliases = {
    "mail.readbasic": ["mail.read", "mail.readwrite"],
    "mail.read": ["mail.readwrite"],
    "calendars.read": ["calendars.readwrite"],
    "user.read": ["user.readbasic.all", "user.read.all"]
  };
  const alt = aliases[normalizedRequired] || [];
  return alt.some(item => current.has(item));
}

function normalizeTenantList(value) {
  return (value || "")
    .split(",")
    .map(item => item.trim())
    .filter(Boolean)
    .map(item => item.toLowerCase());
}

function normalizeDomainList(value) {
  return (value || "")
    .split(",")
    .map(item => item.trim())
    .filter(Boolean)
    .map(item => item.toLowerCase());
}

function enforceTenantDomain({ tenantId, email } = {}) {
  const allowedTenants = normalizeTenantList(process.env.MICROSOFT_ALLOWED_TENANTS || "");
  const allowedDomains = normalizeDomainList(process.env.MICROSOFT_ALLOWED_DOMAINS || "");
  const requireTenantMatch = String(process.env.MICROSOFT_REQUIRE_TENANT_MATCH || "0") === "1";
  const configuredTenant = String(process.env.MICROSOFT_TENANT_ID || DEFAULT_TENANT).toLowerCase();
  if (allowedTenants.length) {
    if (!tenantId) throw new Error("microsoft_tenant_missing");
    if (!allowedTenants.includes(String(tenantId).toLowerCase())) {
      throw new Error("microsoft_tenant_not_allowed");
    }
  }
  if (requireTenantMatch && configuredTenant && !["common", "organizations", "consumers"].includes(configuredTenant)) {
    if (!tenantId) throw new Error("microsoft_tenant_missing");
    if (String(tenantId).toLowerCase() !== configuredTenant) {
      throw new Error("microsoft_tenant_mismatch");
    }
  }
  if (allowedDomains.length) {
    const domain = String(email || "").split("@")[1]?.toLowerCase() || "";
    if (!domain) throw new Error("microsoft_domain_missing");
    if (!allowedDomains.includes(domain)) {
      throw new Error("microsoft_domain_not_allowed");
    }
  }
}

function decodeJwt(token) {
  const parts = String(token || "").split(".");
  if (parts.length < 2) return null;
  try {
    const payload = parts[1].replace(/-/g, "+").replace(/_/g, "/");
    const decoded = Buffer.from(payload, "base64").toString("utf8");
    return JSON.parse(decoded);
  } catch {
    return null;
  }
}

export function connectMicrosoft(preset = "mail_read", meta = {}) {
  const state = generateState();
  const redirectUri = resolveRedirectUri(meta);
  const { verifier, challenge } = createPkce();
  const scopes = MICROSOFT_SCOPE_PRESETS[preset] || MICROSOFT_SCOPE_PRESETS.mail_read;
  storeState(state, { ...meta, redirectUri, verifier, scopes, tenantId: meta?.tenantId });
  return getMicrosoftAuthUrl({ state, preset, redirectUri, codeChallenge: challenge, meta });
}

export function getMicrosoftAuthUrl({ state, preset = "mail_read", redirectUri = "", codeChallenge = "", meta = {} } = {}) {
  const { clientId, tenantId, prompt, domainHint, loginHint } = getMicrosoftEnv();
  const resolvedTenant = meta?.tenantId || tenantId || DEFAULT_TENANT;
  const scopes = MICROSOFT_SCOPE_PRESETS[preset] || MICROSOFT_SCOPE_PRESETS.mail_read;
  const params = new URLSearchParams({
    client_id: clientId,
    response_type: "code",
    redirect_uri: redirectUri,
    response_mode: "query",
    scope: scopes.join(" "),
    state
  });
  if (codeChallenge) {
    params.set("code_challenge", codeChallenge);
    params.set("code_challenge_method", "S256");
  }
  const promptValue = meta?.prompt || prompt;
  if (promptValue) params.set("prompt", promptValue);
  const domainHintValue = meta?.domainHint || domainHint;
  if (domainHintValue) params.set("domain_hint", domainHintValue);
  const loginHintValue = meta?.loginHint || loginHint;
  if (loginHintValue) params.set("login_hint", loginHintValue);
  return `${buildAuthorityUrl(resolvedTenant)}/oauth2/v2.0/authorize?${params.toString()}`;
}

export async function exchangeMicrosoftCode(code, state) {
  const meta = consumeState(state);
  if (!meta) {
    const err = new Error("microsoft_state_invalid");
    err.status = 400;
    throw err;
  }
  const { clientId, clientSecret, tenantId } = getMicrosoftEnv();
  const resolvedTenant = meta?.tenantId || tenantId || DEFAULT_TENANT;
  const tokenUrl = `${buildAuthorityUrl(resolvedTenant)}/oauth2/v2.0/token`;
  const body = new URLSearchParams({
    client_id: clientId,
    client_secret: clientSecret,
    redirect_uri: meta.redirectUri || "",
    grant_type: "authorization_code",
    code,
    code_verifier: meta.verifier || ""
  });
  const r = await fetch(tokenUrl, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body
  });
  if (!r.ok) {
    const text = await r.text();
    throw new Error(text || "microsoft_token_exchange_failed");
  }
  const data = await r.json();
  const expiresAt = Date.now() + (data.expires_in || 0) * 1000;
  return {
    access_token: data.access_token,
    refresh_token: data.refresh_token,
    expires_at: expiresAt,
    scope: data.scope,
    token_type: data.token_type,
    id_token: data.id_token || "",
    meta
  };
}

async function refreshMicrosoftToken(refreshToken, scope, tenantOverride = "") {
  const { clientId, clientSecret, tenantId } = getMicrosoftEnv();
  const resolvedTenant = tenantOverride || tenantId || DEFAULT_TENANT;
  const tokenUrl = `${buildAuthorityUrl(resolvedTenant)}/oauth2/v2.0/token`;
  const body = new URLSearchParams({
    client_id: clientId,
    client_secret: clientSecret,
    grant_type: "refresh_token",
    refresh_token: refreshToken
  });
  if (scope) body.set("scope", scope);
  const r = await fetch(tokenUrl, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body
  });
  if (!r.ok) {
    const text = await r.text();
    throw new Error(text || "microsoft_token_refresh_failed");
  }
  const data = await r.json();
  const expiresAt = Date.now() + (data.expires_in || 0) * 1000;
  return {
    access_token: data.access_token,
    refresh_token: data.refresh_token,
    expires_at: expiresAt,
    scope: data.scope,
    token_type: data.token_type,
    id_token: data.id_token || ""
  };
}

export async function fetchMicrosoftProfile(accessToken) {
  const r = await fetch(`${GRAPH_BASE}/me`, {
    headers: { Authorization: `Bearer ${accessToken}` }
  });
  if (!r.ok) {
    const text = await r.text();
    throw new Error(text || "microsoft_profile_failed");
  }
  return await r.json();
}

export async function fetchMicrosoftTenant(accessToken) {
  const r = await fetch(`${GRAPH_BASE}/organization`, {
    headers: { Authorization: `Bearer ${accessToken}` }
  });
  if (!r.ok) {
    const text = await r.text();
    throw new Error(text || "microsoft_org_failed");
  }
  const data = await r.json();
  return Array.isArray(data?.value) ? data.value[0] : null;
}

export async function resolveMicrosoftAccount({ accessToken, idToken = "" } = {}) {
  const [profile, org] = await Promise.all([
    fetchMicrosoftProfile(accessToken),
    fetchMicrosoftTenant(accessToken)
  ]);
  const claims = decodeJwt(idToken);
  const email = profile?.mail || profile?.userPrincipalName || claims?.preferred_username || "";
  const tenantId = org?.id || claims?.tid || "";
  enforceTenantDomain({ tenantId, email });
  return {
    email,
    name: profile?.displayName || claims?.name || "",
    tenantId,
    organization: org?.displayName || ""
  };
}

export async function getMicrosoftAccessToken(requiredScopes = [], userId = "") {
  const stored = getProvider("microsoft", userId) || getProvider("outlook", userId);
  if (!stored) throw new Error("microsoft_not_connected");
  if (requiredScopes?.length) {
    const current = new Set(parseScopes(stored.scope).map(normalizeScope).filter(Boolean));
    const missing = requiredScopes.filter(scope => !scopeSatisfied(current, scope));
    if (missing.length) {
      const err = new Error("microsoft_scopes_mismatch");
      err.status = 400;
      err.detail = { missing };
      throw err;
    }
  }
  if (stored.access_token && stored.expires_at && stored.expires_at > Date.now() + 30000) {
    setProvider("microsoft", { ...stored, lastUsedAt: new Date().toISOString() }, userId);
    return stored.access_token;
  }
  if (!stored.refresh_token) throw new Error("microsoft_refresh_token_missing");
  const refreshed = await refreshMicrosoftToken(stored.refresh_token, stored.scope || "", stored.tenantId);
  const updated = {
    ...stored,
    ...refreshed,
    refresh_token: refreshed.refresh_token || stored.refresh_token,
    scope: refreshed.scope || stored.scope,
    lastUsedAt: new Date().toISOString()
  };
  setProvider("microsoft", updated, userId);
  return updated.access_token;
}

export function getMicrosoftStatus(userId = "") {
  const stored = getProvider("microsoft", userId) || getProvider("outlook", userId);
  if (!stored || !stored.access_token) {
    return { connected: false, scopes: [], email: null, tenantId: null, expiresAt: null };
  }
  return {
    connected: true,
    scopes: parseScopes(stored.scope).map(normalizeScope),
    email: stored.email || null,
    tenantId: stored.tenantId || null,
    expiresAt: stored.expires_at ? new Date(stored.expires_at).toISOString() : null
  };
}

export async function disconnectMicrosoft(userId = "") {
  setProvider("microsoft", null, userId);
  setProvider("outlook", null, userId);
  return { ok: true };
}

export async function listMicrosoftCalendarEvents({ startISO, endISO, max = 25, userId = "", timezone = "" } = {}) {
  const token = await getMicrosoftAccessToken(["https://graph.microsoft.com/Calendars.Read"], userId);
  const params = new URLSearchParams({
    startDateTime: startISO || new Date().toISOString(),
    endDateTime: endISO || new Date(Date.now() + 7 * 86400000).toISOString(),
    $top: String(max || 25),
    $select: "id,subject,organizer,attendees,start,end,location,onlineMeeting,onlineMeetingUrl,webLink,importance,showAs,isCancelled"
  });
  const headers = { Authorization: `Bearer ${token}` };
  if (timezone) {
    headers.Prefer = `outlook.timezone=\"${timezone}\"`;
  }
  const r = await fetch(`${GRAPH_BASE}/me/calendarView?${params.toString()}`, { headers });
  if (!r.ok) {
    const text = await r.text();
    throw new Error(text || "microsoft_calendar_list_failed");
  }
  const data = await r.json();
  return Array.isArray(data?.value) ? data.value : [];
}

export async function createMicrosoftCalendarEvent(payload = {}, userId = "") {
  const token = await getMicrosoftAccessToken(["https://graph.microsoft.com/Calendars.ReadWrite"], userId);
  const r = await fetch(`${GRAPH_BASE}/me/events`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify(payload)
  });
  if (!r.ok) {
    const text = await r.text();
    throw new Error(text || "microsoft_calendar_create_failed");
  }
  return await r.json();
}

export async function updateMicrosoftCalendarEvent(eventId, payload = {}, userId = "") {
  const token = await getMicrosoftAccessToken(["https://graph.microsoft.com/Calendars.ReadWrite"], userId);
  const r = await fetch(`${GRAPH_BASE}/me/events/${encodeURIComponent(eventId)}`, {
    method: "PATCH",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify(payload)
  });
  if (!r.ok) {
    const text = await r.text();
    throw new Error(text || "microsoft_calendar_update_failed");
  }
  return await r.json();
}

export async function deleteMicrosoftCalendarEvent(eventId, userId = "") {
  const token = await getMicrosoftAccessToken(["https://graph.microsoft.com/Calendars.ReadWrite"], userId);
  const r = await fetch(`${GRAPH_BASE}/me/events/${encodeURIComponent(eventId)}`, {
    method: "DELETE",
    headers: { Authorization: `Bearer ${token}` }
  });
  if (!r.ok) {
    const text = await r.text();
    throw new Error(text || "microsoft_calendar_delete_failed");
  }
  return { ok: true };
}
