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

function toHnswVector(vec) {
  if (!vec) return [];
  if (Array.isArray(vec)) return vec;
  if (vec instanceof Float32Array || ArrayBuffer.isView(vec)) return Array.from(vec);
  try {
    return Array.from(vec);
  } catch {
    return [];
  }
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

    CREATE TABLE IF NOT EXISTS trading_youtube_sources (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      collection_id TEXT,
      channel_id TEXT,
      handle TEXT,
      title TEXT,
      description TEXT,
      url TEXT,
      tags_json TEXT,
      enabled INTEGER,
      subscriber_count INTEGER,
      video_count INTEGER,
      view_count INTEGER,
      max_videos INTEGER,
      created_at TEXT,
      updated_at TEXT,
      last_crawled_at TEXT,
      last_status TEXT,
      last_error TEXT,
      last_published_at TEXT,
      UNIQUE(collection_id, channel_id)
    );

    CREATE TABLE IF NOT EXISTS trading_youtube_items (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      source_id INTEGER,
      video_id TEXT,
      url TEXT,
      title TEXT,
      published_at TEXT,
      ingested_at TEXT,
      transcript_hash TEXT,
      description_hash TEXT,
      UNIQUE(source_id, video_id),
      FOREIGN KEY(source_id) REFERENCES trading_youtube_sources(id)
    );

    CREATE TABLE IF NOT EXISTS signals_documents (
      doc_id TEXT PRIMARY KEY,
      source_id TEXT,
      source_title TEXT,
      source_url TEXT,
      canonical_url TEXT,
      title TEXT,
      summary TEXT,
      raw_text TEXT,
      cleaned_text TEXT,
      content_hash TEXT,
      simhash TEXT,
      retrieved_at TEXT,
      published_at TEXT,
      language TEXT,
      category TEXT,
      tags_json TEXT,
      signal_tags_json TEXT,
      tickers_json TEXT,
      entities_json TEXT,
      freshness_score REAL,
      reliability_score REAL,
      stale INTEGER,
      expired INTEGER,
      stale_reason TEXT,
      summary_json TEXT,
      meeting_id TEXT,
      cluster_id TEXT,
      cluster_label TEXT,
      created_at TEXT,
      updated_at TEXT
    );

    CREATE TABLE IF NOT EXISTS signals_runs (
      run_id TEXT PRIMARY KEY,
      status TEXT,
      started_at TEXT,
      finished_at TEXT,
      source_count INTEGER,
      ingested_count INTEGER,
      skipped_count INTEGER,
      expired_count INTEGER,
      error_count INTEGER,
      errors_json TEXT,
      sources_json TEXT,
      report_path TEXT,
      created_at TEXT
    );

    CREATE TABLE IF NOT EXISTS signals_trends (
      trend_id TEXT PRIMARY KEY,
      run_id TEXT,
      cluster_id TEXT,
      label TEXT,
      representative_doc_id TEXT,
      top_entities_json TEXT,
      top_tickers_json TEXT,
      signal_tags_json TEXT,
      note TEXT,
      doc_count INTEGER,
      created_at TEXT
    );

    CREATE TABLE IF NOT EXISTS knowledge_documents (
      doc_id TEXT PRIMARY KEY,
      collection_id TEXT,
      source_type TEXT,
      source_url TEXT,
      source_group TEXT,
      title TEXT,
      content_hash TEXT,
      simhash TEXT,
      published_at TEXT,
      retrieved_at TEXT,
      freshness_score REAL,
      reliability_score REAL,
      stale INTEGER,
      expired INTEGER,
      stale_reason TEXT,
      reviewed_at TEXT,
      tags_json TEXT,
      metadata_json TEXT,
      meeting_id TEXT,
      created_at TEXT,
      updated_at TEXT
    );

    CREATE INDEX IF NOT EXISTS idx_chunks_meeting ON chunks(meeting_id);
    CREATE INDEX IF NOT EXISTS idx_meetings_date ON meetings(occurred_at);
    CREATE INDEX IF NOT EXISTS idx_trading_sources_enabled ON trading_sources(enabled);
    CREATE INDEX IF NOT EXISTS idx_trading_rss_sources_enabled ON trading_rss_sources(enabled);
    CREATE INDEX IF NOT EXISTS idx_trading_youtube_sources_enabled ON trading_youtube_sources(enabled);
    CREATE INDEX IF NOT EXISTS idx_trading_youtube_items_source ON trading_youtube_items(source_id);
    CREATE INDEX IF NOT EXISTS idx_signals_docs_published ON signals_documents(published_at);
    CREATE INDEX IF NOT EXISTS idx_signals_docs_source ON signals_documents(source_id);
    CREATE INDEX IF NOT EXISTS idx_signals_docs_freshness ON signals_documents(freshness_score);
    CREATE INDEX IF NOT EXISTS idx_signals_docs_hash ON signals_documents(content_hash);
    CREATE INDEX IF NOT EXISTS idx_signals_runs_started ON signals_runs(started_at);
    CREATE INDEX IF NOT EXISTS idx_signals_trends_run ON signals_trends(run_id);
    CREATE INDEX IF NOT EXISTS idx_knowledge_docs_hash ON knowledge_documents(content_hash);
    CREATE INDEX IF NOT EXISTS idx_knowledge_docs_collection ON knowledge_documents(collection_id);
    CREATE INDEX IF NOT EXISTS idx_knowledge_docs_retrieved ON knowledge_documents(retrieved_at);
    CREATE INDEX IF NOT EXISTS idx_knowledge_docs_reviewed ON knowledge_documents(reviewed_at);
  `);
}

function getTableColumns(table) {
  return db.prepare(`PRAGMA table_info(${table})`).all().map(row => row.name);
}

function ensureColumn(table, column, definition) {
  const cols = getTableColumns(table);
  if (!cols.includes(column)) {
    db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`);
  }
}

