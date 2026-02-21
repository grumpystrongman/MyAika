import { normalizeUrl, hashContent, normalizeText, extractHtmlTitle } from "../signals/utils.js";
import { getRestaurantPageByUrl, upsertRestaurantPage } from "../../storage/restaurants.js";
import { fetchTextWithMeta, fetchBufferWithMeta } from "./fetcher.js";
import { getRobotsRules, isAllowedByRobots, getRobotsCrawlDelay } from "./robots.js";
import { extractJsonLd, parseRestaurantJsonLd, extractNavLinks, extractImages, classifyPage, extractReadableText, extractHoursFromHtml, extractMenuSectionsFromHtml } from "./parser.js";
import { extractPdfText } from "../trading/pdfUtils.js";

function nowIso() {
  return new Date().toISOString();
}

function getOrigin(url) {
  try {
    return new URL(url).origin;
  } catch {
    return "";
  }
}

function getDomain(url) {
  try {
    return new URL(url).hostname;
  } catch {
    return "";
  }
}

function isSameDomain(url, domain) {
  try {
    return new URL(url).hostname === domain;
  } catch {
    return false;
  }
}

function isPdfUrl(url) {
  return String(url || "").toLowerCase().includes(".pdf");
}

function mergeMenuSections(target, incoming) {
  const existing = Array.isArray(target) ? target : [];
  const incomingSections = Array.isArray(incoming) ? incoming : [];
  const merged = [...existing];
  incomingSections.forEach(section => {
    const key = normalizeText(section.name || "").toLowerCase();
    if (!key) return;
    const match = merged.find(item => normalizeText(item.name || "").toLowerCase() === key);
    if (!match) {
      merged.push(section);
    } else if (Array.isArray(section.items)) {
      const existingItems = new Set((match.items || []).map(item => normalizeText(item.name || "").toLowerCase()));
      section.items.forEach(item => {
        const itemKey = normalizeText(item.name || "").toLowerCase();
        if (!itemKey || existingItems.has(itemKey)) return;
        match.items = match.items || [];
        match.items.push(item);
        existingItems.add(itemKey);
      });
    }
  });
  return merged;
}

function mergeImages(target, incoming) {
  const existing = Array.isArray(target) ? target : [];
  const merged = [...existing];
  const seen = new Set(existing.map(img => img.image_url));
  incoming.forEach(img => {
    if (!img?.image_url || seen.has(img.image_url)) return;
    seen.add(img.image_url);
    merged.push(img);
  });
  return merged;
}

function mergeHours(target, incoming) {
  const existing = Array.isArray(target) ? target : [];
  const incomingList = Array.isArray(incoming) ? incoming : [];
  const merged = [...existing];
  const seen = new Set(existing.map(h => normalizeText(h).toLowerCase()));
  incomingList.forEach(hour => {
    const key = normalizeText(hour).toLowerCase();
    if (!key || seen.has(key)) return;
    seen.add(key);
    merged.push(hour);
  });
  return merged;
}

function normalizeLinks(links, domain) {
  const list = Array.isArray(links) ? links : [];
  return list
    .map(link => ({
      url: normalizeUrl(link.url),
      text: normalizeText(link.text || "")
    }))
    .filter(link => link.url && isSameDomain(link.url, domain));
}

function classifyFromLink(url, text) {
  const lower = `${url} ${text}`.toLowerCase();
  if (/(menu|eat|food|dining|brunch|lunch|dinner|drinks)/.test(lower)) return "menu";
  if (/(hours|location|contact|visit|directions)/.test(lower)) return "hours";
  if (/(about|story|team|chef)/.test(lower)) return "about";
  if (/(news|press|blog|events)/.test(lower)) return "news";
  return "general";
}

