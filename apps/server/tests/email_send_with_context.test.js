import test from "node:test";
import assert from "node:assert/strict";
import { sendWithContext } from "../mcp/tools/email.js";

test("sendWithContext uses reply result and send override", async () => {
  const replyStub = async () => ({
    draft: { id: "draft-123", to: ["client@example.com"] },
    context: "context",
    citations: []
  });
  let sentPayload = null;
  const sendStub = async (payload) => {
    sentPayload = payload;
    return { status: "sent", transport: "stub", outboxId: "outbox-1" };
  };

  const result = await sendWithContext({
    email: { from: "client@example.com", subject: "hello", body: "body" },
    tone: "direct",
    signOffName: "Aika"
  }, { userId: "local" }, { replyWithContext: replyStub, sendEmail: sendStub });

  assert.equal(result.send.status, "sent");
  assert.equal(sentPayload.draftId, "draft-123");
  assert.deepEqual(sentPayload.sendTo, ["client@example.com"]);
});
