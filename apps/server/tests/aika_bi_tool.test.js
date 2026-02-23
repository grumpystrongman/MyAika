import test from "node:test";
import assert from "node:assert/strict";
import { initDb } from "../storage/db.js";
import { runMigrations } from "../storage/schema.js";
import { executor } from "../mcp/index.js";

initDb();
runMigrations();

test("bi.snapshot records watch event", async () => {
  const result = await executor.callTool({
    name: "bi.snapshot",
    params: { metric: "admissions", value: 120, watchTemplateId: "kpi_drift" },
    context: { userId: "bi_test" }
  });
  assert.equal(result.status, "ok");
  assert.ok(result.data?.event);
  assert.equal(result.data?.watchItem?.type, "kpi");
});
