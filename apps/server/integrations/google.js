import crypto from "node:crypto";
import { getProvider, setProvider } from "./store.js";

const AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth";
const TOKEN_URL = "https://oauth2.googleapis.com/token";

export const GOOGLE_SCOPE_PRESETS = {
  core: [
    "https://www.googleapis.com/auth/drive.metadata.readonly",
    "https://www.googleapis.com/auth/drive.file",
    "https://www.googleapis.com/auth/documents",
    "https://www.googleapis.com/auth/spreadsheets",
    "https://www.googleapis.com/auth/calendar.events",
    "https://www.googleapis.com/auth/presentations",
    "https://www.googleapis.com/auth/gmail.send",
    "https://www.googleapis.com/auth/meetings.space.readonly",
    "https://www.googleapis.com/auth/meetings.space.created",
    "https://www.googleapis.com/auth/meetings.space.settings"
  ],
  readonly: [
    "https://www.googleapis.com/auth/drive.metadata.readonly",
    "https://www.googleapis.com/auth/documents.readonly",
    "https://www.googleapis.com/auth/spreadsheets.readonly",
    "https://www.googleapis.com/auth/calendar.events.readonly",
    "https://www.googleapis.com/auth/presentations.readonly",
    "https://www.googleapis.com/auth/meetings.space.readonly"
  ]
};

function getGoogleEnv() {
  return {
    clientId: process.env.GOOGLE_CLIENT_ID || "",
    clientSecret: process.env.GOOGLE_CLIENT_SECRET || "",
    redirectUri: process.env.GOOGLE_REDIRECT_URI || ""
  };
}

function generateState() {
  return crypto.randomBytes(16).toString("hex");
}

function storeState(state, meta = {}) {
  const current = getProvider("google_oauth_state") || {};
  current[state] = { ...meta, createdAt: Date.now() };
  setProvider("google_oauth_state", current);
}

function consumeState(state) {
  const stored = getProvider("google_oauth_state") || {};
  const meta = stored[state];
  if (!meta) return null;
  delete stored[state];
  setProvider("google_oauth_state", stored);
  return meta;
}

function parseScopes(scopeStr) {
  if (!scopeStr) return [];
  return scopeStr.split(" ").map(s => s.trim()).filter(Boolean);
}

function scopeSatisfied(current, required) {
  if (current.has(required)) return true;
  const aliasMap = {
    "https://www.googleapis.com/auth/documents.readonly": [
      "https://www.googleapis.com/auth/documents"
    ],
    "https://www.googleapis.com/auth/spreadsheets.readonly": [
      "https://www.googleapis.com/auth/spreadsheets"
    ],
    "https://www.googleapis.com/auth/calendar.events.readonly": [
      "https://www.googleapis.com/auth/calendar.events"
    ],
    "https://www.googleapis.com/auth/presentations.readonly": [
      "https://www.googleapis.com/auth/presentations"
    ],
    "https://www.googleapis.com/auth/drive.metadata.readonly": [
      "https://www.googleapis.com/auth/drive.file"
    ]
  };
  const aliases = aliasMap[required] || [];
  return aliases.some(a => current.has(a));
}

export function connectGoogle(preset = "core", meta = {}) {
  const state = generateState();
  storeState(state, meta);
  return getGoogleAuthUrl(state, preset);
}

export function getGoogleAuthUrl(state, preset = "core") {
  const { clientId, redirectUri } = getGoogleEnv();
  const scopes = GOOGLE_SCOPE_PRESETS[preset] || GOOGLE_SCOPE_PRESETS.core;
  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    response_type: "code",
    access_type: "offline",
    prompt: "consent",
    scope: scopes.join(" "),
    state
  });
  return `${AUTH_URL}?${params.toString()}`;
}

export async function exchangeGoogleCode(code, state) {
  const meta = consumeState(state);
  if (!meta) {
    const err = new Error("google_state_invalid");
    err.status = 400;
    throw err;
  }
  const { clientId, clientSecret, redirectUri } = getGoogleEnv();
  const body = new URLSearchParams({
    code,
    client_id: clientId,
    client_secret: clientSecret,
    redirect_uri: redirectUri,
    grant_type: "authorization_code"
  });

  const r = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body
  });
  if (!r.ok) {
    const text = await r.text();
    throw new Error(text || "google_token_exchange_failed");
  }
  const data = await r.json();
  const expiresAt = Date.now() + (data.expires_in || 0) * 1000;
  return {
    access_token: data.access_token,
    refresh_token: data.refresh_token,
    expires_at: expiresAt,
    scope: data.scope,
    token_type: data.token_type,
    meta
  };
}

