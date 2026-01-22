import Database from "better-sqlite3";

export function initMemory(dbPath = "./memory.sqlite") {
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
  db.prepare(
    "INSERT INTO memories (created_at, role, content, tags) VALUES (?, ?, ?, ?)"
  ).run(new Date().toISOString(), role, content, tags);
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
