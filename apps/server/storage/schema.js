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
  },
  {
    id: 8,
    sql: `
    CREATE TABLE IF NOT EXISTS chat_threads (
      id TEXT PRIMARY KEY,
      channel TEXT NOT NULL,
      sender_id TEXT NOT NULL,
      chat_id TEXT,
      status TEXT NOT NULL,
      title TEXT,
      rag_model TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      last_message_at TEXT,
      metadata_json TEXT
    );
    CREATE INDEX IF NOT EXISTS chat_threads_lookup
      ON chat_threads (channel, sender_id, chat_id, status, updated_at);

    CREATE TABLE IF NOT EXISTS chat_messages (
      id TEXT PRIMARY KEY,
      thread_id TEXT NOT NULL,
      role TEXT NOT NULL,
      content TEXT NOT NULL,
      created_at TEXT NOT NULL,
      metadata_json TEXT,
      FOREIGN KEY(thread_id) REFERENCES chat_threads(id) ON DELETE CASCADE
    );
    CREATE INDEX IF NOT EXISTS chat_messages_thread
      ON chat_messages (thread_id, created_at);
    `
  },
  {
    id: 9,
    sql: `
    CREATE TABLE IF NOT EXISTS assistant_profile (
      id TEXT PRIMARY KEY,
      display_name TEXT,
      timezone TEXT,
      preferences_json TEXT,
      memory_mode TEXT,
      auto_summary INTEGER,
      summary_json TEXT,
      created_at TEXT,
      updated_at TEXT
    );

    CREATE TABLE IF NOT EXISTS assistant_projects (
      id TEXT PRIMARY KEY,
      owner_id TEXT,
      name TEXT,
      description TEXT,
      status TEXT,
      metadata_json TEXT,
      created_at TEXT,
      updated_at TEXT
    );
    CREATE INDEX IF NOT EXISTS idx_assistant_projects_owner
      ON assistant_projects (owner_id, status, created_at);

    CREATE TABLE IF NOT EXISTS assistant_tasks (
      id TEXT PRIMARY KEY,
      owner_id TEXT,
      title TEXT,
      prompt TEXT,
      schedule_json TEXT,
      status TEXT,
      last_run_at TEXT,
      next_run_at TEXT,
      last_run_status TEXT,
      last_run_output TEXT,
      last_run_error TEXT,
      notification_channels_json TEXT,
      notification_targets_json TEXT,
      created_at TEXT,
      updated_at TEXT
    );
    CREATE INDEX IF NOT EXISTS idx_assistant_tasks_owner
      ON assistant_tasks (owner_id, status, next_run_at);

    CREATE TABLE IF NOT EXISTS assistant_change_proposals (
      id TEXT PRIMARY KEY,
      owner_id TEXT,
      title TEXT,
      summary TEXT,
      details_json TEXT,
      status TEXT,
      approval_id TEXT,
      decided_at TEXT,
      decided_by TEXT,
      created_at TEXT,
      updated_at TEXT
    );
    CREATE INDEX IF NOT EXISTS idx_assistant_proposals_owner
      ON assistant_change_proposals (owner_id, status, created_at);
    `
  },
  {
    id: 10,
    sql: `
    CREATE TABLE IF NOT EXISTS trading_manual_trades (
      id TEXT PRIMARY KEY,
      user_id TEXT,
      symbol TEXT,
      asset_class TEXT,
      side TEXT,
      quantity REAL,
      entry_price REAL,
      exit_price REAL,
      fees REAL,
      opened_at TEXT,
      closed_at TEXT,
      notes TEXT,
      created_at TEXT,
      updated_at TEXT
    );
    CREATE INDEX IF NOT EXISTS idx_trading_manual_trades_user
      ON trading_manual_trades (user_id, created_at);
    `
  },
  {
    id: 11,
    sql: `
    CREATE TABLE IF NOT EXISTS todo_lists (
      id TEXT PRIMARY KEY,
      name TEXT,
      color TEXT,
      icon TEXT,
      sort_order INTEGER,
      created_at TEXT,
      updated_at TEXT,
      user_id TEXT
    );

    ALTER TABLE todos ADD COLUMN list_id TEXT;
    ALTER TABLE todos ADD COLUMN notes TEXT;
    ALTER TABLE todos ADD COLUMN reminder_at TEXT;
    ALTER TABLE todos ADD COLUMN repeat_rule TEXT;
    ALTER TABLE todos ADD COLUMN completed_at TEXT;
    ALTER TABLE todos ADD COLUMN steps_json TEXT;
    ALTER TABLE todos ADD COLUMN pinned INTEGER;
    ALTER TABLE todos ADD COLUMN sort_order INTEGER;
    ALTER TABLE todos ADD COLUMN archived_at TEXT;

    INSERT OR IGNORE INTO todo_lists (id, name, color, icon, sort_order, created_at, updated_at, user_id)
    VALUES ('inbox', 'Inbox', '#22c55e', 'inbox', 0, strftime('%Y-%m-%dT%H:%M:%fZ','now'), strftime('%Y-%m-%dT%H:%M:%fZ','now'), 'local');

    UPDATE todos SET list_id = 'inbox' WHERE list_id IS NULL AND user_id = 'local';

    CREATE INDEX IF NOT EXISTS idx_todos_list ON todos(list_id);
    CREATE INDEX IF NOT EXISTS idx_todos_status ON todos(status);
    CREATE INDEX IF NOT EXISTS idx_todos_due ON todos(due);
    `
  },
  {
    id: 12,
    sql: `
    ALTER TABLE todos ADD COLUMN reminder_sent_at TEXT;
    ALTER TABLE todos ADD COLUMN reminder_status TEXT;
    ALTER TABLE todos ADD COLUMN reminder_error TEXT;
    ALTER TABLE todos ADD COLUMN reminder_approval_id TEXT;
    CREATE INDEX IF NOT EXISTS idx_todos_reminder
      ON todos(reminder_at, reminder_sent_at);
    `
  },
  {
    id: 13,
    sql: `
    ALTER TABLE trading_settings ADD COLUMN engine_json TEXT;
    `
  },
  {
    id: 14,
    sql: `
    CREATE TABLE IF NOT EXISTS restaurants (
      restaurant_id TEXT PRIMARY KEY,
      osm_type TEXT,
      osm_id TEXT,
      name TEXT,
      address TEXT,
      address_json TEXT,
      lat REAL,
      lon REAL,
      phone TEXT,
      website TEXT,
      cuisine_tags_json TEXT,
      hours_json TEXT,
      price_hint TEXT,
      source_refs_json TEXT,
      menu_hash TEXT,
      hours_hash TEXT,
      menu_updated_at TEXT,
      hours_updated_at TEXT,
      created_at TEXT,
      updated_at TEXT
    );

    CREATE TABLE IF NOT EXISTS restaurant_menus (
      restaurant_id TEXT PRIMARY KEY,
      menu_json TEXT,
      last_seen_at TEXT
    );

    CREATE TABLE IF NOT EXISTS restaurant_media (
      id TEXT PRIMARY KEY,
      restaurant_id TEXT,
      image_url TEXT,
      caption TEXT,
      source_url TEXT,
      created_at TEXT
    );

    CREATE TABLE IF NOT EXISTS restaurant_pages (
      id TEXT PRIMARY KEY,
      restaurant_id TEXT,
      url TEXT,
      doc_type TEXT,
      title TEXT,
      status TEXT,
      etag TEXT,
      last_modified TEXT,
      content_hash TEXT,
      http_status INTEGER,
      error TEXT,
      last_crawled_at TEXT,
      last_changed_at TEXT,
      crawl_run_id TEXT
    );

    CREATE TABLE IF NOT EXISTS restaurant_document_chunks (
      chunk_id TEXT PRIMARY KEY,
      restaurant_id TEXT,
      source_url TEXT,
      doc_type TEXT,
      text TEXT,
      created_at TEXT,
      content_hash TEXT,
      crawl_run_id TEXT
    );

    CREATE TABLE IF NOT EXISTS restaurant_crawl_runs (
      id TEXT PRIMARY KEY,
      started_at TEXT,
      finished_at TEXT,
      status TEXT,
      restaurants_total INTEGER,
      restaurants_new INTEGER,
      restaurants_updated INTEGER,
      pages_fetched INTEGER,
      pages_skipped INTEGER,
      chunks_upserted INTEGER,
      errors_json TEXT
    );

    CREATE INDEX IF NOT EXISTS idx_restaurants_name ON restaurants(name);
    CREATE INDEX IF NOT EXISTS idx_restaurant_pages_url ON restaurant_pages(url);
    CREATE INDEX IF NOT EXISTS idx_restaurant_chunks_restaurant ON restaurant_document_chunks(restaurant_id);
    `
  },
  {
    id: 15,
    sql: `
    CREATE TABLE IF NOT EXISTS trading_accounts (
      id TEXT PRIMARY KEY,
      user_id TEXT,
      mode TEXT,
      equity REAL,
      cash REAL,
      created_at TEXT,
      updated_at TEXT
    );

    CREATE TABLE IF NOT EXISTS trading_positions (
      id TEXT PRIMARY KEY,
      account_id TEXT,
      symbol TEXT,
      asset_class TEXT,
      side TEXT,
      quantity REAL,
      entry_price REAL,
      leverage REAL,
      stop_loss REAL,
      take_profit REAL,
      opened_at TEXT,
      updated_at TEXT
    );
    CREATE INDEX IF NOT EXISTS idx_trading_positions_account
      ON trading_positions (account_id, symbol);

    CREATE TABLE IF NOT EXISTS trading_orders (
      id TEXT PRIMARY KEY,
      account_id TEXT,
      symbol TEXT,
      asset_class TEXT,
      side TEXT,
      quantity REAL,
      type TEXT,
      price REAL,
      status TEXT,
      fill_price REAL,
      filled_at TEXT,
      leverage REAL,
      stop_loss REAL,
      take_profit REAL,
      risk_check_id TEXT,
      mode TEXT,
      created_at TEXT,
      updated_at TEXT
    );
    CREATE INDEX IF NOT EXISTS idx_trading_orders_account
      ON trading_orders (account_id, created_at);

    CREATE TABLE IF NOT EXISTS trading_daily_pnl (
      id TEXT PRIMARY KEY,
      account_id TEXT,
      day TEXT,
      realized_pnl REAL,
      updated_at TEXT
    );
    CREATE INDEX IF NOT EXISTS idx_trading_daily_pnl
      ON trading_daily_pnl (account_id, day);

    CREATE TABLE IF NOT EXISTS trading_risk_checks (
      id TEXT PRIMARY KEY,
      account_id TEXT,
      mode TEXT,
      trade_json TEXT,
      decision TEXT,
      reasons_json TEXT,
      created_at TEXT
    );
    CREATE INDEX IF NOT EXISTS idx_trading_risk_checks
      ON trading_risk_checks (account_id, created_at);

    CREATE TABLE IF NOT EXISTS openai_usage (
      id TEXT PRIMARY KEY,
      ts TEXT,
      model TEXT,
      prompt_tokens INTEGER,
      completion_tokens INTEGER,
      total_tokens INTEGER,
      cost_usd REAL
    );
    CREATE INDEX IF NOT EXISTS idx_openai_usage_ts
      ON openai_usage (ts);
    `
  },
  {
    id: 16,
    sql: `
    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      name TEXT,
      timezone TEXT,
      email TEXT,
      telegram_user_id TEXT,
      created_at TEXT
    );

    CREATE TABLE IF NOT EXISTS settings (
      user_id TEXT PRIMARY KEY,
      digest_time TEXT,
      pulse_time TEXT,
      weekly_time TEXT,
      noise_budget_per_day INTEGER,
      confirmation_policy TEXT,
      mode_flags_json TEXT,
      created_at TEXT,
      updated_at TEXT,
      FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS modules (
      id TEXT PRIMARY KEY,
      name TEXT,
      level TEXT,
      description TEXT,
      trigger_phrases_json TEXT,
      required_inputs_json TEXT,
      action_definition_json TEXT,
      output_schema_json TEXT,
      update_policy_json TEXT,
      requires_confirmation INTEGER,
      enabled INTEGER,
      order_index INTEGER,
      created_at TEXT,
      updated_at TEXT
    );

    CREATE TABLE IF NOT EXISTS module_runs (
      id TEXT PRIMARY KEY,
      user_id TEXT,
      module_id TEXT,
      channel TEXT,
      status TEXT,
      input_payload_json TEXT,
      output_payload_json TEXT,
      created_at TEXT,
      completed_at TEXT
    );
    CREATE INDEX IF NOT EXISTS idx_module_runs_user
      ON module_runs (user_id, created_at);

    CREATE TABLE IF NOT EXISTS run_steps (
      id TEXT PRIMARY KEY,
      module_run_id TEXT,
      step_index INTEGER,
      step_type TEXT,
      status TEXT,
      request_json TEXT,
      response_json TEXT,
      started_at TEXT,
      ended_at TEXT,
      FOREIGN KEY(module_run_id) REFERENCES module_runs(id) ON DELETE CASCADE
    );
    CREATE INDEX IF NOT EXISTS idx_run_steps_run
      ON run_steps (module_run_id, step_index);

    CREATE TABLE IF NOT EXISTS manual_action_queue (
      id TEXT PRIMARY KEY,
      user_id TEXT,
      source_run_id TEXT,
      priority TEXT,
      title TEXT,
      instructions TEXT,
      copy_ready_payload_json TEXT,
      status TEXT,
      due_at TEXT,
      created_at TEXT,
      completed_at TEXT
    );
    CREATE INDEX IF NOT EXISTS idx_manual_action_queue_user
      ON manual_action_queue (user_id, status, created_at);

    CREATE TABLE IF NOT EXISTS confirmations (
      id TEXT PRIMARY KEY,
      user_id TEXT,
      run_id TEXT,
      action_type TEXT,
      summary TEXT,
      details_json TEXT,
      status TEXT,
      approval_id TEXT,
      requested_at TEXT,
      resolved_at TEXT
    );
    CREATE INDEX IF NOT EXISTS idx_confirmations_user
      ON confirmations (user_id, status, requested_at);

    CREATE TABLE IF NOT EXISTS watch_items (
      id TEXT PRIMARY KEY,
      user_id TEXT,
      type TEXT,
      config_json TEXT,
      cadence TEXT,
      thresholds_json TEXT,
      enabled INTEGER,
      created_at TEXT,
      updated_at TEXT,
      last_observed_at TEXT
    );
    CREATE INDEX IF NOT EXISTS idx_watch_items_user
      ON watch_items (user_id, enabled, created_at);

    CREATE TABLE IF NOT EXISTS watch_events (
      id TEXT PRIMARY KEY,
      watch_item_id TEXT,
      observed_at TEXT,
      raw_input_json TEXT,
      derived_signal_json TEXT,
      severity TEXT,
      summary TEXT,
      diff_json TEXT,
      FOREIGN KEY(watch_item_id) REFERENCES watch_items(id) ON DELETE CASCADE
    );
    CREATE INDEX IF NOT EXISTS idx_watch_events_item
      ON watch_events (watch_item_id, observed_at);

    CREATE TABLE IF NOT EXISTS memory_items (
      id TEXT PRIMARY KEY,
      user_id TEXT,
      scope TEXT,
      key TEXT,
      value_json TEXT,
      sensitivity TEXT,
      source TEXT,
      created_at TEXT,
      updated_at TEXT
    );
    CREATE INDEX IF NOT EXISTS idx_memory_items_user
      ON memory_items (user_id, scope, key);

    CREATE TABLE IF NOT EXISTS digests (
      id TEXT PRIMARY KEY,
      user_id TEXT,
      type TEXT,
      period_start TEXT,
      period_end TEXT,
      content TEXT,
      sent_email INTEGER,
      sent_telegram INTEGER,
      created_at TEXT,
      sent_at TEXT
    );
    CREATE INDEX IF NOT EXISTS idx_digests_user
      ON digests (user_id, type, created_at);

    INSERT OR IGNORE INTO users (id, name, timezone, email, telegram_user_id, created_at)
    VALUES ('local', 'Jeff', '', '', '', strftime('%Y-%m-%dT%H:%M:%fZ','now'));
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
