import assert from "node:assert/strict";
import test from "node:test";
import { assessDesktopPlan } from "../src/desktopRunner/runner.js";

test("assessDesktopPlan flags new app launches", () => {
  const assessment = assessDesktopPlan({
    taskName: "Launch Notepad",
    actions: [{ type: "launch", target: "notepad.exe" }],
    safety: { requireApprovalFor: ["launch"] },
    workspaceId: "test"
  });
  assert.ok(assessment.requiresApproval);
  assert.ok(assessment.newApps.includes("notepad.exe"));
});

test("assessDesktopPlan enforces max actions", () => {
  const actions = new Array(5).fill(null).map(() => ({ type: "wait", ms: 100 }));
  const assessment = assessDesktopPlan({
    taskName: "Wait",
    actions,
    safety: { maxActions: 3 },
    workspaceId: "test"
  });
  assert.equal(assessment.maxActions, 3);
  assert.equal(assessment.totalActions, 5);
});

test("assessDesktopPlan tags vision and uia actions", () => {
  const assessment = assessDesktopPlan({
    taskName: "Vision UIA",
    actions: [{ type: "visionOcr" }, { type: "uiaClick", name: "Save" }],
    safety: { requireApprovalFor: ["vision", "uia"] },
    workspaceId: "test"
  });
  assert.ok(assessment.riskTags.includes("vision"));
  assert.ok(assessment.riskTags.includes("uia"));
});
