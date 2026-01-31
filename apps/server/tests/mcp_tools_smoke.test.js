import test from "node:test";
import assert from "node:assert/strict";
import { initDb } from "../storage/db.js";
import { runMigrations } from "../storage/schema.js";
import { summarizeMeeting } from "../mcp/tools/meeting.js";
import { createNote, searchNotesTool } from "../mcp/tools/notes.js";

initDb();
runMigrations();
process.env.OPENAI_API_KEY = "";

test("meeting.summarize (deterministic, local-only)", async () => {
  const result = await summarizeMeeting({
    transcript: "Alice: kickoff\nBob: decision to proceed\nAction: follow up by Friday",
    title: "Test Meeting",
    store: { googleDocs: false, localMarkdown: true }
  });
  assert.ok(result.id);
  assert.ok(result.markdownPath);
  assert.ok(result.summaryMarkdown.includes("Test Meeting"));
});

test("notes.create + notes.search (local-only)", async () => {
  await createNote({
    title: "Test Note",
    body: "Hello world note body",
    tags: ["demo"],
    store: { googleDocs: false, localMarkdown: true }
  });
  const results = searchNotesTool({ query: "Hello", limit: 5 });
  assert.ok(Array.isArray(results));
  assert.ok(results.length >= 1);
});
