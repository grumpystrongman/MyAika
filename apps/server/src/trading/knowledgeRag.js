import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { chunkTranscript } from "../rag/chunking.js";
import { getEmbedding } from "../rag/embeddings.js";
import { extractPdfText } from "./pdfUtils.js";
import {
  getMeeting,
  upsertMeeting,
  upsertChunks,
  upsertVectors,
  persistHnsw,
  searchChunkIds,
  getChunksByIds,
  listMeetings,
  listMeetingsRaw,
  getRagMeta,
  setRagMeta,
  listTradingSources,
  upsertTradingSource,
  updateTradingSource,
  deleteTradingSource,
  getTradingSource,
  getTradingSourceByUrl,
  markTradingSourceCrawl,
  deleteMeetingsBySourceGroup
} from "../rag/vectorStore.js";

const MAX_DOC_CHARS = Number(process.env.TRADING_RAG_MAX_DOC_CHARS || 50000);
const MAX_FETCH_BYTES = Number(process.env.TRADING_RAG_MAX_BYTES || 2000000);
const DEFAULT_CRAWL_DEPTH = Number(process.env.TRADING_RAG_CRAWL_DEPTH || 1);
const DEFAULT_CRAWL_MAX_PAGES = Number(process.env.TRADING_RAG_CRAWL_MAX_PAGES || 120);
const DEFAULT_CRAWL_MAX_PAGES_PER_DOMAIN = Number(process.env.TRADING_RAG_CRAWL_MAX_PAGES_PER_DOMAIN || 30);
const DEFAULT_CRAWL_DELAY_MS = Number(process.env.TRADING_RAG_CRAWL_DELAY_MS || 800);
const DEFAULT_CRAWL_INTERVAL_MINUTES = Number(process.env.TRADING_RAG_CRAWL_INTERVAL_MINUTES || process.env.TRADING_RAG_SYNC_INTERVAL_MINUTES || 0);
const CRAWL_ON_STARTUP = String(process.env.TRADING_RAG_CRAWL_ON_STARTUP || process.env.TRADING_RAG_SYNC_ON_STARTUP || "0") === "1";
const RESPECT_ROBOTS = String(process.env.TRADING_RAG_CRAWL_RESPECT_ROBOTS || "1") !== "0";
const USE_SITEMAP = String(process.env.TRADING_RAG_CRAWL_USE_SITEMAP || "1") !== "0";
const SITEMAP_MAX_URLS = Number(process.env.TRADING_RAG_SITEMAP_MAX_URLS || 300);
const PDF_MAX_BYTES = Number(process.env.TRADING_RAG_PDF_MAX_BYTES || 15000000);
const OCR_DEFAULT = String(process.env.TRADING_RAG_OCR_DEFAULT || "1") !== "0";
const OCR_MAX_PAGES = Number(process.env.TRADING_RAG_OCR_MAX_PAGES || 0);
const OCR_SCALE = Number(process.env.TRADING_RAG_OCR_SCALE || 2.0);
const TRADING_PREFIX = "trading";

function nowIso() {
  return new Date().toISOString();
}

function hashSeed(input) {
  return crypto.createHash("sha1").update(String(input || "")).digest("hex").slice(0, 16);
}

function normalizeText(text) {
  return String(text || "").replace(/\s+/g, " ").trim();
}

function isPdfName(name) {
  const lower = String(name || "").toLowerCase();
  return lower.endsWith(".pdf");
}

function extractTagsFromRaw(raw = "") {
  const text = String(raw || "");
  const match = text.match(/Tags:\s*([^\n\r]+)/i);
  if (!match) return [];
  return match[1]
    .split(",")
    .map(tag => tag.trim().toLowerCase())
    .filter(Boolean);
}

