import { getDb } from "./db.js";

const migrations = [
  {
    id: 1,
    sql: `
    CREATE TABLE IF NOT EXISTS tool_history (
      id TEXT PRIMARY KEY,
      ts TEXT,
      tool TEXT,
      request_json TEXT,
      status TEXT,
      response_json TEXT,
      error_json TEXT
    );
    CREATE TABLE IF NOT EXISTS notes (
      id TEXT PRIMARY KEY,
      title TEXT,
      tags_json TEXT,
      google_doc_id TEXT,
      google_doc_url TEXT,
      cache_path TEXT,
      created_at TEXT,
      updated_at TEXT
    );
    CREATE VIRTUAL TABLE IF NOT EXISTS notes_fts USING fts5(id, title, content, tags);

    CREATE TABLE IF NOT EXISTS meetings (
      id TEXT PRIMARY KEY,
      title TEXT,
      date TEXT,
      attendees_json TEXT,
      tags_json TEXT,
      google_doc_id TEXT,
      google_doc_url TEXT,
      cache_path TEXT,
      created_at TEXT
    );
    CREATE VIRTUAL TABLE IF NOT EXISTS meetings_fts USING fts5(id, title, content, tags);

    CREATE TABLE IF NOT EXISTS todos (
      id TEXT PRIMARY KEY,
      title TEXT,
      details TEXT,
      due TEXT,
      priority TEXT,
      tags_json TEXT,
      status TEXT,
      created_at TEXT,
      updated_at TEXT
    );

    CREATE TABLE IF NOT EXISTS calendar_holds (
      id TEXT PRIMARY KEY,
      title TEXT,
      start TEXT,
      end TEXT,
      timezone TEXT,
      attendees_json TEXT,
      location TEXT,
      description TEXT,
      status TEXT,
      created_at TEXT
    );

    CREATE TABLE IF NOT EXISTS email_drafts (
      id TEXT PRIMARY KEY,
      original_from TEXT,
      original_subject TEXT,
      draft_subject TEXT,
      draft_body TEXT,
      to_json TEXT,
      cc_json TEXT,
      bcc_json TEXT,
      status TEXT,
      created_at TEXT
    );

    CREATE TABLE IF NOT EXISTS spreadsheet_patches (
      id TEXT PRIMARY KEY,
      target_type TEXT,
      target_ref TEXT,
      changes_json TEXT,
      diff_markdown TEXT,
      google_doc_id TEXT,
      google_doc_url TEXT,
      status TEXT,
      created_at TEXT
    );

    CREATE TABLE IF NOT EXISTS memory_entries (
      id TEXT PRIMARY KEY,
      tier INTEGER,
      title TEXT,
      tags_json TEXT,
      contains_phi INTEGER,
      content_ciphertext TEXT,
      content_plaintext TEXT,
      google_doc_id TEXT,
      google_doc_url TEXT,
      cache_path TEXT,
      created_at TEXT
    );
    CREATE VIRTUAL TABLE IF NOT EXISTS memory_fts USING fts5(id, title, content, tags, tier);

    CREATE TABLE IF NOT EXISTS approvals (
      id TEXT PRIMARY KEY,
      tool TEXT,
      request_json TEXT,
      preview TEXT,
      status TEXT,
      created_at TEXT,
      resolved_at TEXT
    );

    CREATE TABLE IF NOT EXISTS audit_log (
      id TEXT PRIMARY KEY,
      ts TEXT,
      action TEXT,
      detail_json TEXT
    );

    CREATE TABLE IF NOT EXISTS integration_cache (
      id TEXT PRIMARY KEY,
      provider TEXT,
      data_json TEXT,
      updated_at TEXT
    );
    `
  }
];

export function runMigrations() {
  const db = getDb();
  db.exec("CREATE TABLE IF NOT EXISTS schema_migrations (id INTEGER PRIMARY KEY)");
  const applied = new Set(db.prepare("SELECT id FROM schema_migrations").all().map(r => r.id));
  for (const m of migrations) {
    if (applied.has(m.id)) continue;
    db.exec(m.sql);
    db.prepare("INSERT INTO schema_migrations (id) VALUES (?)").run(m.id);
  }
}
