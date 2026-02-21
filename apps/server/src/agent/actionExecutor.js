import crypto from "node:crypto";
import path from "node:path";
import { executor as defaultExecutor } from "../../mcp/index.js";
import { getActionRun, setActionRun } from "./actionRunStore.js";
import { getGoogleDoc } from "../../integrations/google.js";
import { evaluateGoldenQueries } from "../rag/evalHarness.js";
import { rebuildChunksFts } from "../rag/vectorStore.js";
import { runSignalsIngestion } from "../signals/index.js";
import { queueFirefliesSync } from "../rag/firefliesIngest.js";
import { setThreadRagModel } from "../../storage/threads.js";
import { getRecording, deleteRecording } from "../../storage/recordings.js";
import { deleteAgentActionsForRecording } from "../../storage/agent_actions.js";
import { deleteMemoryEntitiesForRecording } from "../../storage/memory_entities.js";
import { executeAction } from "../safety/executeAction.js";
import {
  exportRecordingArtifacts,
  runRecordingAction,
  sendMeetingEmail,
  resummarizeRecording
} from "../../recordings/meetingActions.js";

const repoRoot = path.resolve(process.cwd(), "..", "..");
const defaultRagEvalPath = path.join(repoRoot, "apps", "server", "evals", "rag_golden.json");

const SAFE_ACTIONS = new Set([
  "record_meeting.start",
  "record_meeting.stop",
  "record_meeting.pause",
  "record_meeting.resume",
  "meeting.summarize",
  "email.send",
  "meeting.export",
  "meeting.recap_doc",
  "meeting.draft_email",
  "meeting.schedule_followup",
  "meeting.create_task",
  "meeting.create_ticket",
  "meeting.resummarize",
  "todos.create",
  "docs.get",
  "rag.use",
  "rag.eval",
  "rag.fts",
  "signals.run",
  "fireflies.sync"
]);

const ACTION_DEFS = {
  "record_meeting.start": { kind: "client" },
  "record_meeting.stop": { kind: "client" },
  "record_meeting.pause": { kind: "client" },
  "record_meeting.resume": { kind: "client" },
  "meeting.summarize": { kind: "tool", toolName: "meeting.summarize" },
  "email.send": { kind: "tool", toolName: "email.send" },
  "todos.create": { kind: "tool", toolName: "todos.create" },
  "messaging.slackPost": { kind: "tool", toolName: "messaging.slackPost" },
  "messaging.telegramSend": { kind: "tool", toolName: "messaging.telegramSend" },
  "messaging.discordSend": { kind: "tool", toolName: "messaging.discordSend" },
  "meeting.export": { kind: "internal" },
  "meeting.email": { kind: "internal" },
  "meeting.recap_doc": { kind: "internal" },
  "meeting.draft_email": { kind: "internal" },
  "meeting.schedule_followup": { kind: "internal" },
  "meeting.create_task": { kind: "internal" },
  "meeting.create_ticket": { kind: "internal" },
  "meeting.resummarize": { kind: "internal", async: true },
  "meeting.delete": { kind: "internal" },
  "docs.get": { kind: "internal" },
  "rag.use": { kind: "internal" },
  "rag.eval": { kind: "internal" },
  "rag.fts": { kind: "internal" },
  "signals.run": { kind: "internal" },
  "fireflies.sync": { kind: "internal" }
};

function nowIso() {
  return new Date().toISOString();
}

function hashActionKey(payload) {
  return crypto.createHash("sha256").update(payload).digest("hex").slice(0, 16);
}

function buildIdempotencyKey(action, context) {
  const payload = JSON.stringify({
    type: action?.type || "",
    params: action?.params || {},
    channel: context?.channel || "",
    senderId: context?.senderId || ""
  });
  return hashActionKey(payload);
}

function isRetryableError(err) {
  if (!err) return false;
  if (err.retryable) return true;
  const code = String(err.code || "");
  return ["ETIMEDOUT", "ECONNRESET", "ECONNREFUSED", "EAI_AGAIN"].includes(code);
}

function canAccessRecording(recording, context) {
  if (!recording) return false;
  if (recording.workspace_id && context?.workspaceId && recording.workspace_id !== context.workspaceId) return false;
  const userId = context?.userId || "";
  if (recording.created_by && userId && recording.created_by !== userId && !context?.isAdmin && userId !== "local") {
    return false;
  }
  return true;
}

