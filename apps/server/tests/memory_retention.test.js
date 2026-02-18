import test from "node:test";
import assert from "node:assert/strict";
import { initDb, getDb } from "../storage/db.js";
import { runMigrations } from "../storage/schema.js";
import { createMemoryEntry, pruneMemoryEntries } from "../storage/memory.js";

test("memory retention prunes by user and tier", () => {
  initDb();
  runMigrations();
  const userId = `retention_test_${Date.now()}`;
  const entry = createMemoryEntry({
    tier: 1,
    title: "Retention Test",
    content: "Old memory",
    tags: ["test"],
    userId
  });

  const db = getDb();
  db.prepare("UPDATE memory_entries SET created_at = ? WHERE id = ?")
    .run("2000-01-01T00:00:00.000Z", entry.id);

  const result = pruneMemoryEntries({ retentionDaysByTier: { 1: 1 }, userId });
  assert.ok(result.deleted >= 1);

  const remaining = db.prepare("SELECT id FROM memory_entries WHERE id = ?").get(entry.id);
  assert.equal(remaining, undefined);
});
