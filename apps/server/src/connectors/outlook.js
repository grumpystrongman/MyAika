import { getProvider } from "../../integrations/store.js";
import { getMicrosoftAccessToken, getMicrosoftStatus } from "../../integrations/microsoft.js";
import { ingestConnectorDocument } from "./ingest.js";
import { fetchJson, parseList, normalizeText, stripHtml } from "./utils.js";
import { setRagMeta } from "../rag/vectorStore.js";

const GRAPH_API = "https://graph.microsoft.com/v1.0";

async function getOutlookToken(userId = "local", requiredScopes = []) {
  try {
    return await getMicrosoftAccessToken(requiredScopes.length ? requiredScopes : [
      "https://graph.microsoft.com/User.Read",
      "https://graph.microsoft.com/Mail.Read"
    ], userId);
  } catch {
    // fallback to stored/env tokens
  }
  const stored = getProvider("outlook", userId) || getProvider("microsoft", userId);
  return stored?.access_token || stored?.token || process.env.OUTLOOK_ACCESS_TOKEN || process.env.MICROSOFT_ACCESS_TOKEN || "";
}

function buildHeaders(token) {
  return {
    "Authorization": `Bearer ${token}`,
    "Content-Type": "application/json"
  };
}

function buildFilter(lookbackDays, field = "receivedDateTime") {
  const days = Number(lookbackDays || 0);
  if (!Number.isFinite(days) || days <= 0) return "";
  const since = new Date(Date.now() - days * 86400000).toISOString();
  return `${field} ge ${since}`;
}

async function listMessages(token, { folderId = "", limit = 50, lookbackDays } = {}) {
  const path = folderId
    ? `/me/mailFolders/${encodeURIComponent(folderId)}/messages`
    : "/me/mailFolders/inbox/messages";
  const url = new URL(`${GRAPH_API}${path}`);
  url.searchParams.set("$top", String(limit));
  url.searchParams.set("$select", "id,subject,bodyPreview,receivedDateTime,webLink,from,toRecipients,ccRecipients,importance");
  const filter = buildFilter(lookbackDays, "receivedDateTime");
  if (filter) url.searchParams.set("$filter", filter);
  const data = await fetchJson(url.toString(), { headers: buildHeaders(token) });
  return Array.isArray(data?.value) ? data.value : [];
}

async function getMessage(token, messageId) {
  const safeId = String(messageId || "").trim();
  if (!safeId) throw new Error("message_id_required");
  const url = new URL(`${GRAPH_API}/me/messages/${encodeURIComponent(safeId)}`);
  url.searchParams.set("$select", "id,subject,body,bodyPreview,receivedDateTime,webLink,from,toRecipients,ccRecipients,importance");
  return fetchJson(url.toString(), { headers: buildHeaders(token) });
}

async function listEvents(token, { limit = 25, lookbackDays } = {}) {
  const url = new URL(`${GRAPH_API}/me/events`);
  url.searchParams.set("$top", String(limit));
  url.searchParams.set("$select", "id,subject,bodyPreview,start,end,webLink,organizer");
  const filter = buildFilter(lookbackDays, "start/dateTime");
  if (filter) url.searchParams.set("$filter", filter);
  const data = await fetchJson(url.toString(), { headers: buildHeaders(token) });
  return Array.isArray(data?.value) ? data.value : [];
}

