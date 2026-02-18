import assert from "node:assert/strict";
import test from "node:test";
import { scoreRetrieval } from "../src/rag/evalHarness.js";

test("scoreRetrieval computes recall and precision", () => {
  const score = scoreRetrieval({
    expected: { chunkIds: ["a", "b", "c"], terms: ["roadmap"] },
    citations: [
      { chunk_id: "a", snippet: "roadmap notes" },
      { chunk_id: "x", snippet: "other" }
    ]
  });
  assert.equal(score.recall, 1 / 3);
  assert.equal(score.precision, 1 / 2);
  assert.equal(score.termCoverage, 1);
  assert.equal(score.missingIds.length, 2);
});