function ensureIndex(table, column, indexName) {
  const cols = getTableColumns(table);
  if (!cols.includes(column)) return;
  db.exec(`CREATE INDEX IF NOT EXISTS ${indexName} ON ${table}(${column})`);
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
  ensureColumn("trading_youtube_sources", "collection_id", "TEXT");
  ensureColumn("trading_youtube_sources", "channel_id", "TEXT");
  ensureColumn("trading_youtube_sources", "handle", "TEXT");
  ensureColumn("trading_youtube_sources", "title", "TEXT");
  ensureColumn("trading_youtube_sources", "description", "TEXT");
  ensureColumn("trading_youtube_sources", "url", "TEXT");
  ensureColumn("trading_youtube_sources", "tags_json", "TEXT");
  ensureColumn("trading_youtube_sources", "enabled", "INTEGER");
  ensureColumn("trading_youtube_sources", "subscriber_count", "INTEGER");
  ensureColumn("trading_youtube_sources", "video_count", "INTEGER");
  ensureColumn("trading_youtube_sources", "view_count", "INTEGER");
  ensureColumn("trading_youtube_sources", "max_videos", "INTEGER");
  ensureColumn("trading_youtube_sources", "created_at", "TEXT");
  ensureColumn("trading_youtube_sources", "updated_at", "TEXT");
  ensureColumn("trading_youtube_sources", "last_crawled_at", "TEXT");
  ensureColumn("trading_youtube_sources", "last_status", "TEXT");
  ensureColumn("trading_youtube_sources", "last_error", "TEXT");
  ensureColumn("trading_youtube_sources", "last_published_at", "TEXT");
  ensureColumn("trading_youtube_items", "source_id", "INTEGER");
  ensureColumn("trading_youtube_items", "video_id", "TEXT");
  ensureColumn("trading_youtube_items", "url", "TEXT");
  ensureColumn("trading_youtube_items", "title", "TEXT");
  ensureColumn("trading_youtube_items", "published_at", "TEXT");
  ensureColumn("trading_youtube_items", "ingested_at", "TEXT");
  ensureColumn("trading_youtube_items", "transcript_hash", "TEXT");
  ensureColumn("trading_youtube_items", "description_hash", "TEXT");
  migrateSignalsDocumentsSchema();
  migrateSignalsRunsSchema();
  migrateSignalsTrendsSchema();
  ensureColumn("signals_documents", "source_title", "TEXT");
  ensureColumn("signals_documents", "source_url", "TEXT");
  ensureColumn("signals_documents", "canonical_url", "TEXT");
  ensureColumn("signals_documents", "title", "TEXT");
  ensureColumn("signals_documents", "summary", "TEXT");
  ensureColumn("signals_documents", "raw_text", "TEXT");
  ensureColumn("signals_documents", "cleaned_text", "TEXT");
  ensureColumn("signals_documents", "content_hash", "TEXT");
  ensureColumn("signals_documents", "simhash", "TEXT");
  ensureColumn("signals_documents", "retrieved_at", "TEXT");
  ensureColumn("signals_documents", "published_at", "TEXT");
  ensureColumn("signals_documents", "language", "TEXT");
  ensureColumn("signals_documents", "category", "TEXT");
  ensureColumn("signals_documents", "tags_json", "TEXT");
  ensureColumn("signals_documents", "signal_tags_json", "TEXT");
  ensureColumn("signals_documents", "tickers_json", "TEXT");
  ensureColumn("signals_documents", "entities_json", "TEXT");
  ensureColumn("signals_documents", "freshness_score", "REAL");
  ensureColumn("signals_documents", "reliability_score", "REAL");
  ensureColumn("signals_documents", "stale", "INTEGER");
  ensureColumn("signals_documents", "expired", "INTEGER");
  ensureColumn("signals_documents", "stale_reason", "TEXT");
  ensureColumn("signals_documents", "summary_json", "TEXT");
  ensureColumn("signals_documents", "meeting_id", "TEXT");
  ensureColumn("signals_documents", "cluster_id", "TEXT");
  ensureColumn("signals_documents", "cluster_label", "TEXT");
  ensureColumn("signals_documents", "created_at", "TEXT");
  ensureColumn("signals_documents", "updated_at", "TEXT");
  ensureIndex("signals_documents", "stale", "idx_signals_docs_stale");
  ensureIndex("signals_documents", "expired", "idx_signals_docs_expired");
  ensureColumn("signals_runs", "status", "TEXT");
  ensureColumn("signals_runs", "started_at", "TEXT");
  ensureColumn("signals_runs", "finished_at", "TEXT");
  ensureColumn("signals_runs", "source_count", "INTEGER");
  ensureColumn("signals_runs", "ingested_count", "INTEGER");
  ensureColumn("signals_runs", "skipped_count", "INTEGER");
  ensureColumn("signals_runs", "expired_count", "INTEGER");
  ensureColumn("signals_runs", "error_count", "INTEGER");
  ensureColumn("signals_runs", "errors_json", "TEXT");
  ensureColumn("signals_runs", "sources_json", "TEXT");
  ensureColumn("signals_runs", "report_path", "TEXT");
  ensureColumn("signals_runs", "created_at", "TEXT");
  ensureColumn("signals_trends", "run_id", "TEXT");
  ensureColumn("signals_trends", "cluster_id", "TEXT");
  ensureColumn("signals_trends", "label", "TEXT");
  ensureColumn("signals_trends", "representative_doc_id", "TEXT");
  ensureColumn("signals_trends", "top_entities_json", "TEXT");
  ensureColumn("signals_trends", "top_tickers_json", "TEXT");
  ensureColumn("signals_trends", "signal_tags_json", "TEXT");
  ensureColumn("signals_trends", "note", "TEXT");
  ensureColumn("signals_trends", "doc_count", "INTEGER");
  ensureColumn("signals_trends", "created_at", "TEXT");
  ensureColumn("knowledge_documents", "stale", "INTEGER");
  ensureColumn("knowledge_documents", "expired", "INTEGER");
  ensureColumn("knowledge_documents", "stale_reason", "TEXT");
  ensureColumn("knowledge_documents", "reviewed_at", "TEXT");
  ensureIndex("knowledge_documents", "reviewed_at", "idx_knowledge_docs_reviewed");
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
  db.exec("PRAGMA foreign_keys = OFF");
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
    db.exec("PRAGMA foreign_keys = ON");
    throw err;
  }
  db.exec("PRAGMA foreign_keys = ON");
}

function migrateTradingRssSourcesSchema() {
  const cols = db.prepare("PRAGMA table_info(trading_rss_sources)").all();
  if (!cols.length) return;
  const hasComposite = hasUniqueIndex("trading_rss_sources", ["collection_id", "url"]);
  const hasLegacy = hasUniqueIndex("trading_rss_sources", ["url"]);
  if (hasComposite || !hasLegacy) return;
  db.exec("PRAGMA foreign_keys = OFF");
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
    db.exec("PRAGMA foreign_keys = ON");
    throw err;
  }
  db.exec("PRAGMA foreign_keys = ON");
}

function migrateSignalsDocumentsSchema() {
  const cols = db.prepare("PRAGMA table_info(signals_documents)").all();
  if (!cols.length) return;
  const hasDocId = cols.some(col => col.name === "doc_id");
  const hasLegacyId = cols.some(col => col.name === "id");
  if (hasDocId || !hasLegacyId) return;
  db.exec("PRAGMA foreign_keys = OFF");
  db.exec("BEGIN");
  try {
    db.exec("ALTER TABLE signals_documents RENAME TO signals_documents_old");
    db.exec(`
      CREATE TABLE signals_documents (
        doc_id TEXT PRIMARY KEY,
        source_id TEXT,
        source_title TEXT,
        source_url TEXT,
        canonical_url TEXT,
        title TEXT,
        summary TEXT,
        raw_text TEXT,
        cleaned_text TEXT,
        content_hash TEXT,
        simhash TEXT,
        retrieved_at TEXT,
        published_at TEXT,
        language TEXT,
        category TEXT,
        tags_json TEXT,
        signal_tags_json TEXT,
        tickers_json TEXT,
        entities_json TEXT,
        freshness_score REAL,
        reliability_score REAL,
        stale INTEGER,
        expired INTEGER,
        stale_reason TEXT,
        summary_json TEXT,
        meeting_id TEXT,
        cluster_id TEXT,
        cluster_label TEXT,
        created_at TEXT,
        updated_at TEXT
      );
    `);
    db.exec(`
      INSERT INTO signals_documents (
        doc_id, source_id, source_title, source_url, canonical_url, title, summary, raw_text, cleaned_text,
        content_hash, simhash, retrieved_at, published_at, language, category, tags_json, signal_tags_json,
        tickers_json, entities_json, freshness_score, reliability_score, stale, expired, stale_reason,
        summary_json, meeting_id, cluster_id, cluster_label, created_at, updated_at
      )
      SELECT
        id,
        source_id,
        COALESCE(source_type, source_id),
        source_url,
        source_url,
        title,
        summary_text,
        raw_text,
        clean_text,
        content_hash,
        simhash,
        retrieved_at,
        published_at,
        language,
        category,
        tags_json,
        signal_tags_json,
        tickers_json,
        entities_json,
        freshness_score,
        reliability_score,
        COALESCE(is_stale, 0),
        COALESCE(is_expired, 0),
        '',
        '',
        meeting_id,
        cluster_id,
        cluster_label,
        created_at,
        updated_at
      FROM signals_documents_old;
    `);
    db.exec("DROP TABLE signals_documents_old");
    db.exec("CREATE INDEX IF NOT EXISTS idx_signals_docs_published ON signals_documents(published_at)");
    db.exec("CREATE INDEX IF NOT EXISTS idx_signals_docs_source ON signals_documents(source_id)");
    db.exec("CREATE INDEX IF NOT EXISTS idx_signals_docs_freshness ON signals_documents(freshness_score)");
    db.exec("CREATE INDEX IF NOT EXISTS idx_signals_docs_stale ON signals_documents(stale)");
    db.exec("CREATE INDEX IF NOT EXISTS idx_signals_docs_expired ON signals_documents(expired)");
    db.exec("CREATE INDEX IF NOT EXISTS idx_signals_docs_hash ON signals_documents(content_hash)");
    db.exec("COMMIT");
  } catch (err) {
    db.exec("ROLLBACK");
    db.exec("PRAGMA foreign_keys = ON");
    throw err;
  }
  db.exec("PRAGMA foreign_keys = ON");
}

