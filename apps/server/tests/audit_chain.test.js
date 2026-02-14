import test from "node:test";
import assert from "node:assert/strict";
import { initDb } from "../storage/db.js";
import { runMigrations } from "../storage/schema.js";
import { appendAuditEvent, verifyAuditChain } from "../src/safety/auditLog.js";

test("audit hash chain validates", () => {
  initDb();
  runMigrations();
  appendAuditEvent({
    action_type: "chat.respond",
    decision: "allow",
    reason: "test",
    user: "tester",
    session: "session",
    risk_score: 1,
    resource_refs: [],
    redacted_payload: { message: "hello" },
    result_redacted: { ok: true }
  });
  appendAuditEvent({
    action_type: "email.send",
    decision: "require_approval",
    reason: "test",
    user: "tester",
    session: "session",
    risk_score: 80,
    resource_refs: [],
    redacted_payload: { to: ["a@example.com"] },
    result_redacted: { approval: true }
  });
  const result = verifyAuditChain({ limit: 50 });
  assert.equal(result.ok, true);
});
