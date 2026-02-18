import test from "node:test";
import assert from "node:assert/strict";
import { initDb } from "../storage/db.js";
import { runMigrations } from "../storage/schema.js";
import { addMemoryEntities } from "../storage/memory_entities.js";
import { buildMemoryGraph } from "../src/knowledgeGraph/memoryGraph.js";

test("knowledge graph builds co-occurrence edges", () => {
  initDb();
  runMigrations();
  const workspaceId = `kg_test_${Date.now()}`;
  addMemoryEntities([
    { workspaceId, recordingId: "rec1", type: "person", value: "Alice" },
    { workspaceId, recordingId: "rec1", type: "person", value: "Bob" },
    { workspaceId, recordingId: "rec2", type: "person", value: "Alice" }
  ]);

  const graph = buildMemoryGraph({ workspaceId, limitNodes: 10, limitEdges: 10, maxEntities: 10 });
  assert.ok(graph.nodes.length >= 2);
  const edge = graph.edges.find(e => (e.source === "alice" && e.target === "bob") || (e.source === "bob" && e.target === "alice"));
  assert.ok(edge);
});