function migrateSignalsRunsSchema() {
  const cols = db.prepare("PRAGMA table_info(signals_runs)").all();
  if (!cols.length) return;
  const hasRunId = cols.some(col => col.name === "run_id");
  const hasLegacyId = cols.some(col => col.name === "id");
  if (hasRunId || !hasLegacyId) return;
  db.exec("PRAGMA foreign_keys = OFF");
  db.exec("BEGIN");
  try {
    db.exec("ALTER TABLE signals_runs RENAME TO signals_runs_old");
    db.exec(`
      CREATE TABLE signals_runs (
        run_id TEXT PRIMARY KEY,
        status TEXT,
        started_at TEXT,
        finished_at TEXT,
        source_count INTEGER,
        ingested_count INTEGER,
        skipped_count INTEGER,
        expired_count INTEGER,
        error_count INTEGER,
        errors_json TEXT,
        sources_json TEXT,
        report_path TEXT,
        created_at TEXT
      );
    `);
    db.exec(`
      INSERT INTO signals_runs (
        run_id, status, started_at, finished_at, source_count, ingested_count, skipped_count, expired_count,
        error_count, errors_json, sources_json, report_path, created_at
      )
      SELECT
        id,
        status,
        started_at,
        finished_at,
        source_count,
        ingested_count,
        skipped_count,
        expired_count,
        error_count,
        errors_json,
        sources_json,
        report_path,
        created_at
      FROM signals_runs_old;
    `);
    db.exec("DROP TABLE signals_runs_old");
    db.exec("CREATE INDEX IF NOT EXISTS idx_signals_runs_started ON signals_runs(started_at)");
    db.exec("COMMIT");
  } catch (err) {
    db.exec("ROLLBACK");
    db.exec("PRAGMA foreign_keys = ON");
    throw err;
  }
  db.exec("PRAGMA foreign_keys = ON");
}

function migrateSignalsTrendsSchema() {
  const cols = db.prepare("PRAGMA table_info(signals_trends)").all();
  if (!cols.length) return;
  const hasTrendId = cols.some(col => col.name === "trend_id");
  const hasLegacyId = cols.some(col => col.name === "id");
  if (hasTrendId || !hasLegacyId) return;
  db.exec("PRAGMA foreign_keys = OFF");
  db.exec("BEGIN");
  try {
    db.exec("ALTER TABLE signals_trends RENAME TO signals_trends_old");
    db.exec(`
      CREATE TABLE signals_trends (
        trend_id TEXT PRIMARY KEY,
        run_id TEXT,
        cluster_id TEXT,
        label TEXT,
        representative_doc_id TEXT,
        top_entities_json TEXT,
        top_tickers_json TEXT,
        signal_tags_json TEXT,
        note TEXT,
        doc_count INTEGER,
        created_at TEXT
      );
    `);
    db.exec(`
      INSERT INTO signals_trends (
        trend_id, run_id, cluster_id, label, representative_doc_id, top_entities_json, top_tickers_json,
        signal_tags_json, note, doc_count, created_at
      )
      SELECT
        id,
        run_id,
        cluster_id,
        label,
        representative_doc_id,
        top_entities_json,
        top_tickers_json,
        signal_tags_json,
        note,
        doc_count,
        created_at
      FROM signals_trends_old;
    `);
    db.exec("DROP TABLE signals_trends_old");
    db.exec("CREATE INDEX IF NOT EXISTS idx_signals_trends_run ON signals_trends(run_id)");
    db.exec("COMMIT");
  } catch (err) {
    db.exec("ROLLBACK");
    db.exec("PRAGMA foreign_keys = ON");
    throw err;
  }
  db.exec("PRAGMA foreign_keys = ON");
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
  db.pragma("busy_timeout = 8000");
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

function normalizeTradingYoutubeSourceRow(row) {
  if (!row) return null;
  return {
    id: row.id,
    collection_id: row.collection_id || "trading",
    channel_id: row.channel_id || "",
    handle: row.handle || "",
    title: row.title || "",
    description: row.description || "",
    url: row.url || "",
    tags: row.tags_json ? JSON.parse(row.tags_json) : [],
    enabled: Boolean(row.enabled),
    subscriber_count: Number(row.subscriber_count || 0),
    video_count: Number(row.video_count || 0),
    view_count: Number(row.view_count || 0),
    max_videos: row.max_videos == null ? null : Number(row.max_videos || 0),
    created_at: row.created_at,
    updated_at: row.updated_at,
    last_crawled_at: row.last_crawled_at,
    last_status: row.last_status,
    last_error: row.last_error,
    last_published_at: row.last_published_at
  };
}

export function listTradingYoutubeSources({ limit = 100, offset = 0, search = "", includeDisabled = true, collectionId = "trading" } = {}) {
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
    where.push("(title LIKE ? OR handle LIKE ? OR channel_id LIKE ? OR url LIKE ?)");
    params.push(`%${search}%`, `%${search}%`, `%${search}%`, `%${search}%`);
  }
  const whereSql = where.length ? `WHERE ${where.join(" AND ")}` : "";
  const rows = db.prepare(`
    SELECT * FROM trading_youtube_sources
    ${whereSql}
    ORDER BY created_at DESC
    LIMIT ? OFFSET ?
  `).all(...params, Number(limit || 100), Number(offset || 0));
  return rows.map(normalizeTradingYoutubeSourceRow).filter(Boolean);
}

export function getTradingYoutubeSource(id) {
  initRagStore();
  const row = db.prepare("SELECT * FROM trading_youtube_sources WHERE id = ?").get(id);
  return normalizeTradingYoutubeSourceRow(row);
}

