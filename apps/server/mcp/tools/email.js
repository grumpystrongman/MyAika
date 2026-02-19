import { getEmailDraft, updateEmailDraftStatus } from "../../storage/email.js";
import { writeOutbox } from "../../storage/outbox.js";
import {
  buildDraftReply,
  createTodoFromEmail,
  scheduleEmailFollowUp,
  replyWithContext
} from "../../src/email/emailActions.js";

export function draftReply({ originalEmail, tone = "friendly", context = "", signOffName = "" }, contextData = {}) {
  return buildDraftReply({
    originalEmail,
    tone,
    context,
    signOffName,
    userId: contextData.userId || "local"
  });
}

export function sendEmail({ draftId, sendTo = null, cc = [], bcc = [] }, contextData = {}) {
  const draft = getEmailDraft(draftId, contextData.userId || "local");
  if (!draft) {
    const err = new Error("draft_not_found");
    err.status = 404;
    throw err;
  }
  updateEmailDraftStatus(draftId, "sent");
  const payload = {
    type: "email",
    draftId,
    to: sendTo || JSON.parse(draft.to_json || "[]"),
    cc,
    bcc,
    subject: draft.draft_subject,
    body: draft.draft_body,
    transport: "stub"
  };
  const outbox = writeOutbox(payload);
  return { status: "sent", transport: "stub", outboxId: outbox.id };
}

export async function convertEmailToTodo(params = {}, contextData = {}) {
  return await createTodoFromEmail(params, { userId: contextData.userId || "local" });
}

export async function scheduleFollowUp(params = {}, contextData = {}) {
  return await scheduleEmailFollowUp(params, { userId: contextData.userId || "local" });
}

export async function replyWithContextTool(params = {}, contextData = {}) {
  return await replyWithContext(params, { userId: contextData.userId || "local" });
}
