import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { getDb } from "./db.js";
import { repoRoot, ensureDir, nowIso } from "./utils.js";

const cacheDir = path.join(repoRoot, "data", "cache", "notes");

export function createNoteRecord({ title, body, tags = [], googleDocId = null, googleDocUrl = null }) {
  const db = getDb();
  ensureDir(cacheDir);
  const id = crypto.randomBytes(8).toString("hex");
  const createdAt = nowIso();
  const cachePath = path.join(cacheDir, `${id}.md`);
  const markdown = `# ${title}\n\n${body}\n`;
  fs.writeFileSync(cachePath, markdown);
  db.prepare(
    `INSERT INTO notes (id, title, tags_json, google_doc_id, google_doc_url, cache_path, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(id, title, JSON.stringify(tags), googleDocId, googleDocUrl, cachePath, createdAt, createdAt);
  db.prepare(`INSERT INTO notes_fts (id, title, content, tags) VALUES (?, ?, ?, ?)`) 
    .run(id, title, markdown, tags.join(","));
  return { id, cachePath, markdown };
}

export function searchNotes({ query, tags = [], limit = 20 }) {
  const db = getDb();
  if (query) {
    const rows = db.prepare(
      `SELECT id, title, content, tags FROM notes_fts WHERE notes_fts MATCH ? LIMIT ?`
    ).all(query, limit);
    const results = rows.map(r => ({
      id: r.id,
      title: r.title,
      snippet: (r.content || "").slice(0, 240),
      tags: r.tags ? r.tags.split(",") : []
    }));
    if (tags?.length) {
      return results.filter(r => tags.some(t => r.tags.includes(t)));
    }
    return results;
  }
  const rows = db.prepare(`SELECT id, title, tags_json, cache_path, google_doc_url, updated_at FROM notes ORDER BY updated_at DESC LIMIT ?`).all(limit);
  let list = rows.map(r => ({
    id: r.id,
    title: r.title,
    tags: r.tags_json ? JSON.parse(r.tags_json) : [],
    googleDocUrl: r.google_doc_url,
    updatedAt: r.updated_at
  }));
  if (tags?.length) list = list.filter(r => tags.some(t => r.tags.includes(t)));
  return list;
}
