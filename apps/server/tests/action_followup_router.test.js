import test from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import { initDb } from "../storage/db.js";
import { runMigrations } from "../storage/schema.js";
import { createAgentAction } from "../storage/agent_actions.js";
import { updateAssistantProfile } from "../storage/assistant_profile.js";
import { executeActionFollowUpRequest } from "../src/aika/actionFollowUpRouter.js";

initDb();
runMigrations();

function makeUser(prefix) {
  const token = crypto.randomUUID ? crypto.randomUUID() : crypto.randomBytes(8).toString("hex");
  return `${prefix}-${token}`;
}

test("follow-up router reports pending approval status", async () => {
  const userId = makeUser("followup-approval");
  createAgentAction({
    workspaceId: "default",
    requestedBy: userId,
    actionType: "messaging.telegramSend",
    input: { text: 'Send Telegram to Nina "Ping me"' },
    output: { result: { approval: { id: "appr-123" } } },
    status: "approval_required"
  });
  const result = await executeActionFollowUpRequest({
    text: "go ahead with that",
    context: { userId }
  });
  assert.ok(result.handled);
  assert.ok(result.reply.includes("Approval ID: appr-123"));
});

test("follow-up router retries the last retryable action", async () => {
  const userId = makeUser("followup-retry");
  updateAssistantProfile(userId, { preferences: { identity: { workEmail: "work@example.com" } } });
  createAgentAction({
    workspaceId: "default",
    requestedBy: userId,
    actionType: "email.send",
    input: { text: 'Email my work address "Retry me"' },
    output: { result: { retryable: true } },
    status: "failed"
  });
  let seenParams = null;
  const result = await executeActionFollowUpRequest({
    text: "retry that",
    context: { userId, channel: "web" },
    deps: {
      toolExecutor: {
        callTool: async ({ params }) => {
          seenParams = params;
          return { status: "ok", data: { ok: true, to: params.sendTo } };
        }
      },
      maxRetries: 0
    }
  });
  assert.ok(result.handled);
  assert.equal(result.action?.type, "email.send");
  assert.deepEqual(seenParams?.sendTo, ["work@example.com"]);
});

test("follow-up router returns last action status summary", async () => {
  const userId = makeUser("followup-status");
  createAgentAction({
    workspaceId: "default",
    requestedBy: userId,
    actionType: "messaging.sms.send",
    input: { text: 'Text me "Ping"' },
    output: { result: {} },
    status: "ok"
  });
  const result = await executeActionFollowUpRequest({
    text: "did that send?",
    context: { userId }
  });
  assert.ok(result.handled);
  assert.ok(result.reply.toLowerCase().includes("completed successfully"));
});
