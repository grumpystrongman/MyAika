import assert from "node:assert/strict";
import test from "node:test";
import { buildFtsQuery, mergeHybridMatches } from "../src/rag/hybrid.js";

test("buildFtsQuery strips stopwords and caps terms", () => {
  const query = buildFtsQuery("the quick brown fox jumps over the lazy dog", { maxTerms: 3 });
  const tokens = query.split(" OR ").map(token => token.replace(/"/g, ""));
  assert.ok(tokens.length <= 3);
  assert.ok(!tokens.includes("the"));
  assert.ok(tokens.includes("quick") || tokens.includes("brown") || tokens.includes("fox"));
});

test("mergeHybridMatches combines vector and lexical ranks", () => {
  const vectorMatches = [
    { chunk_id: "a" },
    { chunk_id: "b" },
    { chunk_id: "c" }
  ];
  const lexicalMatches = [
    { chunk_id: "c" },
    { chunk_id: "b" },
    { chunk_id: "d" }
  ];
  const merged = mergeHybridMatches({ vectorMatches, lexicalMatches, alpha: 0.6, rrfK: 10 });
  const ids = merged.map(item => item.chunk_id);
  assert.ok(ids.includes("a"));
  assert.ok(ids.includes("b"));
  assert.ok(ids.includes("c"));
  assert.ok(ids.includes("d"));
  assert.equal(ids[0], "b");
});