export function getTradingYoutubeSourceByChannelId(channelId, { collectionId = "trading" } = {}) {
  initRagStore();
  let row = null;
  if (collectionId === "trading") {
    row = db.prepare("SELECT * FROM trading_youtube_sources WHERE channel_id = ? AND (collection_id = ? OR collection_id IS NULL)").get(channelId, collectionId);
  } else {
    row = db.prepare("SELECT * FROM trading_youtube_sources WHERE channel_id = ? AND collection_id = ?").get(channelId, collectionId);
  }
  return normalizeTradingYoutubeSourceRow(row);
}

export function getTradingYoutubeSourceByHandle(handle, { collectionId = "trading" } = {}) {
  initRagStore();
  let row = null;
  if (collectionId === "trading") {
    row = db.prepare("SELECT * FROM trading_youtube_sources WHERE handle = ? AND (collection_id = ? OR collection_id IS NULL)").get(handle, collectionId);
  } else {
    row = db.prepare("SELECT * FROM trading_youtube_sources WHERE handle = ? AND collection_id = ?").get(handle, collectionId);
  }
  return normalizeTradingYoutubeSourceRow(row);
}

export function upsertTradingYoutubeSource({
  channelId,
  handle = "",
  title = "",
  description = "",
  url = "",
  tags = [],
  enabled = true,
  subscriberCount = 0,
  videoCount = 0,
  viewCount = 0,
  maxVideos = null,
  collectionId = "trading"
} = {}) {
  initRagStore();
  const now = nowIso();
  const resolvedHandle = handle || "";
  let existing = null;
  if (channelId) {
    existing = getTradingYoutubeSourceByChannelId(channelId, { collectionId });
  }
  if (!existing && resolvedHandle) {
    existing = getTradingYoutubeSourceByHandle(resolvedHandle, { collectionId });
  }
  if (existing) {
    db.prepare(`
      UPDATE trading_youtube_sources
      SET channel_id = ?, handle = ?, title = ?, description = ?, url = ?, tags_json = ?, enabled = ?,
          subscriber_count = ?, video_count = ?, view_count = ?, max_videos = ?, updated_at = ?
      WHERE id = ?
    `).run(
      channelId || existing.channel_id || null,
      resolvedHandle,
      title || existing.title || "",
      description || existing.description || "",
      url || existing.url || "",
      JSON.stringify(tags || existing.tags || []),
      enabled ? 1 : 0,
      Number(subscriberCount || 0),
      Number(videoCount || 0),
      Number(viewCount || 0),
      maxVideos == null ? existing.max_videos : Number(maxVideos || 0),
      now,
      existing.id
    );
    return getTradingYoutubeSource(existing.id);
  }

  db.prepare(`
    INSERT INTO trading_youtube_sources (
      collection_id,
      channel_id,
      handle,
      title,
      description,
      url,
      tags_json,
      enabled,
      subscriber_count,
      video_count,
      view_count,
      max_videos,
      created_at,
      updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    collectionId,
    channelId || null,
    resolvedHandle,
    title || "",
    description || "",
    url || "",
    JSON.stringify(tags || []),
    enabled ? 1 : 0,
    Number(subscriberCount || 0),
    Number(videoCount || 0),
    Number(viewCount || 0),
    maxVideos == null ? null : Number(maxVideos || 0),
    now,
    now
  );
  if (channelId) return getTradingYoutubeSourceByChannelId(channelId, { collectionId });
  if (resolvedHandle) return getTradingYoutubeSourceByHandle(resolvedHandle, { collectionId });
  return null;
}

export function updateTradingYoutubeSource(id, { tags, enabled, maxVideos } = {}) {
  initRagStore();
  const existing = getTradingYoutubeSource(id);
  if (!existing) return null;
  const nextTags = tags ? JSON.stringify(tags) : JSON.stringify(existing.tags || []);
  const nextEnabled = enabled == null ? (existing.enabled ? 1 : 0) : (enabled ? 1 : 0);
  const nextMaxVideos = maxVideos == null ? existing.max_videos : Number(maxVideos || 0);
  const now = nowIso();
  db.prepare(`
    UPDATE trading_youtube_sources
    SET tags_json = ?, enabled = ?, max_videos = ?, updated_at = ?
    WHERE id = ?
  `).run(nextTags, nextEnabled, nextMaxVideos, now, id);
  return getTradingYoutubeSource(id);
}

export function deleteTradingYoutubeSource(id) {
  initRagStore();
  db.prepare("DELETE FROM trading_youtube_sources WHERE id = ?").run(id);
  db.prepare("DELETE FROM trading_youtube_items WHERE source_id = ?").run(id);
}

export function markTradingYoutubeCrawl({ id, status = "ok", error = "", crawledAt, lastPublishedAt } = {}) {
  initRagStore();
  const now = crawledAt || nowIso();
  db.prepare(`
    UPDATE trading_youtube_sources
    SET last_crawled_at = ?, last_status = ?, last_error = ?, last_published_at = ?, updated_at = ?
    WHERE id = ?
  `).run(now, status, error || "", lastPublishedAt || "", now, id);
}

export function hasTradingYoutubeItem({ sourceId, videoId } = {}) {
  initRagStore();
  const row = db.prepare("SELECT id FROM trading_youtube_items WHERE source_id = ? AND video_id = ?").get(sourceId, videoId);
  return Boolean(row?.id);
}

export function recordTradingYoutubeItem({
  sourceId,
  videoId,
  url,
  title,
  publishedAt,
  transcriptHash,
  descriptionHash,
  ingestedAt
} = {}) {
  if (!sourceId || !videoId) return;
  initRagStore();
  const now = ingestedAt || nowIso();
  db.prepare(`
    INSERT OR IGNORE INTO trading_youtube_items
      (source_id, video_id, url, title, published_at, ingested_at, transcript_hash, description_hash)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    sourceId,
    videoId,
    url || "",
    title || "",
    publishedAt || "",
    now,
    transcriptHash || "",
    descriptionHash || ""
  );
}

export function listTradingYoutubeItems({ sourceId, limit = 50 } = {}) {
  initRagStore();
  const where = [];
  const params = [];
  if (sourceId) {
    where.push("source_id = ?");
    params.push(sourceId);
  }
  const whereSql = where.length ? `WHERE ${where.join(" AND ")}` : "";
  return db.prepare(`
    SELECT * FROM trading_youtube_items
    ${whereSql}
    ORDER BY published_at DESC
    LIMIT ?
  `).all(...params, Number(limit || 50));
}

function normalizeSignalDocRow(row) {
  if (!row) return null;
  return {
    doc_id: row.doc_id,
    source_id: row.source_id || "",
    source_title: row.source_title || "",
    source_url: row.source_url || "",
    canonical_url: row.canonical_url || "",
    title: row.title || "",
    summary: row.summary || "",
    raw_text: row.raw_text || "",
    cleaned_text: row.cleaned_text || "",
    content_hash: row.content_hash || "",
    simhash: row.simhash || "",
    retrieved_at: row.retrieved_at || "",
    published_at: row.published_at || "",
    language: row.language || "",
    category: row.category || "",
    tags: row.tags_json ? JSON.parse(row.tags_json) : [],
    signal_tags: row.signal_tags_json ? JSON.parse(row.signal_tags_json) : [],
    tickers: row.tickers_json ? JSON.parse(row.tickers_json) : [],
    entities: row.entities_json ? JSON.parse(row.entities_json) : {},
    freshness_score: row.freshness_score ?? 0,
    reliability_score: row.reliability_score ?? 0,
    stale: Boolean(row.stale),
    expired: Boolean(row.expired),
    stale_reason: row.stale_reason || "",
    summary_json: row.summary_json ? JSON.parse(row.summary_json) : null,
    meeting_id: row.meeting_id || "",
    cluster_id: row.cluster_id || "",
    cluster_label: row.cluster_label || "",
    created_at: row.created_at || "",
    updated_at: row.updated_at || ""
  };
}

