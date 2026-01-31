import {
  createApprovalRecord,
  listApprovalsRecord,
  getApprovalRecord,
  approveApprovalRecord,
  markApprovalExecuted,
  denyApprovalRecord
} from "../storage/approvals.js";

export function createApproval(request) {
  const { toolName, params, humanSummary, riskLevel, createdBy, correlationId } = request;
  const preview = humanSummary || `Request to run ${toolName}`;
  const record = createApprovalRecord({
    tool: toolName,
    request: { params, riskLevel, createdBy, correlationId },
    preview
  });
  return {
    id: record.id,
    status: record.status,
    createdAt: record.createdAt,
    toolName,
    params,
    humanSummary: preview,
    riskLevel,
    createdBy,
    correlationId
  };
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
  const request = JSON.parse(record.request_json || "{}");
  return {
    id: record.id,
    status: record.status,
    toolName: record.tool,
    params: request.params || {},
    humanSummary: record.preview,
    riskLevel: request.riskLevel,
    createdBy: request.createdBy,
    correlationId: request.correlationId,
    token: record.token
  };
}

export function listApprovals() {
  return listApprovalsRecord().map(record => {
    const request = JSON.parse(record.request_json || "{}");
    return {
      id: record.id,
      status: record.status,
      toolName: record.tool,
      params: request.params || {},
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
