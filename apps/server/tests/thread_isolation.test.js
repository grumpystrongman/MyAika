import test from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import { initDb } from "../storage/db.js";
import { runMigrations } from "../storage/schema.js";
import { runWithContext } from "../auth/context.js";
import {
  ensureActiveThread,
  appendThreadMessage,
  listThreadMessages,
  getThread
} from "../storage/threads.js";

initDb();
runMigrations();

function makeId(prefix) {
  return `${prefix}-${crypto.randomBytes(4).toString("hex")}`;
}

test("thread isolation: users cannot access each other's threads", () => {
  const userA = makeId("userA");
  const userB = makeId("userB");

  const threadA = runWithContext({ userId: userA }, () => ensureActiveThread({
    channel: "web",
    senderId: `sender-${userA}`
  }));
  runWithContext({ userId: userA }, () => appendThreadMessage({
    threadId: threadA.id,
    role: "user",
    content: "Hello from A"
  }));

  const threadB = runWithContext({ userId: userB }, () => ensureActiveThread({
    channel: "web",
    senderId: `sender-${userB}`
  }));
  runWithContext({ userId: userB }, () => appendThreadMessage({
    threadId: threadB.id,
    role: "user",
    content: "Hello from B"
  }));

  const ownThread = runWithContext({ userId: userA }, () => getThread(threadA.id));
  assert.ok(ownThread);

  const crossThread = runWithContext({ userId: userA }, () => getThread(threadB.id));
  assert.equal(crossThread, null);

  const ownMessages = runWithContext({ userId: userA }, () => listThreadMessages(threadA.id, 10));
  assert.equal(ownMessages.length, 1);

  const crossMessages = runWithContext({ userId: userA }, () => listThreadMessages(threadB.id, 10));
  assert.equal(crossMessages.length, 0);
});
