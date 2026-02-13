import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import Database from "better-sqlite3";

function resolveRepoRoot() {
  const moduleDir = path.dirname(fileURLToPath(import.meta.url));
  return path.resolve(moduleDir, "..", "..");
}

function resolveMemoryPath() {
  const repoRoot = resolveRepoRoot();
  const envPath = process.env.MEMORY_SQLITE_PATH || "";
  if (envPath) {
    return path.isAbsolute(envPath) ? envPath : path.join(repoRoot, envPath);
  }
  const legacyPath = path.join(repoRoot, "memory.sqlite");
  if (fs.existsSync(legacyPath)) return legacyPath;
  return path.join(repoRoot, "apps", "server", "data", "aika_memory.sqlite");
}

export function initMemory(dbPath = resolveMemoryPath()) {
  const dir = path.dirname(dbPath);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  const db = new Database(dbPath);
  db.exec(`
    CREATE TABLE IF NOT EXISTS memories (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      created_at TEXT NOT NULL,
      role TEXT NOT NULL,
      content TEXT NOT NULL,
      tags TEXT
    );
  `);
  return db;
}

export function addMemory(db, { role, content, tags = "" }) {
  const info = db.prepare(
    "INSERT INTO memories (created_at, role, content, tags) VALUES (?, ?, ?, ?)"
  ).run(new Date().toISOString(), role, content, tags);
  return info?.lastInsertRowid || null;
}

export function searchMemories(db, query, limit = 8) {
  const like = `%${String(query).toLowerCase()}%`;
  return db.prepare(`
    SELECT id, created_at, role, content, tags
    FROM memories
    WHERE lower(content) LIKE ?
    ORDER BY id DESC
    LIMIT ?
  `).all(like, limit);
}
