import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { getDb } from "./db.js";
import { repoRoot, ensureDir, nowIso } from "./utils.js";

const cacheDir = path.join(repoRoot, "data", "cache", "meetings");

export function createMeetingRecord({ title, date, attendees = [], tags = [], summaryMarkdown, googleDocId = null, googleDocUrl = null }) {
  const db = getDb();
  ensureDir(cacheDir);
  const id = crypto.randomBytes(8).toString("hex");
  const createdAt = nowIso();
  const cachePath = path.join(cacheDir, `${id}.md`);
  fs.writeFileSync(cachePath, summaryMarkdown);
  db.prepare(
    `INSERT INTO meetings (id, title, date, attendees_json, tags_json, google_doc_id, google_doc_url, cache_path, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(id, title, date, JSON.stringify(attendees), JSON.stringify(tags), googleDocId, googleDocUrl, cachePath, createdAt);
  db.prepare(`INSERT INTO meetings_fts (id, title, content, tags) VALUES (?, ?, ?, ?)`) 
    .run(id, title, summaryMarkdown, tags.join(","));
  return { id, cachePath };
}

export function listMeetings(limit = 20) {
  const db = getDb();
  const rows = db.prepare(`SELECT id, title, date, google_doc_url, created_at FROM meetings ORDER BY created_at DESC LIMIT ?`).all(limit);
  return rows;
}