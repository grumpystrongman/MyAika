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

function normalizeApprovalContext(context = {}, fallback = {}) {
  return {
    action: String(context.action || fallback.action || "").trim(),
    why: String(context.why || fallback.why || "").trim(),
    tool: String(context.tool || fallback.tool || "").trim(),
    boundary: String(context.boundary || fallback.boundary || "").trim(),
    risk: String(context.risk || fallback.risk || "").trim(),
    rollback: String(context.rollback || fallback.rollback || "").trim()
  };
}

export function createApproval(request) {
  const { toolName, params, paramsRedacted, humanSummary, riskLevel, createdBy, correlationId, approvalContext } = request;
  const preview = humanSummary || `Request to run ${toolName}`;
  const context = normalizeApprovalContext(approvalContext, {
    action: preview,
    why: "Tool call crossed an approval boundary and requires confirmation.",
    tool: toolName,
    boundary: "host -> tool execution boundary",
    risk: riskLevel || "medium",
    rollback: "Deny this request to prevent execution. If already executed, use tool history to perform compensating actions."
  });
  const record = createApprovalRecord({
    tool: toolName,
    request: { params, riskLevel, createdBy, correlationId, approvalContext: context },
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
    correlationId,
    approvalContext: context
  };
  void notifyApprovalCreated(approval);
  return approval;
}

export function approveApproval(id, approvedBy) {
  const record = approveApprovalRecord(id, approvedBy || "user");
  if (!record) return null;
  const request = safeParse(record.request_json, {});
  const context = normalizeApprovalContext(request.approvalContext, {
    action: record.preview || `Request to run ${record.tool}`,
    why: "Tool call crossed an approval boundary and requires confirmation.",
    tool: record.tool || "",
    boundary: "host -> tool execution boundary",
    risk: request.riskLevel || "medium",
    rollback: "Deny this request to prevent execution. If already executed, use tool history to perform compensating actions."
  });
  return {
    id: record.id,
    status: record.status,
    toolName: record.tool,
    params: request.params || {},
    token: record.token,
    approvedBy: record.approved_by,
    approvedAt: record.approved_at,
    approvalContext: context
  };
}

export function getApproval(id) {
  const record = getApprovalRecord(id);
  if (!record) return null;
  const request = safeParse(record.request_json, {});
  const redacted = safeParse(record.payload_redacted_json, request?.params || {});
  const context = normalizeApprovalContext(request.approvalContext, {
    action: record.preview || `Request to run ${record.tool}`,
    why: "Tool call crossed an approval boundary and requires confirmation.",
    tool: record.tool || "",
    boundary: "host -> tool execution boundary",
    risk: request.riskLevel || "medium",
    rollback: "Deny this request to prevent execution. If already executed, use tool history to perform compensating actions."
  });
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
    token: record.token,
    approvalContext: context
  };
}

export function listApprovals() {
  return listApprovalsRecord().map(record => {
    const request = safeParse(record.request_json, {});
    const redacted = safeParse(record.payload_redacted_json, request?.params || {});
    const context = normalizeApprovalContext(request.approvalContext, {
      action: record.preview || `Request to run ${record.tool}`,
      why: "Tool call crossed an approval boundary and requires confirmation.",
      tool: record.tool || "",
      boundary: "host -> tool execution boundary",
      risk: request.riskLevel || "medium",
      rollback: "Deny this request to prevent execution. If already executed, use tool history to perform compensating actions."
    });
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
      executedAt: record.executed_at,
      approvalContext: context
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
