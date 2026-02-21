import test from "node:test";
import assert from "node:assert/strict";
import { ingestActionRunToRag } from "../src/rag/scrapeIngest.js";
import { countChunksForMeeting, getRagCollection } from "../src/rag/vectorStore.js";

test("action runner extracts are indexed into rag", async () => {
  const collectionId = `scrape-test-${Date.now()}`;
  const run = {
    id: `run-${Date.now()}`,
    taskName: "Screen scrape test",
    startUrl: "https://example.com",
    actions: [{ type: "extractText" }],
    extracted: [
      { selector: ".price", text: "$10", step: 1 },
      { selector: ".title", text: "Example Product", step: 2 }
    ],
    createdAt: new Date().toISOString()
  };

  const result = await ingestActionRunToRag(run, { collectionId });
  assert.equal(result.ok, true);
  assert.equal(result.collectionId, collectionId);
  assert.ok(getRagCollection(collectionId));
  assert.ok(countChunksForMeeting(result.meetingId) > 0);
});
