import test from "node:test";
import assert from "node:assert/strict";
import { initDb } from "../storage/db.js";
import { runMigrations } from "../storage/schema.js";
import { executeRunbook } from "../src/aika/runbookEngine.js";

initDb();
runMigrations();

test("runbook engine executes weekly KPI report", async () => {
  const result = await executeRunbook({
    name: "Weekly KPI Report",
    inputPayload: { context_text: "KPI snapshot attached." },
    context: { userId: "local" }
  });
  assert.equal(result.status, "completed");
  assert.ok(result.output.artifacts.deliverables.length > 0);
});
