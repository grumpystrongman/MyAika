import { fetchTextWithMeta } from "./fetcher.js";
import { initMemory } from "../../memory.js";

const DEFAULT_NOMINATIM_URL = "https://nominatim.openstreetmap.org/search";
const DEFAULT_RADIUS_KM = Number(process.env.RESTAURANT_RADIUS_KM || process.env.DURHAM_RADIUS_KM || 15);

function normalizeText(value) {
  return String(value || "").trim();
}

function parseNumber(value) {
  const num = Number(value);
  return Number.isFinite(num) ? num : null;
}

function slugify(value) {
  return normalizeText(value)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function buildLocationQuery({ location, zip, city, state } = {}, defaultLocation) {
  if (location) return normalizeText(location);
  const parts = [];
  if (zip) parts.push(normalizeText(zip));
  if (city) parts.push(normalizeText(city));
  if (state) parts.push(normalizeText(state));
  const combined = parts.filter(Boolean).join(", ");
  if (combined) return combined;
  return normalizeText(defaultLocation);
}

function normalizeLocation(value) {
  return String(value || "")
    .trim()
    .replace(/^[,.\s]+|[,.\s]+$/g, "")
    .replace(/\s+/g, " ");
}

function extractLocationFromText(text) {
  const input = String(text || "").trim();
  if (!input) return null;
  const patterns = [
    /\b(?:i live in|my city is|my location is|i'm based in|i am based in|home base is)\s+([a-z0-9 ,.'-]{2,})$/i,
    /\b(?:location|city|home)\s*[:=-]\s*([a-z0-9 ,.'-]{2,})$/i
  ];
  for (const re of patterns) {
    const m = input.match(re);
    if (m?.[1]) return normalizeLocation(m[1]);
  }
  return null;
}

function getStoredHomeLocation() {
  let db = null;
  try {
    db = initMemory();
    const rows = db
      .prepare(
        `SELECT content, tags
         FROM memories
         WHERE lower(tags) LIKE '%location%'
            OR lower(content) LIKE '%live in%'
            OR lower(content) LIKE '%city is%'
            OR lower(content) LIKE 'home location:%'
         ORDER BY id DESC
         LIMIT 30`
      )
      .all();
    for (const row of rows) {
      const fromMemory = extractLocationFromText(row?.content || "");
      if (fromMemory) return fromMemory;
      const labeled = String(row?.content || "").match(/^home location:\s*(.+)$/i);
      if (labeled?.[1]) return normalizeLocation(labeled[1]);
    }
  } catch {
    // ignore lookup errors
  } finally {
    try {
      db?.close();
    } catch {
      // ignore close errors
    }
  }
  return null;
}

function bboxFromLatLon(lat, lon, radiusKm) {
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) return null;
  const km = Number.isFinite(radiusKm) ? radiusKm : DEFAULT_RADIUS_KM;
  const latDelta = km / 111.0;
  const lonDelta = km / (111.0 * Math.cos((lat * Math.PI) / 180) || 1);
  const south = lat - latDelta;
  const north = lat + latDelta;
  const west = lon - lonDelta;
  const east = lon + lonDelta;
  return [south, west, north, east];
}

export function buildRestaurantCollectionId({ label, city, state } = {}, fallback = "restaurants-local") {
  const base = slugify(label || [city, state].filter(Boolean).join(" ") || "");
  if (!base) return fallback;
  return `restaurants-${base}`;
}

export async function resolveRestaurantLocation({
  location,
  zip,
  city,
  state,
  bbox,
  lat,
  lon,
  radiusKm,
  fetchFn,
  userAgent = "AikaDurham/1.0",
  defaultLocation = ""
} = {}) {
  if (Array.isArray(bbox) && bbox.length === 4) {
    const parsed = bbox.map(parseNumber);
    if (parsed.every(val => Number.isFinite(val))) {
      return {
        bbox: parsed,
        lat: null,
        lon: null,
        city: normalizeText(city),
        state: normalizeText(state),
        postalCode: normalizeText(zip),
        label: normalizeText(location) || [city, state, zip].filter(Boolean).join(", "),
        source: "bbox"
      };
    }
  }

  if (!location && !zip && !city && !state) {
    const stored = getStoredHomeLocation();
    if (stored) {
      location = stored;
    }
  }

  const parsedLat = parseNumber(lat);
  const parsedLon = parseNumber(lon);
  if (Number.isFinite(parsedLat) && Number.isFinite(parsedLon)) {
    return {
      bbox: bboxFromLatLon(parsedLat, parsedLon, radiusKm),
      lat: parsedLat,
      lon: parsedLon,
      city: normalizeText(city),
      state: normalizeText(state),
      postalCode: normalizeText(zip),
      label: normalizeText(location) || [city, state, zip].filter(Boolean).join(", "),
      source: "latlon"
    };
  }

  const query = buildLocationQuery({ location, zip, city, state }, defaultLocation);
  if (!query) return null;

  const params = new URLSearchParams({
    q: query,
    format: "json",
    addressdetails: "1",
    limit: "1"
  });
  const url = `${DEFAULT_NOMINATIM_URL}?${params.toString()}`;
  const response = await fetchTextWithMeta(url, {
    headers: {
      "User-Agent": userAgent,
      "Accept": "application/json"
    },
    timeoutMs: 15000,
    retry: { retries: 2, minDelayMs: 800, maxDelayMs: 4000 },
    fetchFn
  });

  if (!response.ok) return null;
  let payload = [];
  try {
    payload = JSON.parse(response.text || "[]");
  } catch {
    payload = [];
  }
  if (!payload.length) return null;

  const first = payload[0];
  const box = Array.isArray(first?.boundingbox) ? first.boundingbox : null;
  let resolvedBbox = null;
  if (box && box.length === 4) {
    const south = parseNumber(box[0]);
    const north = parseNumber(box[1]);
    const west = parseNumber(box[2]);
    const east = parseNumber(box[3]);
    if ([south, west, north, east].every(val => Number.isFinite(val))) {
      resolvedBbox = [south, west, north, east];
    }
  }

  const address = first?.address || {};
  const resolvedCity = normalizeText(address.city || address.town || address.village || address.county || "");
  const resolvedState = normalizeText(address.state || address.region || "");
  const resolvedPostal = normalizeText(address.postcode || "");
  const resolvedLat = parseNumber(first?.lat);
  const resolvedLon = parseNumber(first?.lon);
  if (!resolvedBbox && Number.isFinite(resolvedLat) && Number.isFinite(resolvedLon)) {
    resolvedBbox = bboxFromLatLon(resolvedLat, resolvedLon, radiusKm);
  }

  return {
    bbox: resolvedBbox,
    lat: resolvedLat,
    lon: resolvedLon,
    city: resolvedCity,
    state: resolvedState,
    postalCode: resolvedPostal,
    label: normalizeText(first?.display_name || query),
    source: "nominatim"
  };
}
