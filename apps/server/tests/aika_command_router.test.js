import test from "node:test";
import assert from "node:assert/strict";
import { initDb } from "../storage/db.js";
import { runMigrations } from "../storage/schema.js";
import { syncModuleRegistry } from "../src/aika/moduleRegistry.js";
import { routeAikaCommand } from "../src/aika/commandRouter.js";

initDb();
runMigrations();
syncModuleRegistry();

test("routeAikaCommand handles module registry request", async () => {
  const result = await routeAikaCommand({ text: "AIKA, show my modules", context: { userId: "local" } });
  assert.equal(result.handled, true);
  assert.ok(result.reply.includes("Level"));
});

test("routeAikaCommand handles daily digest", async () => {
  const result = await routeAikaCommand({ text: "AIKA, run daily digest", context: { userId: "local" } });
  assert.equal(result.handled, true);
  assert.ok(result.reply.includes("Daily Digest"));
});

test("routeAikaCommand handles no-integrations prefix", async () => {
  const result = await routeAikaCommand({ text: "EMAIL: Follow up with vendor", context: { userId: "local" } });
  assert.equal(result.handled, true);
  assert.ok(result.reply.toLowerCase().includes("no-integrations"));
});
