import { initRagStore } from "../rag/vectorStore.js";
import { refreshMetaRag } from "../rag/metaRag.js";
import { normalizeText, hashContent } from "../signals/utils.js";
import {
  createRestaurantCrawlRun,
  updateRestaurantCrawlRun,
  upsertRestaurant,
  getRestaurantById,
  upsertRestaurantMenu,
  addRestaurantMedia,
  listRestaurantMedia
} from "../../storage/restaurants.js";
import { fetchRestaurantsByLocation, normalizeOverpassElements, dedupeRestaurants } from "./overpassClient.js";
import { resolveRestaurantLocation, buildRestaurantCollectionId } from "./location.js";
import { DomainScheduler } from "./scheduler.js";
import { crawlRestaurantSite } from "./crawler.js";
import { ingestRestaurantDocument } from "./ragIngest.js";

const DEFAULT_MAX_RESTAURANTS = Number(process.env.DURHAM_MAX_RESTAURANTS || process.env.RESTAURANT_MAX_RESTAURANTS || 120);
const DEFAULT_MAX_PAGES = Number(process.env.DURHAM_MAX_PAGES || process.env.RESTAURANT_MAX_PAGES || 20);
const DEFAULT_COLLECTION_ENV = String(process.env.RESTAURANT_RAG_COLLECTION_ID || process.env.DURHAM_RAG_COLLECTION_ID || "").trim();
const DEFAULT_MAX_CONCURRENT = Number(process.env.DURHAM_CRAWL_CONCURRENCY || process.env.RESTAURANT_CRAWL_CONCURRENCY || 6);
const DEFAULT_PER_DOMAIN = Number(process.env.DURHAM_CRAWL_PER_DOMAIN || process.env.RESTAURANT_CRAWL_PER_DOMAIN || 2);
const DEFAULT_DELAY_MS = Number(process.env.DURHAM_CRAWL_DELAY_MS || process.env.RESTAURANT_CRAWL_DELAY_MS || 800);
const DEFAULT_USER_AGENT = String(process.env.DURHAM_USER_AGENT || process.env.RESTAURANT_USER_AGENT || "AikaDurham/1.0");
const DEFAULT_LOCATION = String(
  process.env.RESTAURANT_DEFAULT_LOCATION
  || process.env.DURHAM_LOCATION
  || process.env.DEFAULT_WEATHER_LOCATION
  || "Durham, NC"
).trim();

const DISALLOWED_HOSTS = [
  "yelp.com",
  "tripadvisor.com",
  "opentable.com",
  "google.com",
  "maps.google.com",
  "goo.gl"
];

function nowIso() {
  return new Date().toISOString();
}

function isDisallowedWebsite(url) {
  if (!url) return true;
  try {
    const host = new URL(url).hostname.toLowerCase();
    return DISALLOWED_HOSTS.some(blocked => host === blocked || host.endsWith(`.${blocked}`));
  } catch {
    return true;
  }
}

function mergeUnique(...lists) {
  const seen = new Set();
  const result = [];
  lists.forEach(list => {
    (Array.isArray(list) ? list : []).forEach(item => {
      const value = normalizeText(item || "");
      if (!value || seen.has(value)) return;
      seen.add(value);
      result.push(value);
    });
  });
  return result;
}

function assignIfValue(target, key, value) {
  if (value === undefined || value === null) return;
  if (typeof value === "string") {
    const cleaned = value.trim();
    if (!cleaned) return;
    target[key] = cleaned;
    return;
  }
  if (typeof value === "number") {
    if (!Number.isFinite(value)) return;
    target[key] = value;
    return;
  }
  if (Array.isArray(value)) {
    if (!value.length) return;
    target[key] = value;
    return;
  }
  if (typeof value === "object") {
    if (!Object.keys(value).length) return;
    target[key] = value;
    return;
  }
  target[key] = value;
}

