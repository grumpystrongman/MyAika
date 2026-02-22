import test from "node:test";
import assert from "node:assert/strict";
import { listMacros } from "../src/actionRunner/macros.js";
import { listDesktopMacros } from "../src/desktopRunner/macros.js";

test("seeded teach macros are available", () => {
  const macros = listMacros();
  const ids = macros.map(m => m.id);
  assert.ok(ids.includes("aika_daily_digest_snapshot"));
  assert.ok(ids.includes("aika_module_registry_export"));
});

test("seeded desktop macros are available", () => {
  const macros = listDesktopMacros();
  const ids = macros.map(m => m.id);
  assert.ok(ids.includes("aika_desktop_status_check"));
  assert.ok(ids.includes("aika_desktop_focus_block"));
});
