
import crypto from "node:crypto";
import {
  ingestTradingDocument,
  queueTradingSourceCrawl
} from "./knowledgeRag.js";
import {
  listTradingYoutubeSources,
  getTradingYoutubeSource,
  upsertTradingYoutubeSource,
  updateTradingYoutubeSource,
  deleteTradingYoutubeSource,
  markTradingYoutubeCrawl,
  hasTradingYoutubeItem,
  recordTradingYoutubeItem,
  getTradingSourceByUrl,
  upsertTradingSource
} from "../rag/vectorStore.js";

const YOUTUBE_API_KEY = String(process.env.YOUTUBE_API_KEY || "").trim();
const YOUTUBE_SYNC_INTERVAL_MINUTES = Number(process.env.TRADING_YOUTUBE_SYNC_INTERVAL_MINUTES || 10080);
const YOUTUBE_SYNC_ON_STARTUP = String(process.env.TRADING_YOUTUBE_SYNC_ON_STARTUP || "0") === "1";
const YOUTUBE_DISCOVER_ON_STARTUP = String(process.env.TRADING_YOUTUBE_DISCOVER_ON_STARTUP || "0") === "1";
const YOUTUBE_DISCOVER_INTERVAL_MINUTES = Number(process.env.TRADING_YOUTUBE_DISCOVER_INTERVAL_MINUTES || 10080);
const YOUTUBE_MAX_CHANNELS = Number(process.env.TRADING_YOUTUBE_MAX_CHANNELS || 100);
const YOUTUBE_MAX_VIDEOS_PER_CHANNEL = Number(process.env.TRADING_YOUTUBE_MAX_VIDEOS_PER_CHANNEL || 0);
const YOUTUBE_MAX_NEW_VIDEOS_PER_CHANNEL = Number(process.env.TRADING_YOUTUBE_MAX_NEW_VIDEOS_PER_CHANNEL || 40);
const YOUTUBE_MIN_SUBSCRIBERS = Number(process.env.TRADING_YOUTUBE_MIN_SUBSCRIBERS || 25000);
const YOUTUBE_MIN_SCORE = Number(process.env.TRADING_YOUTUBE_MIN_SCORE || 2);
const YOUTUBE_TRANSCRIPT_MAX_CHARS = Number(process.env.TRADING_YOUTUBE_TRANSCRIPT_MAX_CHARS || 120000);
const YOUTUBE_DESCRIPTION_MAX_CHARS = Number(process.env.TRADING_YOUTUBE_DESCRIPTION_MAX_CHARS || 4000);
const YOUTUBE_FETCH_TIMEOUT_MS = Number(process.env.TRADING_YOUTUBE_FETCH_TIMEOUT_MS || 15000);
const YOUTUBE_CRAWL_LINKS = String(process.env.TRADING_YOUTUBE_CRAWL_LINKS || "1") !== "0";
const YOUTUBE_LINK_MAX_PER_VIDEO = Number(process.env.TRADING_YOUTUBE_LINK_MAX_PER_VIDEO || 6);
const YOUTUBE_LINK_RECRAWL_DAYS = Number(process.env.TRADING_YOUTUBE_LINK_RECRAWL_DAYS || 30);
const YOUTUBE_LINK_CRAWL_DEPTH = Number(process.env.TRADING_YOUTUBE_LINK_CRAWL_DEPTH || 1);
const YOUTUBE_LINK_CRAWL_MAX_PAGES = Number(process.env.TRADING_YOUTUBE_LINK_CRAWL_MAX_PAGES || 30);
const YOUTUBE_LINK_CRAWL_MAX_PAGES_PER_DOMAIN = Number(process.env.TRADING_YOUTUBE_LINK_CRAWL_MAX_PAGES_PER_DOMAIN || 20);
const YOUTUBE_LINK_CRAWL_DELAY_MS = Number(process.env.TRADING_YOUTUBE_LINK_CRAWL_DELAY_MS || 600);

const DEFAULT_YOUTUBE_SOURCES = [
  { channel: "@claytrader", tags: ["trading", "education"] }
];

const DEFAULT_SEARCH_QUERIES = [
  "live trading full day",
  "day trading live recap",
  "options trading live",
  "futures trading live",
  "trade recap journal",
  "live trades with pnl"
];

const DEFAULT_LINK_BLOCKLIST = [
  "youtube.com",
  "youtu.be",
  "twitter.com",
  "x.com",
  "tiktok.com",
  "instagram.com",
  "facebook.com",
  "fb.com",
  "discord.gg",
  "discord.com",
  "t.me",
  "telegram.me",
  "wa.me",
  "whatsapp.com",
  "patreon.com",
  "buymeacoffee.com",
  "cash.app",
  "paypal.me"
];

