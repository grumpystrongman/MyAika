import { routeIntent, buildMissingPrompt } from "./intentRouter.js";
import { executeActionRequest } from "./actionExecutor.js";
import { createAgentAction } from "../../storage/agent_actions.js";
import { getAssistantProfile } from "../../storage/assistant_profile.js";

function summarizeResult(actionType, result) {
  if (!result) return "";
  if (actionType === "meeting.summarize") {
    const docUrl = result?.googleDocUrl;
    return docUrl ? `Summary saved. Google Doc: ${docUrl}` : "Summary complete.";
  }
  if (actionType === "todos.create") {
    return result?.title ? `Task created: ${result.title}` : "Task created.";
  }
  if (actionType.startsWith("messaging.")) {
    return "Message queued.";
  }
  if (actionType === "email.send") {
    const recipients = Array.isArray(result?.to) ? result.to.join(", ") : "";
    return recipients ? `Email sent to ${recipients}.` : "Email sent.";
  }
  if (actionType === "docs.get") {
    const title = result?.title || "document";
    return `Fetched ${title}.`;
  }
  if (actionType === "meeting.export") {
    const notesUrl = result?.notesUrl || "";
    const transcriptUrl = result?.transcriptUrl || "";
    if (notesUrl && transcriptUrl) {
      return `Export ready. Notes: ${notesUrl} | Transcript: ${transcriptUrl}`;
    }
    return "Export ready.";
  }
  if (actionType === "meeting.email") {
    const to = Array.isArray(result?.to) ? result.to.join(", ") : "";
    return to ? `Meeting email sent to ${to}.` : "Meeting email sent.";
  }
  if (actionType === "meeting.recap_doc") {
    const url = result?.url;
    return url ? `Recap doc created: ${url}` : "Recap doc created.";
  }
  if (actionType === "meeting.draft_email") {
    return "Draft recap email ready.";
  }
  if (actionType === "meeting.schedule_followup") {
    return result?.event ? "Follow-up scheduled." : "Follow-up draft created.";
  }
  if (actionType === "meeting.create_task") {
    return "Draft task created.";
  }
  if (actionType === "meeting.create_ticket") {
    return "Draft ticket created.";
  }
  if (actionType === "meeting.resummarize") {
    return "Refreshing the meeting summary now.";
  }
  if (actionType === "meeting.delete") {
    return "Recording deleted.";
  }
  if (actionType === "rag.use") {
    return `RAG set to ${result?.ragModel || "auto"}.`;
  }
  if (actionType === "rag.eval") {
    const passed = result?.passed ?? 0;
    const failed = result?.failed ?? 0;
    return `RAG eval complete. Passed ${passed}, failed ${failed}.`;
  }
  if (actionType === "rag.fts") {
    return `RAG FTS rebuilt. Updated ${result?.updated || 0} rows.`;
  }
  if (actionType === "signals.run") {
    return "Signals ingestion started.";
  }
  if (actionType === "fireflies.sync") {
    return "Fireflies sync started.";
  }
  return "Action complete.";
}

function defaultReplyForAction(actionType) {
  if (actionType === "record_meeting.start") return "Starting the meeting recording now.";
  if (actionType === "record_meeting.stop") return "Stopping the meeting recording.";
  if (actionType === "record_meeting.pause") return "Pausing the meeting recording.";
  if (actionType === "record_meeting.resume") return "Resuming the meeting recording.";
  if (actionType === "meeting.resummarize") return "Refreshing the meeting summary now.";
  if (actionType === "email.send") return "Sending the email now.";
  return "Working on it now.";
}

function buildApprovalReply(approval) {
  const id = approval?.id ? `Approval ID: ${approval.id}` : "Approval required.";
  return `I need approval to proceed. ${id} Open the Approvals panel to continue.`;
}

function buildErrorReply(err, retryable) {
  const detail = err?.message ? ` (${err.message})` : "";
  return retryable
    ? `I couldn't complete that${detail}. Want me to retry?`
    : `I couldn't complete that${detail}.`;
}