const crawlQueue = [];
const queuedSourceIds = new Set();
let crawlRunning = false;

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function parseSourceEntries(input) {
  const list = Array.isArray(input)
    ? input
    : String(input || "").split(/[,\n]/);
  return list
    .map(item => String(item || "").trim())
    .filter(Boolean)
    .map(raw => {
      const parts = raw.split("|").map(p => p.trim()).filter(Boolean);
      const url = parts[parts.length - 1];
      const tags = parts.slice(0, -1).map(tag => tag.toLowerCase());
      return { url, tags };
    })
    .filter(item => item.url && /^https?:\/\//i.test(item.url));
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

function bootstrapTradingSourcesFromEnv() {
  const existing = listTradingSources({ limit: 1, includeDisabled: true });
  if (existing.length) return 0;
  const entries = parseSourceEntries(process.env.TRADING_RAG_SOURCES);
  let inserted = 0;
  entries.forEach(entry => {
    const url = normalizeUrl(entry.url);
    if (!url) return;
    upsertTradingSource({ url, tags: normalizeTags(entry.tags), enabled: true });
    inserted += 1;
  });
  return inserted;
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

function isSkippableUrl(value) {
  const lower = String(value || "").toLowerCase();
  if (!lower.startsWith("http")) return true;
  if (lower.startsWith("mailto:") || lower.startsWith("javascript:")) return true;
  const skipExt = [
    ".png", ".jpg", ".jpeg", ".gif", ".svg", ".webp",
    ".pdf", ".zip", ".gz", ".tar",
    ".mp4", ".mp3", ".wav", ".mov", ".avi",
    ".css", ".js", ".map", ".ico", ".woff", ".woff2", ".ttf", ".eot", ".otf"
  ];
  const pathname = (() => {
    try {
      return new URL(value).pathname.toLowerCase();
    } catch {
      return "";
    }
  })();
  return skipExt.some(ext => pathname.endsWith(ext));
}

function extractLinks(html, baseUrl) {
  const links = new Set();
  const regex = /href\s*=\s*["']([^"']+)["']/gi;
  let match;
  while ((match = regex.exec(html || ""))) {
    const raw = match[1];
    if (!raw || raw.startsWith("#")) continue;
    try {
      const resolved = new URL(raw, baseUrl).toString();
      if (!isSkippableUrl(resolved)) links.add(normalizeUrl(resolved));
    } catch {
      // ignore
    }
  }
  return Array.from(links);
}

const robotsCache = new Map();
const sitemapCache = new Map();
async function allowsCrawl(url) {
  if (!RESPECT_ROBOTS) return true;
  let host = "";
  try {
    host = new URL(url).origin;
  } catch {
    return true;
  }
  if (robotsCache.has(host)) return robotsCache.get(host);
  try {
    const resp = await fetch(`${host}/robots.txt`, { headers: { "User-Agent": "AikaTradingRAG/1.0" } });
    if (!resp.ok) {
      robotsCache.set(host, true);
      return true;
    }
    const text = await resp.text();
    const lines = text.split(/\r?\n/);
    let inStar = false;
    let disallowAll = false;
    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) continue;
      const [key, ...rest] = trimmed.split(":");
      const value = rest.join(":").trim();
      if (/^user-agent$/i.test(key)) {
        inStar = value === "*" ? true : false;
        continue;
      }
      if (inStar && /^disallow$/i.test(key) && value === "/") {
        disallowAll = true;
        break;
      }
    }
    const allowed = !disallowAll;
    robotsCache.set(host, allowed);
    return allowed;
  } catch {
    robotsCache.set(host, true);
    return true;
  }
}

function extractSitemapUrls(xml) {
  const urls = [];
  const regex = /<loc>([^<]+)<\/loc>/gi;
  let match;
  while ((match = regex.exec(xml || ""))) {
    const loc = String(match[1] || "").trim();
    if (loc) urls.push(loc);
  }
  return urls;
}

async function fetchSitemapUrls(origin, maxUrls = SITEMAP_MAX_URLS) {
  if (!USE_SITEMAP) return [];
  if (!origin) return [];
  if (sitemapCache.has(origin)) return sitemapCache.get(origin);
  const collected = new Set();
  const candidates = [
    `${origin}/sitemap.xml`,
    `${origin}/sitemap_index.xml`
  ];
  const fetchXml = async (url) => {
    try {
      const resp = await fetch(url, { headers: { "User-Agent": "AikaTradingRAG/1.0" } });
      if (!resp.ok) return "";
      const contentType = String(resp.headers.get("content-type") || "").toLowerCase();
      if (!contentType.includes("xml") && !contentType.includes("text")) return "";
      return await resp.text();
    } catch {
      return "";
    }
  };

  for (const candidate of candidates) {
    const xml = await fetchXml(candidate);
    if (!xml) continue;
    const locs = extractSitemapUrls(xml);
    const isIndex = xml.includes("<sitemapindex");
    if (isIndex) {
      const sitemapUrls = locs.filter(loc => loc.endsWith(".xml")).slice(0, 10);
      for (const sitemapUrl of sitemapUrls) {
        const subXml = await fetchXml(sitemapUrl);
        if (!subXml) continue;
        extractSitemapUrls(subXml).forEach(loc => {
          if (collected.size >= maxUrls) return;
          collected.add(loc);
        });
      }
    } else {
      locs.forEach(loc => {
        if (collected.size >= maxUrls) return;
        collected.add(loc);
      });
    }
    if (collected.size >= maxUrls) break;
  }

  const filtered = Array.from(collected).filter(loc => {
    if (isSkippableUrl(loc)) return false;
    try {
      const url = new URL(loc);
      return url.origin === origin;
    } catch {
      return false;
    }
  });
  sitemapCache.set(origin, filtered);
  return filtered;
}

function enqueueSourceCrawl(source, options = {}) {
  if (!source?.url) return;
  const id = source.id;
  if (id && queuedSourceIds.has(id)) return;
  crawlQueue.push({ source, options });
  if (id) queuedSourceIds.add(id);
  processCrawlQueue().catch(() => {});
}

async function processCrawlQueue() {
  if (crawlRunning) return;
  crawlRunning = true;
  while (crawlQueue.length) {
    const job = crawlQueue.shift();
    if (!job?.source?.url) continue;
    const source = job.source;
    if (source.id) queuedSourceIds.delete(source.id);
    try {
      if (source.id) {
        markTradingSourceCrawl({ id: source.id, status: "running", error: "" });
      }
      const result = await crawlTradingSources({
        entries: [{
          id: source.id,
          url: source.url,
          tags: source.tags || [],
          sourceGroup: source.url
        }],
        maxDepth: job.options?.maxDepth,
        maxPages: job.options?.maxPages,
        maxPagesPerDomain: job.options?.maxPagesPerDomain,
        delayMs: job.options?.delayMs,
        force: job.options?.force
      });
      const status = result?.errors?.length
        ? (result?.ingested ? "partial" : "error")
        : "ok";
      const error = result?.errors?.[0]?.error || "";
      if (source.id) {
        markTradingSourceCrawl({ id: source.id, status, error, crawledAt: nowIso() });
      }
    } catch (err) {
      if (source.id) {
        markTradingSourceCrawl({ id: source.id, status: "error", error: err?.message || "crawl_failed", crawledAt: nowIso() });
      }
    }
  }
  crawlRunning = false;
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

function limitText(text, maxChars = MAX_DOC_CHARS) {
  if (!text) return "";
  if (!maxChars || text.length <= maxChars) return text;
  return `${text.slice(0, maxChars)}...`;
}

function buildTradingId(kind, seed) {
  const hash = hashSeed(`${kind}:${seed}`);
  return `${TRADING_PREFIX}:${kind}:${hash}`;
}

function buildHeader({ title, sourceUrl, tags }) {
  const parts = [];
  if (title) parts.push(`Title: ${title}`);
  if (sourceUrl) parts.push(`Source: ${sourceUrl}`);
  if (tags?.length) parts.push(`Tags: ${tags.join(", ")}`);
  return parts.join("\n");
}

export async function ingestTradingDocument({
  kind,
  title,
  sourceUrl,
  text,
  tags = [],
  sourceGroup,
  occurredAt,
  force = false
}) {
  const normalizedText = normalizeText(text);
  if (!normalizedText) {
    return { ok: false, error: "empty_text" };
  }
  const idSeed = sourceUrl || `${title}:${normalizedText.slice(0, 120)}`;
  const meetingId = buildTradingId(kind, idSeed);
  const existing = getMeeting(meetingId);
  if (existing && !force && existing.raw_transcript === normalizedText) {
    return { ok: true, skipped: true, meetingId, chunks: 0 };
  }
  const occurred = occurredAt || nowIso();
  const header = buildHeader({ title, sourceUrl, tags });
  const body = limitText(normalizedText);
  const raw = header ? `${header}\n\n${body}` : body;

  upsertMeeting({
    id: meetingId,
    title: title || `Trading Knowledge (${kind})`,
    occurred_at: occurred,
    participants_json: "",
    source_group: sourceGroup || "",
    source_url: sourceUrl || "",
    raw_transcript: raw,
    created_at: occurred
  });

  const chunks = chunkTranscript({ meetingId, rawText: raw });
  if (!chunks.length) {
    return { ok: false, error: "chunking_failed", meetingId };
  }
  upsertChunks(chunks);
  const embeddings = [];
  for (const chunk of chunks) {
    const embedding = await getEmbedding(chunk.text);
    embeddings.push(embedding);
  }
  await upsertVectors(chunks, embeddings);
  await persistHnsw();
  return { ok: true, meetingId, chunks: chunks.length };
}

function extractTitleFromHtml(html) {
  const match = String(html || "").match(/<title[^>]*>([^<]+)<\/title>/i);
  return match ? normalizeText(match[1]) : "";
}

async function fetchUrlText(url) {
  const controller = new AbortController();
  const timeoutMs = Number(process.env.TRADING_RAG_FETCH_TIMEOUT_MS || 15000);
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const resp = await fetch(url, {
      headers: { "User-Agent": "AikaTradingRAG/1.0" },
      signal: controller.signal
    });
    if (!resp.ok) throw new Error(`fetch_failed_${resp.status}`);
    const contentType = String(resp.headers.get("content-type") || "").toLowerCase();
    const isText = contentType.startsWith("text/")
      || contentType.includes("html")
      || contentType.includes("xml")
      || contentType.includes("json");
    if (!isText) return "";
    let html = await resp.text();
    if (MAX_FETCH_BYTES && html.length > MAX_FETCH_BYTES) {
      html = html.slice(0, MAX_FETCH_BYTES);
    }
    return html;
  } finally {
    clearTimeout(timer);
  }
}

async function fetchUrlBuffer(url, { maxBytes = MAX_FETCH_BYTES } = {}) {
  const controller = new AbortController();
  const timeoutMs = Number(process.env.TRADING_RAG_FETCH_TIMEOUT_MS || 20000);
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const resp = await fetch(url, {
      headers: { "User-Agent": "AikaTradingRAG/1.0" },
      signal: controller.signal
    });
    if (!resp.ok) throw new Error(`fetch_failed_${resp.status}`);
    const arrayBuffer = await resp.arrayBuffer();
    if (maxBytes && arrayBuffer.byteLength > maxBytes) {
      throw new Error("fetch_too_large");
    }
    return { buffer: Buffer.from(arrayBuffer), contentType: resp.headers.get("content-type") || "" };
  } finally {
    clearTimeout(timer);
  }
}

