import { getGoogleAccessToken } from "../../integrations/google.js";
import { getProvider } from "../../integrations/store.js";
import { ingestConnectorDocument } from "./ingest.js";
import { fetchJson, normalizeText, parseList } from "./utils.js";
import { setRagMeta } from "../rag/vectorStore.js";

const GMAIL_API = "https://gmail.googleapis.com/gmail/v1";

function buildQuery({ lookbackDays, query } = {}) {
  const parts = [];
  const days = Number(lookbackDays || 0);
  if (Number.isFinite(days) && days > 0) {
    parts.push(`newer_than:${days}d`);
  }
  if (query) parts.push(String(query));
  return parts.join(" ").trim();
}

function gmailWebLink(messageId = "") {
  if (!messageId) return "";
  return `https://mail.google.com/mail/u/0/#inbox/${messageId}`;
}

function getHeader(headers = [], name) {
  const key = String(name || "").toLowerCase();
  const found = headers.find(h => String(h?.name || "").toLowerCase() === key);
  return found?.value || "";
}

async function listMessageIds(token, { limit = 50, query = "", labelIds = [] } = {}) {
  const url = new URL(`${GMAIL_API}/users/me/messages`);
  url.searchParams.set("maxResults", String(limit));
  if (query) url.searchParams.set("q", query);
  if (Array.isArray(labelIds) && labelIds.length) {
    labelIds.forEach(label => url.searchParams.append("labelIds", label));
  }
  const data = await fetchJson(url.toString(), {
    headers: { Authorization: `Bearer ${token}` }
  });
  return Array.isArray(data?.messages) ? data.messages : [];
}

async function getMessage(token, messageId) {
  const url = new URL(`${GMAIL_API}/users/me/messages/${encodeURIComponent(messageId)}`);
  url.searchParams.set("format", "metadata");
  ["Subject", "From", "To", "Date"].forEach(header => {
    url.searchParams.append("metadataHeaders", header);
  });
  return fetchJson(url.toString(), {
    headers: { Authorization: `Bearer ${token}` }
  });
}

export async function listGmailPreview({ userId = "local", limit = 20, lookbackDays, query = "", labelIds } = {}) {
  const token = await getGoogleAccessToken(["https://www.googleapis.com/auth/gmail.readonly"], userId);
  const resolvedLabels = Array.isArray(labelIds) && labelIds.length ? labelIds : parseList(process.env.GMAIL_LABEL_IDS);
  const q = buildQuery({ lookbackDays, query });
  const ids = await listMessageIds(token, { limit, query: q, labelIds: resolvedLabels });
  const previews = [];
  for (const msg of ids) {
    const detail = await getMessage(token, msg.id);
    const headers = detail?.payload?.headers || [];
    const subject = getHeader(headers, "Subject") || "(no subject)";
    const from = getHeader(headers, "From");
    const to = getHeader(headers, "To");
    const date = getHeader(headers, "Date");
    const receivedAt = date ? new Date(date).toISOString() : "";
    previews.push({
      provider: "gmail",
      id: detail?.id || msg.id,
      threadId: detail?.threadId || "",
      subject,
      from,
      to,
      receivedAt,
      snippet: normalizeText(detail?.snippet || ""),
      webLink: gmailWebLink(detail?.id || msg.id),
      labelIds: detail?.labelIds || []
    });
  }
  return previews;
}

export async function syncGmail({ userId = "local", limit } = {}) {
  const token = await getGoogleAccessToken(["https://www.googleapis.com/auth/gmail.readonly"], userId);
  const maxItems = Number(limit || process.env.GMAIL_SYNC_LIMIT || 50);
  const lookbackDays = Number(process.env.GMAIL_LOOKBACK_DAYS || 14);
  const labelIds = parseList(process.env.GMAIL_LABEL_IDS);
  const customQuery = String(process.env.GMAIL_SYNC_QUERY || "").trim();
  const q = buildQuery({ lookbackDays, query: customQuery });

  const summary = { ok: true, ingested: 0, skipped: 0, errors: [] };
  const ids = await listMessageIds(token, { limit: maxItems, query: q, labelIds });

  for (const msg of ids) {
    if (summary.ingested >= maxItems) break;
    try {
      const detail = await getMessage(token, msg.id);
      const headers = detail?.payload?.headers || [];
      const subject = getHeader(headers, "Subject") || "Gmail Message";
      const from = getHeader(headers, "From");
      const to = getHeader(headers, "To");
      const date = getHeader(headers, "Date");
      const receivedAt = date ? new Date(date).toISOString() : "";
      const snippet = normalizeText(detail?.snippet || "");
      const text = normalizeText(`${subject}\nFrom: ${from}\nTo: ${to}\n${snippet}`);
      const result = await ingestConnectorDocument({
        collectionId: "gmail",
        sourceType: "gmail_email",
        meetingId: `rag:gmail:email:${detail?.id || msg.id}`,
        title: subject,
        sourceUrl: gmailWebLink(detail?.id || msg.id),
        text,
        tags: ["gmail", "email"],
        metadata: {
          messageId: detail?.id || msg.id,
          threadId: detail?.threadId || "",
          labelIds: detail?.labelIds || []
        },
        sourceGroup: "gmail:inbox",
        occurredAt: receivedAt,
        force: true,
        replaceExisting: true
      });
      if (result?.skipped) summary.skipped += 1;
      else if (result?.ok) summary.ingested += 1;
      else summary.errors.push({ id: msg?.id || "", error: result?.error || "ingest_failed" });
    } catch (err) {
      summary.errors.push({ id: msg?.id || "", error: err?.message || "gmail_sync_failed" });
    }
  }

  setRagMeta("connector_sync:gmail", new Date().toISOString());
  return summary;
}

export function isGmailConfigured(userId = "local") {
  const stored = getProvider("google", userId);
  if (!stored?.access_token) return false;
  const scopes = String(stored.scope || "")
    .split(" ")
    .map(s => s.trim())
    .filter(Boolean);
  return scopes.includes("https://www.googleapis.com/auth/gmail.readonly") || scopes.includes("https://www.googleapis.com/auth/gmail.modify");
}
