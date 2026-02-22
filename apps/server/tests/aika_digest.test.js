import test from "node:test";
import assert from "node:assert/strict";
import { initDb } from "../storage/db.js";
import { runMigrations } from "../storage/schema.js";
import { buildDailyDigest, buildWeeklyReview } from "../src/aika/digestEngine.js";

initDb();
runMigrations();

test("daily digest includes required sections", () => {
  const digest = buildDailyDigest({ userId: "local" });
  assert.ok(digest.text.includes("Daily Digest"));
  assert.ok(digest.text.includes("Top 3 Priorities"));
  assert.ok(digest.text.includes("Risks & Blocks"));
});

test("weekly review includes automation upgrades", () => {
  const digest = buildWeeklyReview({ userId: "local" });
  assert.ok(digest.text.includes("Automation Upgrades Backlog"));
});