function normalizeSignalRunRow(row) {
  if (!row) return null;
  return {
    run_id: row.run_id,
    status: row.status || "",
    started_at: row.started_at || "",
    finished_at: row.finished_at || "",
    source_count: row.source_count || 0,
    ingested_count: row.ingested_count || 0,
    skipped_count: row.skipped_count || 0,
    expired_count: row.expired_count || 0,
    error_count: row.error_count || 0,
    errors: row.errors_json ? JSON.parse(row.errors_json) : [],
    sources: row.sources_json ? JSON.parse(row.sources_json) : [],
    report_path: row.report_path || "",
    created_at: row.created_at || ""
  };
}

function normalizeSignalTrendRow(row) {
  if (!row) return null;
  return {
    trend_id: row.trend_id,
    run_id: row.run_id || "",
    cluster_id: row.cluster_id || "",
    label: row.label || "",
    representative_doc_id: row.representative_doc_id || "",
    top_entities: row.top_entities_json ? JSON.parse(row.top_entities_json) : [],
    top_tickers: row.top_tickers_json ? JSON.parse(row.top_tickers_json) : [],
    signal_tags: row.signal_tags_json ? JSON.parse(row.signal_tags_json) : [],
    note: row.note || "",
    doc_count: row.doc_count || 0,
    created_at: row.created_at || ""
  };
}

export function upsertSignalDocument(doc) {
  if (!doc?.doc_id) return null;
  initRagStore();
  const now = nowIso();
  db.prepare(`
    INSERT INTO signals_documents (
      doc_id, source_id, source_title, source_url, canonical_url, title, summary, raw_text, cleaned_text,
      content_hash, simhash, retrieved_at, published_at, language, category, tags_json, signal_tags_json,
      tickers_json, entities_json, freshness_score, reliability_score, stale, expired, stale_reason,
      summary_json, meeting_id, cluster_id, cluster_label, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(doc_id) DO UPDATE SET
      source_id = excluded.source_id,
      source_title = excluded.source_title,
      source_url = excluded.source_url,
      canonical_url = excluded.canonical_url,
      title = excluded.title,
      summary = excluded.summary,
      raw_text = excluded.raw_text,
      cleaned_text = excluded.cleaned_text,
      content_hash = excluded.content_hash,
      simhash = excluded.simhash,
      retrieved_at = excluded.retrieved_at,
      published_at = excluded.published_at,
      language = excluded.language,
      category = excluded.category,
      tags_json = excluded.tags_json,
      signal_tags_json = excluded.signal_tags_json,
      tickers_json = excluded.tickers_json,
      entities_json = excluded.entities_json,
      freshness_score = excluded.freshness_score,
      reliability_score = excluded.reliability_score,
      stale = excluded.stale,
      expired = excluded.expired,
      stale_reason = excluded.stale_reason,
      summary_json = excluded.summary_json,
      meeting_id = excluded.meeting_id,
      cluster_id = excluded.cluster_id,
      cluster_label = excluded.cluster_label,
      updated_at = excluded.updated_at
  `).run(
    doc.doc_id,
    doc.source_id || "",
    doc.source_title || "",
    doc.source_url || "",
    doc.canonical_url || "",
    doc.title || "",
    doc.summary || "",
    doc.raw_text || "",
    doc.cleaned_text || "",
    doc.content_hash || "",
    doc.simhash || "",
    doc.retrieved_at || "",
    doc.published_at || "",
    doc.language || "",
    doc.category || "",
    JSON.stringify(doc.tags || []),
    JSON.stringify(doc.signal_tags || []),
    JSON.stringify(doc.tickers || []),
    JSON.stringify(doc.entities || {}),
    Number(doc.freshness_score || 0),
    Number(doc.reliability_score || 0),
    doc.stale ? 1 : 0,
    doc.expired ? 1 : 0,
    doc.stale_reason || "",
    doc.summary_json ? JSON.stringify(doc.summary_json) : "",
    doc.meeting_id || "",
    doc.cluster_id || "",
    doc.cluster_label || "",
    doc.created_at || now,
    now
  );
  return getSignalDocument(doc.doc_id);
}

export function getSignalDocument(docId) {
  initRagStore();
  const row = db.prepare("SELECT * FROM signals_documents WHERE doc_id = ?").get(docId);
  return normalizeSignalDocRow(row);
}

export function getSignalDocumentByUrl(url) {
  if (!url) return null;
  initRagStore();
  const row = db.prepare("SELECT * FROM signals_documents WHERE canonical_url = ?").get(url);
  return normalizeSignalDocRow(row);
}

export function getSignalDocumentByHash(hash) {
  if (!hash) return null;
  initRagStore();
  const row = db.prepare("SELECT * FROM signals_documents WHERE content_hash = ?").get(hash);
  return normalizeSignalDocRow(row);
}

export function listSignalDedupCandidates({ sinceHours = 96, limit = 500 } = {}) {
  initRagStore();
  const since = new Date(Date.now() - sinceHours * 3600000).toISOString();
  return db.prepare(`
    SELECT doc_id, canonical_url, content_hash, simhash
    FROM signals_documents
    WHERE (retrieved_at >= ? OR published_at >= ?)
    ORDER BY retrieved_at DESC
    LIMIT ?
  `).all(since, since, Number(limit || 500));
}

