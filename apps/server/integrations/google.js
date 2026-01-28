import { getProvider, setProvider } from "./store.js";

const AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth";
const TOKEN_URL = "https://oauth2.googleapis.com/token";

function getGoogleEnv() {
  return {
    clientId: process.env.GOOGLE_CLIENT_ID || "",
    clientSecret: process.env.GOOGLE_CLIENT_SECRET || "",
    redirectUri: process.env.GOOGLE_REDIRECT_URI || "",
    scopes: [
      "https://www.googleapis.com/auth/documents",
      "https://www.googleapis.com/auth/drive.file"
    ]
  };
}

export function getGoogleAuthUrl(state) {
  const { clientId, redirectUri, scopes } = getGoogleEnv();
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

export async function exchangeGoogleCode(code) {
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
    token_type: data.token_type
  };
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

export async function getGoogleAccessToken() {
  const stored = getProvider("google");
  if (!stored) throw new Error("google_not_connected");
  if (stored.access_token && stored.expires_at && stored.expires_at > Date.now() + 30000) {
    return stored.access_token;
  }
  if (!stored.refresh_token) throw new Error("google_refresh_token_missing");
  const refreshed = await refreshGoogleToken(stored.refresh_token);
  const updated = { ...stored, ...refreshed };
  setProvider("google", updated);
  return updated.access_token;
}

export async function createGoogleDoc(title, content) {
  const token = await getGoogleAccessToken();
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
    await appendGoogleDoc(doc.documentId, content);
  }
  return doc;
}

export async function appendGoogleDoc(documentId, content) {
  const token = await getGoogleAccessToken();
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

export async function uploadDriveFile(name, content, mimeType = "text/plain") {
  const token = await getGoogleAccessToken();
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
