import test from "node:test";
import assert from "node:assert/strict";
import { initDb } from "../storage/db.js";
import { runMigrations } from "../storage/schema.js";
import { syncModuleRegistry, listModuleRegistry } from "../src/aika/moduleRegistry.js";

initDb();
runMigrations();

test("module registry loads 38 modules", () => {
  const modules = syncModuleRegistry();
  assert.equal(modules.length, 38);
  const registry = listModuleRegistry({ includeDisabled: true });
  assert.equal(registry.length, 38);
  registry.forEach(moduleDef => {
    assert.ok(moduleDef.id);
    assert.ok(Array.isArray(moduleDef.triggerPhrases || moduleDef.trigger_phrases || []));
  });
});
