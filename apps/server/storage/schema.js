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
  },
  {
    id: 2,
    sql: `
    ALTER TABLE approvals ADD COLUMN token TEXT;
    ALTER TABLE approvals ADD COLUMN approved_by TEXT;
    ALTER TABLE approvals ADD COLUMN approved_at TEXT;
    ALTER TABLE approvals ADD COLUMN executed_at TEXT;
    `
  },
  {
    id: 3,
    sql: `
    CREATE TABLE IF NOT EXISTS recordings (
      id TEXT PRIMARY KEY,
      workspace_id TEXT,
      created_by TEXT,
      title TEXT,
      started_at TEXT,
      ended_at TEXT,
      duration INTEGER,
      status TEXT,
      storage_url TEXT,
      storage_path TEXT,
      transcript_text TEXT,
      transcript_json TEXT,
      language TEXT,
      diarization_json TEXT,
      summary_json TEXT,
      decisions_json TEXT,
      tasks_json TEXT,
      risks_json TEXT,
      next_steps_json TEXT,
      artifacts_json TEXT,
      redaction_enabled INTEGER,
      retention_expires_at TEXT,
      processing_json TEXT
    );

    CREATE TABLE IF NOT EXISTS audio_chunks (
      id TEXT PRIMARY KEY,
      recording_id TEXT,
      seq INTEGER,
      storage_path TEXT,
      created_at TEXT
    );

    CREATE TABLE IF NOT EXISTS memory_entities (
      id TEXT PRIMARY KEY,
      workspace_id TEXT,
      recording_id TEXT,
      type TEXT,
      value TEXT,
      normalized_value TEXT,
      metadata_json TEXT,
      created_at TEXT
    );

    CREATE TABLE IF NOT EXISTS agent_actions (
      id TEXT PRIMARY KEY,
      workspace_id TEXT,
      recording_id TEXT,
      requested_by TEXT,
      action_type TEXT,
      input_json TEXT,
      output_json TEXT,
      status TEXT,
      created_at TEXT
    );
    `
  },
  {
    id: 4,
    sql: `
    ALTER TABLE notes ADD COLUMN user_id TEXT;
    UPDATE notes SET user_id = 'local' WHERE user_id IS NULL;

    ALTER TABLE meetings ADD COLUMN user_id TEXT;
    UPDATE meetings SET user_id = 'local' WHERE user_id IS NULL;

    ALTER TABLE todos ADD COLUMN user_id TEXT;
    UPDATE todos SET user_id = 'local' WHERE user_id IS NULL;

    ALTER TABLE calendar_holds ADD COLUMN user_id TEXT;
    UPDATE calendar_holds SET user_id = 'local' WHERE user_id IS NULL;

    ALTER TABLE email_drafts ADD COLUMN user_id TEXT;
    UPDATE email_drafts SET user_id = 'local' WHERE user_id IS NULL;

    ALTER TABLE spreadsheet_patches ADD COLUMN user_id TEXT;
    UPDATE spreadsheet_patches SET user_id = 'local' WHERE user_id IS NULL;

    ALTER TABLE memory_entries ADD COLUMN user_id TEXT;
    UPDATE memory_entries SET user_id = 'local' WHERE user_id IS NULL;
    `
  },
  {
    id: 5,
    sql: `
    ALTER TABLE approvals ADD COLUMN created_by TEXT;
    ALTER TABLE approvals ADD COLUMN action_type TEXT;
    ALTER TABLE approvals ADD COLUMN summary TEXT;
    ALTER TABLE approvals ADD COLUMN payload_redacted_json TEXT;
    ALTER TABLE approvals ADD COLUMN decided_at TEXT;
    ALTER TABLE approvals ADD COLUMN decided_by TEXT;
    ALTER TABLE approvals ADD COLUMN reason TEXT;

    CREATE TABLE IF NOT EXISTS audit_events (
      id TEXT PRIMARY KEY,
      ts TEXT,
      user TEXT,
      session TEXT,
      action_type TEXT,
      decision TEXT,
      reason TEXT,
      risk_score INTEGER,
      resource_refs TEXT,
      redacted_payload TEXT,
      result_redacted TEXT,
      prev_hash TEXT,
      hash TEXT
    );
    `
  },
  {
    id: 6,
    sql: `
    CREATE TABLE IF NOT EXISTS trading_settings (
      id TEXT PRIMARY KEY,
      email_json TEXT,
      training_json TEXT,
      created_at TEXT,
      updated_at TEXT
    );
    `
  },
  {
    id: 7,
    sql: `
    CREATE TABLE IF NOT EXISTS trading_scenarios (
      id TEXT PRIMARY KEY,
      run_at TEXT,
      asset_class TEXT,
      window_days INTEGER,
      picks_json TEXT,
      results_json TEXT,
      notes TEXT
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
