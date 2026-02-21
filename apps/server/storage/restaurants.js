import crypto from "node:crypto";
import { getDb } from "./db.js";
import { nowIso } from "./utils.js";

function makeId() {
  return crypto.randomUUID();
}

function normalizeTags(tags) {
  if (!Array.isArray(tags)) return [];
  return Array.from(new Set(tags.map(tag => String(tag || "").trim()).filter(Boolean)));
}

function normalizeArrayField(value) {
  if (!value) return [];
  if (Array.isArray(value)) return value;
  return [value];
}

function mapRestaurant(row) {
  if (!row) return null;
  return {
    restaurantId: row.restaurant_id,
    osmType: row.osm_type || "",
    osmId: row.osm_id || "",
    name: row.name || "",
    address: row.address || "",
    addressJson: row.address_json ? JSON.parse(row.address_json) : null,
    lat: row.lat,
    lon: row.lon,
    phone: row.phone || "",
    website: row.website || "",
    cuisineTags: row.cuisine_tags_json ? JSON.parse(row.cuisine_tags_json) : [],
    hours: row.hours_json ? JSON.parse(row.hours_json) : null,
    priceHint: row.price_hint || "",
    sourceRefs: row.source_refs_json ? JSON.parse(row.source_refs_json) : [],
    menuHash: row.menu_hash || "",
    hoursHash: row.hours_hash || "",
    menuUpdatedAt: row.menu_updated_at || "",
    hoursUpdatedAt: row.hours_updated_at || "",
    createdAt: row.created_at || "",
    updatedAt: row.updated_at || ""
  };
}

export function upsertRestaurant(record) {
  const db = getDb();
  const now = nowIso();
  const restaurantId = String(record.restaurant_id || record.restaurantId || "").trim();
  if (!restaurantId) throw new Error("restaurant_id_required");
  const existing = getRestaurantById(restaurantId);
  const cuisineTags = normalizeTags(record.cuisine_tags || record.cuisineTags || []);
  const sourceRefs = normalizeArrayField(record.source_refs || record.sourceRefs || []);
  const hours = record.hours || record.hours_json || null;
  const addressJson = record.address_json || record.addressJson || null;

  db.prepare(`
    INSERT INTO restaurants (
      restaurant_id, osm_type, osm_id, name, address, address_json, lat, lon,
      phone, website, cuisine_tags_json, hours_json, price_hint, source_refs_json,
      menu_hash, hours_hash, menu_updated_at, hours_updated_at, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(restaurant_id) DO UPDATE SET
      osm_type = excluded.osm_type,
      osm_id = excluded.osm_id,
      name = excluded.name,
      address = excluded.address,
      address_json = excluded.address_json,
      lat = excluded.lat,
      lon = excluded.lon,
      phone = excluded.phone,
      website = excluded.website,
      cuisine_tags_json = excluded.cuisine_tags_json,
      hours_json = excluded.hours_json,
      price_hint = excluded.price_hint,
      source_refs_json = excluded.source_refs_json,
      menu_hash = excluded.menu_hash,
      hours_hash = excluded.hours_hash,
      menu_updated_at = excluded.menu_updated_at,
      hours_updated_at = excluded.hours_updated_at,
      updated_at = excluded.updated_at
  `).run(
    restaurantId,
    record.osm_type || record.osmType || "",
    record.osm_id || record.osmId || "",
    record.name || "",
    record.address || "",
    addressJson ? JSON.stringify(addressJson) : "",
    record.lat ?? null,
    record.lon ?? null,
    record.phone || "",
    record.website || "",
    JSON.stringify(cuisineTags),
    hours ? JSON.stringify(hours) : "",
    record.price_hint || record.priceHint || "",
    JSON.stringify(sourceRefs),
    record.menu_hash || record.menuHash || (existing?.menuHash || ""),
    record.hours_hash || record.hoursHash || (existing?.hoursHash || ""),
    record.menu_updated_at || record.menuUpdatedAt || (existing?.menuUpdatedAt || ""),
    record.hours_updated_at || record.hoursUpdatedAt || (existing?.hoursUpdatedAt || ""),
    existing?.createdAt || now,
    now
  );
  return getRestaurantById(restaurantId);
}

