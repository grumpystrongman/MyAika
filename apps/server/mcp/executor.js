import { evaluatePolicy, redactPhi } from "./policy.js";
import { writeAudit } from "./audit.js";
import { createApproval, approveApproval, getApproval, markExecuted } from "./approvals.js";
import { recordToolHistory } from "../storage/history.js";
import { evaluateAction } from "../src/safety/evaluator.js";
import { appendAuditEvent } from "../src/safety/auditLog.js";
import { redactPayload } from "../src/safety/redact.js";

export class ToolExecutor {
  constructor(registry) {
    this.registry = registry;
  }

  async callTool({ name, params, context }) {
    const entry = this.registry.get(name);
    if (!entry) throw new Error("tool_not_found");
    const { def, handler } = entry;
    const outboundTargets = def.outboundTargets?.(params, context) || [];
    const safetyDecision = evaluateAction({
      actionType: def.name,
      params,
      outboundTargets,
      context
    });
    const redactedPayload = redactPayload(params);
    const policy = evaluatePolicy({ tool: def, params, context, outboundTargets });

    if (safetyDecision.decision === "deny") {
      appendAuditEvent({
        action_type: def.name,
        decision: "deny",
        reason: safetyDecision.reason,
        user: context?.userId || "",
        session: context?.correlationId || "",
        risk_score: safetyDecision.riskScore,
        resource_refs: safetyDecision.classification?.resourceRefs || [],
        redacted_payload: redactedPayload,
        result_redacted: { error: "policy_denied" }
      });
      const err = new Error("policy_denied");
      err.status = 403;
      recordToolHistory({
        tool: def.name,
        request: params,
        status: "blocked",
        error: { message: "policy_denied" }
      });
      throw err;
    }

    if (policy.block) {
      appendAuditEvent({
        action_type: def.name,
        decision: "deny",
        reason: "mcp_policy_block",
        user: context?.userId || "",
        session: context?.correlationId || "",
        risk_score: safetyDecision.riskScore,
        resource_refs: safetyDecision.classification?.resourceRefs || [],
        redacted_payload: redactedPayload,
        result_redacted: { error: "policy_blocked" }
      });
      writeAudit({
        type: "tool_call_blocked",
        tool: def.name,
        at: new Date().toISOString(),
        correlationId: context?.correlationId || "",
        userId: context?.userId || "",
        reason: "policy_block",
        params: policy.redactedParams
      });
      const err = new Error("policy_blocked");
      err.status = 403;
      recordToolHistory({
        tool: def.name,
        request: params,
        status: "blocked",
        error: { message: "policy_blocked" }
      });
      throw err;
    }

    const autonomyAllowed = Boolean(safetyDecision?.autonomy?.allow);
    const toolRequiresApproval = typeof def.requiresApproval === "function"
      ? def.requiresApproval(params, context)
      : def.requiresApproval;
    if (!autonomyAllowed && (policy.requiresApproval || toolRequiresApproval || safetyDecision.decision === "require_approval")) {
      const approval = createApproval({
        toolName: def.name,
        params: policy.redactedParams,
        humanSummary: def.humanSummary?.(params) || `Request to run ${def.name}`,
        riskLevel: def.riskLevel || "medium",
        createdBy: context?.userId || "user",
        correlationId: context?.correlationId || ""
      });
      appendAuditEvent({
        action_type: def.name,
        decision: "require_approval",
        reason: safetyDecision.reason || "approval_required",
        user: context?.userId || "",
        session: context?.correlationId || "",
        risk_score: safetyDecision.riskScore,
        resource_refs: safetyDecision.classification?.resourceRefs || [],
        redacted_payload: redactedPayload,
        result_redacted: { approvalId: approval.id }
      });
      writeAudit({
        type: "tool_call_requires_approval",
        tool: def.name,
        at: new Date().toISOString(),
        correlationId: approval.correlationId,
        userId: approval.createdBy,
        params: policy.redactedParams,
        approvalId: approval.id
      });
      recordToolHistory({
        tool: def.name,
        request: params,
        status: "pending_approval",
        response: { approvalId: approval.id }
      });
      return { status: "approval_required", approval };
    }

    const start = Date.now();
    let result;
    try {
      result = await handler(params, context);
    } catch (err) {
      appendAuditEvent({
        action_type: def.name,
        decision: "error",
        reason: err.message || "tool_failed",
        user: context?.userId || "",
        session: context?.correlationId || "",
        risk_score: safetyDecision.riskScore,
        resource_refs: safetyDecision.classification?.resourceRefs || [],
        redacted_payload: redactedPayload,
        result_redacted: { error: err.message || "tool_failed" }
      });
      recordToolHistory({
        tool: def.name,
        request: params,
        status: "error",
        error: { message: err.message || "tool_failed" }
      });
      throw err;
    }
    const summary = typeof result === "string" ? result.slice(0, 240) : "ok";
    appendAuditEvent({
      action_type: def.name,
      decision: "allow",
      reason: "tool_ok",
      user: context?.userId || "",
      session: context?.correlationId || "",
      risk_score: safetyDecision.riskScore,
      resource_refs: safetyDecision.classification?.resourceRefs || [],
      redacted_payload: redactedPayload,
      result_redacted: redactPayload(result)
    });
    writeAudit({
      type: "tool_call",
      tool: def.name,
      at: new Date().toISOString(),
      correlationId: context?.correlationId || "",
      userId: context?.userId || "",
      params: policy.redactedParams,
      result: redactPhi(JSON.stringify(summary)),
      durationMs: Date.now() - start,
      status: "ok"
    });
    recordToolHistory({
      tool: def.name,
      request: params,
      status: "ok",
      response: result
    });
    return { status: "ok", data: result };
  }