function resolveEmailAlias(alias, userId) {
  const normalized = String(alias || "").trim().toLowerCase();
  if (!normalized) return "";
  const profile = getAssistantProfile(userId || "local");
  const identity = profile?.preferences?.identity || {};
  const workEmail = String(identity.workEmail || "").trim();
  const personalEmail = String(identity.personalEmail || "").trim();
  if (normalized === "work") return workEmail;
  if (normalized === "personal") return personalEmail;
  if (normalized === "self") return workEmail || personalEmail;
  return "";
}

export async function handleActionIntent({ text, context = {}, deps = {} } = {}) {
  const intent = routeIntent(text);
  if (!intent) return null;

  const action = intent.action || {};
  const missingSet = new Set(Array.isArray(intent.missing) ? intent.missing : []);
  const workspaceId = context.workspaceId || "default";
  const requestedBy = context.userId || "local";
  let missingReplyOverride = "";

  if (action.type === "messaging.telegramSend" && !action.params?.chatId && context?.chatId) {
    action.params = { ...(action.params || {}), chatId: String(context.chatId) };
    missingSet.delete("chatId");
  }
  if (action.type?.startsWith("meeting.") && !action.params?.recordingId && context?.recordingId) {
    action.params = { ...(action.params || {}), recordingId: String(context.recordingId) };
    missingSet.delete("recordingId");
  }
  if (action.type === "email.send") {
    const alias = action.params?.toAlias;
    if (alias && (!Array.isArray(action.params?.sendTo) || action.params.sendTo.length === 0)) {
      const resolved = resolveEmailAlias(alias, requestedBy);
      if (resolved) {
        action.params = {
          ...(action.params || {}),
          sendTo: [resolved],
          autonomy: action.params?.autonomy || "self"
        };
        missingSet.delete("to");
      } else {
        missingSet.add("to");
        missingReplyOverride = alias === "work"
          ? "I don't have your work email yet. Tell me the address or add it in Settings -> Connections -> Email identity."
          : "I don't have your email address yet. Tell me the address or add it in Settings -> Connections -> Email identity.";
      }
    }
    if (action.params?.toAlias) {
      delete action.params.toAlias;
    }
  }
  const missing = Array.from(missingSet);
  action.missing = missing;
  intent.missing = missing;

  if (missing.length) {
    const reply = missingReplyOverride || buildMissingPrompt(intent);
    createAgentAction({
      workspaceId,
      requestedBy,
      actionType: action.type,
      input: { text, params: action.params || {}, missing },
      output: { reply },
      status: "needs_input"
    });
    return {
      handled: true,
      status: "needs_input",
      reply,
      action: { ...action, status: "needs_input" },
      missing
    };
  }

  const exec = await executeActionRequest(action, context, deps);
  let reply = "";
  if (exec.status === "approval_required") {
    reply = buildApprovalReply(exec.approval);
  } else if (exec.status === "error") {
    reply = buildErrorReply(exec.error, exec.retryable);
  } else if (exec.status === "running") {
    reply = defaultReplyForAction(action.type);
    if (context?.channel === "telegram" && exec.idempotencyKey) {
      reply = `${reply} Tracking ID: ${exec.idempotencyKey}. Reply /action ${exec.idempotencyKey} for status.`;
    }
  } else if (exec.status === "client_required") {
    reply = defaultReplyForAction(action.type);
  } else {
    reply = summarizeResult(action.type, exec.data) || defaultReplyForAction(action.type);
  }

  createAgentAction({
    workspaceId,
    requestedBy,
    actionType: action.type,
    input: { text, params: action.params || {} },
    output: { result: exec, reply },
    status: exec.status === "error" ? "failed" : exec.status
  });

  return {
    handled: true,
    status: exec.status,
    reply,
    action: {
      ...action,
      status: exec.status,
      idempotencyKey: exec.idempotencyKey
    },
    result: exec,
    approval: exec.approval || null,
    retryable: exec.retryable || false
  };
}
