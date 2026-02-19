import { createEmailDraft } from "../../storage/email.js";
import { createTodoRecord, getTodoListRecord } from "../../storage/todos.js";
import { createHoldRecord } from "../../storage/calendar.js";
import { ingestTodoToRag } from "../rag/todosIngest.js";
import { answerRagQuestionRouted } from "../rag/router.js";

function toneTemplate(tone) {
  if (tone === "direct") {
    return "Direct and concise";
  }
  if (tone === "executive") {
    return "Executive summary style";
  }
  return "Friendly and helpful";
}

function normalizeEmail(email = {}) {
  const subject = String(email?.subject || "").trim();
  const from = String(email?.from || "").trim();
  const to = Array.isArray(email?.to)
    ? email.to
    : String(email?.to || "")
        .split(",")
        .map(item => item.trim())
        .filter(Boolean);
  const snippet = String(email?.snippet || "").trim();
  const body = String(email?.body || email?.text || snippet).trim();
  const receivedAtRaw = email?.receivedAt ? String(email.receivedAt) : "";
  let receivedAt = "";
  if (receivedAtRaw) {
    const parsed = new Date(receivedAtRaw);
    if (!Number.isNaN(parsed.getTime())) {
      receivedAt = parsed.toISOString();
    }
  }
  const provider = String(email?.provider || "").trim().toLowerCase();
  const webLink = String(email?.webLink || "").trim();
  const id = String(email?.id || "").trim();
  const threadId = String(email?.threadId || "").trim();
  return {
    subject,
    from,
    to,
    body,
    snippet,
    receivedAt,
    provider,
    webLink,
    id,
    threadId
  };
}

function buildEmailDetails(email, extraNotes = "") {
  const lines = [];
  if (email.from) lines.push(`From: ${email.from}`);
  if (email.to?.length) lines.push(`To: ${email.to.join(", ")}`);
  if (email.receivedAt) lines.push(`Received: ${email.receivedAt}`);
  if (email.provider) lines.push(`Provider: ${email.provider}`);
  if (email.webLink) lines.push(`Link: ${email.webLink}`);
  if (email.snippet) lines.push(`Snippet: ${email.snippet}`);
  if (extraNotes) lines.push(`Notes: ${extraNotes}`);
  return lines.join("\n");
}

function mergeTags(base = [], extra = []) {
  const combined = [...base, ...extra]
    .map(tag => String(tag || "").trim())
    .filter(Boolean);
  const seen = new Set();
  return combined.filter(tag => {
    const key = tag.toLowerCase();
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

export function buildDraftReply({ originalEmail, tone = "friendly", context = "", signOffName = "", userId = "local" }) {
  if (!originalEmail?.subject || !originalEmail?.body) {
    const err = new Error("original_email_required");
    err.status = 400;
    throw err;
  }
  const subject = originalEmail.subject.startsWith("Re:")
    ? originalEmail.subject
    : `Re: ${originalEmail.subject}`;
  const signOff = signOffName ? `

Best,
${signOffName}` : "";
  const body = `(${toneTemplate(tone)})

Thanks for the note. ${context ? `Context: ${context}. ` : ""}Here is my response:

- Acknowledged your message
- Proposed next step
- Requested any missing details
${signOff}`;
  const draft = createEmailDraft({
    originalFrom: originalEmail.from || "",
    originalSubject: originalEmail.subject,
    draftSubject: subject,
    draftBody: body,
    to: originalEmail.to || [],
    cc: [],
    bcc: [],
    userId
  });
  return { id: draft.id, subject, body };
}

export function buildEmailContextPrompt(email) {
  return `Find any relevant notes or todos related to this email.
Subject: ${email.subject}
From: ${email.from}
Snippet: ${email.snippet}`;
}

export async function createTodoFromEmail({ email, title = "", details = "", notes = "", due = null, reminderAt = null, priority = "medium", tags = [], listId = null } = {}, context = {}) {
  const userId = context.userId || "local";
  const normalized = normalizeEmail(email || {});
  const fallbackTitle = normalized.subject ? `Follow up: ${normalized.subject}` : "Email follow-up";
  const taskTitle = String(title || "").trim() || fallbackTitle;
  const derivedDetails = buildEmailDetails(normalized, details);
  const combinedTags = mergeTags(["email", normalized.provider].filter(Boolean), tags);

  const record = createTodoRecord({
    title: taskTitle,
    details: derivedDetails,
    notes: notes || "",
    due,
    reminderAt,
    priority,
    tags: combinedTags,
    listId,
    userId
  });

  let rag = null;
  try {
    const list = record.listId ? getTodoListRecord({ id: record.listId, userId }) : null;
    rag = await ingestTodoToRag({ todo: record, listName: list?.name || "" });
  } catch {
    rag = null;
  }

  return { todo: record, rag, sourceEmail: normalized };
}

export async function scheduleEmailFollowUp({ email, followUpAt, reminderAt = null, priority = "medium", tags = [], listId = null, hold = null, notes = "" } = {}, context = {}) {
  if (!followUpAt) {
    const err = new Error("follow_up_date_required");
    err.status = 400;
    throw err;
  }
  const todoResult = await createTodoFromEmail({
    email,
    due: followUpAt,
    reminderAt,
    priority,
    tags,
    listId,
    notes
  }, context);

  let holdResult = null;
  if (hold && hold.start && hold.end && hold.timezone) {
    holdResult = createHoldRecord({
      title: hold.title || todoResult.todo.title,
      start: hold.start,
      end: hold.end,
      timezone: hold.timezone,
      attendees: Array.isArray(hold.attendees) ? hold.attendees : [],
      location: hold.location || "",
      description: hold.description || "",
      userId: context.userId || "local"
    });
  } else if (hold) {
    const err = new Error("hold_requires_start_end_timezone");
    err.status = 400;
    throw err;
  }

  return { todo: todoResult.todo, rag: todoResult.rag, hold: holdResult };
}

export async function replyWithContext({ email, tone = "friendly", signOffName = "", ragTopK = 6, ragModel = "all" } = {}, context = {}, ragAnswerFn = answerRagQuestionRouted) {
  const normalized = normalizeEmail(email || {});
  if (!normalized.subject || !normalized.body) {
    const err = new Error("original_email_required");
    err.status = 400;
    throw err;
  }
  const question = buildEmailContextPrompt(normalized);
  const rag = await ragAnswerFn(question, {
    topK: ragTopK,
    ragModel,
    filters: { meetingIdPrefix: "rag:" }
  });
  const contextText = rag?.answer || "";
  const draft = buildDraftReply({
    originalEmail: {
      subject: normalized.subject,
      body: normalized.body,
      from: normalized.from,
      to: normalized.to
    },
    tone,
    context: contextText,
    signOffName,
    userId: context.userId || "local"
  });
  return { draft, context: contextText, citations: rag?.citations || [] };
}