export async function syncOutlook({ userId = "local", limit } = {}) {
  const includeEvents = String(process.env.OUTLOOK_SYNC_EVENTS || "0") === "1";
  const token = await getOutlookToken(userId, includeEvents ? [
    "https://graph.microsoft.com/User.Read",
    "https://graph.microsoft.com/Mail.Read",
    "https://graph.microsoft.com/Calendars.Read"
  ] : [
    "https://graph.microsoft.com/User.Read",
    "https://graph.microsoft.com/Mail.Read"
  ]);
  if (!token) return { ok: false, error: "outlook_token_missing" };

  const maxItems = Number(limit || process.env.OUTLOOK_SYNC_LIMIT || 50);
  const lookbackDays = Number(process.env.OUTLOOK_LOOKBACK_DAYS || 14);
  const folderIds = parseList(process.env.OUTLOOK_FOLDER_IDS);

  const summary = { ok: true, ingested: 0, skipped: 0, errors: [] };

  const folders = folderIds.length ? folderIds : [""];
  for (const folderId of folders) {
    if (summary.ingested >= maxItems) break;
    try {
      const messages = await listMessages(token, { folderId, limit: maxItems - summary.ingested, lookbackDays });
      for (const msg of messages) {
        if (summary.ingested >= maxItems) break;
        const subject = msg?.subject || "Outlook Message";
        const from = msg?.from?.emailAddress?.name || msg?.from?.emailAddress?.address || "";
        const preview = normalizeText(stripHtml(msg?.bodyPreview || ""));
        const text = normalizeText(`${subject}\nFrom: ${from}\n${preview}`);
        const result = await ingestConnectorDocument({
          collectionId: "outlook",
          sourceType: "outlook_email",
          title: subject,
          sourceUrl: msg?.webLink || "",
          text,
          tags: ["outlook", "email"],
          metadata: { messageId: msg?.id || "", folderId: folderId || "inbox" },
          sourceGroup: `outlook:${folderId || "inbox"}`,
          occurredAt: msg?.receivedDateTime || ""
        });
        if (result?.skipped) summary.skipped += 1;
        else if (result?.ok) summary.ingested += 1;
        else summary.errors.push({ id: msg?.id || "", error: result?.error || "ingest_failed" });
      }
    } catch (err) {
      summary.errors.push({ id: folderId || "inbox", error: err?.message || "outlook_sync_failed" });
    }
  }

  if (includeEvents && summary.ingested < maxItems) {
    try {
      const events = await listEvents(token, { limit: maxItems - summary.ingested, lookbackDays });
      for (const event of events) {
        if (summary.ingested >= maxItems) break;
        const subject = event?.subject || "Outlook Event";
        const organizer = event?.organizer?.emailAddress?.name || event?.organizer?.emailAddress?.address || "";
        const preview = normalizeText(stripHtml(event?.bodyPreview || ""));
        const start = event?.start?.dateTime || "";
        const end = event?.end?.dateTime || "";
        const text = normalizeText(`${subject}\nOrganizer: ${organizer}\nStart: ${start}\nEnd: ${end}\n${preview}`);
        const result = await ingestConnectorDocument({
          collectionId: "outlook",
          sourceType: "outlook_event",
          title: subject,
          sourceUrl: event?.webLink || "",
          text,
          tags: ["outlook", "calendar"],
          metadata: { eventId: event?.id || "", start, end },
          sourceGroup: "outlook:calendar",
          occurredAt: start || ""
        });
        if (result?.skipped) summary.skipped += 1;
        else if (result?.ok) summary.ingested += 1;
        else summary.errors.push({ id: event?.id || "", error: result?.error || "ingest_failed" });
      }
    } catch (err) {
      summary.errors.push({ id: "calendar", error: err?.message || "outlook_events_failed" });
    }
  }

  setRagMeta("connector_sync:outlook", new Date().toISOString());
  return summary;
}

export function isOutlookConfigured(userId = "local") {
  const status = getMicrosoftStatus(userId);
  if (!status?.connected) return false;
  const scopes = new Set(Array.isArray(status.scopes) ? status.scopes : []);
  const mailReadable = scopes.has("mail.read") || scopes.has("mail.readbasic") || scopes.has("mail.readwrite");
  return mailReadable || Boolean(process.env.OUTLOOK_ACCESS_TOKEN || process.env.MICROSOFT_ACCESS_TOKEN);
}

export async function listOutlookPreview({ userId = "local", limit = 20, lookbackDays, folderIds = [] } = {}) {
  const token = await getOutlookToken(userId);
  if (!token) return [];
  const folders = Array.isArray(folderIds) && folderIds.length ? folderIds : [""];
  const items = [];
  for (const folderId of folders) {
    const messages = await listMessages(token, { folderId, limit, lookbackDays });
    items.push(...messages.map(msg => ({
      provider: "outlook",
      id: msg?.id || "",
      subject: msg?.subject || "(no subject)",
      from: msg?.from?.emailAddress?.address || msg?.from?.emailAddress?.name || "",
      to: Array.isArray(msg?.toRecipients)
        ? msg.toRecipients.map(r => r?.emailAddress?.address || r?.emailAddress?.name || "").filter(Boolean).join(", ")
        : "",
      receivedAt: msg?.receivedDateTime || "",
      snippet: normalizeText(stripHtml(msg?.bodyPreview || "")),
      webLink: msg?.webLink || "",
      folderId: folderId || "inbox"
    })));
  }
  return items
    .sort((a, b) => new Date(b.receivedAt || 0) - new Date(a.receivedAt || 0))
    .slice(0, Number(limit || 20));
}

export async function getOutlookMessage({ userId = "local", messageId = "" } = {}) {
  const token = await getOutlookToken(userId);
  if (!token) throw new Error("outlook_token_missing");
  const detail = await getMessage(token, messageId);
  const from = detail?.from?.emailAddress?.address || detail?.from?.emailAddress?.name || "";
  const to = Array.isArray(detail?.toRecipients)
    ? detail.toRecipients.map(r => r?.emailAddress?.address || r?.emailAddress?.name || "").filter(Boolean).join(", ")
    : "";
  const html = detail?.body?.contentType === "html" ? detail?.body?.content || "" : "";
  const text = detail?.body?.contentType === "text"
    ? detail?.body?.content || ""
    : stripHtml(detail?.body?.content || "");
  return {
    provider: "outlook",
    id: detail?.id || String(messageId || ""),
    subject: detail?.subject || "(no subject)",
    from,
    to,
    receivedAt: detail?.receivedDateTime || "",
    snippet: normalizeText(stripHtml(detail?.bodyPreview || "")),
    webLink: detail?.webLink || "",
    html,
    text
  };
}