const KEYWORDS_STRONG = [
  "live trading",
  "trade recap",
  "trading recap",
  "all trades",
  "full trading",
  "live trades",
  "pnl",
  "profit",
  "loss"
];

const KEYWORDS_MEDIUM = [
  "day trading",
  "options trading",
  "futures trading",
  "trading journal",
  "trade review",
  "market recap",
  "price action",
  "risk management"
];

const KEYWORDS_NEGATIVE = [
  "signals",
  "alerts",
  "telegram",
  "discord",
  "patreon",
  "copy trade"
];

function nowIso() {
  return new Date().toISOString();
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function hashContent(text = "") {
  return crypto.createHash("sha1").update(String(text)).digest("hex").slice(0, 20);
}

function normalizeTags(tags) {
  if (!Array.isArray(tags)) return [];
  const seen = new Set();
  return tags
    .map(tag => String(tag || "").trim().toLowerCase())
    .filter(Boolean)
    .filter(tag => {
      if (seen.has(tag)) return false;
      seen.add(tag);
      return true;
    });
}

function parseList(input) {
  return String(input || "")
    .split(/[,\n]/)
    .map(item => item.trim())
    .filter(Boolean);
}

function parseSourceEntries(input) {
  const list = Array.isArray(input) ? input : parseList(input);
  return list.map(raw => {
    const parts = String(raw || "").split("|").map(p => p.trim()).filter(Boolean);
    const channel = parts.pop() || "";
    const tags = parts;
    return { channel, tags };
  }).filter(entry => entry.channel);
}

function normalizeHandle(raw) {
  const handle = String(raw || "").trim();
  if (!handle) return "";
  return handle.startsWith("@") ? handle.slice(1) : handle;
}

function normalizeUrl(value) {
  try {
    const url = new URL(value);
    url.hash = "";
    return url.toString();
  } catch {
    return "";
  }
}

function parseChannelRef(value) {
  const raw = String(value || "").trim();
  if (!raw) return null;
  if (raw.startsWith("@")) {
    return { handle: normalizeHandle(raw) };
  }
  if (raw.startsWith("UC") && raw.length >= 20) {
    return { channelId: raw };
  }
  if (/youtube\.com\/@/i.test(raw)) {
    const match = raw.match(/youtube\.com\/@([^/?#]+)/i);
    if (match) return { handle: normalizeHandle(match[1]) };
  }
  if (/youtube\.com\/channel\//i.test(raw)) {
    const match = raw.match(/youtube\.com\/channel\/([^/?#]+)/i);
    if (match) return { channelId: match[1] };
  }
  if (/youtube\.com\/user\//i.test(raw)) {
    const match = raw.match(/youtube\.com\/user\/([^/?#]+)/i);
    if (match) return { user: match[1] };
  }
  if (/youtube\.com\/c\//i.test(raw)) {
    const match = raw.match(/youtube\.com\/c\/([^/?#]+)/i);
    if (match) return { custom: match[1] };
  }
  return { handle: normalizeHandle(raw) };
}

function parseLinkBlocklist() {
  const envList = parseList(process.env.TRADING_YOUTUBE_LINK_BLOCKLIST || "");
  return [...DEFAULT_LINK_BLOCKLIST, ...envList].map(item => item.toLowerCase());
}

function isBlockedLink(url, blocklist) {
  const lower = String(url || "").toLowerCase();
  return blocklist.some(domain => lower.includes(domain));
}

function extractUrlsFromText(text) {
  const links = new Set();
  const regex = /(https?:\/\/[^\s)]+)|\bwww\.[^\s)]+/gi;
  let match;
  while ((match = regex.exec(String(text || "")))) {
    const raw = match[0];
    if (!raw) continue;
    let candidate = raw;
    if (raw.startsWith("www.")) candidate = `https://${raw}`;
    const normalized = normalizeUrl(candidate);
    if (normalized) links.add(normalized);
  }
  return Array.from(links);
}
async function youtubeApiFetch(path, params = {}) {
  if (!YOUTUBE_API_KEY) {
    throw new Error("youtube_api_key_missing");
  }
  const url = new URL(`https://www.googleapis.com/youtube/v3/${path}`);
  url.searchParams.set("key", YOUTUBE_API_KEY);
  Object.entries(params || {}).forEach(([key, value]) => {
    if (value == null || value === "") return;
    url.searchParams.set(key, String(value));
  });
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), YOUTUBE_FETCH_TIMEOUT_MS);
  try {
    const resp = await fetch(url.toString(), {
      headers: { "User-Agent": "AikaTradingRAG/1.0" },
      signal: controller.signal
    });
    const data = await resp.json().catch(() => ({}));
    if (!resp.ok) {
      const message = data?.error?.message || `youtube_api_${resp.status}`;
      throw new Error(message);
    }
    return data;
  } finally {
    clearTimeout(timer);
  }
}

async function fetchChannelPageHtml(url) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), YOUTUBE_FETCH_TIMEOUT_MS);
  try {
    const resp = await fetch(url, {
      headers: { "User-Agent": "AikaTradingRAG/1.0" },
      signal: controller.signal
    });
    if (!resp.ok) return "";
    return await resp.text();
  } finally {
    clearTimeout(timer);
  }
}

function extractChannelIdFromHtml(html) {
  const match = String(html || "").match(/"channelId":"(UC[^"]+)"/);
  return match ? match[1] : "";
}

function extractHandleFromHtml(html) {
  const match = String(html || "").match(/"canonicalChannelUrl":"https:\/\/www\.youtube\.com\/@([^"]+)"/);
  return match ? match[1] : "";
}

async function resolveChannelId(ref) {
  if (!ref) return null;
  if (ref.channelId) return { channelId: ref.channelId, handle: ref.handle || "" };
  if (!YOUTUBE_API_KEY) {
    const handle = normalizeHandle(ref.handle || ref.custom || ref.user || "");
    if (!handle) return null;
    const url = `https://www.youtube.com/@${handle}`;
    const html = await fetchChannelPageHtml(url);
    const channelId = extractChannelIdFromHtml(html);
    const pageHandle = extractHandleFromHtml(html);
    return channelId ? { channelId, handle: pageHandle || handle } : null;
  }

  if (ref.handle) {
    const data = await youtubeApiFetch("channels", {
      part: "id",
      forHandle: normalizeHandle(ref.handle)
    });
    const id = data?.items?.[0]?.id;
    if (id) return { channelId: id, handle: normalizeHandle(ref.handle) };
  }

  if (ref.user) {
    const data = await youtubeApiFetch("channels", {
      part: "id",
      forUsername: ref.user
    });
    const id = data?.items?.[0]?.id;
    if (id) return { channelId: id };
  }

  const query = ref.handle || ref.custom || ref.user;
  if (query) {
    const data = await youtubeApiFetch("search", {
      part: "snippet",
      type: "channel",
      q: query,
      maxResults: 5
    });
    const item = data?.items?.[0];
    if (item?.snippet?.channelId) {
      return { channelId: item.snippet.channelId, handle: normalizeHandle(ref.handle || "") };
    }
  }
  return null;
}

async function fetchChannelDetails(channelId) {
  const data = await youtubeApiFetch("channels", {
    part: "snippet,contentDetails,statistics",
    id: channelId
  });
  const item = data?.items?.[0];
  if (!item) return null;
  const snippet = item.snippet || {};
  const stats = item.statistics || {};
  const uploads = item.contentDetails?.relatedPlaylists?.uploads || "";
  const customUrl = String(snippet.customUrl || "").trim();
  const handle = customUrl.startsWith("@") ? customUrl.slice(1) : customUrl;
  const url = handle ? `https://www.youtube.com/@${handle}` : `https://www.youtube.com/channel/${channelId}`;
  return {
    channelId,
    uploadsPlaylistId: uploads,
    title: snippet.title || "",
    description: snippet.description || "",
    handle,
    url,
    subscriberCount: Number(stats.subscriberCount || 0),
    viewCount: Number(stats.viewCount || 0),
    videoCount: Number(stats.videoCount || 0)
  };
}

async function listPlaylistVideos({ playlistId, lastPublishedAt, maxVideos = 0, maxNewVideos = 0 } = {}) {
  const items = [];
  let pageToken = "";
  let stop = false;
  const lastTs = lastPublishedAt ? Date.parse(lastPublishedAt) : 0;
  while (!stop) {
    const data = await youtubeApiFetch("playlistItems", {
      part: "snippet",
      playlistId,
      maxResults: 50,
      pageToken
    });
    const entries = Array.isArray(data?.items) ? data.items : [];
    for (const entry of entries) {
      const snippet = entry.snippet || {};
      const videoId = snippet.resourceId?.videoId || "";
      if (!videoId) continue;
      const publishedAt = snippet.publishedAt || "";
      const publishedTs = publishedAt ? Date.parse(publishedAt) : 0;
      if (lastTs && publishedTs && publishedTs <= lastTs) {
        stop = true;
        break;
      }
      items.push({
        videoId,
        title: snippet.title || "",
        description: snippet.description || "",
        publishedAt,
        channelId: snippet.channelId || "",
        channelTitle: snippet.channelTitle || ""
      });
      if (maxVideos > 0 && items.length >= maxVideos) {
        stop = true;
        break;
      }
      if (maxNewVideos > 0 && items.length >= maxNewVideos) {
        stop = true;
        break;
      }
    }
    if (stop || !data?.nextPageToken) break;
    pageToken = data.nextPageToken;
  }
  return items;
}
async function fetchTranscriptTrackList(videoId) {
  const url = `https://www.youtube.com/api/timedtext?type=list&v=${encodeURIComponent(videoId)}`;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), YOUTUBE_FETCH_TIMEOUT_MS);
  try {
    const resp = await fetch(url, {
      headers: { "User-Agent": "AikaTradingRAG/1.0" },
      signal: controller.signal
    });
    if (!resp.ok) return [];
    const xml = await resp.text();
    return parseTranscriptTracks(xml);
  } finally {
    clearTimeout(timer);
  }
}

function parseTranscriptTracks(xml) {
  const tracks = [];
  const regex = /<track\s+([^>]+?)\/?>(?:<\/track>)?/gi;
  let match;
  while ((match = regex.exec(String(xml || "")))) {
    const attrs = parseXmlAttributes(match[1]);
    if (attrs.lang_code) tracks.push(attrs);
  }
  return tracks;
}

function parseXmlAttributes(raw) {
  const attrs = {};
  const regex = /(\w+)="([^"]*)"/g;
  let match;
  while ((match = regex.exec(String(raw || "")))) {
    attrs[match[1]] = decodeHtmlEntities(match[2]);
  }
  return attrs;
}