export async function syncTradingSources({ urls = [], entries = [], force = false } = {}) {
  const list = entries?.length ? entries : parseSourceEntries(urls?.length ? urls : process.env.TRADING_RAG_SOURCES);
  const results = {
    ok: true,
    total: list.length,
    ingested: 0,
    skipped: 0,
    errors: []
  };
  for (const item of list) {
    const url = item?.url || item;
    const tags = Array.isArray(item?.tags) ? item.tags : [];
    const sourceGroup = normalizeUrl(item?.sourceGroup || url) || url;
    try {
      if (!url) continue;
      const html = await fetchUrlText(url);
      const title = extractTitleFromHtml(html) || url;
      const text = stripHtml(html);
      const result = await ingestTradingDocument({
        kind: "source",
        title,
        sourceUrl: url,
        text,
        tags: ["source", ...tags],
        sourceGroup,
        force
      });
      if (result?.skipped) results.skipped += 1;
      else if (result?.ok) results.ingested += 1;
      else results.errors.push({ url, error: result?.error || "ingest_failed" });
    } catch (err) {
      results.errors.push({ url, error: err?.message || "fetch_failed" });
    }
  }
  setRagMeta("trading_sources_last_sync", nowIso());
  return results;
}

export async function crawlTradingSources({
  entries = [],
  maxDepth = DEFAULT_CRAWL_DEPTH,
  maxPages = DEFAULT_CRAWL_MAX_PAGES,
  maxPagesPerDomain = DEFAULT_CRAWL_MAX_PAGES_PER_DOMAIN,
  delayMs = DEFAULT_CRAWL_DELAY_MS,
  force = false
} = {}) {
  const seedEntries = entries?.length ? entries : parseSourceEntries(process.env.TRADING_RAG_SOURCES);
  const queue = seedEntries.map(item => ({
    url: normalizeUrl(item.url),
    depth: 0,
    tags: item.tags || [],
    sourceGroup: normalizeUrl(item.sourceGroup || item.url) || item.url,
    id: item.id
  })).filter(item => item.url);
  const visited = new Set();
  const domainCounts = new Map();
  const results = {
    ok: true,
    total: 0,
    ingested: 0,
    skipped: 0,
    errors: []
  };

  if (USE_SITEMAP) {
    const origins = Array.from(new Set(queue.map(item => {
      try {
        return new URL(item.url).origin;
      } catch {
        return "";
      }
    }).filter(Boolean)));
    for (const origin of origins) {
      const urls = await fetchSitemapUrls(origin);
      if (!urls.length) continue;
      urls.forEach(url => {
        if (visited.has(url)) return;
        const seed = queue.find(item => {
          try {
            return new URL(item.url).origin === origin;
          } catch {
            return false;
          }
        });
        queue.push({
          url,
          depth: 0,
          tags: seed?.tags || [],
          sourceGroup: seed?.sourceGroup || origin,
          id: seed?.id
        });
      });
    }
  }

  while (queue.length && results.total < maxPages) {
    const current = queue.shift();
    if (!current?.url || visited.has(current.url)) continue;
    visited.add(current.url);
    const host = (() => {
      try {
        return new URL(current.url).host;
      } catch {
        return "";
      }
    })();
    if (!host) continue;
    const count = domainCounts.get(host) || 0;
    if (count >= maxPagesPerDomain) continue;

    if (!(await allowsCrawl(current.url))) {
      continue;
    }

    domainCounts.set(host, count + 1);
    results.total += 1;
    try {
      const html = await fetchUrlText(current.url);
      const title = extractTitleFromHtml(html) || current.url;
      const text = stripHtml(html);
      const ingest = await ingestTradingDocument({
        kind: "source",
        title,
        sourceUrl: current.url,
        text,
        tags: ["source", ...current.tags],
        sourceGroup: current.sourceGroup,
        force
      });
      if (ingest?.skipped) results.skipped += 1;
      else if (ingest?.ok) results.ingested += 1;
      else results.errors.push({ url: current.url, error: ingest?.error || "ingest_failed" });

      if (html && current.depth < maxDepth) {
        const links = extractLinks(html, current.url);
        links.forEach(link => {
          if (visited.has(link)) return;
          if (isSkippableUrl(link)) return;
          try {
            const linkHost = new URL(link).host;
            if (linkHost !== host) return;
          } catch {
            return;
          }
          queue.push({ url: link, depth: current.depth + 1, tags: current.tags, sourceGroup: current.sourceGroup, id: current.id });
        });
      }
    } catch (err) {
      results.errors.push({ url: current.url, error: err?.message || "crawl_failed" });
    }

    if (delayMs > 0) {
      await sleep(delayMs);
    }
  }

  setRagMeta("trading_sources_last_crawl", nowIso());
  if (seedEntries?.length) {
    const status = results.errors.length
      ? (results.ingested ? "partial" : "error")
      : "ok";
    const error = results.errors[0]?.error || "";
    seedEntries.forEach(entry => {
      if (entry?.id) {
        markTradingSourceCrawl({ id: entry.id, status, error, crawledAt: nowIso() });
      }
    });
  }
  return { ...results, visited: visited.size };
}

