import { listRecentAgentActionsForUser } from "../../storage/agent_actions.js";
import { getActionRun } from "../agent/actionRunStore.js";
import { handleActionIntent } from "../agent/actionPipeline.js";

function normalize(text) {
  return String(text || "").replace(/\s+/g, " ").trim();
}

function parseMode(text = "") {
  const normalized = normalize(text).toLowerCase();
  if (!normalized) return "";
  if (/\b(retry|try again|run that again|resend|send again)\b/.test(normalized)) return "retry";
  if (/\b(status|did that send|did it send|did it work|what happened|is that done|check that)\b/.test(normalized)) return "status";
  if (/\b(go ahead|continue|proceed|do it|send it now)\b/.test(normalized)) return "continue";
  return "";
}

function latestActionForUser(userId = "local") {
  const actions = listRecentAgentActionsForUser(userId, 8);
  return actions.find((row) => row.action_type) || null;
}

function summarizeLatestAction(action) {
  if (!action) return "I don't have a recent action to reference yet.";
  const output = action.output_json || {};
  const result = output.result || {};
  const idempotencyKey = result.idempotencyKey || output.idempotencyKey || "";
  const run = idempotencyKey ? getActionRun(idempotencyKey) : null;
  const status = run?.status || action.status || result.status || "unknown";
  const actionType = action.action_type || "action";
  if (status === "ok") return `The last ${actionType} completed successfully.`;
  if (status === "approval_required") return `The last ${actionType} is waiting for approval. Use the Approvals queue to continue.`;
  if (status === "running") return `The last ${actionType} is still running.`;
  if (status === "failed" || status === "error") {
    const err = run?.error?.message || result?.error?.message || output?.reply || "it failed.";
    return `The last ${actionType} failed: ${err}`;
  }
  if (status === "needs_input") return `The last ${actionType} still needs more information before I can continue.`;
  return `The last ${actionType} is currently ${status}.`;
}

export async function executeActionFollowUpRequest({ text, context = {}, deps = {} } = {}) {
  const mode = parseMode(text);
  if (!mode) return { handled: false };

  const userId = context.userId || "local";
  const latest = latestActionForUser(userId);
  if (!latest) {
    return {
      handled: true,
      reply: "I don't have a recent action to follow up on yet."
    };
  }

  const input = latest.input_json || {};
  const output = latest.output_json || {};
  const result = output.result || {};
  const idempotencyKey = result.idempotencyKey || output.idempotencyKey || "";
  const run = idempotencyKey ? getActionRun(idempotencyKey) : null;
  const status = run?.status || latest.status || result.status || "";

  if (mode === "status") {
    return {
      handled: true,
      reply: summarizeLatestAction(latest),
      data: {
        mode,
        actionType: latest.action_type,
        status
      }
    };
  }

  if (mode === "continue") {
    if (status === "approval_required") {
      const approvalId = result?.approval?.id || output?.approval?.id || "";
      return {
        handled: true,
        reply: approvalId
          ? `That action is waiting for approval. Approval ID: ${approvalId}. Use the Approvals queue to continue.`
          : "That action is waiting for approval. Use the Approvals queue to continue.",
        data: {
          mode,
          actionType: latest.action_type,
          status
        }
      };
    }
    if (status === "needs_input") {
      return {
        handled: true,
        reply: output.reply || "That action still needs more information before I can continue.",
        data: {
          mode,
          actionType: latest.action_type,
          status
        }
      };
    }
  }

  if (mode === "retry") {
    const retryable = Boolean(result?.retryable || output?.retryable || status === "failed" || status === "error");
    if (!retryable) {
      return {
        handled: true,
        reply: `The last ${latest.action_type} is not in a retryable state right now.`,
        data: {
          mode,
          actionType: latest.action_type,
          status
        }
      };
    }
    const originalText = String(input.text || "").trim();
    if (!originalText) {
      return {
        handled: true,
        reply: "I don't have enough of the original action request to retry it safely."
      };
    }
    const rerun = await handleActionIntent({ text: originalText, context, deps });
    if (!rerun?.handled) {
      return { handled: true, reply: "I couldn't retry that action automatically." };
    }
    return {
      handled: true,
      reply: rerun.reply,
      data: {
        mode,
        retriedActionType: rerun.action?.type || latest.action_type,
        status: rerun.status || ""
      },
      approval: rerun.approval || null,
      action: rerun.action || null,
      actionResult: rerun.result || null
    };
  }

  return { handled: false };
}
