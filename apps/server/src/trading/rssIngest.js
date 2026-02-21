import crypto from "node:crypto";
import { responsesCreate } from "../llm/openaiClient.js";
import Parser from "rss-parser";
import {
  listTradingRssSources,
  upsertTradingRssSource,
  updateTradingRssSource,
  deleteTradingRssSource,
  markTradingRssCrawl,
  hasTradingRssItem,
  recordTradingRssItem,
  listTradingRssItems,
  getRagMeta,
  setRagMeta
} from "../rag/vectorStore.js";
import { ingestTradingDocument } from "./knowledgeRag.js";
import { extractPdfText } from "./pdfUtils.js";

const RSS_SYNC_INTERVAL_MINUTES = Number(process.env.TRADING_RSS_SYNC_INTERVAL_MINUTES || 1440);
const RSS_ON_STARTUP = String(process.env.TRADING_RSS_SYNC_ON_STARTUP || "0") === "1";
const RSS_MAX_ITEMS_PER_FEED = Number(process.env.TRADING_RSS_MAX_ITEMS_PER_FEED || 25);
const RSS_REQUIRE_AI = String(process.env.TRADING_RSS_REQUIRE_AI || "0") === "1";
const RSS_OCR_DEFAULT = String(process.env.TRADING_RSS_OCR_DEFAULT || "1") !== "0";
const RSS_OCR_MAX_PAGES = Number(process.env.TRADING_RSS_OCR_MAX_PAGES || 0);
const RSS_OCR_SCALE = Number(process.env.TRADING_RSS_OCR_SCALE || 2.0);
const RSS_MAX_ARTICLE_CHARS = Number(process.env.TRADING_RSS_MAX_ARTICLE_CHARS || 25000);

const DEFAULT_RSS_SOURCES = [
  { url: "https://feeds.marketwatch.com/marketwatch/topstories/", title: "MarketWatch Top Stories" },
  { url: "https://www.cnbc.com/id/100003114/device/rss/rss.html", title: "CNBC Top News" },
  { url: "https://www.nasdaq.com/feed/rssoutbound?category=markets", title: "Nasdaq Markets" },
  { url: "https://www.investing.com/rss/news_25.rss", title: "Investing.com Market News" },
  { url: "https://www.sec.gov/news/pressreleases.rss", title: "SEC Press Releases" }
];

const FOREIGN_KEYWORDS = [
  "nifty", "sensex", "bse", "nse", "ftse", "dax", "nikkei", "hang seng", "asx",
  "tsx", "csi 300", "shanghai", "shenzhen", "tokyo stock exchange", "london stock exchange",
  "eurostoxx", "cac 40", "kospi", "kse", "taiwan stock", "hong kong", "singapore exchange",
  "india", "china", "australia", "canada", "european markets", "uk stocks"
];

const US_MARKET_KEYWORDS = [
  "s&p", "nasdaq", "dow", "nyse", "u.s. stocks", "us stocks", "american stocks", "u.s. market",
  "federal reserve", "fed", "treasury", "sec", "earnings", "wall street"
];

const GENERAL_MARKET_KEYWORDS = [
  "stock", "equity", "market", "earnings", "rates", "inflation", "macro", "trade", "portfolio"
];

const parser = new Parser();
const openaiEnabled = Boolean(process.env.OPENAI_API_KEY);

function nowIso() {
  return new Date().toISOString();
}

function normalizeText(text) {
  return String(text || "").replace(/\s+/g, " ").trim();
}