export async function ingestTradingHowTo({ title, text, tags = [] } = {}) {
  return ingestTradingDocument({
    kind: "howto",
    title: title || "Trading How-To",
    text,
    tags: ["howto", ...tags]
  });
}

export async function ingestTradingUrl({
  url,
  title,
  tags = [],
  useOcr = OCR_DEFAULT,
  ocrMaxPages = OCR_MAX_PAGES,
  ocrScale = OCR_SCALE,
  force = false
} = {}) {
  const sourceUrl = normalizeUrl(url);
  if (!sourceUrl) {
    return { ok: false, error: "invalid_url" };
  }
  const isPdf = isPdfName(sourceUrl);
  if (isPdf) {
    const { buffer } = await fetchUrlBuffer(sourceUrl, { maxBytes: PDF_MAX_BYTES || MAX_FETCH_BYTES });
    const pdfText = await extractPdfText(buffer, {
      useOcr,
      cacheKey: sourceUrl,
      ocrMaxPages,
      ocrScale
    });
    const text = String(pdfText?.text || "");
    if (!text.trim()) {
      return { ok: false, error: "empty_pdf_text" };
    }
    const finalTitle = title || sourceUrl.split("/").pop() || "PDF Document";
    return ingestTradingDocument({
      kind: "pdf",
      title: finalTitle,
      sourceUrl,
      text,
      tags: ["pdf", "url", ...tags].filter(Boolean),
      sourceGroup: sourceUrl,
      force
    });
  }

  const html = await fetchUrlText(sourceUrl);
  const docTitle = title || extractTitleFromHtml(html) || sourceUrl;
  const text = stripHtml(html);
  return ingestTradingDocument({
    kind: "source",
    title: docTitle,
    sourceUrl,
    text,
    tags: ["source", ...tags],
    sourceGroup: sourceUrl,
    force
  });
}

