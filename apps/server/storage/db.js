import Database from "better-sqlite3";
import fs from "node:fs";
import path from "node:path";

const repoRoot = path.resolve(process.cwd(), "..", "..");
const dataDir = path.join(repoRoot, "data", "db");
const dbPath = path.join(dataDir, "aika.sqlite");

let db = null;

function ensureDir() {
  if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });
}

export function getDb() {
  if (!db) throw new Error("db_not_initialized");
  return db;
}

export function initDb() {
  if (db) return db;
  ensureDir();
  db = new Database(dbPath);
  db.pragma("journal_mode = WAL");
  db.pragma("foreign_keys = ON");
  return db;
}

export function closeDb() {
  if (db) db.close();
  db = null;
}