function decodeHtmlEntities(text) {
  return String(text || "")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, "\"")
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">");
}

function chooseTranscriptTrack(tracks) {
  if (!tracks.length) return null;
  const manualEn = tracks.find(track => track.lang_code?.startsWith("en") && !track.kind);
  if (manualEn) return manualEn;
  const autoEn = tracks.find(track => track.lang_code?.startsWith("en") && track.kind === "asr");
  if (autoEn) return autoEn;
  const defaultTrack = tracks.find(track => track.lang_default === "true");
  return defaultTrack || tracks[0];
}

async function fetchTranscript(videoId) {
  const tracks = await fetchTranscriptTrackList(videoId);
  if (!tracks.length) return "";
  const track = chooseTranscriptTrack(tracks);
  if (!track) return "";
  const url = new URL("https://www.youtube.com/api/timedtext");
  url.searchParams.set("v", videoId);
  url.searchParams.set("lang", track.lang_code || "en");
  if (track.kind) url.searchParams.set("kind", track.kind);
  url.searchParams.set("fmt", "json3");

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), YOUTUBE_FETCH_TIMEOUT_MS);
  try {
    const resp = await fetch(url.toString(), {
      headers: { "User-Agent": "AikaTradingRAG/1.0" },
      signal: controller.signal
    });
    if (!resp.ok) return "";
    const raw = await resp.text();
    const transcript = parseTranscriptJson(raw) || parseTranscriptXml(raw);
    return transcript;
  } finally {
    clearTimeout(timer);
  }
}

