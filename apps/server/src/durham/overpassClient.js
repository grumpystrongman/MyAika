import crypto from "node:crypto";
import { normalizeText, normalizeUrl } from "../signals/utils.js";
import { fetchTextWithMeta } from "./fetcher.js";

const DEFAULT_OVERPASS_URL = "https://overpass-api.de/api/interpreter";
const DEFAULT_AMENITIES = ["restaurant", "cafe", "fast_food", "pub"];
const DEFAULT_AREA_NAME = "Durham";

function buildAddress(tags = {}) {
  if (!tags) return "";
  if (tags["addr:full"]) return normalizeText(tags["addr:full"]);
  const parts = [
    [tags["addr:housenumber"], tags["addr:street"]].filter(Boolean).join(" ").trim(),
    tags["addr:city"],
    tags["addr:state"],
    tags["addr:postcode"]
  ].filter(Boolean);
  return normalizeText(parts.join(", "));
}

function normalizePhone(value) {
  const cleaned = String(value || "").replace(/[^0-9+]/g, "");
  return cleaned || "";
}

function normalizeCuisine(tags = {}) {
  const raw = String(tags.cuisine || "");
  return raw
    .split(/[,;|]/)
    .map(part => normalizeText(part))
    .filter(Boolean);
}

function parseWebsite(tags = {}) {
  const raw = tags.website || tags["contact:website"] || tags.url || "";
  if (!raw) return "";
  if (raw.startsWith("http")) return normalizeUrl(raw);
  return normalizeUrl(`https://${raw}`);
}

function buildSourceRefs(type, id, website) {
  const refs = [];
  if (type && id) refs.push(`https://www.openstreetmap.org/${type}/${id}`);
  if (website) refs.push(website);
  return refs;
}

function hashSeed(value) {
  return crypto.createHash("sha1").update(String(value || "")).digest("hex").slice(0, 16);
}

export function buildOverpassQuery({ amenities = DEFAULT_AMENITIES, bbox, areaName } = {}) {
  const amenityList = amenities.join("|");
  const normalizedArea = String(areaName || DEFAULT_AREA_NAME).trim();
  if (Array.isArray(bbox) && bbox.length === 4) {
    const [south, west, north, east] = bbox.map(value => Number(value));
    if ([south, west, north, east].every(val => Number.isFinite(val))) {
      return `
[out:json][timeout:25];
(
  node["amenity"~"${amenityList}"](${south},${west},${north},${east});
  way["amenity"~"${amenityList}"](${south},${west},${north},${east});
  relation["amenity"~"${amenityList}"](${south},${west},${north},${east});
);
out tags center;`;
    }
  }

  return `
[out:json][timeout:25];
area["name"="${normalizedArea}"]["admin_level"="8"]["boundary"="administrative"]->.target;
(
  node["amenity"~"${amenityList}"](area.target);
  way["amenity"~"${amenityList}"](area.target);
  relation["amenity"~"${amenityList}"](area.target);
);
out tags center;`;
}

export function buildDurhamOverpassQuery({ amenities = DEFAULT_AMENITIES } = {}) {
  return buildOverpassQuery({ amenities, areaName: DEFAULT_AREA_NAME });
}

export async function fetchRestaurantsByLocation({ overpassUrl = DEFAULT_OVERPASS_URL, amenities, bbox, areaName, fetchFn } = {}) {
  const query = buildOverpassQuery({ amenities, bbox, areaName });
  const headers = { "Content-Type": "application/x-www-form-urlencoded" };
  const body = new URLSearchParams({ data: query }).toString();
  const response = await fetchTextWithMeta(overpassUrl, {
    method: "POST",
    headers,
    body,
    timeoutMs: 30000,
    retry: { retries: 3, minDelayMs: 1000, maxDelayMs: 8000 },
    fetchFn
  });
  if (!response.ok) {
    throw new Error(`overpass_failed_${response.status}`);
  }
  return JSON.parse(response.text || "{}");
}

export async function fetchDurhamRestaurants({ overpassUrl = DEFAULT_OVERPASS_URL, amenities, fetchFn } = {}) {
  return fetchRestaurantsByLocation({ overpassUrl, amenities, areaName: DEFAULT_AREA_NAME, fetchFn });
}

export function normalizeOverpassElements(elements = []) {
  const results = [];
  for (const el of elements || []) {
    const tags = el.tags || {};
    const name = normalizeText(tags.name || "");
    if (!name) continue;
    const lat = el.lat ?? el.center?.lat ?? null;
    const lon = el.lon ?? el.center?.lon ?? null;
    const website = parseWebsite(tags);
    const address = buildAddress(tags);
    const phone = normalizePhone(tags.phone || tags["contact:phone"] || "");
    const cuisineTags = normalizeCuisine(tags);
    const osmType = el.type || "";
    const osmId = el.id ? String(el.id) : "";
    const sourceRefs = buildSourceRefs(osmType, osmId, website);
    const restaurantId = `durham_${hashSeed(`${name}|${address}|${website}`)}`;
    results.push({
      restaurant_id: restaurantId,
      osm_type: osmType,
      osm_id: osmId,
      name,
      address,
      lat,
      lon,
      phone,
      website,
      cuisine_tags: cuisineTags,
      price_hint: tags["price"] || tags["price_range"] || tags["price:range"] || "",
      source_refs: sourceRefs,
      raw_tags: tags
    });
  }
  return results;
}

export function dedupeRestaurants(list = []) {
  const byKey = new Map();
  for (const item of list) {
    const domain = item.website ? new URL(item.website).hostname : "";
    const key = domain || `${item.name.toLowerCase()}|${item.address.toLowerCase()}`;
    const existing = byKey.get(key);
    if (!existing) {
      byKey.set(key, item);
      continue;
    }
    const score = (candidate) => {
      let value = 0;
      if (candidate.website) value += 3;
      if (candidate.phone) value += 2;
      if (candidate.address) value += 2;
      if (candidate.cuisine_tags?.length) value += 1;
      return value;
    };
    byKey.set(key, score(item) > score(existing) ? item : existing);
  }
  return Array.from(byKey.values());
}