function getRecordingForAction(recordingId, context) {
  if (!recordingId) {
    const err = new Error("recording_id_required");
    err.code = "recording_id_required";
    throw err;
  }
  const recording = getRecording(String(recordingId));
  if (!recording) {
    const err = new Error("recording_not_found");
    err.code = "recording_not_found";
    throw err;
  }
  if (!canAccessRecording(recording, context)) {
    const err = new Error("forbidden");
    err.code = "forbidden";
    err.status = 403;
    throw err;
  }
  return recording;
}

async function runInternalAction(type, params, context) {
  if (type === "docs.get") {
    const docId = params?.docId || "";
    const doc = await getGoogleDoc(String(docId), context?.userId || "");
    return { docId, title: doc?.title || "", document: doc };
  }
  if (type === "rag.use") {
    const model = String(params?.model || "auto").trim().toLowerCase();
    if (context?.threadId) {
      setThreadRagModel(context.threadId, model);
    }
    return { ragModel: model };
  }
  if (type === "rag.eval") {
    const strict = Boolean(params?.strict);
    return await evaluateGoldenQueries({
      filePath: params?.filePath || defaultRagEvalPath,
      routed: true,
      strict
    });
  }
  if (type === "rag.fts") {
    const batchSize = Number(params?.batchSize || process.env.RAG_FTS_BATCH_SIZE || 500);
    return rebuildChunksFts({ batchSize });
  }
  if (type === "signals.run") {
    return await runSignalsIngestion();
  }
  if (type === "fireflies.sync") {
    const limit = Number(params?.limit || 0);
    const force = Boolean(params?.force);
    return queueFirefliesSync({ limit, force });
  }
  if (type === "meeting.export") {
    const recording = getRecordingForAction(params?.recordingId, context);
    return exportRecordingArtifacts({ recording, baseUrl: context?.publicBaseUrl });
  }
  if (type === "meeting.email") {
    const recording = getRecordingForAction(params?.recordingId, context);
    const result = await sendMeetingEmail({
      recording,
      to: params?.to,
      subject: params?.subject,
      baseUrl: context?.publicBaseUrl,
      userId: context?.userId || "local",
      sessionId: context?.sessionId || ""
    });
    if (result?.status === "approval_required") {
      return result;
    }
    return result;
  }
  if (type === "meeting.recap_doc") {
    const recording = getRecordingForAction(params?.recordingId, context);
    const result = await runRecordingAction({
      recording,
      actionType: "meeting.recap_doc",
      input: params?.input,
      userId: context?.userId || "local"
    });
    if (result?.status === "failed") throw new Error(result.output?.error || "action_failed");
    return result.output;
  }
  if (type === "meeting.draft_email") {
    const recording = getRecordingForAction(params?.recordingId, context);
    const result = await runRecordingAction({
      recording,
      actionType: "meeting.draft_email",
      input: params?.input,
      userId: context?.userId || "local"
    });
    if (result?.status === "failed") throw new Error(result.output?.error || "action_failed");
    return result.output;
  }
  if (type === "meeting.schedule_followup") {
    const recording = getRecordingForAction(params?.recordingId, context);
    const result = await runRecordingAction({
      recording,
      actionType: "meeting.schedule_followup",
      input: params?.input,
      userId: context?.userId || "local"
    });
    if (result?.status === "failed") throw new Error(result.output?.error || "action_failed");
    return result.output;
  }
  if (type === "meeting.create_task") {
    const recording = getRecordingForAction(params?.recordingId, context);
    const result = await runRecordingAction({
      recording,
      actionType: "meeting.create_task",
      input: params?.input,
      userId: context?.userId || "local"
    });
    if (result?.status === "failed") throw new Error(result.output?.error || "action_failed");
    return result.output;
  }
  if (type === "meeting.create_ticket") {
    const recording = getRecordingForAction(params?.recordingId, context);
    const result = await runRecordingAction({
      recording,
      actionType: "meeting.create_ticket",
      input: params?.input,
      userId: context?.userId || "local"
    });
    if (result?.status === "failed") throw new Error(result.output?.error || "action_failed");
    return result.output;
  }
  if (type === "meeting.resummarize") {
    const recording = getRecordingForAction(params?.recordingId, context);
    return resummarizeRecording({
      recording,
      userId: context?.userId || "local",
      sessionId: context?.sessionId || ""
    });
  }
  if (type === "meeting.delete") {
    const recording = getRecordingForAction(params?.recordingId, context);
    const result = await executeAction({
      actionType: "file.delete",
      params: { recordingId: recording.id, path: recording.storage_path || "" },
      context: { userId: context?.userId || "local", sessionId: context?.sessionId || "" },
      resourceRefs: [recording.storage_path || ""],
      summary: `Delete recording ${recording.id}`,
      handler: async () => {
        deleteAgentActionsForRecording(recording.id);
        deleteMemoryEntitiesForRecording(recording.id);
        deleteRecording(recording.id);
        return { ok: true, id: recording.id };
      }
    });
    if (result.status === "approval_required") {
      return { status: "approval_required", approval: result.approval };
    }
    return result.data;
  }
  throw new Error("action_not_supported");
}