function parseTranscriptJson(raw) {
  try {
    const data = JSON.parse(raw);
    const events = Array.isArray(data?.events) ? data.events : [];
    const parts = [];
    for (const event of events) {
      if (!Array.isArray(event?.segs)) continue;
      const text = event.segs.map(seg => seg.utf8 || "").join("");
      if (text.trim()) parts.push(text.trim());
    }
    return parts.join(" ");
  } catch {
    return "";
  }
}

function parseTranscriptXml(raw) {
  const parts = [];
  const regex = /<text[^>]*>([\s\S]*?)<\/text>/gi;
  let match;
  while ((match = regex.exec(String(raw || "")))) {
    const text = decodeHtmlEntities(match[1]).replace(/\s+/g, " ").trim();
    if (text) parts.push(text);
  }
  return parts.join(" ");
}

function buildChannelSourceGroup(channel) {
  const handle = normalizeHandle(channel?.handle || "");
  if (handle) return `youtube:${handle}`;
  if (channel?.channelId) return `youtube:${channel.channelId}`;
  return "youtube";
}

function buildChannelTags(channel, extraTags = []) {
  const tags = ["youtube", ...extraTags];
  if (channel?.handle) tags.push(`channel:${normalizeHandle(channel.handle)}`);
  if (channel?.title) tags.push(String(channel.title).toLowerCase().replace(/\s+/g, "_"));
  return normalizeTags(tags);
}