export async function crawlRestaurantSite({
  restaurant,
  crawlRunId,
  scheduler,
  maxPages = 20,
  fetchFn,
  userAgent = "AikaDurham/1.0"
} = {}) {
  const website = restaurant?.website || "";
  if (!website) {
    return { pages: [], metrics: { skipped: 0, fetched: 0, blocked: 0, errors: [] } };
  }
  const startUrl = normalizeUrl(website) || website;
  const domain = getDomain(startUrl);
  const origin = getOrigin(startUrl);
  const visited = new Set();
  const queue = [{ url: startUrl, depth: 0, hint: "general" }];
  const metrics = { fetched: 0, skipped: 0, blocked: 0, errors: [] };
  const pages = [];
  const extracted = {
    menuSections: [],
    hours: [],
    images: [],
    restaurantPatch: {}
  };

  const robots = await getRobotsRules(origin, { fetchFn, userAgent });
  const crawlDelay = getRobotsCrawlDelay(robots, "*");
  if (crawlDelay && scheduler) scheduler.setDomainDelay(domain, Math.max(800, crawlDelay * 1000));

  while (queue.length && pages.length < maxPages) {
    const item = queue.shift();
    const url = item?.url;
    if (!url || visited.has(url)) continue;
    visited.add(url);
    if (!isSameDomain(url, domain)) continue;

    if (!isAllowedByRobots(url, robots, "*")) {
      metrics.blocked += 1;
      continue;
    }

    const pageState = getRestaurantPageByUrl(url);
    const headers = {
      "User-Agent": userAgent,
      "Accept": "text/html,application/xhtml+xml,application/pdf;q=0.9,*/*;q=0.8"
    };
    if (pageState?.etag) headers["If-None-Match"] = pageState.etag;
    if (pageState?.lastModified) headers["If-Modified-Since"] = pageState.lastModified;

    const fetchTask = async () => {
      if (isPdfUrl(url)) {
        return await fetchBufferWithMeta(url, { headers, timeoutMs: 20000, retry: { retries: 2 }, fetchFn });
      }
      return await fetchTextWithMeta(url, { headers, timeoutMs: 20000, retry: { retries: 2 }, fetchFn });
    };

    let response;
    try {
      response = scheduler ? await scheduler.schedule(url, fetchTask) : await fetchTask();
    } catch (err) {
      metrics.errors.push({ url, error: err?.message || "fetch_failed" });
      upsertRestaurantPage({
        restaurantId: restaurant.restaurant_id,
        url,
        status: "error",
        error: err?.message || "fetch_failed",
        httpStatus: null,
        lastCrawledAt: nowIso(),
        crawlRunId
      });
      continue;
    }

    if (response.status === 304) {
      metrics.skipped += 1;
      upsertRestaurantPage({
        restaurantId: restaurant.restaurant_id,
        url,
        status: "not_modified",
        etag: response.etag,
        lastModified: response.lastModified,
        httpStatus: response.status,
        lastCrawledAt: nowIso(),
        crawlRunId
      });
      continue;
    }

    if (!response.ok) {
      metrics.errors.push({ url, error: `http_${response.status}` });
      upsertRestaurantPage({
        restaurantId: restaurant.restaurant_id,
        url,
        status: "error",
        etag: response.etag,
        lastModified: response.lastModified,
        httpStatus: response.status,
        error: `http_${response.status}`,
        lastCrawledAt: nowIso(),
        crawlRunId
      });
      continue;
    }

    const contentType = response.contentType || "";
    const isPdf = contentType.includes("pdf") || isPdfUrl(url);
    let text = "";
    let title = "";
    let docType = item.hint || "general";
    let menuSections = [];
    let hours = [];
    let images = [];

    if (isPdf) {
      const buffer = response.buffer;
      const pdfText = buffer ? await extractPdfText(buffer, { maxPages: 6, maxChars: 20000 }) : null;
      text = normalizeText(pdfText?.text || "");
      docType = docType === "general" ? "menu" : docType;
    } else {
      const html = response.text || "";
      const jsonLd = extractJsonLd(html);
      const parsedLd = parseRestaurantJsonLd(jsonLd);
      if (parsedLd.restaurant) {
        extracted.restaurantPatch = {
          ...extracted.restaurantPatch,
          ...parsedLd.restaurant
        };
        if (Array.isArray(parsedLd.restaurant.hours) && parsedLd.restaurant.hours.length) {
          extracted.hours = mergeHours(extracted.hours, parsedLd.restaurant.hours);
          hours = parsedLd.restaurant.hours;
        }
      }
      if (parsedLd.menuSections?.length) {
        extracted.menuSections = mergeMenuSections(extracted.menuSections, parsedLd.menuSections);
        menuSections = parsedLd.menuSections;
      }
      if (parsedLd.images?.length) {
        extracted.images = mergeImages(extracted.images, parsedLd.images.map(img => ({ ...img, source_url: url })));
        images = parsedLd.images;
      }

      const navLinks = normalizeLinks(extractNavLinks(html, url), domain);
      const htmlTitle = extractHtmlTitle(html);
      title = normalizeText(parsedLd.restaurant?.name || "") || htmlTitle || "";
      docType = classifyPage({ url, title, navLinks });

      const readable = extractReadableText(html);
      text = readable;
      if (docType === "menu" && !parsedLd.menuSections?.length) {
        const menuFallback = extractMenuSectionsFromHtml(html);
        if (menuFallback.length) {
          extracted.menuSections = mergeMenuSections(extracted.menuSections, menuFallback);
          menuSections = menuFallback;
        }
      }
      if (docType === "hours" && !parsedLd.restaurant?.hours?.length) {
        const hoursFallback = extractHoursFromHtml(html);
        if (hoursFallback.length) {
          extracted.hours = mergeHours(extracted.hours, hoursFallback);
          hours = hoursFallback;
        }
      }

      navLinks.forEach(link => {
        const hint = classifyFromLink(link.url, link.text);
        if (!visited.has(link.url) && queue.length < maxPages * 3) {
          queue.push({ url: link.url, depth: item.depth + 1, hint });
        }
      });

      images = mergeImages(images, extractImages(html, url).map(img => ({ ...img, source_url: url })));
    }

    const contentHash = hashContent(text || response.text || "");
    const changed = !pageState?.contentHash || pageState.contentHash !== contentHash;
    const lastChangedAt = changed ? nowIso() : (pageState?.lastChangedAt || "");

    upsertRestaurantPage({
      restaurantId: restaurant.restaurant_id,
      url,
      docType,
      title,
      status: changed ? "changed" : "unchanged",
      etag: response.etag,
      lastModified: response.lastModified,
      contentHash,
      httpStatus: response.status,
      error: "",
      lastCrawledAt: nowIso(),
      lastChangedAt,
      crawlRunId
    });

    metrics.fetched += 1;
    pages.push({
      url,
      docType,
      text,
      title,
      contentHash,
      changed,
      menuSections,
      hours,
      images
    });
  }

  return { pages, metrics, extracted };
}
