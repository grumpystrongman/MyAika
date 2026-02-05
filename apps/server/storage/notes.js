import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { getDb } from "./db.js";
import { repoRoot, ensureDir, nowIso } from "./utils.js";

const cacheDir = path.join(repoRoot, "data", "cache", "notes");

export function createNoteRecord({ title, body, tags = [], googleDocId = null, googleDocUrl = null, userId = "local" }) {
  const db = getDb();
  ensureDir(cacheDir);
  const id = crypto.randomBytes(8).toString("hex");
  const createdAt = nowIso();
  const cachePath = path.join(cacheDir, `${id}.md`);
  const markdown = `# ${title}\n\n${body}\n`;
  fs.writeFileSync(cachePath, markdown);
  db.prepare(
    `INSERT INTO notes (id, title, tags_json, google_doc_id, google_doc_url, cache_path, created_at, updated_at, user_id)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(id, title, JSON.stringify(tags), googleDocId, googleDocUrl, cachePath, createdAt, createdAt, userId);
  db.prepare(`INSERT INTO notes_fts (id, title, content, tags) VALUES (?, ?, ?, ?)`) 
    .run(id, title, markdown, tags.join(","));
  return { id, cachePath, markdown };
}

export function searchNotes({ query, tags = [], limit = 20, userId = "local" }) {
  const db = getDb();
  if (query) {
    const rows = db.prepare(
      `SELECT f.id, f.title, f.content, f.tags
       FROM notes_fts f
       JOIN notes n ON n.id = f.id
       WHERE n.user_id = ? AND notes_fts MATCH ?
       LIMIT ?`
    ).all(userId, query, limit);
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
  const rows = db.prepare(`SELECT id, title, tags_json, cache_path, google_doc_url, updated_at FROM notes WHERE user_id = ? ORDER BY updated_at DESC LIMIT ?`).all(userId, limit);
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
