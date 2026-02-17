import Parser from "rss-parser";
import { fetchText, fetchJson, normalizeText, cleanText, extractHtmlTitle, extractMetaDescription, extractPublishedTime, parseDateValue, normalizeUrl } from "./utils.js";

const parser = new Parser();
const robotsCache = new Map();

async function allowsCrawl(url) {
  let origin = "";
  try {
    origin = new URL(url).origin;
  } catch {
    return true;
  }
  if (robotsCache.has(origin)) return robotsCache.get(origin);
  try {
    const resp = await fetch(`${origin}/robots.txt`, { headers: { "User-Agent": "AikaSignals/1.0" } });
    if (!resp.ok) {
      robotsCache.set(origin, true);
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
        inStar = value === "*";
        continue;
      }
      if (inStar && /^disallow$/i.test(key) && value === "/") {
        disallowAll = true;
        break;
      }
    }
    const allowed = !disallowAll;
    robotsCache.set(origin, allowed);
    return allowed;
  } catch {
    robotsCache.set(origin, true);
    return true;
  }
}

function normalizeItemUrl(item) {
  const raw = item?.link || item?.guid || item?.id || "";
  return normalizeUrl(raw) || "";
}

async function fetchRssItems(source, config) {
  const xml = await fetchText(source.url, {
    timeoutMs: config.defaults.fetchTimeoutMs,
    retry: config.defaults.retry
  });
  const feed = await parser.parseString(xml);
  const items = Array.isArray(feed.items) ? feed.items.slice(0, source.maxItemsPerFeed || config.defaults.maxItemsPerFeed) : [];
  const list = [];
  for (const item of items) {
    const canonicalUrl = normalizeItemUrl(item);
    const title = normalizeText(item.title || "") || feed.title || source.id;
    const summary = normalizeText(item.contentSnippet || item.summary || "");
    const content = normalizeText(item.content || item["content:encoded"] || summary);
    list.push({
      source_id: source.id,
      source_title: feed.title || source.id,
      source_url: source.url,
      canonical_url: canonicalUrl,
      title,
      summary,
      content,
      published_at: parseDateValue(item.isoDate || item.pubDate || ""),
      retrieved_at: new Date().toISOString(),
      language: source.language || config.defaults.language,
      category: source.category,
      tags: source.tags || [],
      allow_html: source.allow_html === true
    });
  }
  return list;
}

async function fetchHtmlItems(source, config) {
  if (!(await allowsCrawl(source.url))) return [];
  const html = await fetchText(source.url, {
    timeoutMs: config.defaults.fetchTimeoutMs,
    retry: config.defaults.retry
  });
  const title = extractHtmlTitle(html) || source.id;
  const summary = extractMetaDescription(html);
  const publishedRaw = extractPublishedTime(html);
  const publishedAt = parseDateValue(publishedRaw) || "";
  const content = cleanText(html);
  return [{
    source_id: source.id,
    source_title: source.id,
    source_url: source.url,
    canonical_url: normalizeUrl(source.url),
    title,
    summary,
    content,
    published_at: publishedAt,
    retrieved_at: new Date().toISOString(),
    language: source.language || config.defaults.language,
    category: source.category,
    tags: source.tags || [],
    allow_html: false
  }];
}

async function fetchNwsAlerts(source, config) {
  const data = await fetchJson(source.url, {
    timeoutMs: config.defaults.fetchTimeoutMs,
    retry: config.defaults.retry
  });
  const features = Array.isArray(data?.features) ? data.features : [];
  return features.map(feature => {
    const props = feature.properties || {};
    const title = normalizeText(props.headline || props.event || "Weather Alert");
    const description = normalizeText(props.description || "");
    const instruction = normalizeText(props.instruction || "");
    const summary = description || props.areaDesc || "";
    const content = [description, instruction].filter(Boolean).join("\n");
    return {
      source_id: source.id,
      source_title: source.id,
      source_url: source.url,
      canonical_url: normalizeUrl(props.web || feature.id || ""),
      title,
      summary,
      content,
      published_at: parseDateValue(props.sent || props.effective || ""),
      retrieved_at: new Date().toISOString(),
      language: source.language || config.defaults.language,
      category: source.category,
      tags: [...(source.tags || []), normalizeText(props.event || "").toLowerCase()].filter(Boolean),
      allow_html: false
    };
  });
}

async function fetchNasaFirms(source, config) {
  const apiKey = process.env.NASA_FIRMS_MAP_KEY || "";
  if (!apiKey) return [];
  const url = `https://firms.modaps.eosdis.nasa.gov/api/area/json/${apiKey}/VIIRS_SNPP_NRT/world/1`;
  const data = await fetchJson(url, {
    timeoutMs: config.defaults.fetchTimeoutMs,
    retry: config.defaults.retry
  });
  const items = Array.isArray(data) ? data : [];
  if (!items.length) return [];
  const count = items.length;
  const title = `NASA FIRMS wildfire hotspots (${count})`;
  const summary = `Detected ${count} wildfire hotspots in the past 24 hours.`;
  const content = summary;
  return [{
    source_id: source.id,
    source_title: source.id,
    source_url: url,
    canonical_url: url,
    title,
    summary,
    content,
    published_at: new Date().toISOString(),
    retrieved_at: new Date().toISOString(),
    language: source.language || config.defaults.language,
    category: source.category,
    tags: source.tags || [],
    allow_html: false
  }];
}

const ADAPTERS = {
  rss: fetchRssItems,
  html: fetchHtmlItems,
  nws_alerts: fetchNwsAlerts,
  nasa_firms: fetchNasaFirms
};

export async function fetchSourceItems(source, config) {
  const adapter = ADAPTERS[source.type] || ADAPTERS.rss;
  return adapter(source, config);
}

export function listAdapters() {
  return Object.keys(ADAPTERS);
}

