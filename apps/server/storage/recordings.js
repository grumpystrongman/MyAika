import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { getDb } from "./db.js";
import { repoRoot, ensureDir, nowIso, safeJsonParse } from "./utils.js";

const recordingsDir = path.join(repoRoot, "data", "recordings");

export function ensureRecordingDir(recordingId) {
  const dir = path.join(recordingsDir, recordingId);
  ensureDir(dir);
  ensureDir(path.join(dir, "chunks"));
  ensureDir(path.join(dir, "artifacts"));
  return dir;
}

export function createRecording({
  workspaceId = "default",
  createdBy = "local",
  title,
  startedAt,
  redactionEnabled = false,
  retentionExpiresAt = null
}) {
  const db = getDb();
  const id = crypto.randomBytes(10).toString("hex");
  const safeTitle = title && title.trim() ? title.trim() : `Recording ${new Date().toLocaleString()}`;
  const startIso = startedAt || nowIso();
  ensureRecordingDir(id);
  db.prepare(
    `INSERT INTO recordings (id, workspace_id, created_by, title, started_at, status, redaction_enabled, retention_expires_at, processing_json)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(id, workspaceId, createdBy, safeTitle, startIso, "recording", redactionEnabled ? 1 : 0, retentionExpiresAt, JSON.stringify({ stage: "recording" }));
  return { id, title: safeTitle, startedAt: startIso };
}

export function updateRecording(id, fields = {}) {
  const db = getDb();
  const keys = Object.keys(fields);
  if (!keys.length) return null;
  const sets = keys.map(k => `${k} = ?`).join(", ");
  const values = keys.map(k => fields[k]);
  db.prepare(`UPDATE recordings SET ${sets} WHERE id = ?`).run(...values, id);
  return getRecording(id);
}

export function addRecordingChunk({ recordingId, seq, storagePath }) {
  const db = getDb();
  const createdAt = nowIso();
  const existing = db.prepare(
    `SELECT id FROM audio_chunks WHERE recording_id = ? AND seq = ?`
  ).get(recordingId, seq);
  if (existing?.id) {
    db.prepare(
      `UPDATE audio_chunks SET storage_path = ?, created_at = ? WHERE id = ?`
    ).run(storagePath, createdAt, existing.id);
    return { id: existing.id, recordingId, seq, storagePath, createdAt };
  }
  const id = crypto.randomBytes(8).toString("hex");
  db.prepare(
    `INSERT INTO audio_chunks (id, recording_id, seq, storage_path, created_at)
     VALUES (?, ?, ?, ?, ?)`
  ).run(id, recordingId, seq, storagePath, createdAt);
  return { id, recordingId, seq, storagePath, createdAt };
}

export function listRecordingChunks(recordingId) {
  const db = getDb();
  return db.prepare(
    `SELECT seq, storage_path AS storagePath FROM audio_chunks WHERE recording_id = ? ORDER BY seq ASC`
  ).all(recordingId);
}

export function getRecording(id) {
  const db = getDb();
  const row = db.prepare(`SELECT * FROM recordings WHERE id = ?`).get(id);
  if (!row) return null;
  return hydrateRecording(row);
}

export function listRecordings({ workspaceId = "default", status = "", query = "", limit = 50 }) {
  const db = getDb();
  const where = ["workspace_id = ?"];
  const params = [workspaceId];
  if (status) {
    where.push("status = ?");
    params.push(status);
  }
  if (query) {
    where.push("(title LIKE ? OR transcript_text LIKE ?)");
    params.push(`%${query}%`, `%${query}%`);
  }
  params.push(limit);
  const rows = db.prepare(
    `SELECT * FROM recordings WHERE ${where.join(" AND ")} ORDER BY started_at DESC LIMIT ?`
  ).all(...params);
  return rows.map(hydrateRecording);
}

export function hydrateRecording(row) {
  if (!row) return null;
  return {
    ...row,
    duration: row.duration ? Number(row.duration) : null,
    transcript_json: safeJsonParse(row.transcript_json, null),
    diarization_json: safeJsonParse(row.diarization_json, null),
    summary_json: safeJsonParse(row.summary_json, null),
    decisions_json: safeJsonParse(row.decisions_json, null),
    tasks_json: safeJsonParse(row.tasks_json, null),
    risks_json: safeJsonParse(row.risks_json, null),
    next_steps_json: safeJsonParse(row.next_steps_json, null),
    artifacts_json: safeJsonParse(row.artifacts_json, null),
    processing_json: safeJsonParse(row.processing_json, null),
    redaction_enabled: Boolean(row.redaction_enabled)
  };
}

export function writeArtifact(recordingId, name, content) {
  const dir = ensureRecordingDir(recordingId);
  const artifactsDir = path.join(dir, "artifacts");
  ensureDir(artifactsDir);
  const filePath = path.join(artifactsDir, name);
  fs.writeFileSync(filePath, content);
  return filePath;
}

export function getRecordingBaseDir() {
  ensureDir(recordingsDir);
  return recordingsDir;
}

export function deleteRecording(recordingId) {
  const db = getDb();
  const dir = path.join(recordingsDir, recordingId);
  try {
    if (fs.existsSync(dir)) {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  } catch (err) {
    console.warn("Failed to remove recording files:", err?.message || err);
  }
  db.prepare(`DELETE FROM audio_chunks WHERE recording_id = ?`).run(recordingId);
  db.prepare(`DELETE FROM recordings WHERE id = ?`).run(recordingId);
  return true;
}