export function getRestaurantById(id) {
  if (!id) return null;
  const db = getDb();
  const row = db.prepare("SELECT * FROM restaurants WHERE restaurant_id = ?").get(id);
  return mapRestaurant(row);
}

export function getRestaurantByWebsite(website) {
  if (!website) return null;
  const db = getDb();
  const row = db.prepare("SELECT * FROM restaurants WHERE website = ?").get(website);
  return mapRestaurant(row);
}

export function listRestaurants(limit = 200, offset = 0) {
  const db = getDb();
  const rows = db.prepare(`
    SELECT * FROM restaurants
    ORDER BY updated_at DESC
    LIMIT ? OFFSET ?
  `).all(Number(limit || 200), Number(offset || 0));
  return rows.map(mapRestaurant).filter(Boolean);
}

export function upsertRestaurantMenu({ restaurantId, menu, lastSeenAt } = {}) {
  const db = getDb();
  const id = String(restaurantId || "").trim();
  if (!id) throw new Error("restaurant_id_required");
  const now = lastSeenAt || nowIso();
  db.prepare(`
    INSERT INTO restaurant_menus (restaurant_id, menu_json, last_seen_at)
    VALUES (?, ?, ?)
    ON CONFLICT(restaurant_id) DO UPDATE SET
      menu_json = excluded.menu_json,
      last_seen_at = excluded.last_seen_at
  `).run(id, JSON.stringify(menu || {}), now);
  return { restaurantId: id, menu, lastSeenAt: now };
}

export function listRestaurantMenus(limit = 200, offset = 0) {
  const db = getDb();
  const rows = db.prepare(`
    SELECT * FROM restaurant_menus
    LIMIT ? OFFSET ?
  `).all(Number(limit || 200), Number(offset || 0));
  return rows.map(row => ({
    restaurantId: row.restaurant_id,
    menu: row.menu_json ? JSON.parse(row.menu_json) : null,
    lastSeenAt: row.last_seen_at || ""
  }));
}