function buildVideoText({ channel, video, transcript, description }) {
  const parts = [];
  if (channel?.title) parts.push(`Channel: ${channel.title}`);
  if (video?.publishedAt) parts.push(`Published: ${video.publishedAt}`);
  if (video?.videoId) parts.push(`Video ID: ${video.videoId}`);
  if (description) {
    const trimmed = YOUTUBE_DESCRIPTION_MAX_CHARS > 0 ? description.slice(0, YOUTUBE_DESCRIPTION_MAX_CHARS) : description;
    parts.push(`Description:\n${trimmed}`);
  }
  if (transcript) {
    const trimmed = YOUTUBE_TRANSCRIPT_MAX_CHARS > 0 ? transcript.slice(0, YOUTUBE_TRANSCRIPT_MAX_CHARS) : transcript;
    parts.push(`Transcript:\n${trimmed}`);
  }
  return parts.join("\n\n");
}

async function enqueueExternalLinks({ links, channel, collectionId } = {}) {
  if (!YOUTUBE_CRAWL_LINKS || !links?.length) return { queued: 0, skipped: 0 };
  const blocklist = parseLinkBlocklist();
  const now = Date.now();
  let queued = 0;
  let skipped = 0;
  for (const link of links) {
    if (!link) continue;
    if (isBlockedLink(link, blocklist)) {
      skipped += 1;
      continue;
    }
    const normalized = normalizeUrl(link);
    if (!normalized) {
      skipped += 1;
      continue;
    }
    const existing = getTradingSourceByUrl(normalized, { collectionId: collectionId || "trading" });
    if (existing?.last_crawled_at) {
      const last = Date.parse(existing.last_crawled_at);
      if (Number.isFinite(last)) {
        const ageDays = (now - last) / 86400000;
        if (ageDays < YOUTUBE_LINK_RECRAWL_DAYS) {
          skipped += 1;
          continue;
        }
      }
    }
    const tags = buildChannelTags(channel, ["youtube-link"]);
    const source = upsertTradingSource({
      url: normalized,
      tags,
      enabled: true,
      collectionId: collectionId || "trading"
    });
    if (source?.id) {
      queueTradingSourceCrawl(source.id, {
        maxDepth: YOUTUBE_LINK_CRAWL_DEPTH,
        maxPages: YOUTUBE_LINK_CRAWL_MAX_PAGES,
        maxPagesPerDomain: YOUTUBE_LINK_CRAWL_MAX_PAGES_PER_DOMAIN,
        delayMs: YOUTUBE_LINK_CRAWL_DELAY_MS,
        collectionId: collectionId || "trading"
      });
      queued += 1;
    }
  }
  return { queued, skipped };
}

async function ingestYoutubeVideo({ channel, video, source, force = false, collectionId } = {}) {
  if (!video?.videoId) return { ok: false, error: "missing_video_id" };
  const url = `https://www.youtube.com/watch?v=${video.videoId}`;
  const transcript = await fetchTranscript(video.videoId);
  const description = String(video.description || "");
  const text = buildVideoText({ channel, video, transcript, description });
  if (!text.trim()) return { ok: false, error: "empty_transcript" };
  const tags = buildChannelTags(channel, source?.tags || []);
  const sourceGroup = buildChannelSourceGroup(channel);
  const ingest = await ingestTradingDocument({
    kind: "youtube",
    title: video.title || "YouTube Video",
    sourceUrl: url,
    text,
    tags,
    sourceGroup,
    occurredAt: video.publishedAt || "",
    force,
    collectionId
  });
  if ((ingest?.ok || ingest?.skipped) && source?.id) {
    const transcriptHash = transcript ? hashContent(transcript) : "";
    const descriptionHash = description ? hashContent(description) : "";
    recordTradingYoutubeItem({
      sourceId: source?.id,
      videoId: video.videoId,
      url,
      title: video.title || "",
      publishedAt: video.publishedAt || "",
      transcriptHash,
      descriptionHash
    });
  }

  if (YOUTUBE_CRAWL_LINKS && description) {
    const links = extractUrlsFromText(description)
      .filter(Boolean)
      .slice(0, YOUTUBE_LINK_MAX_PER_VIDEO);
    if (links.length) {
      await enqueueExternalLinks({ links, channel, collectionId });
    }
  }

  return ingest;
}

