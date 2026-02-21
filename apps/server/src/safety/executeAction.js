import { evaluateAction } from "./evaluator.js";
import { redactPayload } from "./redact.js";
import { appendAuditEvent } from "./auditLog.js";
import { createSafetyApproval } from "./approvals.js";

export async function executeAction({
  actionType,
  params = {},
  context = {},
  resourceRefs = [],
  outboundTargets = [],
  summary = "",
  handler,
  onApproval
} = {}) {
  const decision = evaluateAction({
    actionType,
    params,
    outboundTargets,
    resourceRefs,
    context
  });
  const redactedPayload = redactPayload(params);
  const auditBase = {
    action_type: actionType,
    user: context?.userId || "",
    session: context?.sessionId || "",
    risk_score: decision.riskScore,
    resource_refs: resourceRefs,
    redacted_payload: redactedPayload
  };

  if (decision.decision === "deny") {
    appendAuditEvent({
      ...auditBase,
      decision: "deny",
      reason: decision.reason,
      result_redacted: { error: "policy_denied" }
    });
    const err = new Error("policy_denied");
    err.status = 403;
    err.reason = decision.reason;
    throw err;
  }

  if (decision.decision === "require_approval") {
    const approval =
      typeof onApproval === "function"
        ? await onApproval({ actionType, summary, payload: redactedPayload, reason: decision.reason })
        : createSafetyApproval({
            actionType,
            summary: summary || `Request to run ${actionType}`,
            payloadRedacted: redactedPayload,
            createdBy: context?.userId || "user",
            reason: decision.reason
          });
    appendAuditEvent({
      ...auditBase,
      decision: "require_approval",
      reason: decision.reason,
      result_redacted: { approvalId: approval?.id || "" }
    });
    return { status: "approval_required", approval };
  }

  try {
    const result = await handler?.();
    appendAuditEvent({
      ...auditBase,
      decision: "allow",
      reason: decision.reason,
      result_redacted: redactPayload(result)
    });
    return { status: "ok", data: result };
  } catch (err) {
    appendAuditEvent({
      ...auditBase,
      decision: "error",
      reason: err?.message || "action_failed",
      result_redacted: { error: err?.message || "action_failed" }
    });
    throw err;
  }
}