export async function ingestTradingFile({
  filePath,
  originalName = "",
  title,
  tags = [],
  useOcr = OCR_DEFAULT,
  ocrMaxPages = OCR_MAX_PAGES,
  ocrScale = OCR_SCALE,
  force = false
} = {}) {
  if (!filePath || !fs.existsSync(filePath)) {
    return { ok: false, error: "file_not_found" };
  }
  const ext = path.extname(originalName || filePath).toLowerCase();
  const isPdf = ext === ".pdf";
  let text = "";
  if (isPdf) {
    const buffer = fs.readFileSync(filePath);
    const pdfText = await extractPdfText(buffer, {
      useOcr,
      cacheKey: originalName || filePath,
      ocrMaxPages,
      ocrScale
    });
    text = String(pdfText?.text || "");
    if (!text.trim()) {
      return { ok: false, error: "empty_pdf_text" };
    }
  } else {
    text = fs.readFileSync(filePath, "utf8");
  }
  const finalTitle = title || originalName || path.basename(filePath);
  return ingestTradingDocument({
    kind: "file",
    title: finalTitle,
    sourceUrl: originalName ? `file://${originalName}` : "",
    text,
    tags: [isPdf ? "pdf" : "file", "upload", ...tags].filter(Boolean),
    sourceGroup: "local-file",
    force
  });
}