export function addRestaurantMedia({ restaurantId, imageUrl, caption, sourceUrl } = {}) {
  const db = getDb();
  const id = makeId();
  const now = nowIso();
  db.prepare(`
    INSERT INTO restaurant_media (id, restaurant_id, image_url, caption, source_url, created_at)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run(id, restaurantId || "", imageUrl || "", caption || "", sourceUrl || "", now);
  return { id, restaurantId, imageUrl, caption, sourceUrl, createdAt: now };
}

export function listRestaurantMedia(restaurantId) {
  const db = getDb();
  const rows = db.prepare("SELECT * FROM restaurant_media WHERE restaurant_id = ?").all(restaurantId);
  return rows.map(row => ({
    id: row.id,
    restaurantId: row.restaurant_id,
    imageUrl: row.image_url,
    caption: row.caption,
    sourceUrl: row.source_url,
    createdAt: row.created_at
  }));
}

export function getRestaurantPageByUrl(url) {
  if (!url) return null;
  const db = getDb();
  const row = db.prepare("SELECT * FROM restaurant_pages WHERE url = ?").get(url);
  if (!row) return null;
  return {
    id: row.id,
    restaurantId: row.restaurant_id,
    url: row.url,
    docType: row.doc_type,
    title: row.title,
    status: row.status,
    etag: row.etag,
    lastModified: row.last_modified,
    contentHash: row.content_hash,
    httpStatus: row.http_status,
    error: row.error,
    lastCrawledAt: row.last_crawled_at,
    lastChangedAt: row.last_changed_at,
    crawlRunId: row.crawl_run_id
  };
}

export function upsertRestaurantPage({
  restaurantId,
  url,
  docType,
  title,
  status,
  etag,
  lastModified,
  contentHash,
  httpStatus,
  error,
  lastCrawledAt,
  lastChangedAt,
  crawlRunId
} = {}) {
  const db = getDb();
  if (!url) throw new Error("url_required");
  const id = crypto.createHash("sha1").update(url).digest("hex").slice(0, 16);
  const now = lastCrawledAt || nowIso();
  db.prepare(`
    INSERT INTO restaurant_pages (
      id, restaurant_id, url, doc_type, title, status, etag, last_modified,
      content_hash, http_status, error, last_crawled_at, last_changed_at, crawl_run_id
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(id) DO UPDATE SET
      restaurant_id = excluded.restaurant_id,
      doc_type = excluded.doc_type,
      title = excluded.title,
      status = excluded.status,
      etag = excluded.etag,
      last_modified = excluded.last_modified,
      content_hash = excluded.content_hash,
      http_status = excluded.http_status,
      error = excluded.error,
      last_crawled_at = excluded.last_crawled_at,
      last_changed_at = excluded.last_changed_at,
      crawl_run_id = excluded.crawl_run_id
  `).run(
    id,
    restaurantId || "",
    url,
    docType || "",
    title || "",
    status || "",
    etag || "",
    lastModified || "",
    contentHash || "",
    httpStatus ?? null,
    error || "",
    now,
    lastChangedAt || "",
    crawlRunId || ""
  );
  return getRestaurantPageByUrl(url);
}

export function addRestaurantDocumentChunk({
  chunkId,
  restaurantId,
  sourceUrl,
  docType,
  text,
  createdAt,
  contentHash,
  crawlRunId
} = {}) {
  const db = getDb();
  const now = createdAt || nowIso();
  db.prepare(`
    INSERT OR REPLACE INTO restaurant_document_chunks
      (chunk_id, restaurant_id, source_url, doc_type, text, created_at, content_hash, crawl_run_id)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    chunkId || "",
    restaurantId || "",
    sourceUrl || "",
    docType || "",
    text || "",
    now,
    contentHash || "",
    crawlRunId || ""
  );
  return { chunkId, restaurantId, sourceUrl, docType, text, createdAt: now, contentHash, crawlRunId };
}

export function createRestaurantCrawlRun() {
  const db = getDb();
  const id = makeId();
  const now = nowIso();
  db.prepare(`
    INSERT INTO restaurant_crawl_runs
      (id, started_at, status, restaurants_total, restaurants_new, restaurants_updated, pages_fetched, pages_skipped, chunks_upserted, errors_json)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(id, now, "running", 0, 0, 0, 0, 0, 0, JSON.stringify([]));
  return { id, startedAt: now, status: "running" };
}

export function updateRestaurantCrawlRun(id, patch = {}) {
  if (!id) return null;
  const db = getDb();
  const existing = db.prepare("SELECT * FROM restaurant_crawl_runs WHERE id = ?").get(id);
  if (!existing) return null;
  const next = {
    finished_at: patch.finishedAt || existing.finished_at,
    status: patch.status || existing.status,
    restaurants_total: patch.restaurantsTotal ?? existing.restaurants_total,
    restaurants_new: patch.restaurantsNew ?? existing.restaurants_new,
    restaurants_updated: patch.restaurantsUpdated ?? existing.restaurants_updated,
    pages_fetched: patch.pagesFetched ?? existing.pages_fetched,
    pages_skipped: patch.pagesSkipped ?? existing.pages_skipped,
    chunks_upserted: patch.chunksUpserted ?? existing.chunks_upserted,
    errors_json: JSON.stringify(patch.errors || (existing.errors_json ? JSON.parse(existing.errors_json) : []))
  };
  db.prepare(`
    UPDATE restaurant_crawl_runs SET
      finished_at = ?,
      status = ?,
      restaurants_total = ?,
      restaurants_new = ?,
      restaurants_updated = ?,
      pages_fetched = ?,
      pages_skipped = ?,
      chunks_upserted = ?,
      errors_json = ?
    WHERE id = ?
  `).run(
    next.finished_at,
    next.status,
    next.restaurants_total,
    next.restaurants_new,
    next.restaurants_updated,
    next.pages_fetched,
    next.pages_skipped,
    next.chunks_upserted,
    next.errors_json,
    id
  );
  return db.prepare("SELECT * FROM restaurant_crawl_runs WHERE id = ?").get(id);
}
