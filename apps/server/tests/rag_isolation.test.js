import test from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import { runWithContext } from "../auth/context.js";
import {
  initRagStore,
  upsertMeeting,
  upsertChunks,
  upsertVectors,
  getMeeting,
  getChunksByIds,
  searchChunkIds
} from "../src/rag/vectorStore.js";

const originalMulti = process.env.RAG_MULTIUSER_ENABLED;
const originalStrict = process.env.AIKA_STRICT_USER_SCOPE;

process.env.RAG_MULTIUSER_ENABLED = "1";
process.env.AIKA_STRICT_USER_SCOPE = "1";

test.after(() => {
  if (originalMulti === undefined) {
    delete process.env.RAG_MULTIUSER_ENABLED;
  } else {
    process.env.RAG_MULTIUSER_ENABLED = originalMulti;
  }
  if (originalStrict === undefined) {
    delete process.env.AIKA_STRICT_USER_SCOPE;
  } else {
    process.env.AIKA_STRICT_USER_SCOPE = originalStrict;
  }
});

function makeId(prefix) {
  return `${prefix}-${crypto.randomBytes(4).toString("hex")}`;
}

test("rag isolation: per-user stores prevent cross access", async () => {
  const userA = makeId("userA");
  const userB = makeId("userB");

  const meetingA = `memory:${makeId("meetingA")}`;
  const meetingB = `memory:${makeId("meetingB")}`;
  const chunkAId = makeId("chunkA");
  const chunkBId = makeId("chunkB");
  const vectorA = [0.1, 0.2, 0.3];
  const vectorB = [0.9, 0.2, 0.1];

  await runWithContext({ userId: userA }, async () => {
    initRagStore();
    upsertMeeting({ id: meetingA, title: "Meeting A", occurred_at: new Date().toISOString() });
    upsertChunks([{ chunk_id: chunkAId, meeting_id: meetingA, chunk_index: 0, text: "Hello A", token_count: 3 }]);
    await upsertVectors([{ chunk_id: chunkAId }], [vectorA]);
  });

  await runWithContext({ userId: userB }, async () => {
    initRagStore();
    upsertMeeting({ id: meetingB, title: "Meeting B", occurred_at: new Date().toISOString() });
    upsertChunks([{ chunk_id: chunkBId, meeting_id: meetingB, chunk_index: 0, text: "Hello B", token_count: 3 }]);
    await upsertVectors([{ chunk_id: chunkBId }], [vectorB]);
  });

  const meetingSeen = runWithContext({ userId: userA }, () => getMeeting(meetingA));
  assert.ok(meetingSeen);

  const crossMeeting = runWithContext({ userId: userA }, () => getMeeting(meetingB));
  assert.equal(crossMeeting, null);

  const crossChunks = runWithContext({ userId: userA }, () => getChunksByIds([chunkBId]));
  assert.equal(crossChunks.length, 0);

  const matches = await runWithContext({ userId: userA }, () => searchChunkIds(vectorA, 5));
  assert.ok(matches.some(item => item.chunk_id === chunkAId));
  assert.ok(!matches.some(item => item.chunk_id === chunkBId));
});
