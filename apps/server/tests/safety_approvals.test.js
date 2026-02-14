import test from "node:test";
import assert from "node:assert/strict";
import { initDb } from "../storage/db.js";
import { runMigrations } from "../storage/schema.js";
import { createSafetyApproval, approveSafetyApproval, rejectSafetyApproval } from "../src/safety/approvals.js";

test("safety approvals lifecycle", () => {
  initDb();
  runMigrations();
  const created = createSafetyApproval({
    actionType: "email.send",
    summary: "Send test email",
    payloadRedacted: { to: ["a@example.com"] },
    createdBy: "tester"
  });
  assert.equal(created.status, "pending");

  const approved = approveSafetyApproval(created.id, "approver");
  assert.equal(approved.status, "approved");

  const created2 = createSafetyApproval({
    actionType: "file.delete",
    summary: "Delete file",
    payloadRedacted: { path: "C:/tmp/file.txt" },
    createdBy: "tester"
  });
  const rejected = rejectSafetyApproval(created2.id, "approver", "no");
  assert.equal(rejected.status, "rejected");
});