function scoreChannel(channel) {
  const text = `${channel?.title || ""} ${channel?.description || ""}`.toLowerCase();
  let score = 0;
  KEYWORDS_STRONG.forEach(keyword => {
    if (text.includes(keyword)) score += 2;
  });
  KEYWORDS_MEDIUM.forEach(keyword => {
    if (text.includes(keyword)) score += 1;
  });
  KEYWORDS_NEGATIVE.forEach(keyword => {
    if (text.includes(keyword)) score -= 2;
  });
  const subs = Number(channel?.subscriberCount || 0);
  if (subs >= 1000000) score += 4;
  else if (subs >= 250000) score += 3;
  else if (subs >= 100000) score += 2;
  else if (subs >= 50000) score += 1;
  const videos = Number(channel?.videoCount || 0);
  if (videos >= 500) score += 2;
  else if (videos >= 200) score += 1;
  return score;
}
export function ensureTradingYoutubeSeeded() {
  const existing = listTradingYoutubeSources({ limit: 1, includeDisabled: true, collectionId: "trading" });
  if (existing.length) return false;
  const entries = parseSourceEntries(process.env.TRADING_YOUTUBE_SOURCES || "");
  const sources = entries.length ? entries : DEFAULT_YOUTUBE_SOURCES;
  sources.forEach(entry => {
    upsertTradingYoutubeSource({
      channelId: "",
      handle: normalizeHandle(entry.channel || ""),
      title: "",
      description: "",
      url: "",
      tags: normalizeTags(entry.tags || []),
      enabled: true,
      collectionId: "trading"
    });
  });
  return true;
}

export function listTradingYoutubeSourcesUi({ limit = 100, offset = 0, search = "", includeDisabled = true, collectionId = "trading" } = {}) {
  if (!collectionId || collectionId === "trading") {
    ensureTradingYoutubeSeeded();
  }
  return listTradingYoutubeSources({ limit, offset, search, includeDisabled, collectionId: collectionId || "trading" });
}

export async function addTradingYoutubeSource({ channel, tags = [], enabled = true, maxVideos, collectionId = "trading" } = {}) {
  const ref = parseChannelRef(channel);
  if (!ref) throw new Error("invalid_channel");
  const resolved = await resolveChannelId(ref);
  if (!resolved?.channelId) throw new Error("channel_not_found");
  const details = await fetchChannelDetails(resolved.channelId);
  if (!details) throw new Error("channel_not_found");
  const mergedTags = normalizeTags([...(tags || []), "youtube"]);
  const source = upsertTradingYoutubeSource({
    channelId: details.channelId,
    handle: details.handle || resolved.handle || "",
    title: details.title || "",
    description: details.description || "",
    url: details.url || "",
    tags: mergedTags,
    enabled: enabled !== false,
    subscriberCount: details.subscriberCount,
    videoCount: details.videoCount,
    viewCount: details.viewCount,
    maxVideos: maxVideos == null ? null : Number(maxVideos || 0),
    collectionId: collectionId || "trading"
  });
  return source;
}

export function updateTradingYoutubeSourceUi(id, { tags, enabled, maxVideos } = {}) {
  const next = {};
  if (Array.isArray(tags)) next.tags = normalizeTags(tags);
  if (enabled !== undefined) next.enabled = enabled;
  if (maxVideos !== undefined) next.maxVideos = maxVideos;
  return updateTradingYoutubeSource(id, next);
}

export function removeTradingYoutubeSource(id) {
  deleteTradingYoutubeSource(id);
  return { ok: true };
}

