import crypto from "node:crypto";
import { getDb } from "./db.js";
import { nowIso, safeJsonParse } from "./utils.js";

export function createAgentAction({
  workspaceId = "default",
  recordingId,
  requestedBy = "local",
  actionType,
  input,
  output,
  status = "draft"
}) {
  const db = getDb();
  const id = crypto.randomBytes(8).toString("hex");
  const createdAt = nowIso();
  db.prepare(
    `INSERT INTO agent_actions (id, workspace_id, recording_id, requested_by, action_type, input_json, output_json, status, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(
    id,
    workspaceId,
    recordingId,
    requestedBy,
    actionType,
    JSON.stringify(input || {}),
    JSON.stringify(output || {}),
    status,
    createdAt
  );
  return { id, workspaceId, recordingId, requestedBy, actionType, input, output, status, createdAt };
}

export function listAgentActions(recordingId) {
  const db = getDb();
  const rows = db.prepare(
    `SELECT * FROM agent_actions WHERE recording_id = ? ORDER BY created_at DESC`
  ).all(recordingId);
  return rows.map(row => ({
    ...row,
    input_json: safeJsonParse(row.input_json, {}),
    output_json: safeJsonParse(row.output_json, {})
  }));
}

export function deleteAgentActionsForRecording(recordingId) {
  const db = getDb();
  db.prepare(`DELETE FROM agent_actions WHERE recording_id = ?`).run(recordingId);
}
