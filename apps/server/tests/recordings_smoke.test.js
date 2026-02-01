import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { initDb } from "../storage/db.js";
import { runMigrations } from "../storage/schema.js";
import { createRecording, addRecordingChunk, listRecordings, ensureRecordingDir } from "../storage/recordings.js";

initDb();
runMigrations();

test("recordings.create + list (local)", () => {
  const recording = createRecording({ title: "Test Recording", redactionEnabled: false });
  assert.ok(recording.id);
  const list = listRecordings({ query: "Test Recording", limit: 5 });
  assert.ok(list.length >= 1);
});

test("recordings.chunk writes", () => {
  const recording = createRecording({ title: "Chunk Recording", redactionEnabled: false });
  const dir = ensureRecordingDir(recording.id);
  const chunkPath = path.join(dir, "chunks", "000001.webm");
  fs.writeFileSync(chunkPath, Buffer.from("test"));
  const chunk = addRecordingChunk({ recordingId: recording.id, seq: 1, storagePath: chunkPath });
  assert.ok(chunk.id);
});