  approve(id, userId) {
    const approval = approveApproval(id, userId);
    if (!approval) {
      const err = new Error("approval_not_found");
      err.status = 404;
      throw err;
    }
    writeAudit({
      type: "approval_approved",
      tool: approval.toolName,
      at: new Date().toISOString(),
      correlationId: approval.correlationId,
      userId: approval.approvedBy
    });
    return approval;
  }

  async execute(id, token, context = {}) {
    const approval = getApproval(id);
    if (!approval) {
      const err = new Error("approval_not_found");
      err.status = 404;
      throw err;
    }
    if (approval.status !== "approved") {
      const err = new Error("approval_not_ready");
      err.status = 400;
      throw err;
    }
    const execContext = { ...context };
    if (!execContext.userId && approval.createdBy) {
      execContext.userId = approval.createdBy;
    }
    if (!token || token !== approval.token) {
      const err = new Error("approval_token_invalid");
      err.status = 403;
      throw err;
    }
    const entry = this.registry.get(approval.toolName);
    if (!entry) throw new Error("tool_not_found");
    const { def, handler } = entry;
    const safetyDecision = evaluateAction({
      actionType: def.name,
      params: approval.params || {},
      outboundTargets: def.outboundTargets?.(approval.params, execContext) || [],
      context: execContext
    });
    const redactedPayload = redactPayload(approval.params || {});
    if (safetyDecision.decision === "deny") {
      appendAuditEvent({
        action_type: def.name,
        decision: "deny",
        reason: safetyDecision.reason,
        user: execContext.userId || "",
        session: execContext.correlationId || "",
        risk_score: safetyDecision.riskScore,
        resource_refs: safetyDecision.classification?.resourceRefs || [],
        redacted_payload: redactedPayload,
        result_redacted: { error: "policy_denied" }
      });
      const err = new Error("policy_denied");
      err.status = 403;
      throw err;
    }
    const policy = evaluatePolicy({ tool: def, params: approval.params, context: execContext });
    if (policy.block) {
      const err = new Error("policy_blocked");
      err.status = 403;
      throw err;
    }
    const result = await handler(approval.params, execContext);
    markExecuted(id);
    appendAuditEvent({
      action_type: def.name,
      decision: "allow",
      reason: "approval_executed",
      user: execContext.userId || "",
      session: execContext.correlationId || "",
      risk_score: safetyDecision.riskScore,
      resource_refs: safetyDecision.classification?.resourceRefs || [],
      redacted_payload: redactedPayload,
      result_redacted: redactPayload(result)
    });
    writeAudit({
      type: "approval_executed",
      tool: def.name,
      at: new Date().toISOString(),
      correlationId: approval.correlationId,
      userId: execContext.userId || "",
      params: policy.redactedParams,
      status: "ok"
    });
    recordToolHistory({
      tool: def.name,
      request: approval.params,
      status: "ok",
      response: result
    });
    return { status: "ok", data: result };
  }
}
