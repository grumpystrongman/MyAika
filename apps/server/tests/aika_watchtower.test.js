import test from "node:test";
import assert from "node:assert/strict";
import { initDb } from "../storage/db.js";
import { runMigrations } from "../storage/schema.js";
import { createWatchItemFromTemplate, observeWatchItem } from "../src/aika/watchtower.js";

initDb();
runMigrations();

test("watchtower detects KPI drift severity", () => {
  const item = createWatchItemFromTemplate({ templateId: "kpi_drift", userId: "local" });
  assert.ok(item?.id);
  observeWatchItem({ watchItemId: item.id, rawInput: 100, userId: "local" });
  const result = observeWatchItem({ watchItemId: item.id, rawInput: 120, userId: "local" });
  assert.equal(result.status, "ok");
  assert.equal(result.event.severity, "high");
});