function stripHtml(rawHtml) {
  let text = String(rawHtml || "");
  text = text.replace(/<script[\s\S]*?<\/script>/gi, " ");
  text = text.replace(/<style[\s\S]*?<\/style>/gi, " ");
  text = text.replace(/<noscript[\s\S]*?<\/noscript>/gi, " ");
  text = text.replace(/<[^>]+>/g, " ");
  text = text.replace(/&nbsp;/gi, " ");
  text = text.replace(/&amp;/gi, "&");
  text = text.replace(/&quot;/gi, "\"");
  text = text.replace(/&#39;/gi, "'");
  return normalizeText(text);
}

function isForeignContent(text) {
  const lower = String(text || "").toLowerCase();
  return FOREIGN_KEYWORDS.some(keyword => lower.includes(keyword));
}

function isUsContent(text) {
  const lower = String(text || "").toLowerCase();
  return US_MARKET_KEYWORDS.some(keyword => lower.includes(keyword));
}

function isMarketContent(text) {
  const lower = String(text || "").toLowerCase();
  return GENERAL_MARKET_KEYWORDS.some(keyword => lower.includes(keyword));
}

function hashContent(text = "") {
  return crypto.createHash("sha1").update(String(text)).digest("hex").slice(0, 20);
}

async function fetchUrlText(url) {
  const controller = new AbortController();
  const timeoutMs = Number(process.env.TRADING_RSS_FETCH_TIMEOUT_MS || 15000);
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const resp = await fetch(url, {
      headers: { "User-Agent": "AikaTradingRAG/1.0" },
      signal: controller.signal
    });
    if (!resp.ok) throw new Error(`fetch_failed_${resp.status}`);
    let html = await resp.text();
    if (RSS_MAX_ARTICLE_CHARS && html.length > RSS_MAX_ARTICLE_CHARS) {
      html = html.slice(0, RSS_MAX_ARTICLE_CHARS);
    }
    return html;
  } finally {
    clearTimeout(timer);
  }
}

async function fetchUrlBuffer(url) {
  const controller = new AbortController();
  const timeoutMs = Number(process.env.TRADING_RSS_FETCH_TIMEOUT_MS || 20000);
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const resp = await fetch(url, {
      headers: { "User-Agent": "AikaTradingRAG/1.0" },
      signal: controller.signal
    });
    if (!resp.ok) throw new Error(`fetch_failed_${resp.status}`);
    const arrayBuffer = await resp.arrayBuffer();
    return Buffer.from(arrayBuffer);
  } finally {
    clearTimeout(timer);
  }
}

function extractJsonObject(text = "") {
  const match = String(text).match(/\{[\s\S]*\}/);
  if (!match) return null;
  try {
    return JSON.parse(match[0]);
  } catch {
    return null;
  }
}

async function aiReviewItem({ title, content }) {
  if (!openaiEnabled) {
    if (RSS_REQUIRE_AI) {
      return { decision: "skip", reason: "ai_required_no_key", tags: [] };
    }
    const combined = `${title}\n${content}`;
    if (isForeignContent(combined) && !isUsContent(combined)) {
      return { decision: "skip", reason: "foreign_market", tags: [] };
    }
    if (isUsContent(combined) || isMarketContent(combined)) {
      return { decision: "include", reason: "heuristic_match", tags: [] };
    }
    return { decision: "skip", reason: "low_relevance", tags: [] };
  }

  const system = [
    "You are filtering RSS news for a US-focused trading knowledge base.",
    "Return JSON ONLY with keys: decision (include|skip), reason, tags (array of short tags).",
    "Include if the item is about US equities, US macro, broadly relevant global market events, or trading education.",
    "Skip if it is mostly about non-US markets or unrelated topics.",
    "Keep tags short (max 6)."
  ].join(" ");
  const user = `Title: ${title}\n\nContent:\n${content.slice(0, 4000)}`;

  try {
    const response = await responsesCreate({
      model: process.env.OPENAI_PRIMARY_MODEL || process.env.OPENAI_MODEL || "gpt-4o-mini",
      input: [
        { role: "system", content: [{ type: "input_text", text: system }] },
        { role: "user", content: [{ type: "input_text", text: user }] }
      ],
      max_output_tokens: 200
    });
    const output = response?.output_text || "";
    const parsed = extractJsonObject(output) || {};
    const decision = parsed.decision === "include" ? "include" : "skip";
    const tags = Array.isArray(parsed.tags) ? parsed.tags.map(tag => String(tag).trim()).filter(Boolean) : [];
    return { decision, reason: parsed.reason || "ai_review", tags };
  } catch (err) {
    if (RSS_REQUIRE_AI) {
      return { decision: "skip", reason: "ai_error", tags: [] };
    }
    return { decision: "include", reason: "ai_failed_fallback", tags: [] };
  }
}

