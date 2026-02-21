import Database from "better-sqlite3";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { threadId } from "node:worker_threads";

let db = null;
let dbPath = "";

function resolveRepoRoot() {
  const override = process.env.AIKA_REPO_ROOT || "";
  if (override) return path.isAbsolute(override) ? override : path.resolve(process.cwd(), override);
  return path.resolve(process.cwd(), "..", "..");
}

function resolveDbPath() {
  const override = process.env.AIKA_DB_PATH || "";
  const isTestEnv = process.env.NODE_ENV === "test" || process.argv.includes("--test") || process.env.AIKA_TEST_MODE === "1";
  if (override && !isTestEnv) {
    if (override === ":memory:") return override;
    return path.isAbsolute(override) ? override : path.join(resolveRepoRoot(), override);
  }
  if (isTestEnv) {
    const suffix = `${process.pid}-${threadId || 0}`;
    return path.join(os.tmpdir(), `aika_test_${suffix}.sqlite`);
  }
  return path.join(resolveRepoRoot(), "data", "db", "aika.sqlite");
}

function ensureDir(dirPath) {
  if (!fs.existsSync(dirPath)) fs.mkdirSync(dirPath, { recursive: true });
}

export function getDb() {
  if (!db) throw new Error("db_not_initialized");
  return db;
}

export function initDb() {
  if (db) return db;
  dbPath = resolveDbPath();
  if (dbPath !== ":memory:") ensureDir(path.dirname(dbPath));
  db = new Database(dbPath);
  db.pragma("journal_mode = WAL");
  db.pragma("foreign_keys = ON");
  return db;
}

export function closeDb() {
  if (db) db.close();
  db = null;
}
