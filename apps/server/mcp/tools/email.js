import { createEmailDraft, getEmailDraft, updateEmailDraftStatus } from "../../storage/email.js";
import { writeOutbox } from "../../storage/outbox.js";
import { getGoogleStatus, sendGmailMessage } from "../../integrations/google.js";
import { getEmailInbox } from "../../src/connectors/emailInbox.js";
import {
  buildDraftReply,
  createTodoFromEmail,
  scheduleEmailFollowUp,
  replyWithContext,
  normalizeRecipients
} from "../../src/email/emailActions.js";

function coerceOriginalEmail(originalEmail, context = "") {
  if (typeof originalEmail === "string") {
    const raw = originalEmail.trim();
    const firstLine = raw.split(/\r?\n/).find(line => line.trim()) || "Draft Request";
    const subject = firstLine.slice(0, 80);
    return {
      subject: subject || "Draft Request",
      body: raw || context || "No email body provided.",
      from: "",
      to: []
    };
  }
  if (originalEmail && typeof originalEmail === "object") {
    const subject = String(originalEmail.subject || originalEmail.title || "").trim() || "Draft Request";
    const body = String(originalEmail.body || originalEmail.text || originalEmail.snippet || "").trim()
      || String(context || "").trim()
      || "No email body provided.";
    const to = normalizeRecipients(originalEmail.to || originalEmail.sendTo || []);
    return {
      subject,
      body,
      from: originalEmail.from || "",
      to
    };
  }
  const fallback = String(context || "").trim();
  return {
    subject: "Draft Request",
    body: fallback || "No email body provided.",
    from: "",
    to: []
  };
}

export function draftReply({ originalEmail, tone = "friendly", context = "", signOffName = "" }, contextData = {}) {
  const normalized = coerceOriginalEmail(originalEmail, context);
  return buildDraftReply({
    originalEmail: normalized,
    tone,
    context,
    signOffName,
    userId: contextData.userId || "local"
  });
}

function normalizeProviders(value) {
  if (Array.isArray(value)) return value.map(v => String(v || "").toLowerCase()).filter(Boolean);
  const raw = String(value || "").trim().toLowerCase();
  if (!raw || raw === "all") return ["gmail", "outlook"];
  return raw.split(",").map(v => v.trim()).filter(Boolean);
}

function triageCategory(email = {}) {
  const subject = String(email.subject || "").toLowerCase();
  const from = String(email.from || "").toLowerCase();
  if (subject.includes("urgent") || subject.includes("asap") || subject.includes("action required") || subject.includes("deadline")) {
    return "urgent";
  }
  if (from.includes("no-reply") || from.includes("noreply") || subject.includes("newsletter")) {
    return "low";
  }
  return "normal";
}

function suggestedAction(category) {
  if (category === "urgent") return "reply";
  if (category === "low") return "archive";
  return "follow_up";
}

function buildStubInbox() {
  const now = Date.now();
  return [
    { id: "stub-1", subject: "Action required: KPI review", from: "director@example.com", snippet: "Please review the KPI deck.", receivedAt: new Date(now - 3600_000).toISOString(), provider: "stub" },
    { id: "stub-2", subject: "Weekly check-in", from: "team@example.com", snippet: "Quick updates for this week.", receivedAt: new Date(now - 7200_000).toISOString(), provider: "stub" },
    { id: "stub-3", subject: "Newsletter: Data engineering", from: "no-reply@newsletter.com", snippet: "Latest trends and tips.", receivedAt: new Date(now - 10_800_000).toISOString(), provider: "stub" }
  ];
}

export async function inboxTriage({ providers = "all", limit = 25, lookbackDays = 14 } = {}, contextData = {}) {
  const userId = contextData.userId || "local";
  const allowStub = contextData.allowStub === true || String(process.env.AIKA_ALLOW_STUB_INBOX || "0") === "1";
  const providerList = normalizeProviders(providers);
  const cappedLimit = Math.min(100, Math.max(5, Number(limit || 25)));
  const lookback = Number.isFinite(Number(lookbackDays)) ? Number(lookbackDays) : 14;
  let items = [];
  try {
    items = await getEmailInbox({ userId, providers: providerList, limit: cappedLimit, lookbackDays: lookback });
  } catch {
    items = [];
  }
  if (!items.length && allowStub) {
    items = buildStubInbox();
  }
  const triaged = items.map(item => {
    const category = triageCategory(item);
    return {
      ...item,
      category,
      suggestedAction: suggestedAction(category)
    };
  });
  const summary = triaged.reduce((acc, item) => {
    acc.total += 1;
    acc[item.category] += 1;
    return acc;
  }, { total: 0, urgent: 0, normal: 0, low: 0 });

  return {
    summary,
    top: triaged.slice(0, 5),
    items: triaged
  };
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