export async function discoverTradingYoutubeChannels({
  queries,
  maxChannels = YOUTUBE_MAX_CHANNELS,
  minSubscribers = YOUTUBE_MIN_SUBSCRIBERS,
  minScore = YOUTUBE_MIN_SCORE,
  autoAdd = false,
  collectionId = "trading"
} = {}) {
  if (!YOUTUBE_API_KEY) throw new Error("youtube_api_key_missing");
  const searchQueries = Array.isArray(queries) && queries.length
    ? queries
    : parseList(process.env.TRADING_YOUTUBE_SEARCH_QUERIES || "").concat(DEFAULT_SEARCH_QUERIES);
  const channelIds = new Set();
  for (const query of searchQueries) {
    const data = await youtubeApiFetch("search", {
      part: "snippet",
      type: "channel",
      q: query,
      maxResults: 25
    });
    (data?.items || []).forEach(item => {
      const id = item?.snippet?.channelId;
      if (id) channelIds.add(id);
    });
    await sleep(200);
  }
  const ids = Array.from(channelIds);
  const chunks = [];
  while (ids.length) chunks.push(ids.splice(0, 50));

  const candidates = [];
  for (const batch of chunks) {
    const data = await youtubeApiFetch("channels", {
      part: "snippet,statistics",
      id: batch.join(",")
    });
    (data?.items || []).forEach(item => {
      const snippet = item.snippet || {};
      const stats = item.statistics || {};
      const channel = {
        channelId: item.id,
        title: snippet.title || "",
        description: snippet.description || "",
        handle: String(snippet.customUrl || "").replace(/^@/, ""),
        subscriberCount: Number(stats.subscriberCount || 0),
        videoCount: Number(stats.videoCount || 0),
        viewCount: Number(stats.viewCount || 0)
      };
      const score = scoreChannel(channel);
      candidates.push({ ...channel, score });
    });
    await sleep(200);
  }

  const filtered = candidates
    .filter(item => item.subscriberCount >= minSubscribers)
    .filter(item => item.score >= minScore)
    .sort((a, b) => b.score - a.score || b.subscriberCount - a.subscriberCount);

  const limited = filtered.slice(0, maxChannels);
  if (autoAdd) {
    const existing = listTradingYoutubeSources({ limit: 500, includeDisabled: true, collectionId });
    const existingById = new Map(existing.map(item => [item.channel_id, item]));
    let available = Math.max(0, maxChannels - existing.length);
    for (const channel of limited) {
      const existingRow = existingById.get(channel.channelId);
      if (existingRow) {
        upsertTradingYoutubeSource({
          channelId: channel.channelId,
          handle: channel.handle || existingRow.handle,
          title: channel.title || existingRow.title,
          description: channel.description || existingRow.description,
          url: existingRow.url || (channel.handle ? `https://www.youtube.com/@${channel.handle}` : ""),
          tags: normalizeTags([...(existingRow.tags || []), "youtube"]),
          enabled: existingRow.enabled,
          subscriberCount: channel.subscriberCount,
          videoCount: channel.videoCount,
          viewCount: channel.viewCount,
          maxVideos: existingRow.max_videos,
          collectionId
        });
        continue;
      }
      if (available <= 0) break;
      const tags = normalizeTags(["youtube", "discovered"]);
      upsertTradingYoutubeSource({
        channelId: channel.channelId,
        handle: channel.handle,
        title: channel.title,
        description: channel.description,
        url: channel.handle ? `https://www.youtube.com/@${channel.handle}` : "",
        tags,
        enabled: true,
        subscriberCount: channel.subscriberCount,
        videoCount: channel.videoCount,
        viewCount: channel.viewCount,
        collectionId
      });
      available -= 1;
    }
  }
  return { total: filtered.length, items: limited };
}

