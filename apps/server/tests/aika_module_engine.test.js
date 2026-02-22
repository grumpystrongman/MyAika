import test from "node:test";
import assert from "node:assert/strict";
import { initDb } from "../storage/db.js";
import { runMigrations } from "../storage/schema.js";
import { syncModuleRegistry } from "../src/aika/moduleRegistry.js";
import { executeModule } from "../src/aika/moduleEngine.js";
import { listManualActions } from "../storage/manual_actions.js";
import { listConfirmations } from "../storage/confirmations.js";

initDb();
runMigrations();
syncModuleRegistry();

test("module engine creates manual checklist in no-integrations mode", async () => {
  const result = await executeModule({
    moduleId: "drafting_factory",
    inputPayload: { context_text: "Draft a follow-up email." },
    context: { userId: "local" },
    modeFlags: { no_integrations: true }
  });
  assert.equal(result.status, "completed");
  assert.ok(Array.isArray(result.output.manual_checklist));
  const actions = listManualActions({ userId: "local", status: "pending", limit: 5 });
  assert.ok(actions.some(action => action.title.includes("Drafting Factory")));
});

test("module engine requires confirmation for risky actions", async () => {
  const result = await executeModule({
    moduleId: "relationship_ops",
    inputPayload: { context_text: "Send a gratitude note", structured_input: { to: ["a@example.com"], subject: "Thanks" } },
    context: { userId: "local" },
    modeFlags: { no_integrations: false }
  });
  assert.equal(result.status, "approval_required");
  const confirmations = listConfirmations({ userId: "local", status: "pending", limit: 5 });
  assert.ok(confirmations.length > 0);
});
