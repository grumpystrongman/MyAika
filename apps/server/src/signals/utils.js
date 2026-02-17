import crypto from "node:crypto";

const COMPANY_SUFFIXES = [
  "inc", "corp", "co", "ltd", "llc", "plc", "gmbh", "sa", "ag", "nv", "bv", "holdings", "group"
];

const TICKER_STOPWORDS = new Set([
  "USD", "US", "EU", "UK", "UN", "AND", "FOR", "THE", "A", "AN", "TO", "OF", "IN", "ON", "AT",
  "CEO", "CFO", "GDP", "CPI", "PPI", "PMI", "FED", "SEC", "EIA", "NOAA", "USGS", "BLS"
]);

const COMMODITY_KEYWORDS = {
  crude_oil: ["crude", "oil", "wti", "brent", "west texas"],
  gasoline: ["gasoline", "gas", "diesel"],
  natural_gas: ["natural gas", "nat gas", "lng", "henry hub"],
  electricity: ["electricity", "power grid", "grid"],
  coal: ["coal"],
  copper: ["copper"],
  gold: ["gold"],
  silver: ["silver"],
  wheat: ["wheat"],
  corn: ["corn"],
  soybeans: ["soy", "soybean", "soybeans"],
  freight: ["freight", "shipping", "container", "tanker", "vessel"]
};

const REGION_KEYWORDS = {
  us: ["u.s.", "united states", "america", "us "],
  europe: ["europe", "eurozone", "eu"],
  uk: ["uk", "united kingdom", "britain", "england"],
  china: ["china", "beijing", "shanghai"],
  japan: ["japan", "tokyo"],
  india: ["india", "delhi"],
  middle_east: ["middle east", "gulf", "opec"],
  latin_america: ["latin america", "brazil", "mexico"],
  africa: ["africa", "nigeria", "south africa"],
  global: ["global", "worldwide"]
};

const EVENT_KEYWORDS = {
  strike: ["strike", "walkout", "labor action"],
  outage: ["outage", "shutdown", "offline", "curtail"],
  hurricane: ["hurricane", "tropical storm", "cyclone"],
  wildfire: ["wildfire", "fire weather", "burn"],
  drought: ["drought", "dry spell"],
  sanctions: ["sanction", "embargo"],
  cyber: ["cyber", "ransomware", "hack", "breach"],
  layoffs: ["layoff", "job cuts", "redundancy"],
  earnings: ["earnings", "guidance", "results", "profit"],
  shipping: ["port", "shipping", "container", "canal", "freight", "logistics"],
  inventory: ["inventory", "stockpile", "storage"],
  regulatory: ["regulatory", "rule", "compliance", "policy"],
  weather: ["storm", "tornado", "flood", "blizzard", "heat", "snow", "severe weather"]
};

const SIGNAL_RULES = {
  energy_supply: ["opec", "production", "refinery", "output", "supply", "inventory", "storage", "rig count", "export", "import"],
  shipping_disruption: ["port", "shipping", "container", "canal", "logistics", "freight", "surcharge", "schedule"],
  extreme_weather: ["tornado", "storm", "hurricane", "flood", "blizzard", "heat", "severe", "warning", "watch"],
  drought_risk: ["drought", "dry", "low rainfall"],
  wildfire_risk: ["wildfire", "fire weather", "smoke"],
  regulatory_risk: ["regulatory", "rule", "ban", "sanction", "policy", "compliance"],
  earnings: ["earnings", "guidance", "results"],
  layoffs: ["layoff", "job cuts", "redundancy"],
  cyber_incident: ["cyber", "ransomware", "hack", "breach"],
  energy_inventory: ["storage", "inventory", "stockpile", "build", "draw"],
  macro_indicator: ["cpi", "ppi", "gdp", "employment", "jobs report"]
};

const STOPWORDS = new Set([
  "the", "and", "for", "with", "from", "that", "this", "will", "into", "over", "than", "after", "before", "about",
  "market", "markets", "news", "report", "reports", "update", "weekly", "daily", "today", "latest", "says"
]);