export async function fetchGoogleUserInfo(accessToken) {
  const r = await fetch("https://www.googleapis.com/oauth2/v2/userinfo", {
    headers: { Authorization: `Bearer ${accessToken}` }
  });
  if (!r.ok) {
    const text = await r.text();
    const err = new Error(text || "google_userinfo_failed");
    err.status = r.status;
    throw err;
  }
  return await r.json();
}

async function refreshGoogleToken(refreshToken) {
  const { clientId, clientSecret } = getGoogleEnv();
  const body = new URLSearchParams({
    refresh_token: refreshToken,
    client_id: clientId,
    client_secret: clientSecret,
    grant_type: "refresh_token"
  });
  const r = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body
  });
  if (!r.ok) {
    const text = await r.text();
    throw new Error(text || "google_token_refresh_failed");
  }
  const data = await r.json();
  const expiresAt = Date.now() + (data.expires_in || 0) * 1000;
  return {
    access_token: data.access_token,
    expires_at: expiresAt,
    token_type: data.token_type
  };
}

export async function getGoogleAccessToken(requiredScopes = [], userId = "") {
  const stored = getProvider("google", userId);
  if (!stored) throw new Error("google_not_connected");
  if (requiredScopes?.length) {
    const current = new Set(parseScopes(stored.scope));
    const missing = requiredScopes.filter(s => !scopeSatisfied(current, s));
    if (missing.length) {
      const err = new Error("google_scopes_mismatch");
      err.status = 400;
      err.detail = { missing };
      throw err;
    }
  }
  if (stored.access_token && stored.expires_at && stored.expires_at > Date.now() + 30000) {
    return stored.access_token;
  }
  if (!stored.refresh_token) throw new Error("google_refresh_token_missing");
  const refreshed = await refreshGoogleToken(stored.refresh_token);
  const updated = { ...stored, ...refreshed };
  setProvider("google", updated, userId);
  return updated.access_token;
}

export function getGoogleStatus(userId = "") {
  const stored = getProvider("google", userId);
  if (!stored || !stored.access_token) {
    return { connected: false, scopes: [], email: null, expiresAt: null };
  }
  return {
    connected: true,
    scopes: parseScopes(stored.scope),
    email: stored.email || null,
    expiresAt: stored.expires_at ? new Date(stored.expires_at).toISOString() : null
  };
}

export async function disconnectGoogle(userId = "") {
  const stored = getProvider("google", userId);
  if (stored?.access_token) {
    await fetch(`https://oauth2.googleapis.com/revoke?token=${encodeURIComponent(stored.access_token)}`, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" }
    }).catch(() => {});
  }
  setProvider("google", null, userId);
  return { ok: true };
}

export async function createGoogleDoc(title, content, userId = "") {
  const token = await getGoogleAccessToken(["https://www.googleapis.com/auth/documents"], userId);
  const r = await fetch("https://docs.googleapis.com/v1/documents", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({ title })
  });
  if (!r.ok) {
    const text = await r.text();
    throw new Error(text || "google_doc_create_failed");
  }
  const doc = await r.json();
  if (content) {
    await appendGoogleDoc(doc.documentId, content, userId);
  }
  return doc;
}

export async function appendGoogleDoc(documentId, content, userId = "") {
  const token = await getGoogleAccessToken(["https://www.googleapis.com/auth/documents"], userId);
  const r = await fetch(`https://docs.googleapis.com/v1/documents/${documentId}:batchUpdate`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      requests: [
        { insertText: { location: { index: 1 }, text: `${content}\n` } }
      ]
    })
  });
  if (!r.ok) {
    const text = await r.text();
    throw new Error(text || "google_doc_update_failed");
  }
  return await r.json();
}

export async function getGoogleDoc(documentId, userId = "") {
  const token = await getGoogleAccessToken(["https://www.googleapis.com/auth/documents.readonly"], userId);
  const r = await fetch(`https://docs.googleapis.com/v1/documents/${documentId}`, {
    headers: { Authorization: `Bearer ${token}` }
  });
  if (!r.ok) {
    const text = await r.text();
    throw new Error(text || "google_doc_get_failed");
  }
  return await r.json();
}

