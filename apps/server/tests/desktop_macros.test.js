import assert from "node:assert/strict";
import test from "node:test";
import {
  saveDesktopMacro,
  getDesktopMacro,
  deleteDesktopMacro,
  listDesktopMacros,
  applyDesktopMacroParams,
  buildDesktopMacroPlan
} from "../src/desktopRunner/macros.js";

test("desktop macro save/list/delete cycle", () => {
  const name = `Test Macro ${Date.now()}`;
  const macro = saveDesktopMacro({
    name,
    description: "Test macro",
    tags: ["test"],
    actions: [{ type: "wait", ms: 120 }]
  });
  assert.ok(macro.id);
  const fetched = getDesktopMacro(macro.id);
  assert.equal(fetched?.name, name);
  const listed = listDesktopMacros();
  assert.ok(listed.some(item => item.id === macro.id));
  const deleted = deleteDesktopMacro(macro.id);
  assert.equal(deleted, true);
});

test("desktop macro params and plan build", () => {
  const macro = {
    id: "macro",
    name: "Hello Macro",
    actions: [{ type: "type", text: "Hello {{name}}" }],
    safety: { requireApprovalFor: ["input"], maxActions: 10 }
  };
  const resolved = applyDesktopMacroParams(macro, { name: "Aika" });
  assert.equal(resolved.actions[0].text, "Hello Aika");
  const plan = buildDesktopMacroPlan(resolved);
  assert.equal(plan.taskName, "Hello Macro");
  assert.equal(plan.actions.length, 1);
  assert.equal(plan.safety.maxActions, 10);
});
