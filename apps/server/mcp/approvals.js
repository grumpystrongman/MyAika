import {
  createApprovalRecord,
  listApprovalsRecord,
  getApprovalRecord,
  approveApprovalRecord,
  markApprovalExecuted,
  denyApprovalRecord
} from "../storage/approvals.js";
import { notifyApprovalCreated } from "../src/notifications/approvalNotifications.js";

function safeParse(value, fallback) {
  try {
    return value ? JSON.parse(value) : fallback;
  } catch {
    return fallback;
  }
}

export function createApproval(request) {
  const { toolName, params, paramsRedacted, humanSummary, riskLevel, createdBy, correlationId } = request;
  const preview = humanSummary || `Request to run ${toolName}`;
  const record = createApprovalRecord({
    tool: toolName,
    request: { params, riskLevel, createdBy, correlationId },
    preview,
    actionType: toolName,
    summary: preview,
    payloadRedacted: paramsRedacted ?? params,
    createdBy
  });
  const approval = {
    id: record.id,
    status: record.status,
    createdAt: record.createdAt,
    toolName,
    params: paramsRedacted ?? params,
    humanSummary: preview,
    riskLevel,
    createdBy,
    correlationId
  };
  void notifyApprovalCreated(approval);
  return approval;
}

export function approveApproval(id, approvedBy) {
  const record = approveApprovalRecord(id, approvedBy || "user");
  if (!record) return null;
  return {
    id: record.id,
    status: record.status,
    toolName: record.tool,
    params: JSON.parse(record.request_json || "{}").params || {},
    token: record.token,
    approvedBy: record.approved_by,
    approvedAt: record.approved_at
  };
}

export function getApproval(id) {
  const record = getApprovalRecord(id);
  if (!record) return null;
  const request = safeParse(record.request_json, {});
  const redacted = safeParse(record.payload_redacted_json, request?.params || {});
  return {
    id: record.id,
    status: record.status,
    toolName: record.tool,
    params: request.params || {},
    paramsRedacted: redacted,
    humanSummary: record.preview,
    riskLevel: request.riskLevel,
    createdBy: request.createdBy,
    correlationId: request.correlationId,
    token: record.token
  };
}

export function listApprovals() {
  return listApprovalsRecord().map(record => {
    const request = safeParse(record.request_json, {});
    const redacted = safeParse(record.payload_redacted_json, request?.params || {});
    return {
      id: record.id,
      status: record.status,
      toolName: record.tool,
      params: redacted,
      humanSummary: record.preview,
      riskLevel: request.riskLevel,
      createdBy: request.createdBy,
      correlationId: request.correlationId,
      token: record.token,
      createdAt: record.created_at,
      approvedAt: record.approved_at,
      executedAt: record.executed_at
    };
  });
}

export function markExecuted(id) {
  const record = markApprovalExecuted(id);
  if (!record) return null;
  return {
    id: record.id,
    status: record.status,
    executedAt: record.executed_at
  };
}

export function denyApproval(id, deniedBy) {
  const record = denyApprovalRecord(id, deniedBy || "user");
  if (!record) return null;
  return {
    id: record.id,
    status: record.status,
    resolvedAt: record.resolved_at
  };
}