export async function uploadDriveFile(name, content, mimeType = "text/plain", userId = "") {
  const token = await getGoogleAccessToken(["https://www.googleapis.com/auth/drive.file"], userId);
  const boundary = "aika_boundary";
  const metadata = { name, mimeType };
  const multipart = [
    `--${boundary}`,
    "Content-Type: application/json; charset=UTF-8",
    "",
    JSON.stringify(metadata),
    `--${boundary}`,
    `Content-Type: ${mimeType}`,
    "",
    content,
    `--${boundary}--`
  ].join("\r\n");

  const r = await fetch("https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": `multipart/related; boundary=${boundary}`
    },
    body: multipart
  });
  if (!r.ok) {
    const text = await r.text();
    throw new Error(text || "google_drive_upload_failed");
  }
  return await r.json();
}

export async function listDriveFiles(q, limit = 20, userId = "") {
  const token = await getGoogleAccessToken(["https://www.googleapis.com/auth/drive.metadata.readonly"], userId);
  const params = new URLSearchParams({
    pageSize: String(limit),
    fields: "files(id,name,mimeType,modifiedTime)",
    spaces: "drive"
  });
  if (q) params.set("q", q);
  const r = await fetch(`https://www.googleapis.com/drive/v3/files?${params.toString()}`, {
    headers: { Authorization: `Bearer ${token}` }
  });
  if (!r.ok) {
    const text = await r.text();
    throw new Error(text || "google_drive_list_failed");
  }
  return await r.json();
}

async function createDriveFolder(name, parentId, userId = "") {
  const token = await getGoogleAccessToken(["https://www.googleapis.com/auth/drive.file"], userId);
  const body = {
    name,
    mimeType: "application/vnd.google-apps.folder"
  };
  if (parentId) body.parents = [parentId];
  const r = await fetch("https://www.googleapis.com/drive/v3/files", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify(body)
  });
  if (!r.ok) {
    const text = await r.text();
    throw new Error(text || "google_drive_folder_create_failed");
  }
  return await r.json();
}

export async function ensureDriveFolderPath(pathParts, userId = "") {
  const stored = getProvider("google", userId) || {};
  const cache = stored.folder_cache || {};
  let parentId = "root";
  let currentPath = "";
  for (const part of pathParts) {
    currentPath = currentPath ? `${currentPath}/${part}` : part;
    if (cache[currentPath]) {
      parentId = cache[currentPath];
      continue;
    }
    const q = `mimeType='application/vnd.google-apps.folder' and name='${part.replace(/'/g, "\\'")}' and '${parentId}' in parents and trashed=false`;
    const list = await listDriveFiles(q, 1, userId);
    const found = list.files?.[0];
    if (found) {
      cache[currentPath] = found.id;
      parentId = found.id;
      continue;
    }
    const created = await createDriveFolder(part, parentId === "root" ? null : parentId, userId);
    cache[currentPath] = created.id;
    parentId = created.id;
  }
  setProvider("google", { ...stored, folder_cache: cache }, userId);
  return parentId;
}

export async function createGoogleDocInFolder(title, content, folderId, userId = "") {
  const token = await getGoogleAccessToken(["https://www.googleapis.com/auth/documents"], userId);
  const r = await fetch("https://docs.googleapis.com/v1/documents", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({ title })
  });
  if (!r.ok) {
    const text = await r.text();
    throw new Error(text || "google_doc_create_failed");
  }
  const doc = await r.json();
  if (folderId) {
    const params = new URLSearchParams({
      addParents: folderId,
      removeParents: "root"
    });
    await fetch(`https://www.googleapis.com/drive/v3/files/${doc.documentId}?${params.toString()}`, {
      method: "PATCH",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({})
    });
  }
  if (content) {
    await appendGoogleDoc(doc.documentId, content, userId);
  }
  return doc;
}

