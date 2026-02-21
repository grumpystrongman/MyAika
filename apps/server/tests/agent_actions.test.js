import test from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import { initDb } from "../storage/db.js";
import { runMigrations } from "../storage/schema.js";
import { createRecording, updateRecording } from "../storage/recordings.js";
import { handleActionIntent } from "../src/agent/actionPipeline.js";
import { updateAssistantProfile } from "../storage/assistant_profile.js";

initDb();
runMigrations();

function makeSenderId(prefix) {
  const token = crypto.randomUUID ? crypto.randomUUID() : crypto.randomBytes(8).toString("hex");
  return `${prefix}-${token}`;
}


test("agent actions: record_meeting happy path", async () => {
  const result = await handleActionIntent({
    text: "Record this meeting",
    context: { channel: "web", userId: "local", senderId: makeSenderId("test-record") },
    deps: { maxRetries: 0 }
  });
  assert.ok(result);
  assert.equal(result.status, "client_required");
  assert.equal(result.action.type, "record_meeting.start");
});

test("agent actions: missing parameters path", async () => {
  const result = await handleActionIntent({
    text: "Send a message on Slack",
    context: { channel: "web", userId: "local", senderId: makeSenderId("test-missing") },
    deps: { maxRetries: 0 }
  });
  assert.ok(result);
  assert.equal(result.status, "needs_input");
  assert.ok(result.reply.toLowerCase().includes("message") || result.reply.toLowerCase().includes("channel"));
});

test("agent actions: tool failure includes retry prompt", async () => {
  const failingExecutor = {
    callTool: async () => {
      const err = new Error("tool_failed");
      err.retryable = true;
      throw err;
    }
  };
  const result = await handleActionIntent({
    text: "Add todo: buy milk",
    context: { channel: "web", userId: "local", senderId: makeSenderId("test-fail") },
    deps: { toolExecutor: failingExecutor, maxRetries: 0 }
  });
  assert.ok(result);
  assert.equal(result.status, "error");
  assert.ok(result.reply.toLowerCase().includes("retry"));
});

test("agent actions: telegram send uses context chatId", async () => {
  let seenParams = null;
  const stubExecutor = {
    callTool: async ({ params }) => {
      seenParams = params;
      return { status: "ok", data: { ok: true } };
    }
  };
  const result = await handleActionIntent({
    text: "Send Telegram: hello from Aika",
    context: { channel: "telegram", userId: "local", senderId: makeSenderId("test-tg"), chatId: "12345" },
    deps: { toolExecutor: stubExecutor, maxRetries: 0 }
  });
  assert.ok(result);
  assert.equal(result.status, "ok");
  assert.equal(result.action.type, "messaging.telegramSend");
  assert.equal(seenParams?.chatId, "12345");
});

test("agent actions: meeting export requires recording id", async () => {
  const result = await handleActionIntent({
    text: "Export meeting notes",
    context: { channel: "web", userId: "local", senderId: makeSenderId("test-export-missing") },
    deps: { maxRetries: 0 }
  });
  assert.ok(result);
  assert.equal(result.status, "needs_input");
  assert.ok(result.reply.toLowerCase().includes("recording"));
});

test("agent actions: meeting export uses context recording id", async () => {
  const recording = createRecording({ title: "Test Meeting", workspaceId: "default", createdBy: "local" });
  updateRecording(recording.id, {
    transcript_text: "Hello world",
    summary_json: JSON.stringify({ overview: ["Test overview"] })
  });
  const result = await handleActionIntent({
    text: "Export meeting notes",
    context: { channel: "web", userId: "local", senderId: makeSenderId("test-export"), recordingId: recording.id },
    deps: { maxRetries: 0 }
  });
  assert.ok(result);
  assert.equal(result.status, "ok");
  assert.equal(result.action.type, "meeting.export");
  assert.ok(result.result?.data?.notesUrl);
});

test("agent actions: email to work address resolves stored identity", async () => {
  updateAssistantProfile("local", { preferences: { identity: { workEmail: "work@example.com" } } });
  let seenParams = null;
  const stubExecutor = {
    callTool: async ({ params }) => {
      seenParams = params;
      return { status: "ok", data: { ok: true, to: params.sendTo } };
    }
  };
  const result = await handleActionIntent({
    text: "Send an email to my work address to remind me to take out the garbage before I leave work",
    context: { channel: "web", userId: "local", senderId: makeSenderId("test-email-work") },
    deps: { toolExecutor: stubExecutor, maxRetries: 0 }
  });
  assert.ok(result);
  assert.equal(result.status, "ok");
  assert.equal(result.action.type, "email.send");
  assert.deepEqual(seenParams?.sendTo, ["work@example.com"]);
  assert.equal(seenParams?.autonomy, "self");
});

test("agent actions: email to work address prompts when missing identity", async () => {
  updateAssistantProfile("local", { preferences: { identity: { workEmail: "" } } });
  const result = await handleActionIntent({
    text: "Email my work address about the update",
    context: { channel: "web", userId: "local", senderId: makeSenderId("test-email-missing") },
    deps: { maxRetries: 0 }
  });
  assert.ok(result);
  assert.equal(result.status, "needs_input");
  assert.ok(result.reply.toLowerCase().includes("work email"));
});