export async function recordTradeAnalysis({ outcome, analysis, source } = {}) {
  const payload = outcome || {};
  const title = payload.symbol ? `Trade Analysis ${payload.symbol}` : "Trade Analysis";
  const lines = [
    "Trade Outcome Analysis",
    payload.symbol ? `Symbol: ${payload.symbol}` : "",
    payload.side ? `Side: ${payload.side}` : "",
    payload.quantity ? `Quantity: ${payload.quantity}` : "",
    payload.pnl != null ? `PnL: ${payload.pnl}` : "",
    payload.pnl_pct != null ? `PnL%: ${payload.pnl_pct}` : "",
    payload.notes ? `Notes: ${payload.notes}` : "",
    source ? `Source: ${source}` : "",
    analysis ? `Analysis: ${analysis}` : ""
  ].filter(Boolean);
  const text = lines.join("\n");
  return ingestTradingDocument({
    kind: "trade",
    title,
    text,
    tags: ["trade", payload.symbol || ""].filter(Boolean)
  });
}

export async function queryTradingKnowledge(question, { topK = 6 } = {}) {
  const query = String(question || "").trim();
  if (!query) {
    return { answer: "Question required.", citations: [], debug: { retrievedCount: 0 } };
  }
  const embedding = await getEmbedding(query);
  const matches = await searchChunkIds(embedding, Math.max(topK * 3, topK));
  const orderedIds = matches.map(m => m.chunk_id).filter(Boolean);
  const rows = getChunksByIds(orderedIds, { meetingIdPrefix: `${TRADING_PREFIX}:` });
  const byId = new Map(rows.map(row => [row.chunk_id, row]));
  const ordered = matches
    .map(match => ({ ...byId.get(match.chunk_id), distance: match.distance }))
    .filter(item => item && item.text);
  const top = ordered.slice(0, topK);

  const context = top.map((chunk, idx) => {
    const header = `[${idx + 1}] ${chunk.meeting_title || "Trading Knowledge"} (${chunk.occurred_at || ""}) | ${chunk.chunk_id}`;
    return `${header}\n${chunk.text}`.trim();
  }).join("\n\n");

  return {
    answer: context ? "Context retrieved." : "No trading knowledge available.",
    context,
    citations: top.map(chunk => ({
      meeting_title: chunk.meeting_title || "Trading Knowledge",
      occurred_at: chunk.occurred_at || "",
      chunk_id: chunk.chunk_id,
      snippet: chunk.text
    })),
    debug: { retrievedCount: top.length }
  };
}