export async function crawlTradingYoutubeSources({
  entries,
  force = false,
  maxVideosPerChannel,
  maxNewVideosPerChannel,
  collectionId
} = {}) {
  const list = entries?.length
    ? entries
    : listTradingYoutubeSources({ limit: 500, includeDisabled: false, collectionId: collectionId || "trading" });
  const results = {
    ok: true,
    total: list.length,
    ingested: 0,
    skipped: 0,
    errors: []
  };
  for (const entry of list) {
    let source = entry?.channel_id ? entry : getTradingYoutubeSource(entry?.id);
    if (source && !source.channel_id) {
      const ref = parseChannelRef(source.handle || source.url || "");
      const resolved = await resolveChannelId(ref);
      if (resolved?.channelId) {
        source = upsertTradingYoutubeSource({
          channelId: resolved.channelId,
          handle: resolved.handle || source.handle || "",
          title: source.title || "",
          description: source.description || "",
          url: source.url || "",
          tags: source.tags || [],
          enabled: source.enabled,
          maxVideos: source.max_videos,
          collectionId: source.collection_id || "trading"
        });
      }
    }
    if (!source?.channel_id) {
      results.errors.push({ channel: entry?.channel_id || entry?.handle || source?.handle || "", error: "missing_channel_id" });
      continue;
    }
    if (!source.enabled) continue;
    try {
      if (!YOUTUBE_API_KEY) {
        results.errors.push({ channel: source.channel_id, error: "youtube_api_key_missing" });
        markTradingYoutubeCrawl({ id: source.id, status: "error", error: "youtube_api_key_missing", crawledAt: nowIso() });
        continue;
      }
      const details = await fetchChannelDetails(source.channel_id);
      if (!details?.uploadsPlaylistId) {
        results.errors.push({ channel: source.channel_id, error: "uploads_playlist_missing" });
        markTradingYoutubeCrawl({ id: source.id, status: "error", error: "uploads_playlist_missing", crawledAt: nowIso() });
        continue;
      }
      const mergedTags = normalizeTags([...(source.tags || []), "youtube"]);
      upsertTradingYoutubeSource({
        channelId: source.channel_id,
        handle: details.handle || source.handle,
        title: details.title || source.title,
        description: details.description || source.description,
        url: details.url || source.url,
        tags: mergedTags,
        enabled: source.enabled,
        subscriberCount: details.subscriberCount,
        videoCount: details.videoCount,
        viewCount: details.viewCount,
        maxVideos: source.max_videos,
        collectionId: source.collection_id || "trading"
      });

      const maxVideos = maxVideosPerChannel != null
        ? Number(maxVideosPerChannel || 0)
        : (source.max_videos == null ? YOUTUBE_MAX_VIDEOS_PER_CHANNEL : Number(source.max_videos || 0));
      const maxNew = maxNewVideosPerChannel != null
        ? Number(maxNewVideosPerChannel || 0)
        : YOUTUBE_MAX_NEW_VIDEOS_PER_CHANNEL;
      const hasLast = Boolean(source.last_published_at);
      const effectiveMaxNew = force ? 0 : (hasLast ? maxNew : 0);
      const videos = await listPlaylistVideos({
        playlistId: details.uploadsPlaylistId,
        lastPublishedAt: force ? "" : source.last_published_at,
        maxVideos,
        maxNewVideos: effectiveMaxNew
      });
      let newest = source.last_published_at || "";
      for (const video of videos) {
        if (!video?.videoId) continue;
        if (!force && hasTradingYoutubeItem({ sourceId: source.id, videoId: video.videoId })) {
          results.skipped += 1;
          continue;
        }
        const ingest = await ingestYoutubeVideo({
          channel: details,
          video,
          source,
          force,
          collectionId: source.collection_id || "trading"
        });
        if (ingest?.ok) results.ingested += 1;
        else results.errors.push({ channel: source.channel_id, video: video.videoId, error: ingest?.error || "ingest_failed" });
        if (video.publishedAt && (!newest || video.publishedAt > newest)) {
          newest = video.publishedAt;
        }
        await sleep(200);
      }
      markTradingYoutubeCrawl({ id: source.id, status: "ok", error: "", crawledAt: nowIso(), lastPublishedAt: newest || source.last_published_at });
    } catch (err) {
      results.errors.push({ channel: source.channel_id, error: err?.message || "youtube_crawl_failed" });
      markTradingYoutubeCrawl({ id: source.id, status: "error", error: err?.message || "youtube_crawl_failed", crawledAt: nowIso() });
    }
  }
  return results;
}

let youtubeSyncRunning = false;
let youtubeDiscoverRunning = false;
let youtubeSyncInterval = null;
let youtubeDiscoverInterval = null;

async function runYoutubeSync() {
  if (youtubeSyncRunning) return;
  youtubeSyncRunning = true;
  try {
    await crawlTradingYoutubeSources();
  } finally {
    youtubeSyncRunning = false;
  }
}

async function runYoutubeDiscover() {
  if (youtubeDiscoverRunning) return;
  youtubeDiscoverRunning = true;
  try {
    await discoverTradingYoutubeChannels({ autoAdd: true });
  } finally {
    youtubeDiscoverRunning = false;
  }
}

export function startTradingYoutubeLoop() {
  ensureTradingYoutubeSeeded();
  if (YOUTUBE_DISCOVER_ON_STARTUP) {
    runYoutubeDiscover().catch(() => {});
  }
  if (YOUTUBE_SYNC_ON_STARTUP) {
    runYoutubeSync().catch(() => {});
  }
  if (YOUTUBE_DISCOVER_INTERVAL_MINUTES > 0) {
    youtubeDiscoverInterval = setInterval(() => {
      runYoutubeDiscover().catch(() => {});
    }, YOUTUBE_DISCOVER_INTERVAL_MINUTES * 60_000);
  }
  if (YOUTUBE_SYNC_INTERVAL_MINUTES > 0) {
    youtubeSyncInterval = setInterval(() => {
      runYoutubeSync().catch(() => {});
    }, YOUTUBE_SYNC_INTERVAL_MINUTES * 60_000);
  }
}

export function stopTradingYoutubeLoop() {
  if (youtubeDiscoverInterval) clearInterval(youtubeDiscoverInterval);
  if (youtubeSyncInterval) clearInterval(youtubeSyncInterval);
  youtubeDiscoverInterval = null;
  youtubeSyncInterval = null;
}
