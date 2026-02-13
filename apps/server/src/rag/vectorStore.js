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

    CREATE TABLE IF NOT EXISTS chunk_embeddings (
      chunk_id TEXT PRIMARY KEY,
      embedding BLOB
    );

    CREATE INDEX IF NOT EXISTS idx_chunks_meeting ON chunks(meeting_id);
    CREATE INDEX IF NOT EXISTS idx_meetings_date ON meetings(occurred_at);
  `);
}

function getMeta(key) {
  const row = db.prepare("SELECT value FROM rag_meta WHERE key = ?").get(key);
  return row?.value || null;
}

function setMeta(key, value) {
  db.prepare("INSERT INTO rag_meta (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value")
    .run(key, value);
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
    INSERT INTO meetings (id, title, occurred_at, participants_json, source_url, raw_transcript, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(id) DO UPDATE SET
      title = excluded.title,
      occurred_at = excluded.occurred_at,
      participants_json = excluded.participants_json,
      source_url = excluded.source_url,
      raw_transcript = excluded.raw_transcript
  `).run(
    meeting.id,
    meeting.title || "",
    meeting.occurred_at || "",
    meeting.participants_json || "",
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

export function listMeetingSummaries({ dateFrom, dateTo, limit = 20 } = {}) {
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

export function listMeetings({ type = "all", limit = 20, offset = 0, search = "" } = {}) {
  initRagStore();
  const where = [];
  const params = [];
  const normalizedType = String(type || "all").toLowerCase();

  if (normalizedType === "memory") {
    where.push("m.id LIKE 'memory:%'");
  } else if (normalizedType === "feedback") {
    where.push("m.id LIKE 'feedback:%'");
  } else if (normalizedType === "fireflies") {
    where.push("m.id NOT LIKE 'memory:%'");
    where.push("m.id NOT LIKE 'feedback:%'");
  }

  if (search) {
    where.push("(m.title LIKE ? OR m.raw_transcript LIKE ?)");
    params.push(`%${search}%`, `%${search}%`);
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

export function getRagCounts() {
  initRagStore();
  const totalMeetings = db.prepare("SELECT COUNT(*) AS count FROM meetings").get()?.count || 0;
  const totalChunks = db.prepare("SELECT COUNT(*) AS count FROM chunks").get()?.count || 0;
  const memoryMeetings = db.prepare("SELECT COUNT(*) AS count FROM meetings WHERE id LIKE 'memory:%'").get()?.count || 0;
  const feedbackMeetings = db.prepare("SELECT COUNT(*) AS count FROM meetings WHERE id LIKE 'feedback:%'").get()?.count || 0;
  const firefliesMeetings = totalMeetings - memoryMeetings - feedbackMeetings;
  return {
    totalMeetings,
    totalChunks,
    firefliesMeetings: Math.max(0, firefliesMeetings),
    memoryMeetings,
    feedbackMeetings
  };
}
