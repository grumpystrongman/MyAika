import test from "node:test";
import assert from "node:assert/strict";
import {
  computeSimhash,
  hammingDistance,
  computeFreshnessScore,
  deriveSignalTags,
  buildExpirySummary
} from "../src/signals/utils.js";

test("simhash distance is zero for identical text", () => {
  const text = "Oil inventories fell as refinery output surged.";
  const hashA = computeSimhash(text);
  const hashB = computeSimhash(text);
  assert.equal(hammingDistance(hashA, hashB), 0);
});

test("freshness score near 1 for current timestamp", () => {
  const now = new Date().toISOString();
  const score = computeFreshnessScore(now, 72);
  assert.ok(score > 0.95);
});

test("deriveSignalTags picks shipping disruption", () => {
  const tags = deriveSignalTags("Port congestion and shipping delays are rising across major terminals.");
  assert.ok(tags.includes("shipping_disruption"));
});

test("buildExpirySummary returns up to 3 bullets", () => {
  const text = "First sentence. Second sentence. Third sentence. Fourth sentence.";
  const bullets = buildExpirySummary(text);
  assert.ok(bullets.length <= 3);
});