export async function listTradingKnowledge({ limit = 25, offset = 0, search = "", tag = "" } = {}) {
  const tagValue = String(tag || "").trim().toLowerCase();
  if (tagValue) {
    const rawRows = listMeetingsRaw({ type: "trading", limit: Math.max(limit * 4, limit), offset: 0 });
    const filtered = rawRows.filter(row => {
      const tags = extractTagsFromRaw(row.raw_transcript || "");
      if (!tags.includes(tagValue)) return false;
      if (!search) return true;
      const needle = String(search).toLowerCase();
      return String(row.title || "").toLowerCase().includes(needle)
        || String(row.raw_transcript || "").toLowerCase().includes(needle);
    });
    return filtered.slice(0, limit).map(row => ({
      id: row.id,
      title: row.title,
      occurred_at: row.occurred_at,
      source_url: row.source_url || "",
      summary: null
    }));
  }
  const rows = listMeetings({ type: "trading", limit, offset, search });
  return rows.map(row => ({
    id: row.id,
    title: row.title,
    occurred_at: row.occurred_at,
    source_url: row.source_url || "",
    summary: row.summary_json ? JSON.parse(row.summary_json) : null
  }));
}

export function getTradingKnowledgeStats({ limit = 500 } = {}) {
  const rows = listMeetingsRaw({ type: "trading", limit, offset: 0 });
  const tagCounts = new Map();
  const sourceMap = new Map();
  let earliest = null;
  let latest = null;

  rows.forEach(row => {
    const occurred = row.occurred_at || row.created_at || "";
    const ts = occurred ? Date.parse(occurred) : NaN;
    if (Number.isFinite(ts)) {
      if (earliest == null || ts < earliest) earliest = ts;
      if (latest == null || ts > latest) latest = ts;
    }
    const tags = extractTagsFromRaw(row.raw_transcript || "");
    tags.forEach(tag => {
      tagCounts.set(tag, (tagCounts.get(tag) || 0) + 1);
    });
    const sourceKey = row.source_url || row.source_group || row.title || "manual";
    const existing = sourceMap.get(sourceKey);
    if (!existing) {
      sourceMap.set(sourceKey, {
        key: sourceKey,
        title: row.title || sourceKey,
        source_url: row.source_url || "",
        source_group: row.source_group || "",
        first_seen: occurred || "",
        last_seen: occurred || "",
        count: 1
      });
    } else {
      existing.count += 1;
      if (occurred && (!existing.first_seen || occurred < existing.first_seen)) {
        existing.first_seen = occurred;
      }
      if (occurred && (!existing.last_seen || occurred > existing.last_seen)) {
        existing.last_seen = occurred;
      }
    }
  });

  const tagsSorted = Array.from(tagCounts.entries())
    .map(([tag, count]) => ({ tag, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 24);

  const topTagSet = new Set(tagsSorted.map(t => t.tag));
  const linkMap = new Map();
  rows.forEach(row => {
    const tags = extractTagsFromRaw(row.raw_transcript || "").filter(tag => topTagSet.has(tag));
    for (let i = 0; i < tags.length; i += 1) {
      for (let j = i + 1; j < tags.length; j += 1) {
        const key = [tags[i], tags[j]].sort().join("::");
        linkMap.set(key, (linkMap.get(key) || 0) + 1);
      }
    }
  });
  const links = Array.from(linkMap.entries()).map(([key, weight]) => {
    const [source, target] = key.split("::");
    return { source, target, weight };
  });

  const sources = Array.from(sourceMap.values()).map(source => {
    const last = source.last_seen ? Date.parse(source.last_seen) : NaN;
    const ageDays = Number.isFinite(last) ? Math.round((Date.now() - last) / 86400000) : null;
    return { ...source, age_days: ageDays };
  }).sort((a, b) => (b.last_seen || "").localeCompare(a.last_seen || ""));

  return {
    totalDocuments: rows.length,
    totalTags: tagCounts.size,
    earliest: earliest ? new Date(earliest).toISOString() : "",
    latest: latest ? new Date(latest).toISOString() : "",
    sources,
    tags: tagsSorted,
    graph: {
      nodes: tagsSorted.map(item => ({ id: item.tag, count: item.count })),
      links
    }
  };
}

export function listTradingSourcesUi({ limit = 100, offset = 0, search = "", includeDisabled = true } = {}) {
  ensureTradingSourcesSeeded();
  return listTradingSources({ limit, offset, search, includeDisabled });
}

export function addTradingSource({ url, tags = [], enabled = true } = {}) {
  const normalized = normalizeUrl(url);
  if (!normalized) throw new Error("invalid_url");
  const source = upsertTradingSource({ url: normalized, tags: normalizeTags(tags), enabled: enabled !== false });
  enqueueSourceCrawl({ ...source, tags: source.tags || [] });
  return source;
}

export function updateTradingSourceUi(id, { tags, enabled } = {}) {
  const next = {};
  if (Array.isArray(tags)) next.tags = normalizeTags(tags);
  if (enabled !== undefined) next.enabled = enabled;
  return updateTradingSource(id, next);
}

export function removeTradingSource(id, { deleteKnowledge = false } = {}) {
  const source = getTradingSource(id);
  if (!source) return { ok: false, error: "not_found" };
  let deletedCount = 0;
  if (deleteKnowledge) {
    deletedCount = deleteMeetingsBySourceGroup(source.url);
  }
  deleteTradingSource(id);
  return { ok: true, deletedCount };
}

export function queueTradingSourceCrawl(id, options = {}) {
  const source = getTradingSource(id);
  if (!source) throw new Error("not_found");
  enqueueSourceCrawl(source, options);
  return { ok: true, queued: true };
}

export function ensureTradingSourcesSeeded() {
  return bootstrapTradingSourcesFromEnv();
}

export async function startTradingKnowledgeSyncLoop() {
  const intervalMin = DEFAULT_CRAWL_INTERVAL_MINUTES;
  if (!intervalMin || intervalMin <= 0) return;
  ensureTradingSourcesSeeded();

  const run = async () => {
    const sources = listTradingSources({ limit: 500, includeDisabled: false });
    if (!sources.length) return;
    const now = Date.now();
    for (const source of sources) {
      const last = source.last_crawled_at ? Date.parse(source.last_crawled_at) : 0;
      if (!last || now - last >= intervalMin * 60_000) {
        enqueueSourceCrawl(source);
      }
    }
  };

  if (CRAWL_ON_STARTUP) {
    run().catch(() => {});
  }
  setInterval(() => {
    run().catch(() => {});
  }, intervalMin * 60_000);
}
