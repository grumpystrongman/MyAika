import fs from "node:fs";
import path from "node:path";
import Database from "better-sqlite3";
import * as sqliteVec from "sqlite-vec";

let db = null;
let vecEnabled = false;
let cachedDim = null;
let hnswIndex = null;
let hnswMeta = { nextLabel: 0, chunkIdToLabel: {}, labelToChunkId: {} };
let hnswDirty = false;
let hnswInitialized = false;

function resolveRepoRoot() {
  const cwd = process.cwd();
  const candidate = path.join(cwd, "apps", "server");
  if (fs.existsSync(candidate)) return cwd;
  return path.resolve(cwd, "..", "..");
}

const repoRoot = resolveRepoRoot();
const defaultDbPath = path.join(repoRoot, "apps", "server", "data", "aika_rag.sqlite");
const envPath = process.env.RAG_SQLITE_PATH || "";
const dbPath = envPath
  ? (path.isAbsolute(envPath) ? envPath : path.join(repoRoot, envPath))
  : defaultDbPath;
const dataDir = path.dirname(dbPath);
const hnswDir = path.join(dataDir, "rag_hnsw");
const hnswIndexPath = path.join(hnswDir, "index.bin");
const hnswMetaPath = path.join(hnswDir, "index.json");

function ensureDir(dir) {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

function nowIso() {
  return new Date().toISOString();
}

function toBlob(vec) {
  const f32 = vec instanceof Float32Array ? vec : Float32Array.from(vec || []);
  return Buffer.from(f32.buffer);
}

function bufferToFloat32(buffer) {
  if (!buffer) return new Float32Array();
  return new Float32Array(buffer.buffer, buffer.byteOffset, Math.floor(buffer.byteLength / 4));
}

function ensureSchema() {
  db.exec(`
    CREATE TABLE IF NOT EXISTS rag_meta (
      key TEXT PRIMARY KEY,
      value TEXT
    );

    CREATE TABLE IF NOT EXISTS meetings (
      id TEXT PRIMARY KEY,
      title TEXT,
      occurred_at TEXT,
      participants_json TEXT,
      source_group TEXT,
      source_url TEXT,
      raw_transcript TEXT,
      created_at TEXT
    );

    CREATE TABLE IF NOT EXISTS chunks (
      chunk_id TEXT PRIMARY KEY,
      meeting_id TEXT,
      chunk_index INTEGER,
      speaker TEXT,
      start_time REAL,
      end_time REAL,
      text TEXT,
      token_count INTEGER,
      created_at TEXT,
      FOREIGN KEY(meeting_id) REFERENCES meetings(id)
    );

    CREATE TABLE IF NOT EXISTS meeting_summaries (
      meeting_id TEXT PRIMARY KEY,
      summary_json TEXT,
      decisions_json TEXT,
      tasks_json TEXT,
      risks_json TEXT,
      next_steps_json TEXT,
      created_at TEXT,
      updated_at TEXT,
      FOREIGN KEY(meeting_id) REFERENCES meetings(id)
    );

    CREATE TABLE IF NOT EXISTS meeting_emails (
      meeting_id TEXT PRIMARY KEY,
      to_json TEXT,
      subject TEXT,
      sent_at TEXT,
      status TEXT,
      error TEXT,
      FOREIGN KEY(meeting_id) REFERENCES meetings(id)
    );

    CREATE TABLE IF NOT EXISTS meeting_notifications (
      meeting_id TEXT,
      channel TEXT,
      to_json TEXT,
      sent_at TEXT,
      status TEXT,
      error TEXT,
      PRIMARY KEY (meeting_id, channel)
    );

    CREATE TABLE IF NOT EXISTS chunk_embeddings (
      chunk_id TEXT PRIMARY KEY,
      embedding BLOB
    );

    CREATE TABLE IF NOT EXISTS trading_sources (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      collection_id TEXT,
      url TEXT,
      tags_json TEXT,
      enabled INTEGER,
      created_at TEXT,
      updated_at TEXT,
      last_crawled_at TEXT,
      last_status TEXT,
      last_error TEXT,
      UNIQUE(collection_id, url)
    );

    CREATE TABLE IF NOT EXISTS trading_rss_sources (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      collection_id TEXT,
      url TEXT,
      title TEXT,
      tags_json TEXT,
      enabled INTEGER,
      include_foreign INTEGER,
      created_at TEXT,
      updated_at TEXT,
      last_crawled_at TEXT,
      last_status TEXT,
      last_error TEXT,
      UNIQUE(collection_id, url)
    );

    CREATE TABLE IF NOT EXISTS rag_collections (
      id TEXT PRIMARY KEY,
      title TEXT,
      description TEXT,
      kind TEXT,
      created_at TEXT,
      updated_at TEXT
    );

    CREATE TABLE IF NOT EXISTS trading_rss_items (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      source_id INTEGER,
      guid TEXT,
      url TEXT,
      title TEXT,
      published_at TEXT,
      seen_at TEXT,
      decision TEXT,
      reason TEXT,
      content_hash TEXT,
      UNIQUE(source_id, guid),
      FOREIGN KEY(source_id) REFERENCES trading_rss_sources(id)
    );

    CREATE INDEX IF NOT EXISTS idx_chunks_meeting ON chunks(meeting_id);
    CREATE INDEX IF NOT EXISTS idx_meetings_date ON meetings(occurred_at);
    CREATE INDEX IF NOT EXISTS idx_trading_sources_enabled ON trading_sources(enabled);
    CREATE INDEX IF NOT EXISTS idx_trading_rss_sources_enabled ON trading_rss_sources(enabled);
  `);
}

function ensureColumn(table, column, definition) {
  const cols = db.prepare(`PRAGMA table_info(${table})`).all().map(row => row.name);
  if (!cols.includes(column)) {
    db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`);
  }
}

function ensureMigrations() {
  ensureColumn("meeting_summaries", "decisions_json", "TEXT");
  ensureColumn("meeting_summaries", "tasks_json", "TEXT");
  ensureColumn("meeting_summaries", "risks_json", "TEXT");
  ensureColumn("meeting_summaries", "next_steps_json", "TEXT");
  ensureColumn("meeting_summaries", "updated_at", "TEXT");
  ensureColumn("meeting_emails", "error", "TEXT");
  ensureColumn("meetings", "source_group", "TEXT");
  ensureColumn("trading_sources", "collection_id", "TEXT");
  ensureColumn("trading_rss_sources", "collection_id", "TEXT");
  ensureColumn("trading_rss_sources", "tags_json", "TEXT");
  ensureColumn("trading_rss_sources", "include_foreign", "INTEGER");
  ensureColumn("trading_rss_sources", "updated_at", "TEXT");
  ensureColumn("trading_rss_sources", "last_crawled_at", "TEXT");
  ensureColumn("trading_rss_sources", "last_status", "TEXT");
  ensureColumn("trading_rss_sources", "last_error", "TEXT");
  ensureColumn("trading_rss_items", "published_at", "TEXT");
  ensureColumn("trading_rss_items", "decision", "TEXT");
  ensureColumn("trading_rss_items", "reason", "TEXT");
  ensureColumn("trading_rss_items", "content_hash", "TEXT");
  migrateTradingSourcesSchema();
  migrateTradingRssSourcesSchema();
}

function hasUniqueIndex(table, columns = []) {
  const indexes = db.prepare(`PRAGMA index_list(${table})`).all();
  for (const idx of indexes) {
    if (!idx.unique) continue;
    const info = db.prepare(`PRAGMA index_info(${idx.name})`).all();
    const cols = info.map(row => row.name);
    if (cols.length !== columns.length) continue;
    if (columns.every((col, i) => cols[i] === col)) return true;
  }
  return false;
}

function migrateTradingSourcesSchema() {
  const cols = db.prepare("PRAGMA table_info(trading_sources)").all();
  if (!cols.length) return;
  const hasComposite = hasUniqueIndex("trading_sources", ["collection_id", "url"]);
  const hasLegacy = hasUniqueIndex("trading_sources", ["url"]);
  if (hasComposite || !hasLegacy) return;
  db.exec("BEGIN");
  try {
    db.exec("ALTER TABLE trading_sources RENAME TO trading_sources_old");
    db.exec(`
      CREATE TABLE trading_sources (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        collection_id TEXT,
        url TEXT,
        tags_json TEXT,
        enabled INTEGER,
        created_at TEXT,
        updated_at TEXT,
        last_crawled_at TEXT,
        last_status TEXT,
        last_error TEXT,
        UNIQUE(collection_id, url)
      );
    `);
    db.exec(`
      INSERT INTO trading_sources (id, collection_id, url, tags_json, enabled, created_at, updated_at, last_crawled_at, last_status, last_error)
      SELECT id, COALESCE(collection_id, 'trading'), url, tags_json, enabled, created_at, updated_at, last_crawled_at, last_status, last_error
      FROM trading_sources_old;
    `);
    db.exec("DROP TABLE trading_sources_old");
    db.exec("CREATE INDEX IF NOT EXISTS idx_trading_sources_enabled ON trading_sources(enabled)");
    db.exec("COMMIT");
  } catch (err) {
    db.exec("ROLLBACK");
    throw err;
  }
}

function migrateTradingRssSourcesSchema() {
  const cols = db.prepare("PRAGMA table_info(trading_rss_sources)").all();
  if (!cols.length) return;
  const hasComposite = hasUniqueIndex("trading_rss_sources", ["collection_id", "url"]);
  const hasLegacy = hasUniqueIndex("trading_rss_sources", ["url"]);
  if (hasComposite || !hasLegacy) return;
  db.exec("BEGIN");
  try {
    db.exec("ALTER TABLE trading_rss_sources RENAME TO trading_rss_sources_old");
    db.exec(`
      CREATE TABLE trading_rss_sources (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        collection_id TEXT,
        url TEXT,
        title TEXT,
        tags_json TEXT,
        enabled INTEGER,
        include_foreign INTEGER,
        created_at TEXT,
        updated_at TEXT,
        last_crawled_at TEXT,
        last_status TEXT,
        last_error TEXT,
        UNIQUE(collection_id, url)
      );
    `);
    db.exec(`
      INSERT INTO trading_rss_sources (id, collection_id, url, title, tags_json, enabled, include_foreign, created_at, updated_at, last_crawled_at, last_status, last_error)
      SELECT id, COALESCE(collection_id, 'trading'), url, title, tags_json, enabled, include_foreign, created_at, updated_at, last_crawled_at, last_status, last_error
      FROM trading_rss_sources_old;
    `);
    db.exec("DROP TABLE trading_rss_sources_old");
    db.exec("CREATE INDEX IF NOT EXISTS idx_trading_rss_sources_enabled ON trading_rss_sources(enabled)");
    db.exec("COMMIT");
  } catch (err) {
    db.exec("ROLLBACK");
    throw err;
  }
}

function getMeta(key) {
  const row = db.prepare("SELECT value FROM rag_meta WHERE key = ?").get(key);
  return row?.value || null;
}

function setMeta(key, value) {
  db.prepare("INSERT INTO rag_meta (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value")
    .run(key, value);
}

export function getRagMeta(key) {
  initRagStore();
  return getMeta(key);
}

export function setRagMeta(key, value) {
  initRagStore();
  setMeta(key, value);
}

function ensureVecTable(dim) {
  if (!vecEnabled) return;
  const stored = getMeta("embedding_dim");
  if (stored && Number(stored) !== dim) {
    throw new Error(`embedding_dim_mismatch_${stored}_${dim}`);
  }
  if (!stored) setMeta("embedding_dim", String(dim));
  db.exec(`CREATE VIRTUAL TABLE IF NOT EXISTS chunk_vectors USING vec0(
    chunk_id TEXT PRIMARY KEY,
    embedding float[${dim}]
  );`);
}

export function initRagStore() {
  if (db) return { db, vecEnabled };
  ensureDir(dataDir);
  db = new Database(dbPath);
  db.pragma("journal_mode = WAL");
  db.pragma("foreign_keys = ON");
  ensureSchema();
  ensureMigrations();
  try {
    sqliteVec.load(db);
    vecEnabled = true;
  } catch (err) {
    vecEnabled = false;
    console.warn("sqlite-vec load failed, using HNSW fallback:", err?.message || err);
  }
  return { db, vecEnabled };
}

export function getVectorStoreStatus() {
  initRagStore();
  return { vecEnabled, dbPath };
}

export function getMeeting(meetingId) {
  initRagStore();
  return db.prepare("SELECT * FROM meetings WHERE id = ?").get(meetingId) || null;
}

export function countChunksForMeeting(meetingId) {
  initRagStore();
  const row = db.prepare("SELECT COUNT(*) AS count FROM chunks WHERE meeting_id = ?").get(meetingId);
  return row?.count || 0;
}

export function upsertMeeting(meeting) {
  initRagStore();
  const now = nowIso();
  db.prepare(`
    INSERT INTO meetings (id, title, occurred_at, participants_json, source_group, source_url, raw_transcript, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(id) DO UPDATE SET
      title = excluded.title,
      occurred_at = excluded.occurred_at,
      participants_json = excluded.participants_json,
      source_group = excluded.source_group,
      source_url = excluded.source_url,
      raw_transcript = excluded.raw_transcript
  `).run(
    meeting.id,
    meeting.title || "",
    meeting.occurred_at || "",
    meeting.participants_json || "",
    meeting.source_group || "",
    meeting.source_url || "",
    meeting.raw_transcript || "",
    meeting.created_at || now
  );
}

export function deleteMeetingChunks(meetingId) {
  initRagStore();
  const chunkIds = db.prepare("SELECT chunk_id FROM chunks WHERE meeting_id = ?").all(meetingId).map(r => r.chunk_id);
  if (!chunkIds.length) return 0;
  const placeholders = chunkIds.map(() => "?").join(",");
  db.prepare("DELETE FROM chunks WHERE meeting_id = ?").run(meetingId);
  if (vecEnabled) {
    db.prepare(`DELETE FROM chunk_vectors WHERE chunk_id IN (${placeholders})`).run(...chunkIds);
  } else {
    db.prepare(`DELETE FROM chunk_embeddings WHERE chunk_id IN (${placeholders})`).run(...chunkIds);
    hnswDirty = true;
  }
  return chunkIds.length;
}

export function deleteMeetingById(meetingId) {
  initRagStore();
  deleteMeetingChunks(meetingId);
  db.prepare("DELETE FROM meeting_summaries WHERE meeting_id = ?").run(meetingId);
  db.prepare("DELETE FROM meeting_emails WHERE meeting_id = ?").run(meetingId);
  db.prepare("DELETE FROM meeting_notifications WHERE meeting_id = ?").run(meetingId);
  db.prepare("DELETE FROM meetings WHERE id = ?").run(meetingId);
}

export function deleteMeetingsBySourceGroup(sourceGroup) {
  initRagStore();
  const ids = db.prepare("SELECT id FROM meetings WHERE source_group = ?").all(sourceGroup).map(r => r.id);
  ids.forEach(id => deleteMeetingById(id));
  return ids.length;
}

function normalizeTradingSourceRow(row) {
  if (!row) return null;
  return {
    id: row.id,
    collection_id: row.collection_id || "trading",
    url: row.url,
    tags: row.tags_json ? JSON.parse(row.tags_json) : [],
    enabled: Boolean(row.enabled),
    created_at: row.created_at,
    updated_at: row.updated_at,
    last_crawled_at: row.last_crawled_at,
    last_status: row.last_status,
    last_error: row.last_error
  };
}

export function listTradingSources({ limit = 100, offset = 0, search = "", includeDisabled = true, collectionId = "trading" } = {}) {
  initRagStore();
  const where = [];
  const params = [];
  if (collectionId) {
    if (collectionId === "trading") {
      where.push("(collection_id = ? OR collection_id IS NULL)");
      params.push(collectionId);
    } else {
      where.push("collection_id = ?");
      params.push(collectionId);
    }
  }
  if (!includeDisabled) {
    where.push("enabled = 1");
  }
  if (search) {
    where.push("url LIKE ?");
    params.push(`%${search}%`);
  }
  const whereSql = where.length ? `WHERE ${where.join(" AND ")}` : "";
  const rows = db.prepare(`
    SELECT * FROM trading_sources
    ${whereSql}
    ORDER BY created_at DESC
    LIMIT ? OFFSET ?
  `).all(...params, Number(limit || 100), Number(offset || 0));
  return rows.map(normalizeTradingSourceRow).filter(Boolean);
}

export function getTradingSource(id) {
  initRagStore();
  const row = db.prepare("SELECT * FROM trading_sources WHERE id = ?").get(id);
  return normalizeTradingSourceRow(row);
}

export function getTradingSourceByUrl(url, { collectionId = "trading" } = {}) {
  initRagStore();
  let row = null;
  if (collectionId === "trading") {
    row = db.prepare("SELECT * FROM trading_sources WHERE url = ? AND (collection_id = ? OR collection_id IS NULL)").get(url, collectionId);
  } else {
    row = db.prepare("SELECT * FROM trading_sources WHERE url = ? AND collection_id = ?").get(url, collectionId);
  }
  return normalizeTradingSourceRow(row);
}

export function upsertTradingSource({ url, tags = [], enabled = true, collectionId = "trading" }) {
  initRagStore();
  const now = nowIso();
  db.prepare(`
    INSERT INTO trading_sources (collection_id, url, tags_json, enabled, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?)
    ON CONFLICT(collection_id, url) DO UPDATE SET
      collection_id = excluded.collection_id,
      tags_json = excluded.tags_json,
      enabled = excluded.enabled,
      updated_at = excluded.updated_at
  `).run(
    collectionId,
    url,
    JSON.stringify(tags || []),
    enabled ? 1 : 0,
    now,
    now
  );
  return getTradingSourceByUrl(url, { collectionId });
}

export function updateTradingSource(id, { tags, enabled } = {}) {
  initRagStore();
  const existing = getTradingSource(id);
  if (!existing) return null;
  const nextTags = tags ? JSON.stringify(tags) : JSON.stringify(existing.tags || []);
  const nextEnabled = enabled == null ? (existing.enabled ? 1 : 0) : (enabled ? 1 : 0);
  const now = nowIso();
  db.prepare(`
    UPDATE trading_sources
    SET tags_json = ?, enabled = ?, updated_at = ?
    WHERE id = ?
  `).run(nextTags, nextEnabled, now, id);
  return getTradingSource(id);
}

export function deleteTradingSource(id) {
  initRagStore();
  db.prepare("DELETE FROM trading_sources WHERE id = ?").run(id);
}

export function markTradingSourceCrawl({ id, status = "ok", error = "", crawledAt } = {}) {
  initRagStore();
  const now = crawledAt || nowIso();
  db.prepare(`
    UPDATE trading_sources
    SET last_crawled_at = ?, last_status = ?, last_error = ?, updated_at = ?
    WHERE id = ?
  `).run(now, status, error || "", now, id);
}

function normalizeTradingRssRow(row) {
  if (!row) return null;
  return {
    id: row.id,
    collection_id: row.collection_id || "trading",
    url: row.url,
    title: row.title || "",
    tags: row.tags_json ? JSON.parse(row.tags_json) : [],
    enabled: Boolean(row.enabled),
    include_foreign: Boolean(row.include_foreign),
    created_at: row.created_at,
    updated_at: row.updated_at,
    last_crawled_at: row.last_crawled_at,
    last_status: row.last_status,
    last_error: row.last_error
  };
}

export function listTradingRssSources({ limit = 100, offset = 0, search = "", includeDisabled = true, collectionId = "trading" } = {}) {
  initRagStore();
  const where = [];
  const params = [];
  if (collectionId) {
    if (collectionId === "trading") {
      where.push("(collection_id = ? OR collection_id IS NULL)");
      params.push(collectionId);
    } else {
      where.push("collection_id = ?");
      params.push(collectionId);
    }
  }
  if (!includeDisabled) {
    where.push("enabled = 1");
  }
  if (search) {
    where.push("url LIKE ? OR title LIKE ?");
    params.push(`%${search}%`, `%${search}%`);
  }
  const whereSql = where.length ? `WHERE ${where.join(" AND ")}` : "";
  const rows = db.prepare(`
    SELECT * FROM trading_rss_sources
    ${whereSql}
    ORDER BY created_at DESC
    LIMIT ? OFFSET ?
  `).all(...params, Number(limit || 100), Number(offset || 0));
  return rows.map(normalizeTradingRssRow).filter(Boolean);
}

export function getTradingRssSource(id) {
  initRagStore();
  const row = db.prepare("SELECT * FROM trading_rss_sources WHERE id = ?").get(id);
  return normalizeTradingRssRow(row);
}

export function getTradingRssSourceByUrl(url, { collectionId = "trading" } = {}) {
  initRagStore();
  let row = null;
  if (collectionId === "trading") {
    row = db.prepare("SELECT * FROM trading_rss_sources WHERE url = ? AND (collection_id = ? OR collection_id IS NULL)").get(url, collectionId);
  } else {
    row = db.prepare("SELECT * FROM trading_rss_sources WHERE url = ? AND collection_id = ?").get(url, collectionId);
  }
  return normalizeTradingRssRow(row);
}

export function upsertTradingRssSource({ url, title = "", tags = [], enabled = true, includeForeign = false, collectionId = "trading" } = {}) {
  initRagStore();
  const now = nowIso();
  db.prepare(`
    INSERT INTO trading_rss_sources (collection_id, url, title, tags_json, enabled, include_foreign, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(collection_id, url) DO UPDATE SET
      collection_id = excluded.collection_id,
      title = excluded.title,
      tags_json = excluded.tags_json,
      enabled = excluded.enabled,
      include_foreign = excluded.include_foreign,
      updated_at = excluded.updated_at
  `).run(
    collectionId,
    url,
    title || "",
    JSON.stringify(tags || []),
    enabled ? 1 : 0,
    includeForeign ? 1 : 0,
    now,
    now
  );
  return getTradingRssSourceByUrl(url, { collectionId });
}

export function updateTradingRssSource(id, { title, tags, enabled, includeForeign } = {}) {
  initRagStore();
  const existing = getTradingRssSource(id);
  if (!existing) return null;
  const nextTags = tags ? JSON.stringify(tags) : JSON.stringify(existing.tags || []);
  const nextEnabled = enabled == null ? (existing.enabled ? 1 : 0) : (enabled ? 1 : 0);
  const nextIncludeForeign = includeForeign == null ? (existing.include_foreign ? 1 : 0) : (includeForeign ? 1 : 0);
  const now = nowIso();
  db.prepare(`
    UPDATE trading_rss_sources
    SET title = ?, tags_json = ?, enabled = ?, include_foreign = ?, updated_at = ?
    WHERE id = ?
  `).run(title ?? existing.title, nextTags, nextEnabled, nextIncludeForeign, now, id);
  return getTradingRssSource(id);
}

export function deleteTradingRssSource(id) {
  initRagStore();
  db.prepare("DELETE FROM trading_rss_sources WHERE id = ?").run(id);
  db.prepare("DELETE FROM trading_rss_items WHERE source_id = ?").run(id);
}

export function markTradingRssCrawl({ id, status = "ok", error = "", crawledAt } = {}) {
  initRagStore();
  const now = crawledAt || nowIso();
  db.prepare(`
    UPDATE trading_rss_sources
    SET last_crawled_at = ?, last_status = ?, last_error = ?, updated_at = ?
    WHERE id = ?
  `).run(now, status, error || "", now, id);
}

export function hasTradingRssItem({ sourceId, guid }) {
  initRagStore();
  const row = db.prepare("SELECT id FROM trading_rss_items WHERE source_id = ? AND guid = ?").get(sourceId, guid);
  return Boolean(row?.id);
}

export function recordTradingRssItem({ sourceId, guid, url, title, publishedAt, decision, reason, contentHash } = {}) {
  initRagStore();
  const now = nowIso();
  db.prepare(`
    INSERT OR IGNORE INTO trading_rss_items
      (source_id, guid, url, title, published_at, seen_at, decision, reason, content_hash)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    sourceId,
    guid,
    url || "",
    title || "",
    publishedAt || "",
    now,
    decision || "",
    reason || "",
    contentHash || ""
  );
}

export function listTradingRssItems({ sourceId, limit = 50 } = {}) {
  initRagStore();
  const where = [];
  const params = [];
  if (sourceId) {
    where.push("source_id = ?");
    params.push(sourceId);
  }
  const whereSql = where.length ? `WHERE ${where.join(" AND ")}` : "";
  const rows = db.prepare(`
    SELECT * FROM trading_rss_items
    ${whereSql}
    ORDER BY published_at DESC
    LIMIT ?
  `).all(...params, Number(limit || 50));
  return rows;
}

export function listRagCollections({ limit = 100, offset = 0 } = {}) {
  initRagStore();
  const rows = db.prepare(`
    SELECT * FROM rag_collections
    ORDER BY created_at DESC
    LIMIT ? OFFSET ?
  `).all(Number(limit || 100), Number(offset || 0));
  return rows.map(row => ({
    id: row.id,
    title: row.title || "",
    description: row.description || "",
    kind: row.kind || "custom",
    created_at: row.created_at,
    updated_at: row.updated_at
  }));
}

export function getRagCollection(id) {
  initRagStore();
  const row = db.prepare("SELECT * FROM rag_collections WHERE id = ?").get(id);
  if (!row) return null;
  return {
    id: row.id,
    title: row.title || "",
    description: row.description || "",
    kind: row.kind || "custom",
    created_at: row.created_at,
    updated_at: row.updated_at
  };
}

export function upsertRagCollection({ id, title = "", description = "", kind = "custom" } = {}) {
  initRagStore();
  const now = nowIso();
  db.prepare(`
    INSERT INTO rag_collections (id, title, description, kind, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?)
    ON CONFLICT(id) DO UPDATE SET
      title = excluded.title,
      description = excluded.description,
      kind = excluded.kind,
      updated_at = excluded.updated_at
  `).run(id, title, description, kind, now, now);
  return getRagCollection(id);
}

export function deleteRagCollection(id) {
  initRagStore();
  db.prepare("DELETE FROM rag_collections WHERE id = ?").run(id);
}

export function upsertChunks(chunks) {
  initRagStore();
  if (!chunks?.length) return 0;
  const now = nowIso();
  const stmt = db.prepare(`
    INSERT INTO chunks (chunk_id, meeting_id, chunk_index, speaker, start_time, end_time, text, token_count, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(chunk_id) DO UPDATE SET
      meeting_id = excluded.meeting_id,
      chunk_index = excluded.chunk_index,
      speaker = excluded.speaker,
      start_time = excluded.start_time,
      end_time = excluded.end_time,
      text = excluded.text,
      token_count = excluded.token_count
  `);
  const tx = db.transaction(items => {
    for (const chunk of items) {
      stmt.run(
        chunk.chunk_id,
        chunk.meeting_id,
        chunk.chunk_index,
        chunk.speaker || "",
        chunk.start_time,
        chunk.end_time,
        chunk.text || "",
        chunk.token_count || 0,
        chunk.created_at || now
      );
    }
  });
  tx(chunks);
  return chunks.length;
}

export function upsertMeetingSummary({ meetingId, summary }) {
  initRagStore();
  const now = nowIso();
  const decisions = summary?.decisions || summary?.summary?.decisions || [];
  const tasks = summary?.actionItems || summary?.tasks || [];
  const risks = summary?.risks || [];
  const nextSteps = summary?.nextSteps || [];
  db.prepare(`
    INSERT INTO meeting_summaries (meeting_id, summary_json, decisions_json, tasks_json, risks_json, next_steps_json, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(meeting_id) DO UPDATE SET
      summary_json = excluded.summary_json,
      decisions_json = excluded.decisions_json,
      tasks_json = excluded.tasks_json,
      risks_json = excluded.risks_json,
      next_steps_json = excluded.next_steps_json,
      updated_at = excluded.updated_at
  `).run(
    meetingId,
    JSON.stringify(summary || {}),
    JSON.stringify(decisions),
    JSON.stringify(tasks),
    JSON.stringify(risks),
    JSON.stringify(nextSteps),
    now,
    now
  );
}

export function getMeetingSummary(meetingId) {
  initRagStore();
  const row = db.prepare("SELECT * FROM meeting_summaries WHERE meeting_id = ?").get(meetingId);
  if (!row) return null;
  return {
    summary: row.summary_json ? JSON.parse(row.summary_json) : null,
    decisions: row.decisions_json ? JSON.parse(row.decisions_json) : [],
    tasks: row.tasks_json ? JSON.parse(row.tasks_json) : [],
    risks: row.risks_json ? JSON.parse(row.risks_json) : [],
    nextSteps: row.next_steps_json ? JSON.parse(row.next_steps_json) : []
  };
}

export function recordMeetingEmail({ meetingId, to, subject, status, error = "", sentAt }) {
  initRagStore();
  db.prepare(`
    INSERT INTO meeting_emails (meeting_id, to_json, subject, sent_at, status, error)
    VALUES (?, ?, ?, ?, ?, ?)
    ON CONFLICT(meeting_id) DO UPDATE SET
      to_json = excluded.to_json,
      subject = excluded.subject,
      sent_at = excluded.sent_at,
      status = excluded.status,
      error = excluded.error
  `).run(
    meetingId,
    JSON.stringify(to || []),
    subject || "",
    sentAt || nowIso(),
    status || "",
    error || ""
  );
}

export function getMeetingEmail(meetingId) {
  initRagStore();
  const row = db.prepare("SELECT * FROM meeting_emails WHERE meeting_id = ?").get(meetingId);
  if (!row) return null;
  return {
    to: row.to_json ? JSON.parse(row.to_json) : [],
    subject: row.subject,
    sent_at: row.sent_at,
    status: row.status,
    error: row.error
  };
}

export function recordMeetingNotification({ meetingId, channel, to, status, error = "", sentAt }) {
  initRagStore();
  db.prepare(`
    INSERT INTO meeting_notifications (meeting_id, channel, to_json, sent_at, status, error)
    VALUES (?, ?, ?, ?, ?, ?)
    ON CONFLICT(meeting_id, channel) DO UPDATE SET
      to_json = excluded.to_json,
      sent_at = excluded.sent_at,
      status = excluded.status,
      error = excluded.error
  `).run(
    meetingId,
    channel,
    JSON.stringify(to || []),
    sentAt || nowIso(),
    status || "",
    error || ""
  );
}

export function getMeetingNotification(meetingId, channel) {
  initRagStore();
  const row = db.prepare("SELECT * FROM meeting_notifications WHERE meeting_id = ? AND channel = ?").get(meetingId, channel);
  if (!row) return null;
  return {
    to: row.to_json ? JSON.parse(row.to_json) : [],
    sent_at: row.sent_at,
    status: row.status,
    error: row.error
  };
}

async function ensureHnswIndex(dim) {
  if (hnswInitialized) return;
  const mod = await import("hnswlib-node");
  const HierarchicalNSW = mod.HierarchicalNSW || mod.default?.HierarchicalNSW || mod.default || mod;
  hnswIndex = new HierarchicalNSW("cosine", dim);
  hnswInitialized = true;

  if (fs.existsSync(hnswIndexPath) && fs.existsSync(hnswMetaPath)) {
    try {
      const metaRaw = fs.readFileSync(hnswMetaPath, "utf-8");
      hnswMeta = metaRaw ? JSON.parse(metaRaw) : hnswMeta;
      hnswIndex.readIndexSync(hnswIndexPath);
      hnswDirty = false;
      return;
    } catch {
      hnswDirty = true;
    }
  } else {
    hnswDirty = true;
  }

  if (hnswDirty) {
    await rebuildHnswIndex(dim);
  }
}

async function rebuildHnswIndex(dim) {
  const mod = await import("hnswlib-node");
  const HierarchicalNSW = mod.HierarchicalNSW || mod.default?.HierarchicalNSW || mod.default || mod;
  hnswIndex = new HierarchicalNSW("cosine", dim);
  const rows = db.prepare("SELECT chunk_id, embedding FROM chunk_embeddings").all();
  const maxElements = Math.max(rows.length + 100, Number(process.env.RAG_HNSW_MAX_ELEMENTS || 10000));
  const m = Number(process.env.RAG_HNSW_M || 16);
  const ef = Number(process.env.RAG_HNSW_EF_CONSTRUCTION || 200);
  hnswIndex.initIndex(maxElements, m, ef);
  const efSearch = Number(process.env.RAG_HNSW_EF_SEARCH || 64);
  hnswIndex.setEfSearch(efSearch);
  hnswMeta = { nextLabel: 0, chunkIdToLabel: {}, labelToChunkId: {} };
  for (const row of rows) {
    const label = hnswMeta.nextLabel++;
    hnswMeta.chunkIdToLabel[row.chunk_id] = label;
    hnswMeta.labelToChunkId[label] = row.chunk_id;
    const vec = bufferToFloat32(row.embedding);
    hnswIndex.addPoint(vec, label);
  }
  ensureDir(hnswDir);
  hnswIndex.writeIndexSync(hnswIndexPath);
  fs.writeFileSync(hnswMetaPath, JSON.stringify(hnswMeta, null, 2));
  hnswDirty = false;
}

export async function upsertVectors(chunks, embeddings) {
  initRagStore();
  if (!chunks?.length || !embeddings?.length) return 0;
  const dim = embeddings[0]?.length || 0;
  cachedDim = cachedDim || dim;
  if (vecEnabled) ensureVecTable(dim);
  const stmt = vecEnabled
    ? db.prepare("INSERT OR REPLACE INTO chunk_vectors (chunk_id, embedding) VALUES (?, ?)")
    : db.prepare("INSERT OR REPLACE INTO chunk_embeddings (chunk_id, embedding) VALUES (?, ?)");

  const tx = db.transaction(items => {
    for (const item of items) {
      stmt.run(item.chunk_id, toBlob(item.embedding));
    }
  });
  const items = chunks.map((chunk, idx) => ({ chunk_id: chunk.chunk_id, embedding: embeddings[idx] }));
  tx(items);

  if (!vecEnabled) {
    await ensureHnswIndex(dim);
    for (const item of items) {
      if (hnswMeta.chunkIdToLabel[item.chunk_id] !== undefined) continue;
      const label = hnswMeta.nextLabel++;
      hnswMeta.chunkIdToLabel[item.chunk_id] = label;
      hnswMeta.labelToChunkId[label] = item.chunk_id;
      const vec = item.embedding instanceof Float32Array ? item.embedding : Float32Array.from(item.embedding);
      hnswIndex.addPoint(vec, label);
      hnswDirty = true;
    }
  }

  return items.length;
}

export async function persistHnsw() {
  if (!hnswDirty || !hnswIndex) return;
  ensureDir(hnswDir);
  hnswIndex.writeIndexSync(hnswIndexPath);
  fs.writeFileSync(hnswMetaPath, JSON.stringify(hnswMeta, null, 2));
  hnswDirty = false;
}

export async function searchChunkIds(embedding, topK = 8) {
  initRagStore();
  const vec = embedding instanceof Float32Array ? embedding : Float32Array.from(embedding || []);
  if (!vec.length) return [];
  if (vecEnabled) {
    ensureVecTable(vec.length);
    const stmt = db.prepare("SELECT chunk_id, distance FROM chunk_vectors WHERE embedding MATCH ? ORDER BY distance LIMIT ?");
    return stmt.all(toBlob(vec), topK);
  }

  await ensureHnswIndex(vec.length);
  if (!hnswIndex) return [];
  const result = hnswIndex.searchKnn(vec, topK);
  const labels = result?.neighbors || [];
  const distances = result?.distances || [];
  return labels.map((label, idx) => ({
    chunk_id: hnswMeta.labelToChunkId[label],
    distance: distances[idx]
  })).filter(item => item.chunk_id);
}

export function getChunksByIds(chunkIds = [], filters = {}) {
  initRagStore();
  if (!chunkIds.length) return [];
  const where = [];
  const params = [];
  const placeholders = chunkIds.map(() => "?").join(",");
  where.push(`c.chunk_id IN (${placeholders})`);
  params.push(...chunkIds);
  if (filters?.meetingId) {
    where.push("c.meeting_id = ?");
    params.push(filters.meetingId);
  }
  if (filters?.titleContains) {
    where.push("m.title LIKE ?");
    params.push(`%${filters.titleContains}%`);
  }
  if (filters?.meetingIdPrefix) {
    where.push("c.meeting_id LIKE ?");
    params.push(`${filters.meetingIdPrefix}%`);
  }
  if (filters?.meetingType) {
    const type = String(filters.meetingType || "").toLowerCase();
    if (type === "memory") {
      where.push("m.id LIKE 'memory:%'");
    } else if (type === "feedback") {
      where.push("m.id LIKE 'feedback:%'");
    } else if (type === "recording" || type === "recordings") {
      where.push("m.id LIKE 'recording:%'");
    } else if (type === "trading") {
      where.push("m.id LIKE 'trading:%'");
    } else if (type === "fireflies") {
      where.push("m.id NOT LIKE 'memory:%'");
      where.push("m.id NOT LIKE 'feedback:%'");
      where.push("m.id NOT LIKE 'recording:%'");
      where.push("m.id NOT LIKE 'trading:%'");
      where.push("m.id NOT LIKE 'rag:%'");
    } else if (type === "custom") {
      where.push("m.id LIKE 'rag:%'");
    }
  }
  if (filters?.dateFrom) {
    where.push("m.occurred_at >= ?");
    params.push(filters.dateFrom);
  }
  if (filters?.dateTo) {
    where.push("m.occurred_at <= ?");
    params.push(filters.dateTo);
  }

  const sql = `
    SELECT c.chunk_id, c.meeting_id, c.chunk_index, c.speaker, c.start_time, c.end_time, c.text, c.token_count,
           m.title AS meeting_title, m.occurred_at, m.source_url
    FROM chunks c
    JOIN meetings m ON m.id = c.meeting_id
    WHERE ${where.join(" AND ")}
  `;
  return db.prepare(sql).all(...params);
}

export function listMeetingSummaries({ dateFrom, dateTo, limit = 20, meetingType = "", meetingIdPrefix = "" } = {}) {
  initRagStore();
  const where = [];
  const params = [];
  if (dateFrom) {
    where.push("m.occurred_at >= ?");
    params.push(dateFrom);
  }
  if (dateTo) {
    where.push("m.occurred_at <= ?");
    params.push(dateTo);
  }
  if (meetingIdPrefix) {
    where.push("m.id LIKE ?");
    params.push(`${meetingIdPrefix}%`);
  }
  if (meetingType) {
    const type = String(meetingType || "").toLowerCase();
    if (type === "memory") {
      where.push("m.id LIKE 'memory:%'");
    } else if (type === "feedback") {
      where.push("m.id LIKE 'feedback:%'");
    } else if (type === "recording" || type === "recordings") {
      where.push("m.id LIKE 'recording:%'");
    } else if (type === "trading") {
      where.push("m.id LIKE 'trading:%'");
    } else if (type === "fireflies") {
      where.push("m.id NOT LIKE 'memory:%'");
      where.push("m.id NOT LIKE 'feedback:%'");
      where.push("m.id NOT LIKE 'recording:%'");
      where.push("m.id NOT LIKE 'trading:%'");
      where.push("m.id NOT LIKE 'rag:%'");
    } else if (type === "custom") {
      where.push("m.id LIKE 'rag:%'");
    }
  }
  const whereSql = where.length ? `WHERE ${where.join(" AND ")}` : "";
  const sql = `
    SELECT m.id, m.title, m.occurred_at, m.source_url,
           ms.summary_json, ms.decisions_json, ms.tasks_json, ms.next_steps_json
    FROM meetings m
    LEFT JOIN meeting_summaries ms ON ms.meeting_id = m.id
    ${whereSql}
    ORDER BY m.occurred_at DESC
    LIMIT ?
  `;
  return db.prepare(sql).all(...params, Number(limit || 20));
}

export function listMeetings({ type = "all", limit = 20, offset = 0, search = "", participant = "", meetingIdPrefix = "" } = {}) {
  initRagStore();
  const where = [];
  const params = [];
  const normalizedType = String(type || "all").toLowerCase();

  if (normalizedType === "memory") {
    where.push("m.id LIKE 'memory:%'");
  } else if (normalizedType === "feedback") {
    where.push("m.id LIKE 'feedback:%'");
  } else if (normalizedType === "recordings" || normalizedType === "recording") {
    where.push("m.id LIKE 'recording:%'");
  } else if (normalizedType === "trading") {
    where.push("m.id LIKE 'trading:%'");
  } else if (normalizedType === "fireflies") {
    where.push("m.id NOT LIKE 'memory:%'");
    where.push("m.id NOT LIKE 'feedback:%'");
    where.push("m.id NOT LIKE 'recording:%'");
    where.push("m.id NOT LIKE 'trading:%'");
  }

  if (search) {
    where.push("(m.title LIKE ? OR m.raw_transcript LIKE ?)");
    params.push(`%${search}%`, `%${search}%`);
  }
  if (participant) {
    where.push("m.participants_json LIKE ?");
    params.push(`%${participant}%`);
  }
  if (meetingIdPrefix) {
    where.push("m.id LIKE ?");
    params.push(`${meetingIdPrefix}%`);
  }

  const whereSql = where.length ? `WHERE ${where.join(" AND ")}` : "";
  const sql = `
    SELECT m.id, m.title, m.occurred_at, m.source_url, m.participants_json,
           ms.summary_json, ms.decisions_json, ms.tasks_json, ms.next_steps_json
    FROM meetings m
    LEFT JOIN meeting_summaries ms ON ms.meeting_id = m.id
    ${whereSql}
    ORDER BY m.occurred_at DESC
    LIMIT ? OFFSET ?
  `;
  return db.prepare(sql).all(...params, Number(limit || 20), Number(offset || 0));
}

export function listMeetingsRaw({ type = "all", limit = 200, offset = 0, search = "", meetingIdPrefix = "" } = {}) {
  initRagStore();
  const where = [];
  const params = [];
  const normalizedType = String(type || "all").toLowerCase();

  if (normalizedType === "memory") {
    where.push("m.id LIKE 'memory:%'");
  } else if (normalizedType === "feedback") {
    where.push("m.id LIKE 'feedback:%'");
  } else if (normalizedType === "recordings" || normalizedType === "recording") {
    where.push("m.id LIKE 'recording:%'");
  } else if (normalizedType === "trading") {
    where.push("m.id LIKE 'trading:%'");
  } else if (normalizedType === "fireflies") {
    where.push("m.id NOT LIKE 'memory:%'");
    where.push("m.id NOT LIKE 'feedback:%'");
    where.push("m.id NOT LIKE 'recording:%'");
    where.push("m.id NOT LIKE 'trading:%'");
  }

  if (search) {
    where.push("(m.title LIKE ? OR m.raw_transcript LIKE ?)");
    params.push(`%${search}%`, `%${search}%`);
  }
  if (meetingIdPrefix) {
    where.push("m.id LIKE ?");
    params.push(`${meetingIdPrefix}%`);
  }

  const whereSql = where.length ? `WHERE ${where.join(" AND ")}` : "";
  const sql = `
    SELECT m.id, m.title, m.occurred_at, m.source_url, m.source_group, m.raw_transcript, m.created_at, m.participants_json
    FROM meetings m
    ${whereSql}
    ORDER BY m.occurred_at DESC
    LIMIT ? OFFSET ?
  `;
  return db.prepare(sql).all(...params, Number(limit || 200), Number(offset || 0));
}

export function getSnippetsForMeetings(meetingIds = [], { term = "", limit = 6 } = {}) {
  initRagStore();
  if (!meetingIds.length) return [];
  const placeholders = meetingIds.map(() => "?").join(",");
  const where = [`c.meeting_id IN (${placeholders})`];
  const params = [...meetingIds];
  if (term) {
    where.push("c.text LIKE ?");
    params.push(`%${term}%`);
  }
  const sql = `
    SELECT c.chunk_id, c.meeting_id, c.text,
           m.title AS meeting_title, m.occurred_at
    FROM chunks c
    JOIN meetings m ON m.id = c.meeting_id
    WHERE ${where.join(" AND ")}
    ORDER BY LENGTH(c.text) DESC
    LIMIT ?
  `;
  return db.prepare(sql).all(...params, Number(limit || 6));
}

const FIREFLIES_STOPWORDS = new Set([
  "a", "an", "and", "are", "as", "at", "be", "but", "by", "for", "from", "has", "have", "if", "in", "is", "it",
  "its", "of", "on", "or", "that", "the", "to", "was", "were", "will", "with", "you", "your", "our", "we", "they",
  "meeting", "sync", "notes", "recap", "call", "demo",
  "mp3", "aac", "am", "pm",
  "jan", "january", "feb", "february", "mar", "march", "apr", "april",
  "may", "jun", "june", "jul", "july", "aug", "august", "sep", "sept",
  "september", "oct", "october", "nov", "november", "dec", "december"
]);

function extractTitleTopics(title = "", limit = 3) {
  const tokens = String(title || "")
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .map(token => token.trim())
    .filter(token => token.length > 2 && token.length <= 18 && !FIREFLIES_STOPWORDS.has(token))
    .filter(token => !/^\\d+$/.test(token))
    .filter(token => !/^[a-f0-9]{8,}$/.test(token));
  const uniq = [];
  for (const token of tokens) {
    if (!uniq.includes(token)) uniq.push(token);
    if (uniq.length >= limit) break;
  }
  return uniq;
}

export function getFirefliesGraph({ limit = 500 } = {}) {
  const rows = listMeetingsRaw({ type: "fireflies", limit });
  const nodeCounts = new Map();
  const linkCounts = new Map();
  const participantCounts = new Map();
  const topicCounts = new Map();

  for (const row of rows) {
    let participants = [];
    if (row?.participants_json) {
      try {
        const parsed = JSON.parse(row.participants_json);
        if (Array.isArray(parsed)) participants = parsed.map(item => String(item || "").trim()).filter(Boolean);
      } catch {
        participants = [];
      }
    }
    const topics = extractTitleTopics(row?.title || "");
    const participantNodes = participants.slice(0, 8);
    const topicNodes = topics.slice(0, 3).map(topic => `#${topic}`);
    const nodes = Array.from(new Set([...participantNodes, ...topicNodes]));

    nodes.forEach(node => {
      nodeCounts.set(node, (nodeCounts.get(node) || 0) + 1);
      if (node.startsWith("#")) {
        topicCounts.set(node, (topicCounts.get(node) || 0) + 1);
      } else {
        participantCounts.set(node, (participantCounts.get(node) || 0) + 1);
      }
    });

    for (let i = 0; i < nodes.length; i += 1) {
      for (let j = i + 1; j < nodes.length; j += 1) {
        const [a, b] = [nodes[i], nodes[j]].sort();
        const key = `${a}::${b}`;
        linkCounts.set(key, (linkCounts.get(key) || 0) + 1);
      }
    }
  }

  const nodes = Array.from(nodeCounts.entries())
    .map(([id, count]) => ({ id, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 140);
  const nodeSet = new Set(nodes.map(node => node.id));
  const links = Array.from(linkCounts.entries())
    .map(([key, weight]) => {
      const [source, target] = key.split("::");
      return { source, target, weight };
    })
    .filter(link => nodeSet.has(link.source) && nodeSet.has(link.target))
    .sort((a, b) => b.weight - a.weight)
    .slice(0, 240);

  return {
    totalMeetings: rows.length,
    nodes,
    links,
    topParticipants: Array.from(participantCounts.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10)
      .map(([name, count]) => ({ name, count })),
    topTopics: Array.from(topicCounts.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10)
      .map(([tag, count]) => ({ tag, count }))
  };
}

export function getFirefliesNodeDetails(nodeId, { limitMeetings = 8, limitSnippets = 6 } = {}) {
  const rawId = String(nodeId || "").trim();
  if (!rawId) return null;
  const isTopic = rawId.startsWith("#");
  const label = isTopic ? rawId.slice(1) : rawId;
  const meetings = isTopic
    ? listMeetings({ type: "fireflies", limit: limitMeetings, search: label })
    : listMeetings({ type: "fireflies", limit: limitMeetings, participant: label });
  const meetingIds = meetings.map(item => item.id).filter(Boolean);
  const snippets = getSnippetsForMeetings(meetingIds, {
    term: isTopic ? label : "",
    limit: limitSnippets
  });
  return {
    nodeId: rawId,
    type: isTopic ? "topic" : "participant",
    label,
    meetings,
    snippets
  };
}

export function getRagCounts() {
  initRagStore();
  const totalMeetings = db.prepare("SELECT COUNT(*) AS count FROM meetings").get()?.count || 0;
  const totalChunks = db.prepare("SELECT COUNT(*) AS count FROM chunks").get()?.count || 0;
  const memoryMeetings = db.prepare("SELECT COUNT(*) AS count FROM meetings WHERE id LIKE 'memory:%'").get()?.count || 0;
  const feedbackMeetings = db.prepare("SELECT COUNT(*) AS count FROM meetings WHERE id LIKE 'feedback:%'").get()?.count || 0;
  const recordingMeetings = db.prepare("SELECT COUNT(*) AS count FROM meetings WHERE id LIKE 'recording:%'").get()?.count || 0;
  const tradingMeetings = db.prepare("SELECT COUNT(*) AS count FROM meetings WHERE id LIKE 'trading:%'").get()?.count || 0;
  const firefliesMeetings = totalMeetings - memoryMeetings - feedbackMeetings - recordingMeetings - tradingMeetings;
  return {
    totalMeetings,
    totalChunks,
    firefliesMeetings: Math.max(0, firefliesMeetings),
    recordingMeetings,
    memoryMeetings,
    feedbackMeetings,
    tradingMeetings
  };
}