export function updateSignalDocument(docId, patch = {}) {
  if (!docId) return null;
  initRagStore();
  const fields = [];
  const params = [];
  const setField = (col, value) => {
    fields.push(`${col} = ?`);
    params.push(value);
  };
  if (patch.source_id !== undefined) setField("source_id", patch.source_id || "");
  if (patch.source_title !== undefined) setField("source_title", patch.source_title || "");
  if (patch.source_url !== undefined) setField("source_url", patch.source_url || "");
  if (patch.canonical_url !== undefined) setField("canonical_url", patch.canonical_url || "");
  if (patch.title !== undefined) setField("title", patch.title || "");
  if (patch.summary !== undefined) setField("summary", patch.summary || "");
  if (patch.raw_text !== undefined) setField("raw_text", patch.raw_text || "");
  if (patch.cleaned_text !== undefined) setField("cleaned_text", patch.cleaned_text || "");
  if (patch.content_hash !== undefined) setField("content_hash", patch.content_hash || "");
  if (patch.simhash !== undefined) setField("simhash", patch.simhash || "");
  if (patch.retrieved_at !== undefined) setField("retrieved_at", patch.retrieved_at || "");
  if (patch.published_at !== undefined) setField("published_at", patch.published_at || "");
  if (patch.language !== undefined) setField("language", patch.language || "");
  if (patch.category !== undefined) setField("category", patch.category || "");
  if (patch.tags !== undefined) setField("tags_json", JSON.stringify(patch.tags || []));
  if (patch.signal_tags !== undefined) setField("signal_tags_json", JSON.stringify(patch.signal_tags || []));
  if (patch.tickers !== undefined) setField("tickers_json", JSON.stringify(patch.tickers || []));
  if (patch.entities !== undefined) setField("entities_json", JSON.stringify(patch.entities || {}));
  if (patch.freshness_score !== undefined) setField("freshness_score", Number(patch.freshness_score || 0));
  if (patch.reliability_score !== undefined) setField("reliability_score", Number(patch.reliability_score || 0));
  if (patch.stale !== undefined) setField("stale", patch.stale ? 1 : 0);
  if (patch.expired !== undefined) setField("expired", patch.expired ? 1 : 0);
  if (patch.stale_reason !== undefined) setField("stale_reason", patch.stale_reason || "");
  if (patch.summary_json !== undefined) setField("summary_json", patch.summary_json ? JSON.stringify(patch.summary_json) : "");
  if (patch.meeting_id !== undefined) setField("meeting_id", patch.meeting_id || "");
  if (patch.cluster_id !== undefined) setField("cluster_id", patch.cluster_id || "");
  if (patch.cluster_label !== undefined) setField("cluster_label", patch.cluster_label || "");
  if (!fields.length) return getSignalDocument(docId);
  setField("updated_at", nowIso());
  params.push(docId);
  db.prepare(`UPDATE signals_documents SET ${fields.join(", ")} WHERE doc_id = ?`).run(...params);
  return getSignalDocument(docId);
}

export function listSignalDocuments({
  limit = 50,
  offset = 0,
  includeStale = false,
  includeExpired = false,
  category = "",
  sourceId = "",
  search = "",
  includeSummaries = false,
  dateFrom,
  dateTo
} = {}) {
  initRagStore();
  const where = [];
  const params = [];
  if (!includeExpired) {
    where.push("(expired = 0 OR expired IS NULL)");
  }
  if (!includeStale) {
    where.push("(stale = 0 OR stale IS NULL)");
  }
  if (category) {
    where.push("category = ?");
    params.push(category);
  }
  if (sourceId) {
    where.push("source_id = ?");
    params.push(sourceId);
  }
  if (search) {
    where.push("(title LIKE ? OR summary LIKE ? OR cleaned_text LIKE ?)");
    params.push(`%${search}%`, `%${search}%`, `%${search}%`);
  }
  if (dateFrom) {
    where.push("published_at >= ?");
    params.push(dateFrom);
  }
  if (dateTo) {
    where.push("published_at <= ?");
    params.push(dateTo);
  }
  const whereSql = where.length ? `WHERE ${where.join(" AND ")}` : "";
  const rows = db.prepare(`
    SELECT * FROM signals_documents
    ${whereSql}
    ORDER BY published_at DESC
    LIMIT ? OFFSET ?
  `).all(...params, Number(limit || 50), Number(offset || 0));
  return rows.map(normalizeSignalDocRow).filter(Boolean);
}

function normalizeKnowledgeDocRow(row) {
  if (!row) return null;
  return {
    doc_id: row.doc_id,
    collection_id: row.collection_id || "",
    source_type: row.source_type || "",
    source_url: row.source_url || "",
    source_group: row.source_group || "",
    title: row.title || "",
    content_hash: row.content_hash || "",
    simhash: row.simhash || "",
    published_at: row.published_at || "",
    retrieved_at: row.retrieved_at || "",
    freshness_score: Number(row.freshness_score || 0),
    reliability_score: Number(row.reliability_score || 0),
    stale: Boolean(row.stale),
    expired: Boolean(row.expired),
    stale_reason: row.stale_reason || "",
    reviewed_at: row.reviewed_at || "",
    tags: row.tags_json ? JSON.parse(row.tags_json) : [],
    metadata: row.metadata_json ? JSON.parse(row.metadata_json) : {},
    meeting_id: row.meeting_id || "",
    created_at: row.created_at || "",
    updated_at: row.updated_at || ""
  };
}

export function upsertKnowledgeDocument(doc) {
  if (!doc?.doc_id) return null;
  initRagStore();
  const now = nowIso();
  db.prepare(`
    INSERT INTO knowledge_documents (
      doc_id, collection_id, source_type, source_url, source_group, title,
      content_hash, simhash, published_at, retrieved_at, freshness_score,
      reliability_score, stale, expired, stale_reason, reviewed_at,
      tags_json, metadata_json, meeting_id, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(doc_id) DO UPDATE SET
      collection_id = excluded.collection_id,
      source_type = excluded.source_type,
      source_url = excluded.source_url,
      source_group = excluded.source_group,
      title = excluded.title,
      content_hash = excluded.content_hash,
      simhash = excluded.simhash,
      published_at = excluded.published_at,
      retrieved_at = excluded.retrieved_at,
      freshness_score = excluded.freshness_score,
      reliability_score = excluded.reliability_score,
      stale = excluded.stale,
      expired = excluded.expired,
      stale_reason = excluded.stale_reason,
      reviewed_at = excluded.reviewed_at,
      tags_json = excluded.tags_json,
      metadata_json = excluded.metadata_json,
      meeting_id = excluded.meeting_id,
      updated_at = excluded.updated_at
  `).run(
    doc.doc_id,
    doc.collection_id || "",
    doc.source_type || "",
    doc.source_url || "",
    doc.source_group || "",
    doc.title || "",
    doc.content_hash || "",
    doc.simhash || "",
    doc.published_at || "",
    doc.retrieved_at || "",
    Number(doc.freshness_score || 0),
    Number(doc.reliability_score || 0),
    doc.stale ? 1 : 0,
    doc.expired ? 1 : 0,
    doc.stale_reason || "",
    doc.reviewed_at || "",
    JSON.stringify(doc.tags || []),
    JSON.stringify(doc.metadata || {}),
    doc.meeting_id || "",
    doc.created_at || now,
    now
  );
  return getKnowledgeDocument(doc.doc_id);
}

export function getKnowledgeDocument(docId) {
  initRagStore();
  const row = db.prepare("SELECT * FROM knowledge_documents WHERE doc_id = ?").get(docId);
  return normalizeKnowledgeDocRow(row);
}

export function getKnowledgeDocumentByHash(hash, collectionId = "") {
  if (!hash) return null;
  initRagStore();
  const params = [hash];
  let sql = "SELECT * FROM knowledge_documents WHERE content_hash = ?";
  if (collectionId) {
    sql += " AND collection_id = ?";
    params.push(collectionId);
  }
  const row = db.prepare(sql).get(...params);
  return normalizeKnowledgeDocRow(row);
}

export function listKnowledgeDedupCandidates({ sinceHours = 720, limit = 1000, collectionId = "" } = {}) {
  initRagStore();
  const since = new Date(Date.now() - sinceHours * 3600000).toISOString();
  const params = [since, since];
  let sql = `
    SELECT doc_id, content_hash, simhash, source_url, collection_id
    FROM knowledge_documents
    WHERE (retrieved_at >= ? OR published_at >= ?)
  `;
  if (collectionId) {
    if (collectionId === "trading") {
      sql += " AND (collection_id = ? OR collection_id IS NULL OR collection_id = '')";
      params.push(collectionId);
    } else {
      sql += " AND collection_id = ?";
      params.push(collectionId);
    }
  }
  sql += " ORDER BY retrieved_at DESC LIMIT ?";
  params.push(Number(limit || 1000));
  return db.prepare(sql).all(...params);
}

