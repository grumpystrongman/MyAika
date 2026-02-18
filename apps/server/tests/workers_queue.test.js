import test from "node:test";
import assert from "node:assert/strict";
import { enqueueWork, claimWork, completeWork } from "../src/workers/queue.js";

test("worker queue enqueue/claim/complete", () => {
  const job = enqueueWork({ type: "test.queue", payload: { ping: true }, priority: 1 });
  const claimed = claimWork({ workerId: "tester", types: ["test.queue"], limit: 1 });
  assert.ok(claimed.length >= 1);
  assert.equal(claimed[0].id, job.id);
  const completed = completeWork({ id: job.id, status: "completed", result: { ok: true } });
  assert.equal(completed.status, "completed");
});