export async function getSheetValues(spreadsheetId, range, userId = "") {
  const token = await getGoogleAccessToken(["https://www.googleapis.com/auth/spreadsheets.readonly"], userId);
  const r = await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${encodeURIComponent(range)}`, {
    headers: { Authorization: `Bearer ${token}` }
  });
  if (!r.ok) {
    const text = await r.text();
    throw new Error(text || "google_sheets_get_failed");
  }
  return await r.json();
}

export async function appendSheetValues(spreadsheetId, range, values, userId = "") {
  const token = await getGoogleAccessToken(["https://www.googleapis.com/auth/spreadsheets"], userId);
  const r = await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${encodeURIComponent(range)}:append?valueInputOption=USER_ENTERED`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({ values })
  });
  if (!r.ok) {
    const text = await r.text();
    throw new Error(text || "google_sheets_append_failed");
  }
  return await r.json();
}

export async function listCalendarEvents(max = 10, userId = "") {
  const token = await getGoogleAccessToken(["https://www.googleapis.com/auth/calendar.events.readonly"], userId);
  const params = new URLSearchParams({
    maxResults: String(max),
    timeMin: new Date().toISOString(),
    singleEvents: "true",
    orderBy: "startTime"
  });
  const r = await fetch(`https://www.googleapis.com/calendar/v3/calendars/primary/events?${params.toString()}`, {
    headers: { Authorization: `Bearer ${token}` }
  });
  if (!r.ok) {
    const text = await r.text();
    throw new Error(text || "google_calendar_list_failed");
  }
  return await r.json();
}

export async function createCalendarEvent(payload, userId = "") {
  const token = await getGoogleAccessToken(["https://www.googleapis.com/auth/calendar.events"], userId);
  const r = await fetch("https://www.googleapis.com/calendar/v3/calendars/primary/events", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify(payload)
  });
  if (!r.ok) {
    const text = await r.text();
    throw new Error(text || "google_calendar_create_failed");
  }
  return await r.json();
}

export async function getSlidesPresentation(presentationId, userId = "") {
  const token = await getGoogleAccessToken(["https://www.googleapis.com/auth/presentations.readonly"], userId);
  const r = await fetch(`https://slides.googleapis.com/v1/presentations/${presentationId}`, {
    headers: { Authorization: `Bearer ${token}` }
  });
  if (!r.ok) {
    const text = await r.text();
    throw new Error(text || "google_slides_get_failed");
  }
  return await r.json();
}

export async function listMeetSpaces(userId = "") {
  const token = await getGoogleAccessToken([
    "https://www.googleapis.com/auth/meetings.space.readonly"
  ], userId);
  const r = await fetch("https://meet.googleapis.com/v2/spaces", {
    headers: { Authorization: `Bearer ${token}` }
  });
  if (!r.ok) {
    const text = await r.text();
    throw new Error(text || "google_meet_list_failed");
  }
  return await r.json();
}

export async function createMeetSpace(payload = {}, userId = "") {
  const token = await getGoogleAccessToken([
    "https://www.googleapis.com/auth/meetings.space.created",
    "https://www.googleapis.com/auth/meetings.space.settings"
  ], userId);
  const r = await fetch("https://meet.googleapis.com/v2/spaces", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify(payload)
  });
  if (!r.ok) {
    const text = await r.text();
    throw new Error(text || "google_meet_create_failed");
  }
  return await r.json();
}

function toBase64Url(value) {
  return Buffer.from(value, "utf8")
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");
}

export async function sendGmailMessage({ to, subject, text, fromName = "", userId = "" }) {
  const token = await getGoogleAccessToken(["https://www.googleapis.com/auth/gmail.send"], userId);
  const toLine = Array.isArray(to) ? to.join(", ") : String(to || "");
  const safeSubject = String(subject || "Aika Meeting Notes");
  const safeText = String(text || "");
  const headers = [
    `To: ${toLine}`,
    safeSubject ? `Subject: ${safeSubject}` : "",
    fromName ? `From: ${fromName}` : "",
    "MIME-Version: 1.0",
    "Content-Type: text/plain; charset=UTF-8"
  ].filter(Boolean);
  const raw = toBase64Url(`${headers.join("\r\n")}\r\n\r\n${safeText}`);
  const r = await fetch("https://gmail.googleapis.com/gmail/v1/users/me/messages/send", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({ raw })
  });
  if (!r.ok) {
    const detail = await r.text();
    throw new Error(detail || "gmail_send_failed");
  }
  return await r.json();
}