function normalizeMenuSections(sections = []) {
  const normalized = (Array.isArray(sections) ? sections : []).map(section => {
    const name = normalizeText(section?.name || "");
    const items = (Array.isArray(section?.items) ? section.items : []).map(item => ({
      name: normalizeText(item?.name || ""),
      description: normalizeText(item?.description || ""),
      price: normalizeText(item?.price || ""),
      diet_tags: mergeUnique(item?.diet_tags || item?.dietTags || [])
    })).filter(item => item.name);
    items.sort((a, b) => a.name.localeCompare(b.name));
    return { name: name || "Menu", items };
  }).filter(section => section.items?.length);
  normalized.sort((a, b) => a.name.localeCompare(b.name));
  return normalized;
}

function normalizeHours(hours = []) {
  const list = Array.isArray(hours) ? hours : [];
  const normalized = list.map(item => normalizeText(item)).filter(Boolean);
  return mergeUnique(normalized);
}

function hashMenuSections(sections = []) {
  const normalized = normalizeMenuSections(sections);
  if (!normalized.length) return "";
  return hashContent(JSON.stringify(normalized));
}

function hashHours(hours = []) {
  const normalized = normalizeHours(hours);
  if (!normalized.length) return "";
  return hashContent(JSON.stringify(normalized));
}

function mergeRestaurantRecord({ existing, candidate, patch, hours, menuHash, hoursHash } = {}) {
  const merged = {};
  const patchAddress = patch?.address || null;
  const patchAddressText = patchAddress?.formatted || patchAddress?.street || "";

  assignIfValue(merged, "restaurant_id", candidate?.restaurant_id || existing?.restaurantId || existing?.restaurant_id);
  assignIfValue(merged, "osm_type", candidate?.osm_type || existing?.osmType);
  assignIfValue(merged, "osm_id", candidate?.osm_id || existing?.osmId);
  assignIfValue(merged, "name", patch?.name || candidate?.name || existing?.name);
  assignIfValue(merged, "address", patchAddressText || candidate?.address || existing?.address);
  assignIfValue(merged, "address_json", patchAddress || existing?.addressJson || null);
  assignIfValue(merged, "lat", candidate?.lat ?? existing?.lat);
  assignIfValue(merged, "lon", candidate?.lon ?? existing?.lon);
  assignIfValue(merged, "phone", patch?.phone || candidate?.phone || existing?.phone);
  assignIfValue(merged, "website", candidate?.website || existing?.website);
  assignIfValue(merged, "price_hint", patch?.price_hint || candidate?.price_hint || existing?.priceHint);

  const cuisines = mergeUnique(existing?.cuisineTags || [], candidate?.cuisine_tags || [], patch?.cuisine_tags || []);
  assignIfValue(merged, "cuisine_tags", cuisines);

  const sources = mergeUnique(existing?.sourceRefs || [], candidate?.source_refs || [], patch?.source_refs || []);
  assignIfValue(merged, "source_refs", sources);

  if (Array.isArray(hours) && hours.length) {
    assignIfValue(merged, "hours", hours);
  }

  if (menuHash) {
    assignIfValue(merged, "menu_hash", menuHash);
  } else if (existing?.menuHash) {
    assignIfValue(merged, "menu_hash", existing.menuHash);
  }
  if (hoursHash) {
    assignIfValue(merged, "hours_hash", hoursHash);
  } else if (existing?.hoursHash) {
    assignIfValue(merged, "hours_hash", existing.hoursHash);
  }

  if (menuHash && menuHash !== existing?.menuHash) {
    assignIfValue(merged, "menu_updated_at", nowIso());
  } else if (existing?.menuUpdatedAt) {
    assignIfValue(merged, "menu_updated_at", existing.menuUpdatedAt);
  }
  if (hoursHash && hoursHash !== existing?.hoursHash) {
    assignIfValue(merged, "hours_updated_at", nowIso());
  } else if (existing?.hoursUpdatedAt) {
    assignIfValue(merged, "hours_updated_at", existing.hoursUpdatedAt);
  }

  return merged;
}