export function listKnowledgeHealthCandidates({ reviewIntervalHours = 24, limit = 500, collectionId = "" } = {}) {
  initRagStore();
  const since = new Date(Date.now() - reviewIntervalHours * 3600000).toISOString();
  const params = [since];
  let where = "(reviewed_at IS NULL OR reviewed_at <= ?)";
  if (collectionId) {
    if (collectionId === "trading") {
      where += " AND (collection_id = ? OR collection_id IS NULL OR collection_id = '')";
      params.push(collectionId);
    } else {
      where += " AND collection_id = ?";
      params.push(collectionId);
    }
  }
  const rows = db.prepare(`
    SELECT * FROM knowledge_documents
    WHERE ${where}
    ORDER BY reviewed_at ASC
    LIMIT ?
  `).all(...params, Number(limit || 500));
  return rows.map(normalizeKnowledgeDocRow).filter(Boolean);
}

export function updateKnowledgeDocument(docId, patch = {}) {
  if (!docId) return null;
  initRagStore();
  const fields = [];
  const params = [];
  const setField = (col, value) => {
    fields.push(`${col} = ?`);
    params.push(value);
  };
  if (patch.collection_id !== undefined) setField("collection_id", patch.collection_id || "");
  if (patch.source_type !== undefined) setField("source_type", patch.source_type || "");
  if (patch.source_url !== undefined) setField("source_url", patch.source_url || "");
  if (patch.source_group !== undefined) setField("source_group", patch.source_group || "");
  if (patch.title !== undefined) setField("title", patch.title || "");
  if (patch.content_hash !== undefined) setField("content_hash", patch.content_hash || "");
  if (patch.simhash !== undefined) setField("simhash", patch.simhash || "");
  if (patch.published_at !== undefined) setField("published_at", patch.published_at || "");
  if (patch.retrieved_at !== undefined) setField("retrieved_at", patch.retrieved_at || "");
  if (patch.freshness_score !== undefined) setField("freshness_score", Number(patch.freshness_score || 0));
  if (patch.reliability_score !== undefined) setField("reliability_score", Number(patch.reliability_score || 0));
  if (patch.stale !== undefined) setField("stale", patch.stale ? 1 : 0);
  if (patch.expired !== undefined) setField("expired", patch.expired ? 1 : 0);
  if (patch.stale_reason !== undefined) setField("stale_reason", patch.stale_reason || "");
  if (patch.reviewed_at !== undefined) setField("reviewed_at", patch.reviewed_at || "");
  if (patch.tags !== undefined) setField("tags_json", JSON.stringify(patch.tags || []));
  if (patch.metadata !== undefined) setField("metadata_json", JSON.stringify(patch.metadata || {}));
  if (patch.meeting_id !== undefined) setField("meeting_id", patch.meeting_id || "");
  if (!fields.length) return getKnowledgeDocument(docId);
  setField("updated_at", nowIso());
  params.push(docId);
  db.prepare(`UPDATE knowledge_documents SET ${fields.join(", ")} WHERE doc_id = ?`).run(...params);
  return getKnowledgeDocument(docId);
}

export function getKnowledgeHealthSummary({ collectionId = "" } = {}) {
  initRagStore();
  const params = [];
  let where = "1=1";
  if (collectionId) {
    if (collectionId === "trading") {
      where += " AND (collection_id = ? OR collection_id IS NULL OR collection_id = '')";
      params.push(collectionId);
    } else {
      where += " AND collection_id = ?";
      params.push(collectionId);
    }
  }
  const row = db.prepare(`
    SELECT
      COUNT(*) AS total,
      SUM(CASE WHEN stale = 1 THEN 1 ELSE 0 END) AS stale_count,
      SUM(CASE WHEN expired = 1 THEN 1 ELSE 0 END) AS expired_count,
      AVG(COALESCE(freshness_score, 0)) AS avg_freshness,
      AVG(COALESCE(reliability_score, 0)) AS avg_reliability,
      MAX(reviewed_at) AS last_reviewed_at
    FROM knowledge_documents
    WHERE ${where}
  `).get(...params);
  return {
    total: row?.total || 0,
    stale: row?.stale_count || 0,
    expired: row?.expired_count || 0,
    avgFreshness: Number(row?.avg_freshness || 0),
    avgReliability: Number(row?.avg_reliability || 0),
    lastReviewedAt: row?.last_reviewed_at || ""
  };
}

export function listKnowledgeSourceStats({ collectionId = "", limit = 50 } = {}) {
  initRagStore();
  const params = [];
  let where = "1=1";
  if (collectionId) {
    if (collectionId === "trading") {
      where += " AND (collection_id = ? OR collection_id IS NULL OR collection_id = '')";
      params.push(collectionId);
    } else {
      where += " AND collection_id = ?";
      params.push(collectionId);
    }
  }
  const rows = db.prepare(`
    SELECT
      COALESCE(NULLIF(source_group, ''), NULLIF(source_url, ''), NULLIF(source_type, ''), 'unknown') AS source_key,
      MAX(source_url) AS source_url,
      MAX(source_group) AS source_group,
      MAX(source_type) AS source_type,
      MIN(COALESCE(NULLIF(published_at, ''), NULLIF(retrieved_at, ''), NULLIF(created_at, ''))) AS first_seen,
      MAX(COALESCE(NULLIF(published_at, ''), NULLIF(retrieved_at, ''), NULLIF(created_at, ''))) AS last_seen,
      COUNT(*) AS doc_count,
      SUM(CASE WHEN stale = 1 THEN 1 ELSE 0 END) AS stale_count,
      SUM(CASE WHEN expired = 1 THEN 1 ELSE 0 END) AS expired_count,
      AVG(COALESCE(freshness_score, 0)) AS avg_freshness,
      AVG(COALESCE(reliability_score, 0)) AS avg_reliability
    FROM knowledge_documents
    WHERE ${where}
    GROUP BY source_key
    ORDER BY doc_count DESC
    LIMIT ?
  `).all(...params, Number(limit || 50));
  return rows.map(row => ({
    source_key: row.source_key || "unknown",
    source_url: row.source_url || "",
    source_group: row.source_group || "",
    source_type: row.source_type || "",
    first_seen: row.first_seen || "",
    last_seen: row.last_seen || "",
    doc_count: row.doc_count || 0,
    stale_count: row.stale_count || 0,
    expired_count: row.expired_count || 0,
    avg_freshness: Number(row.avg_freshness || 0),
    avg_reliability: Number(row.avg_reliability || 0)
  }));
}

export function recordSignalsRun({ run_id, status, started_at, source_count, report_path } = {}) {
  if (!run_id) return null;
  initRagStore();
  const now = nowIso();
  db.prepare(`
    INSERT INTO signals_runs (run_id, status, started_at, source_count, report_path, created_at)
    VALUES (?, ?, ?, ?, ?, ?)
    ON CONFLICT(run_id) DO UPDATE SET
      status = excluded.status,
      started_at = excluded.started_at,
      source_count = excluded.source_count,
      report_path = excluded.report_path
  `).run(
    run_id,
    status || "",
    started_at || now,
    Number(source_count || 0),
    report_path || "",
    now
  );
  return getSignalsRun(run_id);
}

