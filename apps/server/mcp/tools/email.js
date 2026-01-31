import { createEmailDraft, getEmailDraft, updateEmailDraftStatus } from "../../storage/email.js";
import { writeOutbox } from "../../storage/outbox.js";

function toneTemplate(tone) {
  if (tone === "direct") {
    return "Direct and concise";
  }
  if (tone === "executive") {
    return "Executive summary style";
  }
  return "Friendly and helpful";
}

export function draftReply({ originalEmail, tone = "friendly", context = "", signOffName = "" }) {
  if (!originalEmail?.subject || !originalEmail?.body) {
    const err = new Error("original_email_required");
    err.status = 400;
    throw err;
  }
  const subject = originalEmail.subject.startsWith("Re:")
    ? originalEmail.subject
    : `Re: ${originalEmail.subject}`;
  const signOff = signOffName ? `\n\nBest,\n${signOffName}` : "";
  const body = `(${toneTemplate(tone)})\n\nThanks for the note. ${context ? `Context: ${context}. ` : ""}Here is my response:\n\n- Acknowledged your message\n- Proposed next step\n- Requested any missing details\n${signOff}`;
  const draft = createEmailDraft({
    originalFrom: originalEmail.from || "",
    originalSubject: originalEmail.subject,
    draftSubject: subject,
    draftBody: body,
    to: originalEmail.to || [],
    cc: [],
    bcc: []
  });
  return { id: draft.id, subject, body };
}

export function sendEmail({ draftId, sendTo = null, cc = [], bcc = [] }) {
  const draft = getEmailDraft(draftId);
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