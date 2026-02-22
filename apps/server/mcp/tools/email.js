import { createEmailDraft, getEmailDraft, updateEmailDraftStatus } from "../../storage/email.js";
import { writeOutbox } from "../../storage/outbox.js";
import { getGoogleStatus, sendGmailMessage } from "../../integrations/google.js";
import {
  buildDraftReply,
  createTodoFromEmail,
  scheduleEmailFollowUp,
  replyWithContext,
  normalizeRecipients
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

function hasGmailSendScope(status) {
  const scopes = new Set(Array.isArray(status?.scopes) ? status.scopes : []);
  return scopes.has("https://www.googleapis.com/auth/gmail.send");
}

function resolveTransportPreference() {
  const raw = String(process.env.EMAIL_TOOL_TRANSPORT || "auto").trim().toLowerCase();
  if (["gmail", "stub", "auto"].includes(raw)) return raw;
  return "auto";
}

export async function sendEmail({ draftId, sendTo = null, to = null, subject = "", body = "", cc = [], bcc = [] }, contextData = {}) {
  const userId = contextData.userId || "local";
  const resolvedTo = sendTo || to || [];
  const normalizedTo = normalizeRecipients(resolvedTo);
  const normalizedCc = normalizeRecipients(cc);
  const normalizedBcc = normalizeRecipients(bcc);
  let draft = null;
  let resolvedDraftId = draftId;
  let draftSubject = "";
  let draftBody = "";
  let draftRecipients = [];

  if (resolvedDraftId) {
    draft = getEmailDraft(resolvedDraftId, userId);
    if (!draft) {
      const err = new Error("draft_not_found");
      err.status = 404;
      throw err;
    }
    draftSubject = String(draft.draft_subject || "");
    draftBody = String(draft.draft_body || "");
    try {
      draftRecipients = JSON.parse(draft.to_json || "[]");
    } catch {
      draftRecipients = [];
    }
  } else {
    const subjectLine = String(subject || "Aika message").trim() || "Aika message";
    const bodyText = String(body || "").trim();
    if (!bodyText) {
      const err = new Error("email_body_required");
      err.status = 400;
      throw err;
    }
    if (!normalizedTo.length) {
      const err = new Error("email_to_required");
      err.status = 400;
      throw err;
    }
    const created = createEmailDraft({
      originalFrom: "",
      originalSubject: "",
      draftSubject: subjectLine,
      draftBody: bodyText,
      to: normalizedTo,
      cc: normalizedCc,
      bcc: normalizedBcc,
      userId
    });
    resolvedDraftId = created.id;
    draftSubject = subjectLine;
    draftBody = bodyText;
    draftRecipients = normalizedTo;
  }

  updateEmailDraftStatus(resolvedDraftId, "sent");

  const transportPref = resolveTransportPreference();
  const gmailStatus = transportPref === "stub" ? null : getGoogleStatus(userId);
  const canUseGmail = transportPref === "gmail" || (transportPref === "auto" && gmailStatus?.connected && hasGmailSendScope(gmailStatus));
  const payload = {
    type: "email",
    draftId: resolvedDraftId,
    to: normalizedTo.length ? normalizedTo : draftRecipients,
    cc: normalizedCc,
    bcc: normalizedBcc,
    subject: draftSubject,
    body: draftBody,
    transport: canUseGmail ? "gmail" : "stub"
  };

  if (canUseGmail) {
    const fromName = String(process.env.EMAIL_FROM_NAME || "");
    const sent = await sendGmailMessage({
      to: payload.to,
      subject: payload.subject,
      text: payload.body,
      fromName,
      userId
    });
    const outbox = writeOutbox({ ...payload, messageId: sent?.id || null });
    return {
      status: "sent",
      transport: "gmail",
      messageId: sent?.id || null,
      outboxId: outbox.id,
      to: payload.to,
      subject: payload.subject
    };
  }

  const outbox = writeOutbox(payload);
  return {
    status: "sent",
    transport: "stub",
    outboxId: outbox.id,
    to: payload.to,
    subject: payload.subject
  };
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

export async function sendWithContext(params = {}, contextData = {}, deps = {}) {
  const replyFn = deps.replyWithContext || replyWithContext;
  const sendFn = deps.sendEmail || sendEmail;
  const { email, tone = "friendly", signOffName = "", ragTopK = 6, ragModel = "all", sendTo = null, cc = [], bcc = [] } = params;
  const reply = await replyFn({ email, tone, signOffName, ragTopK, ragModel }, { userId: contextData.userId || "local" });
  const fallbackTo = normalizeRecipients(email?.from || reply?.draft?.to || []);
  const resolvedSendTo = Array.isArray(sendTo) && sendTo.length ? sendTo : fallbackTo;
  const sendResult = await Promise.resolve(sendFn({ draftId: reply?.draft?.id, sendTo: resolvedSendTo, cc, bcc }, contextData));
  return { ...reply, send: sendResult };
}