function mapDocType(docType) {
  const value = String(docType || "").toLowerCase();
  if (["menu", "hours", "news", "about"].includes(value)) return value;
  if (value === "general") return "about";
  return "about";
}

export async function runDurhamPipeline({
  overpassUrl,
  amenities,
  location,
  zip,
  city,
  state,
  bbox,
  lat,
  lon,
  radiusKm,
  limitRestaurants = DEFAULT_MAX_RESTAURANTS,
  maxPages = DEFAULT_MAX_PAGES,
  collectionId,
  fetchFn,
  userAgent = DEFAULT_USER_AGENT,
  schedulerOptions = {}
} = {}) {
  initRagStore();
  const run = createRestaurantCrawlRun();
  const summary = {
    run_id: run.id,
    status: "running",
    started_at: run.startedAt,
    finished_at: "",
    restaurants_total: 0,
    restaurants_new: 0,
    restaurants_updated: 0,
    pages_fetched: 0,
    pages_skipped: 0,
    pages_blocked: 0,
    chunks_upserted: 0,
    parse_failures: 0,
    location_label: "",
    location_bbox: null,
    errors: []
  };

  const scheduler = new DomainScheduler({
    maxConcurrent: schedulerOptions.maxConcurrent ?? DEFAULT_MAX_CONCURRENT,
    maxPerDomain: schedulerOptions.maxPerDomain ?? DEFAULT_PER_DOMAIN,
    minDelayMs: schedulerOptions.minDelayMs ?? DEFAULT_DELAY_MS
  });

  let ingestedDocs = 0;

  try {
    const resolvedLocation = await resolveRestaurantLocation({
      location,
      zip,
      city,
      state,
      bbox,
      lat,
      lon,
      radiusKm,
      fetchFn,
      userAgent,
      defaultLocation: DEFAULT_LOCATION
    });
    if (!resolvedLocation?.bbox) {
      throw new Error("location_not_resolved");
    }
    summary.location_label = resolvedLocation.label || "";
    summary.location_bbox = resolvedLocation.bbox;

    const resolvedCollectionId = collectionId
      || DEFAULT_COLLECTION_ENV
      || buildRestaurantCollectionId(resolvedLocation, "restaurants-local");

    const overpass = await fetchRestaurantsByLocation({
      overpassUrl,
      amenities,
      bbox: resolvedLocation.bbox,
      fetchFn
    });
    const normalized = normalizeOverpassElements(overpass?.elements || []);
    const deduped = dedupeRestaurants(normalized).slice(0, Math.max(1, Number(limitRestaurants || DEFAULT_MAX_RESTAURANTS)));
    summary.restaurants_total = deduped.length;
    updateRestaurantCrawlRun(run.id, { restaurantsTotal: summary.restaurants_total });

    for (const candidate of deduped) {
      const existing = getRestaurantById(candidate.restaurant_id);
      const isNew = !existing;

      const baseRecord = mergeRestaurantRecord({ existing, candidate, patch: {} });
      const saved = upsertRestaurant(baseRecord);
      if (isNew) summary.restaurants_new += 1;

      if (!saved?.website || isDisallowedWebsite(saved.website)) {
        continue;
      }

      let crawlResult;
      try {
        crawlResult = await crawlRestaurantSite({
          restaurant: { ...saved, restaurant_id: saved.restaurantId || saved.restaurant_id },
          crawlRunId: run.id,
          scheduler,
          maxPages,
          fetchFn,
          userAgent
        });
      } catch (err) {
        summary.errors.push({ restaurant_id: saved.restaurantId, error: err?.message || "crawl_failed" });
        continue;
      }

      const metrics = crawlResult?.metrics || {};
      summary.pages_fetched += metrics.fetched || 0;
      summary.pages_skipped += (metrics.skipped || 0);
      summary.pages_blocked += (metrics.blocked || 0);
      if (metrics.errors?.length) {
        metrics.errors.forEach(item => summary.errors.push({ restaurant_id: saved.restaurantId, ...item }));
      }

      const extracted = crawlResult?.extracted || {};
      const menuSections = normalizeMenuSections(extracted.menuSections || []);
      const hours = normalizeHours(extracted.restaurantPatch?.hours || extracted.hours || []);
      const menuHash = menuSections.length ? hashMenuSections(menuSections) : "";
      const hoursHash = hours.length ? hashHours(hours) : "";
      const patch = extracted.restaurantPatch || {};

      const mergedRecord = mergeRestaurantRecord({
        existing: saved,
        candidate,
        patch,
        hours,
        menuHash,
        hoursHash
      });

      const updatedRestaurant = upsertRestaurant(mergedRecord);
      if (!isNew) {
        const menuChanged = menuHash && menuHash !== existing?.menuHash;
        const hoursChanged = hoursHash && hoursHash !== existing?.hoursHash;
        const pageChanged = crawlResult?.pages?.some(page => page.changed);
        if (menuChanged || hoursChanged || pageChanged) summary.restaurants_updated += 1;
      }

      if (menuSections.length) {
        upsertRestaurantMenu({
          restaurantId: updatedRestaurant.restaurantId,
          menu: { sections: menuSections },
          lastSeenAt: nowIso()
        });
      }

      if (Array.isArray(extracted.images) && extracted.images.length) {
        const existingMedia = listRestaurantMedia(updatedRestaurant.restaurantId);
        const seen = new Set(existingMedia.map(item => item.imageUrl));
        extracted.images.forEach(img => {
          if (!img?.image_url || seen.has(img.image_url)) return;
          seen.add(img.image_url);
          addRestaurantMedia({
            restaurantId: updatedRestaurant.restaurantId,
            imageUrl: img.image_url,
            caption: img.caption || "",
            sourceUrl: img.source_url || ""
          });
        });
      }

      const pages = Array.isArray(crawlResult?.pages) ? crawlResult.pages : [];
      for (const page of pages) {
        if (!page?.text) {
          summary.parse_failures += 1;
          continue;
        }
        if (!page.changed) continue;
        const docType = mapDocType(page.docType);
        try {
          const ingestion = await ingestRestaurantDocument({
            restaurant: updatedRestaurant,
            sourceUrl: page.url,
            docType,
            text: page.text,
            crawlRunId: run.id,
            collectionId: resolvedCollectionId,
            lastUpdated: nowIso(),
            location: resolvedLocation,
            collectionLabel: resolvedLocation.label
          });
          if (ingestion?.ok && !ingestion?.skipped) {
            ingestedDocs += 1;
            summary.chunks_upserted += ingestion?.chunks || 0;
          } else if (!ingestion?.ok) {
            summary.parse_failures += 1;
          }
        } catch (err) {
          summary.errors.push({ restaurant_id: updatedRestaurant.restaurantId, url: page.url, error: err?.message || "ingest_failed" });
        }
      }
    }
  } catch (err) {
    summary.errors.push({ error: err?.message || "pipeline_failed" });
  }

  const finishedAt = nowIso();
  summary.finished_at = finishedAt;
  summary.status = summary.errors.length ? (summary.chunks_upserted ? "partial" : "error") : "ok";

  updateRestaurantCrawlRun(run.id, {
    finishedAt,
    status: summary.status,
    restaurantsTotal: summary.restaurants_total,
    restaurantsNew: summary.restaurants_new,
    restaurantsUpdated: summary.restaurants_updated,
    pagesFetched: summary.pages_fetched,
    pagesSkipped: summary.pages_skipped,
    chunksUpserted: summary.chunks_upserted,
    errors: summary.errors
  });

  if (ingestedDocs > 0) {
    refreshMetaRag().catch(() => {});
  }

  return summary;
}
