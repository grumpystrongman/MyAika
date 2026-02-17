import { getProvider } from "../integrations/store.js";
import { ingestConnectorDocument } from "./ingest.js";
import { fetchJson, parseList, normalizeText, stripHtml } from "./utils.js";
import { setRagMeta } from "../rag/vectorStore.js";

const GRAPH_API = "https://graph.microsoft.com/v1.0";

function getOutlookToken(userId = "local") {
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
  url.searchParams.set("$select", "id,subject,bodyPreview,receivedDateTime,webLink,from");
  const filter = buildFilter(lookbackDays, "receivedDateTime");
  if (filter) url.searchParams.set("$filter", filter);
  const data = await fetchJson(url.toString(), { headers: buildHeaders(token) });
  return Array.isArray(data?.value) ? data.value : [];
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
  const token = getOutlookToken(userId);
  if (!token) return { ok: false, error: "outlook_token_missing" };

  const maxItems = Number(limit || process.env.OUTLOOK_SYNC_LIMIT || 50);
  const lookbackDays = Number(process.env.OUTLOOK_LOOKBACK_DAYS || 14);
  const includeEvents = String(process.env.OUTLOOK_SYNC_EVENTS || "0") === "1";
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
  return Boolean(getOutlookToken(userId));
}
