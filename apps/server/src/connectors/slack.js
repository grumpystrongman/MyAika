import { getProvider } from "../integrations/store.js";
import { ingestConnectorDocument } from "./ingest.js";
import { fetchJson, parseList, normalizeText } from "./utils.js";
import { setRagMeta } from "../rag/vectorStore.js";

const SLACK_API = "https://slack.com/api";

function getSlackToken(userId = "local") {
  const stored = getProvider("slack", userId);
  return stored?.bot_token || stored?.access_token || process.env.SLACK_BOT_TOKEN || "";
}

function buildHeaders(token) {
  return {
    "Authorization": `Bearer ${token}`,
    "Content-Type": "application/json; charset=utf-8"
  };
}

async function slackApi(path, token, params = {}) {
  const url = new URL(`${SLACK_API}/${path}`);
  Object.entries(params).forEach(([key, value]) => {
    if (value === undefined || value === null || value === "") return;
    url.searchParams.set(key, String(value));
  });
  const data = await fetchJson(url.toString(), { headers: buildHeaders(token) });
  if (!data.ok) throw new Error(data.error || "slack_api_error");
  return data;
}

function cleanSlackText(text) {
  return String(text || "")
    .replace(/<@([A-Z0-9]+)>/g, "@$1")
    .replace(/<#([A-Z0-9]+)\|([^>]+)>/g, "#$2")
    .replace(/<https?:\\/\\/[^|>]+\\|([^>]+)>/g, "$1")
    .replace(/<mailto:[^|>]+\\|([^>]+)>/g, "$1")
    .replace(/<([^>]+)>/g, "$1")
    .replace(/\\s+/g, " ")
    .trim();
}

async function listChannels(token, { types, limit = 200 } = {}) {
  let cursor = "";
  const channels = [];
  while (channels.length < limit) {
    const data = await slackApi("conversations.list", token, {
      types: types || "public_channel,private_channel",
      exclude_archived: "true",
      limit: Math.min(200, limit - channels.length),
      cursor: cursor || undefined
    });
    const items = Array.isArray(data?.channels) ? data.channels : [];
    channels.push(...items);
    if (!data?.response_metadata?.next_cursor) break;
    cursor = data.response_metadata.next_cursor;
  }
  return channels;
}

async function fetchChannelHistory(token, channelId, { oldest, limit = 200 } = {}) {
  let cursor = "";
  const messages = [];
  while (messages.length < limit) {
    const data = await slackApi("conversations.history", token, {
      channel: channelId,
      oldest,
      limit: Math.min(200, limit - messages.length),
      cursor: cursor || undefined
    });
    const items = Array.isArray(data?.messages) ? data.messages : [];
    messages.push(...items);
    if (!data?.has_more || !data?.response_metadata?.next_cursor) break;
    cursor = data.response_metadata.next_cursor;
  }
  return messages;
}

function groupMessagesByDay(messages = []) {
  const byDay = new Map();
  messages.forEach(msg => {
    const ts = Number(msg?.ts || 0);
    if (!Number.isFinite(ts) || !msg?.text) return;
    const date = new Date(ts * 1000);
    const dayKey = date.toISOString().slice(0, 10);
    const time = date.toISOString().slice(11, 19);
    const user = msg.user || msg.bot_id || "unknown";
    const line = `[${time}] ${user}: ${cleanSlackText(msg.text)}`;
    if (!byDay.has(dayKey)) byDay.set(dayKey, []);
    byDay.get(dayKey).push(line);
  });
  return byDay;
}

export async function syncSlack({ userId = "local", limit } = {}) {
  const token = getSlackToken(userId);
  if (!token) return { ok: false, error: "slack_token_missing" };

  const channelInput = parseList(process.env.SLACK_CHANNELS);
  const channelTypes = process.env.SLACK_CHANNEL_TYPES || "public_channel,private_channel";
  const maxMessages = Number(process.env.SLACK_SYNC_MAX_MESSAGES || 200);
  const lookbackDays = Number(process.env.SLACK_SYNC_LOOKBACK_DAYS || 7);
  const maxDocs = Number(limit || process.env.SLACK_SYNC_LIMIT || 40);

  const channels = await listChannels(token, { types: channelTypes, limit: 500 });
  const channelMap = new Map(channels.map(ch => [ch.id, ch]));
  const byName = new Map(channels.map(ch => [ch.name, ch]));

  const selectedChannels = channelInput.length
    ? channelInput.map(entry => {
        const trimmed = entry.replace(/^#/, "");
        return channelMap.get(entry) || byName.get(trimmed);
      }).filter(Boolean)
    : channels.slice(0, 25);

  const summary = { ok: true, ingested: 0, skipped: 0, errors: [] };
  const oldest = lookbackDays > 0 ? (Date.now() - lookbackDays * 86400000) / 1000 : undefined;

  for (const channel of selectedChannels) {
    if (summary.ingested >= maxDocs) break;
    try {
      const messages = await fetchChannelHistory(token, channel.id, { oldest, limit: maxMessages });
      const grouped = groupMessagesByDay(messages);
      for (const [day, lines] of grouped.entries()) {
        if (summary.ingested >= maxDocs) break;
        const body = normalizeText(lines.join("\n"));
        if (!body) continue;
        const title = `${channel.name || channel.id} (${day})`;
        const result = await ingestConnectorDocument({
          collectionId: "slack",
          sourceType: "slack",
          title,
          sourceUrl: `slack://channel/${channel.id}`,
          text: body,
          tags: ["slack", channel.name || channel.id],
          metadata: { channelId: channel.id, day, messageCount: lines.length },
          sourceGroup: `slack:${channel.id}`,
          occurredAt: `${day}T00:00:00.000Z`
        });
        if (result?.skipped) summary.skipped += 1;
        else if (result?.ok) summary.ingested += 1;
        else summary.errors.push({ id: channel.id, error: result?.error || "ingest_failed" });
      }
    } catch (err) {
      summary.errors.push({ id: channel.id, error: err?.message || "slack_sync_failed" });
    }
  }

  setRagMeta("connector_sync:slack", new Date().toISOString());
  return summary;
}

export function isSlackConfigured(userId = "local") {
  return Boolean(getSlackToken(userId));
}