export function updateSignalsRun(runId, patch = {}) {
  if (!runId) return null;
  initRagStore();
  const fields = [];
  const params = [];
  const setField = (col, value) => {
    fields.push(`${col} = ?`);
    params.push(value);
  };
  if (patch.status !== undefined) setField("status", patch.status || "");
  if (patch.started_at !== undefined) setField("started_at", patch.started_at || "");
  if (patch.finished_at !== undefined) setField("finished_at", patch.finished_at || "");
  if (patch.source_count !== undefined) setField("source_count", Number(patch.source_count || 0));
  if (patch.ingested_count !== undefined) setField("ingested_count", Number(patch.ingested_count || 0));
  if (patch.skipped_count !== undefined) setField("skipped_count", Number(patch.skipped_count || 0));
  if (patch.expired_count !== undefined) setField("expired_count", Number(patch.expired_count || 0));
  if (patch.error_count !== undefined) setField("error_count", Number(patch.error_count || 0));
  if (patch.errors_json !== undefined) setField("errors_json", patch.errors_json || "");
  if (patch.sources_json !== undefined) setField("sources_json", patch.sources_json || "");
  if (patch.report_path !== undefined) setField("report_path", patch.report_path || "");
  if (!fields.length) return getSignalsRun(runId);
  params.push(runId);
  db.prepare(`UPDATE signals_runs SET ${fields.join(", ")} WHERE run_id = ?`).run(...params);
  return getSignalsRun(runId);
}

export function getSignalsRun(runId) {
  initRagStore();
  const row = db.prepare("SELECT * FROM signals_runs WHERE run_id = ?").get(runId);
  return normalizeSignalRunRow(row);
}

export function getLatestSignalsRun() {
  initRagStore();
  const row = db.prepare(`
    SELECT * FROM signals_runs
    ORDER BY started_at DESC
    LIMIT 1
  `).get();
  return normalizeSignalRunRow(row);
}

export function listSignalsRuns({ limit = 20 } = {}) {
  initRagStore();
  const rows = db.prepare(`
    SELECT * FROM signals_runs
    ORDER BY started_at DESC
    LIMIT ?
  `).all(Number(limit || 20));
  return rows.map(normalizeSignalRunRow).filter(Boolean);
}

export function replaceSignalsTrends(runId, trends = []) {
  if (!runId) return 0;
  initRagStore();
  db.prepare("DELETE FROM signals_trends WHERE run_id = ?").run(runId);
  if (!trends.length) return 0;
  const stmt = db.prepare(`
    INSERT INTO signals_trends (
      trend_id, run_id, cluster_id, label, representative_doc_id,
      top_entities_json, top_tickers_json, signal_tags_json, note, doc_count, created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  const now = nowIso();
  const tx = db.transaction(items => {
    items.forEach(item => stmt.run(
      item.trend_id,
      item.run_id,
      item.cluster_id,
      item.label || "",
      item.representative_doc_id || "",
      JSON.stringify(item.top_entities || []),
      JSON.stringify(item.top_tickers || []),
      JSON.stringify(item.signal_tags || []),
      item.note || "",
      Number(item.doc_count || 0),
      now
    ));
  });
  const payload = trends.map(trend => ({
    trend_id: `${runId}:${trend.cluster_id || trend.label || "cluster"}`,
    run_id: runId,
    cluster_id: trend.cluster_id || "",
    label: trend.label || "",
    representative_doc_id: trend.representative_doc_id || "",
    top_entities: trend.top_entities || [],
    top_tickers: trend.top_tickers || [],
    signal_tags: trend.signal_tags || [],
    note: trend.note || "",
    doc_count: trend.doc_count || 0
  }));
  tx(payload);
  return payload.length;
}

export function listSignalTrends({ runId, limit = 20 } = {}) {
  initRagStore();
  const resolvedRunId = runId || getLatestSignalsRun()?.run_id;
  if (!resolvedRunId) return [];
  const rows = db.prepare(`
    SELECT * FROM signals_trends
    WHERE run_id = ?
    ORDER BY doc_count DESC
    LIMIT ?
  `).all(resolvedRunId, Number(limit || 20));
  return rows.map(normalizeSignalTrendRow).filter(Boolean);
}

export function getSignalsOverview() {
  initRagStore();
  const total = db.prepare("SELECT COUNT(*) AS count FROM signals_documents").get()?.count || 0;
  const stale = db.prepare("SELECT COUNT(*) AS count FROM signals_documents WHERE stale = 1 AND (expired = 0 OR expired IS NULL)").get()?.count || 0;
  const expired = db.prepare("SELECT COUNT(*) AS count FROM signals_documents WHERE expired = 1").get()?.count || 0;
  const latestRun = getLatestSignalsRun();
  return {
    total,
    stale,
    expired,
    latestRun
  };
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
    hnswIndex.addPoint(toHnswVector(vec), label);
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
      hnswIndex.addPoint(toHnswVector(vec), label);
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
  const result = hnswIndex.searchKnn(toHnswVector(vec), topK);
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
    } else if (type === "signals") {
      where.push("m.id LIKE 'signals:%'");
    } else if (type === "fireflies") {
      where.push("m.id NOT LIKE 'memory:%'");
      where.push("m.id NOT LIKE 'feedback:%'");
      where.push("m.id NOT LIKE 'recording:%'");
      where.push("m.id NOT LIKE 'trading:%'");
      where.push("m.id NOT LIKE 'signals:%'");
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
    } else if (type === "signals") {
      where.push("m.id LIKE 'signals:%'");
    } else if (type === "fireflies") {
      where.push("m.id NOT LIKE 'memory:%'");
      where.push("m.id NOT LIKE 'feedback:%'");
      where.push("m.id NOT LIKE 'recording:%'");
      where.push("m.id NOT LIKE 'trading:%'");
      where.push("m.id NOT LIKE 'signals:%'");
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
  } else if (normalizedType === "signals") {
    where.push("m.id LIKE 'signals:%'");
  } else if (normalizedType === "fireflies") {
    where.push("m.id NOT LIKE 'memory:%'");
    where.push("m.id NOT LIKE 'feedback:%'");
    where.push("m.id NOT LIKE 'recording:%'");
    where.push("m.id NOT LIKE 'trading:%'");
    where.push("m.id NOT LIKE 'signals:%'");
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
  } else if (normalizedType === "signals") {
    where.push("m.id LIKE 'signals:%'");
  } else if (normalizedType === "fireflies") {
    where.push("m.id NOT LIKE 'memory:%'");
    where.push("m.id NOT LIKE 'feedback:%'");
    where.push("m.id NOT LIKE 'recording:%'");
    where.push("m.id NOT LIKE 'trading:%'");
    where.push("m.id NOT LIKE 'signals:%'");
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
  const signalsMeetings = db.prepare("SELECT COUNT(*) AS count FROM meetings WHERE id LIKE 'signals:%'").get()?.count || 0;
  const firefliesMeetings = totalMeetings - memoryMeetings - feedbackMeetings - recordingMeetings - tradingMeetings - signalsMeetings;
  return {
    totalMeetings,
    totalChunks,
    firefliesMeetings: Math.max(0, firefliesMeetings),
    recordingMeetings,
    memoryMeetings,
    feedbackMeetings,
    tradingMeetings,
    signalsMeetings
  };
}