export async function executeActionRequest(action, context = {}, options = {}) {
  if (!action?.type) throw new Error("action_type_required");
  const def = ACTION_DEFS[action.type];
  if (!def) {
    const err = new Error("action_not_supported");
    err.code = "action_not_supported";
    throw err;
  }

  const idempotencyKey = action.idempotencyKey || buildIdempotencyKey(action, context);
  const existing = getActionRun(idempotencyKey);
  if (existing?.status === "ok") {
    return { status: "ok", data: existing.data, idempotencyKey, deduped: true };
  }

  const maxRetries = Number.isFinite(options.maxRetries) ? options.maxRetries : 1;
  const toolExecutor = options.toolExecutor || defaultExecutor;
  let attempt = 0;
  let lastErr = null;

  while (attempt <= maxRetries) {
    attempt += 1;
    try {
      setActionRun(idempotencyKey, { status: "running", attempts: attempt, updatedAt: nowIso() });
      if (def.kind === "client") {
        const channel = String(context?.channel || "web");
        if (!["web", "app", "browser"].includes(channel)) {
          const err = new Error("client_action_not_supported");
          err.code = "client_action_not_supported";
          throw err;
        }
        const data = { clientAction: { type: action.type, params: action.params || {} } };
        setActionRun(idempotencyKey, { status: "ok", attempts: attempt, updatedAt: nowIso(), data });
        return { status: "client_required", data, idempotencyKey };
      }
      if (def.kind === "tool") {
        const result = await toolExecutor.callTool({
          name: def.toolName,
          params: action.params || {},
          context: {
            userId: context?.userId || "local",
            correlationId: context?.correlationId || "",
            source: context?.channel || "chat"
          }
        });
        if (result?.status === "approval_required") {
          setActionRun(idempotencyKey, { status: "approval_required", attempts: attempt, updatedAt: nowIso(), data: result });
          return { status: "approval_required", approval: result.approval, idempotencyKey };
        }
        setActionRun(idempotencyKey, { status: "ok", attempts: attempt, updatedAt: nowIso(), data: result?.data || result });
        return { status: "ok", data: result?.data ?? result, idempotencyKey };
      }
      if (def.kind === "internal") {
        if (def.async) {
          const runAsync = async () => {
            try {
              const result = await runInternalAction(action.type, action.params || {}, context);
              setActionRun(idempotencyKey, { status: "ok", attempts: attempt, updatedAt: nowIso(), data: result });
            } catch (err) {
              setActionRun(idempotencyKey, {
                status: "error",
                attempts: attempt,
                updatedAt: nowIso(),
                error: { message: err?.message || "action_failed", code: err?.code || "" }
              });
            }
          };
          runAsync();
          return { status: "running", idempotencyKey };
        }
        const result = await runInternalAction(action.type, action.params || {}, context);
        if (result?.status === "approval_required") {
          setActionRun(idempotencyKey, { status: "approval_required", attempts: attempt, updatedAt: nowIso(), data: result });
          return { status: "approval_required", approval: result.approval, idempotencyKey };
        }
        setActionRun(idempotencyKey, { status: "ok", attempts: attempt, updatedAt: nowIso(), data: result });
        return { status: "ok", data: result, idempotencyKey };
      }
      throw new Error("action_handler_missing");
    } catch (err) {
      lastErr = err;
      const retryable = isRetryableError(err) || def.kind === "tool";
      const shouldRetry = isRetryableError(err) && attempt <= maxRetries;
      if (shouldRetry) {
        continue;
      }
      setActionRun(idempotencyKey, {
        status: "error",
        attempts: attempt,
        updatedAt: nowIso(),
        error: { message: err?.message || "action_failed", code: err?.code || "" }
      });
      return {
        status: "error",
        error: { message: err?.message || "action_failed", code: err?.code || "" },
        idempotencyKey,
        retryable
      };
    }
  }

  return {
    status: "error",
    error: { message: lastErr?.message || "action_failed", code: lastErr?.code || "" },
    idempotencyKey,
    retryable: false
  };
}

export function isSafeAction(actionType) {
  return SAFE_ACTIONS.has(actionType);
}