async function getItemContent(item) {
  const link = item.link || item.guid || "";
  if (link && link.toLowerCase().endsWith(".pdf")) {
    const buffer = await fetchUrlBuffer(link);
    const pdfText = await extractPdfText(buffer, {
      useOcr: RSS_OCR_DEFAULT,
      cacheKey: link,
      ocrMaxPages: RSS_OCR_MAX_PAGES,
      ocrScale: RSS_OCR_SCALE
    });
    return String(pdfText?.text || "");
  }
  if (item.contentSnippet) return item.contentSnippet;
  if (item.content) return stripHtml(item.content);
  if (link) {
    const html = await fetchUrlText(link);
    return stripHtml(html);
  }
  return "";
}

export async function crawlTradingRssSources({ entries, force = false, maxItemsPerFeed, collectionId = "trading" } = {}) {
  const list = entries?.length ? entries : listTradingRssSources({ limit: 500, includeDisabled: false, collectionId });
  const results = {
    ok: true,
    total: list.length,
    ingested: 0,
    skipped: 0,
    errors: []
  };
  for (const source of list) {
    try {
      const feed = await parser.parseURL(source.url);
      const items = Array.isArray(feed.items) ? feed.items.slice(0, maxItemsPerFeed || RSS_MAX_ITEMS_PER_FEED) : [];
      for (const item of items) {
        const guid = String(item.guid || item.id || item.link || item.title || "").trim();
        if (!guid) continue;
        if (!force && hasTradingRssItem({ sourceId: source.id, guid })) {
          results.skipped += 1;
          continue;
        }
        const content = await getItemContent(item);
        const title = String(item.title || "RSS Item");
        let combined = `${title}\n${content}`;
        if (RSS_MAX_ARTICLE_CHARS && combined.length > RSS_MAX_ARTICLE_CHARS) {
          combined = combined.slice(0, RSS_MAX_ARTICLE_CHARS);
        }
        let review = null;
        if (!source.include_foreign && isForeignContent(combined) && !isUsContent(combined)) {
          review = { decision: "skip", reason: "foreign_market", tags: [] };
        } else {
          review = await aiReviewItem({ title, content: combined });
        }
        if (review.decision !== "include") {
          recordTradingRssItem({
            sourceId: source.id,
            guid,
            url: item.link || "",
            title,
            publishedAt: item.isoDate || item.pubDate || "",
            decision: review.decision,
            reason: review.reason,
            contentHash: hashContent(combined)
          });
          results.skipped += 1;
          continue;
        }

        const tags = Array.isArray(source.tags) ? source.tags : [];
        const itemTags = review.tags || [];
        const ingest = await ingestTradingDocument({
          kind: "rss",
          title,
          sourceUrl: item.link || "",
          text: combined,
          tags: ["rss", ...tags, ...itemTags],
          sourceGroup: `rss:${source.id}`,
          occurredAt: item.isoDate || item.pubDate || nowIso(),
          force
        });
        recordTradingRssItem({
          sourceId: source.id,
          guid,
          url: item.link || "",
          title,
          publishedAt: item.isoDate || item.pubDate || "",
          decision: "include",
          reason: review.reason,
          contentHash: hashContent(combined)
        });
        if (ingest?.ok) results.ingested += 1;
        else results.errors.push({ url: item.link || "", error: ingest?.error || "ingest_failed" });
      }
      markTradingRssCrawl({ id: source.id, status: "ok", error: "", crawledAt: nowIso() });
    } catch (err) {
      results.errors.push({ url: source.url, error: err?.message || "rss_fetch_failed" });
      markTradingRssCrawl({ id: source.id, status: "error", error: err?.message || "rss_fetch_failed", crawledAt: nowIso() });
    }
  }
  return results;
}