export function nowIso() {
  return new Date().toISOString();
}

export function normalizeText(text) {
  return String(text || "").replace(/\s+/g, " ").trim();
}

export function stripHtml(rawHtml) {
  let text = String(rawHtml || "");
  text = text.replace(/<script[\s\S]*?<\/script>/gi, " ");
  text = text.replace(/<style[\s\S]*?<\/style>/gi, " ");
  text = text.replace(/<noscript[\s\S]*?<\/noscript>/gi, " ");
  text = text.replace(/<svg[\s\S]*?<\/svg>/gi, " ");
  text = text.replace(/<[^>]+>/g, " ");
  text = text.replace(/&nbsp;/gi, " ");
  text = text.replace(/&amp;/gi, "&");
  text = text.replace(/&quot;/gi, "\"");
  text = text.replace(/&#39;/gi, "'");
  text = text.replace(/&lt;/gi, "<");
  text = text.replace(/&gt;/gi, "> ");
  return normalizeText(text);
}

export function cleanText(rawHtml) {
  const text = stripHtml(rawHtml);
  if (!text) return "";
  const lines = text.split(/\n+/).map(line => line.trim()).filter(Boolean);
  const filtered = lines.filter(line => {
    const lower = line.toLowerCase();
    if (line.length < 30) return false;
    if (lower.includes("cookie") || lower.includes("privacy") || lower.includes("subscribe")) return false;
    if (lower.includes("all rights reserved") || lower.includes("terms of use")) return false;
    if (lower.includes("sign up") || lower.includes("log in")) return false;
    return true;
  });
  const merged = filtered.length ? filtered.join("\n") : text;
  return normalizeText(merged);
}

export function extractHtmlTitle(html) {
  const match = String(html || "").match(/<title[^>]*>([^<]+)<\/title>/i);
  return match ? normalizeText(match[1]) : "";
}

export function extractMetaDescription(html) {
  const match = String(html || "").match(/<meta[^>]+name=["']description["'][^>]+content=["']([^"']+)["'][^>]*>/i);
  return match ? normalizeText(match[1]) : "";
}

export function extractPublishedTime(html) {
  const meta = String(html || "").match(/<meta[^>]+property=["']article:published_time["'][^>]+content=["']([^"']+)["'][^>]*>/i);
  if (meta && meta[1]) return meta[1];
  const timeTag = String(html || "").match(/<time[^>]+datetime=["']([^"']+)["'][^>]*>/i);
  if (timeTag && timeTag[1]) return timeTag[1];
  const release = String(html || "").match(/(Release Date|Released|Publication Date)\s*[:\-]?\s*([A-Za-z]+\s+\d{1,2},\s+\d{4})/i);
  if (release && release[2]) return release[2];
  return "";
}

export function parseDateValue(value) {
  if (!value) return "";
  const ts = Date.parse(value);
  if (Number.isFinite(ts)) return new Date(ts).toISOString();
  return "";
}

export function limitText(text, maxChars) {
  if (!text) return "";
  if (!maxChars || text.length <= maxChars) return text;
  return `${text.slice(0, maxChars)}...`;
}

export function normalizeUrl(raw) {
  try {
    const url = new URL(raw);
    url.hash = "";
    return url.toString();
  } catch {
    return "";
  }
}

function tokenize(text) {
  return String(text || "")
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .map(token => token.trim())
    .filter(token => token.length >= 3 && token.length <= 24 && !STOPWORDS.has(token));
}

function hashToken64(token) {
  const buf = crypto.createHash("sha1").update(token).digest();
  let value = 0n;
  for (let i = 0; i < 8; i += 1) {
    value = (value << 8n) + BigInt(buf[i]);
  }
  return value;
}

export function computeSimhash(text) {
  const tokens = tokenize(text);
  if (!tokens.length) return "";
  const weights = Array(64).fill(0);
  tokens.forEach(token => {
    const hash = hashToken64(token);
    for (let i = 0; i < 64; i += 1) {
      const bit = (hash >> BigInt(63 - i)) & 1n;
      weights[i] += bit === 1n ? 1 : -1;
    }
  });
  let result = 0n;
  for (let i = 0; i < 64; i += 1) {
    if (weights[i] >= 0) {
      result = result | (1n << BigInt(63 - i));
    }
  }
  return result.toString(16).padStart(16, "0");
}

export function hammingDistance(hashA, hashB) {
  if (!hashA || !hashB) return 64;
  try {
    let a = BigInt(`0x${hashA}`);
    let b = BigInt(`0x${hashB}`);
    let x = a ^ b;
    let dist = 0;
    while (x > 0n) {
      dist += Number(x & 1n);
      x >>= 1n;
    }
    return dist;
  } catch {
    return 64;
  }
}

export function hashContent(text) {
  return crypto.createHash("sha256").update(String(text || "")).digest("hex");
}

export function uniqueList(items = []) {
  const seen = new Set();
  const result = [];
  items.forEach(item => {
    const value = String(item || "").trim();
    if (!value) return;
    if (seen.has(value)) return;
    seen.add(value);
    result.push(value);
  });
  return result;
}

export function extractTickers(text) {
  const tickers = new Set();
  const raw = String(text || "");
  const dollarMatches = raw.match(/\$[A-Z]{1,5}\b/g) || [];
  dollarMatches.forEach(match => tickers.add(match.replace("$", "")));
  const exchangeMatches = raw.match(/\b(?:NYSE|NASDAQ|NYSEARCA|AMEX)\s*:?\s*([A-Z]{1,5})\b/g) || [];
  exchangeMatches.forEach(match => {
    const parts = match.split(/\s*:?\s*/);
    const ticker = parts[parts.length - 1];
    if (ticker) tickers.add(ticker);
  });
  const looseMatches = raw.match(/\b[A-Z]{2,5}\b/g) || [];
  looseMatches.forEach(match => {
    if (TICKER_STOPWORDS.has(match)) return;
    if (match.length <= 1) return;
    tickers.add(match);
  });
  return Array.from(tickers).slice(0, 12);
}

export function extractCompanies(text) {
  const companies = new Set();
  const raw = String(text || "");
  const regex = /\b([A-Z][a-z]+(?:\s+[A-Z][a-z]+){0,3})\s+(Inc|Corp|Co|Ltd|LLC|PLC|GmbH|SA|AG|NV|BV|Holdings|Group)\b/g;
  let match;
  while ((match = regex.exec(raw))) {
    const name = `${match[1]} ${match[2]}`;
    companies.add(name.trim());
  }
  return Array.from(companies).slice(0, 12);
}

export function extractCommodities(text) {
  const lower = String(text || "").toLowerCase();
  const found = [];
  Object.entries(COMMODITY_KEYWORDS).forEach(([key, words]) => {
    if (words.some(word => lower.includes(word))) found.push(key);
  });
  return uniqueList(found).slice(0, 10);
}

export function extractRegions(text) {
  const lower = String(text || "").toLowerCase();
  const found = [];
  Object.entries(REGION_KEYWORDS).forEach(([key, words]) => {
    if (words.some(word => lower.includes(word))) found.push(key);
  });
  return uniqueList(found).slice(0, 8);
}

export function extractEventTypes(text) {
  const lower = String(text || "").toLowerCase();
  const found = [];
  Object.entries(EVENT_KEYWORDS).forEach(([key, words]) => {
    if (words.some(word => lower.includes(word))) found.push(key);
  });
  return uniqueList(found).slice(0, 10);
}

export function deriveSignalTags(text) {
  const lower = String(text || "").toLowerCase();
  const scores = {};
  Object.entries(SIGNAL_RULES).forEach(([tag, words]) => {
    let score = 0;
    words.forEach(word => {
      if (lower.includes(word)) score += 1;
    });
    if (score > 0) scores[tag] = score;
  });
  const sorted = Object.entries(scores)
    .sort((a, b) => b[1] - a[1])
    .map(item => item[0]);
  return sorted.slice(0, 6);
}

export function computeFreshnessScore(publishedAt, halfLifeHours = 72) {
  const ts = publishedAt ? Date.parse(publishedAt) : NaN;
  const ageHours = Number.isFinite(ts) ? (Date.now() - ts) / 3600000 : 0;
  const halfLife = halfLifeHours > 0 ? halfLifeHours : 72;
  return Math.exp(-ageHours / halfLife);
}

export function extractKeywords(text, limit = 4) {
  const counts = new Map();
  tokenize(text).forEach(token => {
    counts.set(token, (counts.get(token) || 0) + 1);
  });
  return Array.from(counts.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, limit)
    .map(([token]) => token);
}

export function buildExpirySummary(text) {
  const clean = normalizeText(text);
  if (!clean) return [];
  const sentences = clean.match(/[^.!?]+[.!?]+|[^.!?]+$/g) || [];
  const bullets = sentences.map(s => normalizeText(s)).filter(Boolean).slice(0, 3);
  return bullets;
}

export function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

export async function fetchWithRetry(url, options = {}, retry = {}) {
  const retries = Number(retry.retries ?? 2);
  const minDelayMs = Number(retry.minDelayMs ?? 600);
  const maxDelayMs = Number(retry.maxDelayMs ?? 4000);
  let attempt = 0;
  while (attempt <= retries) {
    try {
      return await fetch(url, options);
    } catch (err) {
      if (attempt >= retries) throw err;
      const delay = Math.min(maxDelayMs, minDelayMs * Math.pow(2, attempt));
      await sleep(delay);
    }
    attempt += 1;
  }
  throw new Error("fetch_failed");
}

export async function fetchText(url, { timeoutMs = 15000, headers = {}, retry = {} } = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const resp = await fetchWithRetry(url, {
      headers: { "User-Agent": "AikaSignals/1.0", ...headers },
      signal: controller.signal
    }, retry);
    if (!resp.ok) throw new Error(`fetch_failed_${resp.status}`);
    return await resp.text();
  } finally {
    clearTimeout(timer);
  }
}

export async function fetchJson(url, { timeoutMs = 15000, headers = {}, retry = {} } = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const resp = await fetchWithRetry(url, {
      headers: { "User-Agent": "AikaSignals/1.0", "Accept": "application/json", ...headers },
      signal: controller.signal
    }, retry);
    if (!resp.ok) throw new Error(`fetch_failed_${resp.status}`);
    return await resp.json();
  } finally {
    clearTimeout(timer);
  }
}

export function scoreByFreshnessReliability(freshness, reliability) {
  const f = Number.isFinite(freshness) ? freshness : 0;
  const r = Number.isFinite(reliability) ? reliability : 0.5;
  return f * (0.6 + r * 0.4);
}

export function dayKeyFromIso(iso) {
  if (!iso) return "";
  const ts = Date.parse(iso);
  if (!Number.isFinite(ts)) return "";
  const d = new Date(ts);
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${d.getFullYear()}-${m}-${day}`;
}

export function isEvergreen(doc) {
  const tags = Array.isArray(doc?.tags) ? doc.tags : [];
  return tags.includes("evergreen") || tags.includes("reference");
}

export function ensureArray(value) {
  if (Array.isArray(value)) return value;
  if (!value) return [];
  return [value];
}

export function buildDocHeader({ title, source, publishedAt, tags = [], signalTags = [] } = {}) {
  const lines = [];
  if (title) lines.push(`Title: ${title}`);
  if (source) lines.push(`Source: ${source}`);
  if (publishedAt) lines.push(`Published: ${publishedAt}`);
  if (tags.length) lines.push(`Tags: ${tags.join(", ")}`);
  if (signalTags.length) lines.push(`Signals: ${signalTags.join(", ")}`);
  return lines.join("\n");
}