export function listTradingRssSourcesUi({ limit = 100, includeDisabled = true, search = "", collectionId = "trading" } = {}) {
  return listTradingRssSources({ limit, includeDisabled, search, collectionId });
}

export function addTradingRssSource({ url, title = "", tags = [], enabled = true, includeForeign = false, collectionId = "trading" } = {}) {
  return upsertTradingRssSource({ url, title, tags, enabled, includeForeign, collectionId });
}

export function updateTradingRssSourceUi(id, { title, tags, enabled, includeForeign } = {}) {
  return updateTradingRssSource(id, { title, tags, enabled, includeForeign });
}

export function removeTradingRssSource(id) {
  deleteTradingRssSource(id);
  return { ok: true };
}

function extractFeedUrlsFromFeedspot(html) {
  const links = new Set();
  const regex = /href\\s*=\\s*["']([^"']+)["']/gi;
  let match;
  while ((match = regex.exec(html || ""))) {
    const url = match[1];
    if (!url || !url.startsWith("http")) continue;
    const lower = url.toLowerCase();
    if (lower.includes("rss") || lower.endsWith(".xml") || lower.includes("feed")) {
      links.add(url);
    }
  }
  return Array.from(links);
}

function looksForeignUrl(url) {
  const lower = String(url || "").toLowerCase();
  return FOREIGN_KEYWORDS.some(keyword => lower.includes(keyword));
}

export function ensureTradingRssSeeded() {
  const seeded = getRagMeta("trading_rss_seeded");
  if (seeded) return false;
  const existing = listTradingRssSources({ limit: 1, includeDisabled: true, collectionId: "trading" });
  if (existing.length) {
    setRagMeta("trading_rss_seeded", nowIso());
    return false;
  }
  DEFAULT_RSS_SOURCES.forEach(item => {
    upsertTradingRssSource({
      url: item.url,
      title: item.title || item.url,
      tags: ["default"],
      enabled: true,
      includeForeign: false,
      collectionId: "trading"
    });
  });
  setRagMeta("trading_rss_seeded", nowIso());
  return true;
}

export async function seedRssSourcesFromFeedspot(feedspotUrl, { collectionId = "trading" } = {}) {
  const html = await fetchUrlText(feedspotUrl);
  const urls = extractFeedUrlsFromFeedspot(html);
  const added = [];
  const skipped = [];
  const disabled = [];
  urls.forEach(url => {
    if (!url) return;
    const isForeign = looksForeignUrl(url);
    const source = upsertTradingRssSource({
      url,
      title: url,
      tags: ["feedspot"],
      enabled: !isForeign,
      includeForeign: false,
      collectionId
    });
    if (!source) return;
    if (isForeign) disabled.push(url);
    else added.push(url);
  });
  return { added: added.length, disabled: disabled.length, skipped: skipped.length, urls };
}

let rssInterval = null;
export function startTradingRssLoop() {
  if (rssInterval) return;
  ensureTradingRssSeeded();
  if (RSS_ON_STARTUP) {
    crawlTradingRssSources().catch(() => {});
  }
  if (RSS_SYNC_INTERVAL_MINUTES > 0) {
    rssInterval = setInterval(() => {
      crawlTradingRssSources().catch(() => {});
    }, RSS_SYNC_INTERVAL_MINUTES * 60_000);
  }
}

export function listTradingRssItemsUi({ sourceId, limit = 50 } = {}) {
  return listTradingRssItems({ sourceId, limit });
}

