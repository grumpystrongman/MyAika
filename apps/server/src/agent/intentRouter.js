import crypto from "node:crypto";

function makeId() {
  return crypto.randomUUID ? crypto.randomUUID() : crypto.randomBytes(16).toString("hex");
}

function extractQuoted(text) {
  const match = String(text || "").match(/"([^"]+)"|'([^']+)'/);
  if (!match) return "";
  return (match[1] || match[2] || "").trim();
}

function extractAfterColon(text) {
  const idx = String(text || "").indexOf(":");
  if (idx === -1) return "";
  return String(text || "").slice(idx + 1).trim();
}

function normalizeSpace(text) {
  return String(text || "").replace(/\s+/g, " ").trim();
}

function extractRecordingId(text) {
  const raw = String(text || "");
  const match = raw.match(/\b(?:recording|meeting)\s*(?:id|#)?\s*([a-f0-9]{6,})\b/i) ||
    raw.match(/\brec\s*#?\s*([a-f0-9]{6,})\b/i);
  return match?.[1] || "";
}

function extractEmails(text) {
  const matches = String(text || "").match(/[^\s@]+@[^\s@]+\.[^\s@]+/g);
  return matches ? Array.from(new Set(matches.map(v => v.trim().replace(/[,:;]+$/, "")))) : [];
}

function extractPhones(text) {
  const matches = String(text || "").match(/\+?\d[\d\s().-]{7,}\d/g);
  return matches
    ? Array.from(
        new Set(
          matches
            .map(v => v.replace(/[^\d+]/g, ""))
            .filter(v => v.length >= 10)
        )
      )
    : [];
}

function extractSubject(text) {
  const match = String(text || "").match(/\bsubject\s*[:=]\s*(.+)$/i);
  return match?.[1]?.trim() || "";
}

function extractRecipientAlias(text) {
  const lower = String(text || "").toLowerCase();
  if (/\bmy\s+work\s+(email|address)\b/.test(lower)) return "work";
  if (/\bmy\s+(email|address)\b/.test(lower)) return "self";
  if (/\bemail\s+me\b/.test(lower)) return "self";
  if (/\bto\s+me\b/.test(lower)) return "self";
  if (/\bmyself\b/.test(lower)) return "self";
  return "";
}

function extractMessagingRecipientAlias(text) {
  const lower = String(text || "").toLowerCase();
  if (/\b(?:text|sms|whatsapp)\s+me\b/.test(lower)) return "self";
  if (/\btelegram\s+me\b/.test(lower)) return "self";
  if (/\bto\s+me\b/.test(lower)) return "self";
  if (/\bmyself\b/.test(lower)) return "self";
  return "";
}

function extractMessagingRecipientLabel(text, platform = "") {
  const raw = normalizeSpace(text);
  const patterns = platform === "telegram"
    ? [
        /\btelegram(?:\s+message)?\s+to\s+([a-z][a-z0-9 .'-]{1,40}?)(?=\s+(?:"|'|chat\b|:)|$)/i,
        /\bsend\s+telegram\s+([a-z][a-z0-9 .'-]{1,40}?)(?=\s+(?:"|'|chat\b|:)|$)/i
      ]
    : platform === "whatsapp"
      ? [
          /\bwhats\s?app(?:\s+message)?\s+to\s+([a-z][a-z0-9 .'-]{1,40}?)(?=\s+(?:"|'|:)|$)/i,
          /\bsend\s+whats\s?app\s+([a-z][a-z0-9 .'-]{1,40}?)(?=\s+(?:"|'|:)|$)/i
        ]
      : platform === "sms"
        ? [
            /\b(?:sms|text)(?:\s+message)?\s+to\s+([a-z][a-z0-9 .'-]{1,40}?)(?=\s+(?:"|'|:)|$)/i,
            /\b(?:sms|text)\s+([a-z][a-z0-9 .'-]{1,40}?)(?=\s+(?:"|'|:)|$)/i
          ]
        : [];
  for (const pattern of patterns) {
    const match = raw.match(pattern);
    if (match?.[1]) return normalizeSpace(match[1]);
  }
  return "";
}

function extractEmailBody(text) {
  const raw = String(text || "");
  const quoted = extractQuoted(raw);
  if (quoted) return quoted;
  const afterColon = extractAfterColon(raw);
  if (afterColon) return afterColon;
  const remindMatch = raw.match(/\bremind me (?:to )?(.+)$/i);
  if (remindMatch?.[1]) return `Reminder: ${remindMatch[1].trim()}`;
  const sayMatch = raw.match(/\b(?:say|saying|that says|telling)\s+(.+)$/i);
  if (sayMatch?.[1]) return sayMatch[1].trim();
  const aboutMatch = raw.match(/\babout\s+(.+)$/i);
  if (aboutMatch?.[1]) return aboutMatch[1].trim();
  return "";
}

function defaultEmailSubject(text, body) {
  const lower = String(text || "").toLowerCase();
  if (/\bremind me\b/.test(lower) || /\breminder\b/.test(lower)) return "Reminder";
  if (/\bfollow[- ]?up\b/.test(lower)) return "Follow-up";
  if (body && body.toLowerCase().startsWith("reminder:")) return "Reminder";
  return "Aika message";
}

function pad2(value) {
  return String(value).padStart(2, "0");
}

function formatLocalIso(date) {
  return `${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(date.getDate())}T${pad2(date.getHours())}:${pad2(date.getMinutes())}:00`;
}

function parseClockTime(token) {
  const match = String(token || "").trim().match(/^(\d{1,2})(?::(\d{2}))?\s*(am|pm)?$/i);
  if (!match) return null;
  let hours = Number(match[1]);
  const minutes = Number(match[2] || 0);
  const meridiem = String(match[3] || "").toLowerCase();
  if (meridiem === "pm" && hours < 12) hours += 12;
  if (meridiem === "am" && hours === 12) hours = 0;
  if (!Number.isFinite(hours) || !Number.isFinite(minutes) || hours > 23 || minutes > 59) return null;
  return { hours, minutes };
}

function buildIsoFromDateAndTime(dateToken, timeToken) {
  const dateMatch = String(dateToken || "").trim().match(/^(\d{4})-(\d{2})-(\d{2})$/);
  const time = parseClockTime(timeToken);
  if (!dateMatch || !time) return "";
  return `${dateMatch[1]}-${dateMatch[2]}-${dateMatch[3]}T${pad2(time.hours)}:${pad2(time.minutes)}:00`;
}

function extractCalendarRange(text) {
  const raw = String(text || "");
  const quotedTitle = extractQuoted(raw);

  let match = raw.match(/\bfrom\s+(\d{4}-\d{2}-\d{2}[ t]\d{1,2}:\d{2}(?::\d{2})?)\s+to\s+(\d{4}-\d{2}-\d{2}[ t]\d{1,2}:\d{2}(?::\d{2})?)/i);
  if (match) {
    return {
      title: quotedTitle,
      start: match[1].replace(" ", "T"),
      end: match[2].replace(" ", "T")
    };
  }

  match = raw.match(/\bon\s+(\d{4}-\d{2}-\d{2})\s+from\s+(\d{1,2}(?::\d{2})?\s*(?:am|pm)?)\s+to\s+(\d{1,2}(?::\d{2})?\s*(?:am|pm)?)/i);
  if (match) {
    return {
      title: quotedTitle,
      start: buildIsoFromDateAndTime(match[1], match[2]),
      end: buildIsoFromDateAndTime(match[1], match[3])
    };
  }

  match = raw.match(/\b(today|tomorrow)\s+at\s+(\d{1,2}(?::\d{2})?\s*(?:am|pm)?)(?:\s+for\s+(\d+)\s*(minutes?|hours?))?/i);
  if (match) {
    const start = new Date();
    if (String(match[1]).toLowerCase() === "tomorrow") start.setDate(start.getDate() + 1);
    const time = parseClockTime(match[2]);
    if (time) {
      start.setHours(time.hours, time.minutes, 0, 0);
      const end = new Date(start.getTime());
      const amount = Number(match[3] || 30);
      const unit = String(match[4] || "minutes").toLowerCase();
      end.setMinutes(end.getMinutes() + (unit.startsWith("hour") ? amount * 60 : amount));
      return {
        title: quotedTitle,
        start: formatLocalIso(start),
        end: formatLocalIso(end)
      };
    }
  }

  return { title: quotedTitle, start: "", end: "" };
}

function buildIntent({ name, actionType, params = {}, missing = [], confidence = 0.6, raw = "", notes = "" } = {}) {
  return {
    id: makeId(),
    name,
    action: {
      id: makeId(),
      type: actionType,
      params,
      missing
    },
    missing,
    confidence,
    raw: String(raw || ""),
    notes
  };
}

function parseRecordMeeting(text) {
  const lower = String(text || "").toLowerCase();
  if (/\b(stop|end)\s+record(ing)?\b/.test(lower)) {
    return buildIntent({ name: "record_meeting", actionType: "record_meeting.stop", confidence: 0.9, raw: text });
  }
  if (/\bpause\s+record(ing)?\b/.test(lower)) {
    return buildIntent({ name: "record_meeting", actionType: "record_meeting.pause", confidence: 0.9, raw: text });
  }
  if (/\bresume\s+record(ing)?\b/.test(lower)) {
    return buildIntent({ name: "record_meeting", actionType: "record_meeting.resume", confidence: 0.9, raw: text });
  }
  const isStart = /\b(record( this)? meeting|start record(ing)?|start meeting recording|record meeting)\b/.test(lower);
  if (!isStart) return null;
  const title = extractQuoted(text) || extractAfterColon(text);
  const params = title ? { title } : {};
  return buildIntent({ name: "record_meeting", actionType: "record_meeting.start", params, confidence: 0.85, raw: text });
}

function parseSummarizeMeeting(text) {
  const lower = String(text || "").toLowerCase();
  if (!/\b(summarize|summary|recap)\b/.test(lower)) return null;
  if (!/\b(meeting|transcript|call|notes)\b/.test(lower)) return null;
  const transcript = extractQuoted(text) || extractAfterColon(text);
  if (!transcript) {
    return buildIntent({
      name: "summarize_meeting",
      actionType: "meeting.summarize",
      missing: ["transcript"],
      confidence: 0.7,
      raw: text
    });
  }
  return buildIntent({
    name: "summarize_meeting",
    actionType: "meeting.summarize",
    params: { transcript },
    confidence: 0.75,
    raw: text
  });
}

function parseMeetingResummarize(text) {
  const lower = String(text || "").toLowerCase();
  if (!/\b(resummarize|re-summarize|refresh summary|regenerate summary)\b/.test(lower)) return null;
  if (!/\b(meeting|recording|summary)\b/.test(lower)) return null;
  const recordingId = extractRecordingId(text);
  const missing = recordingId ? [] : ["recordingId"];
  return buildIntent({
    name: "meeting_resummarize",
    actionType: "meeting.resummarize",
    params: recordingId ? { recordingId } : {},
    missing,
    confidence: 0.75,
    raw: text
  });
}

function parseMeetingDelete(text) {
  const lower = String(text || "").toLowerCase();
  if (!/\b(delete|remove|trash)\b/.test(lower)) return null;
  if (!/\b(meeting|recording)\b/.test(lower)) return null;
  const recordingId = extractRecordingId(text);
  const missing = recordingId ? [] : ["recordingId"];
  return buildIntent({
    name: "meeting_delete",
    actionType: "meeting.delete",
    params: recordingId ? { recordingId } : {},
    missing,
    confidence: 0.7,
    raw: text
  });
}

function parseMeetingExport(text) {
  const lower = String(text || "").toLowerCase();
  if (!/\b(export|download|save|get)\b/.test(lower)) return null;
  if (!/\b(meeting|recording|notes|transcript)\b/.test(lower)) return null;
  const recordingId = extractRecordingId(text);
  const missing = recordingId ? [] : ["recordingId"];
  return buildIntent({
    name: "meeting_export",
    actionType: "meeting.export",
    params: recordingId ? { recordingId } : {},
    missing,
    confidence: 0.72,
    raw: text
  });
}

function parseMeetingDraftEmail(text) {
  const lower = String(text || "").toLowerCase();
  if (!/\b(draft|write|compose)\b/.test(lower)) return null;
  if (!/\b(email|mail)\b/.test(lower)) return null;
  if (!/\b(meeting|recap|summary|notes)\b/.test(lower)) return null;
  const recordingId = extractRecordingId(text);
  const missing = recordingId ? [] : ["recordingId"];
  return buildIntent({
    name: "meeting_draft_email",
    actionType: "meeting.draft_email",
    params: recordingId ? { recordingId } : {},
    missing,
    confidence: 0.7,
    raw: text
  });
}

function parseMeetingEmail(text) {
  const lower = String(text || "").toLowerCase();
  const hasEmailKeyword = /\b(email|mail)\b/.test(lower);
  if (!/\b(meeting|recap|summary|notes)\b/.test(lower)) return null;
  if (/\bdraft\b/.test(lower)) return null;
  const to = extractEmails(text);
  if (!hasEmailKeyword && !to.length) return null;
  if (!hasEmailKeyword && !/\bsend\b/.test(lower)) return null;
  const recordingId = extractRecordingId(text);
  const subject = extractSubject(text);
  const missing = [];
  if (!recordingId) missing.push("recordingId");
  if (!to.length) missing.push("to");
  const params = {};
  if (recordingId) params.recordingId = recordingId;
  if (to.length) params.to = to;
  if (subject) params.subject = subject;
  return buildIntent({
    name: "meeting_email",
    actionType: "meeting.email",
    params,
    missing,
    confidence: 0.75,
    raw: text
  });
}

function parseMeetingRecapDoc(text) {
  const lower = String(text || "").toLowerCase();
  if (!/\b(create|make|generate|build)\b/.test(lower)) return null;
  if (!/\b(doc|document)\b/.test(lower)) return null;
  if (!/\b(meeting|recap|summary|notes)\b/.test(lower)) return null;
  const recordingId = extractRecordingId(text);
  const missing = recordingId ? [] : ["recordingId"];
  return buildIntent({
    name: "meeting_recap_doc",
    actionType: "meeting.recap_doc",
    params: recordingId ? { recordingId } : {},
    missing,
    confidence: 0.7,
    raw: text
  });
}

function parseMeetingScheduleFollowup(text) {
  const lower = String(text || "").toLowerCase();
  if (!/\b(schedule|set up|book)\b/.test(lower)) return null;
  if (!/\b(follow[- ]?up|followup)\b/.test(lower)) return null;
  const recordingId = extractRecordingId(text);
  const missing = recordingId ? [] : ["recordingId"];
  return buildIntent({
    name: "meeting_followup",
    actionType: "meeting.schedule_followup",
    params: recordingId ? { recordingId } : {},
    missing,
    confidence: 0.68,
    raw: text
  });
}

function parseMeetingCreateTask(text) {
  const lower = String(text || "").toLowerCase();
  if (!/\b(create|add|make)\b/.test(lower)) return null;
  if (!/\b(task|todo)\b/.test(lower)) return null;
  if (!/\b(meeting|recap|summary|notes)\b/.test(lower)) return null;
  const recordingId = extractRecordingId(text);
  const missing = recordingId ? [] : ["recordingId"];
  return buildIntent({
    name: "meeting_create_task",
    actionType: "meeting.create_task",
    params: recordingId ? { recordingId } : {},
    missing,
    confidence: 0.66,
    raw: text
  });
}

function parseMeetingCreateTicket(text) {
  const lower = String(text || "").toLowerCase();
  if (!/\b(create|add|make)\b/.test(lower)) return null;
  if (!/\b(ticket|issue)\b/.test(lower)) return null;
  if (!/\b(meeting|recap|summary|notes)\b/.test(lower)) return null;
  const recordingId = extractRecordingId(text);
  const missing = recordingId ? [] : ["recordingId"];
  return buildIntent({
    name: "meeting_create_ticket",
    actionType: "meeting.create_ticket",
    params: recordingId ? { recordingId } : {},
    missing,
    confidence: 0.66,
    raw: text
  });
}

function parseTodo(text) {
  const raw = String(text || "").trim();
  const lower = raw.toLowerCase();
  const colonMatch = raw.match(/^(todo|task)\s*:\s*(.+)$/i);
  if (colonMatch) {
    return buildIntent({
      name: "create_task",
      actionType: "todos.create",
      params: { title: colonMatch[2].trim() },
      confidence: 0.8,
      raw: text
    });
  }
  const match = raw.match(/^(create|add|new)\s+(task|todo)\s*(.+)?$/i) || raw.match(/^add\s+(task|todo)\s+(.+)$/i);
  if (!match) return null;
  const title = normalizeSpace(match[3] || match[2] || "");
  if (!title) {
    return buildIntent({
      name: "create_task",
      actionType: "todos.create",
      missing: ["title"],
      confidence: 0.7,
      raw: text
    });
  }
  return buildIntent({
    name: "create_task",
    actionType: "todos.create",
    params: { title },
    confidence: 0.8,
    raw: text
  });
}

function parseSendMessage(text) {
  const raw = String(text || "").trim();
  const lower = raw.toLowerCase();
  if (!/(send|message|text|notify)/.test(lower)) return null;

  const platform = /\bslack\b/.test(lower)
    ? "slack"
    : /\btelegram\b/.test(lower)
      ? "telegram"
      : /\bwhats\s?app\b/.test(lower)
        ? "whatsapp"
        : /\b(?:sms|text)\b/.test(lower)
          ? "sms"
      : /\bdiscord\b/.test(lower)
        ? "discord"
        : "";
  if (!platform) return null;

  const message = extractQuoted(raw) || extractAfterColon(raw);
  let destination = "";
  const alias = extractMessagingRecipientAlias(raw);
  const recipientLabel = extractMessagingRecipientLabel(raw, platform);
  if (platform === "slack") {
    const channelMatch = raw.match(/#([\w-]+)/);
    const channelLabel = raw.match(/channel\s+([\w-]+)/i);
    destination = channelMatch?.[1] || channelLabel?.[1] || "";
  } else if (platform === "telegram") {
    const chatMatch = raw.match(/chat\s*id\s*(\d+)/i) || raw.match(/chat\s+(\d+)/i);
    destination = chatMatch?.[1] || "";
  } else if (platform === "whatsapp" || platform === "sms") {
    destination = extractPhones(raw)[0] || "";
  } else if (platform === "discord") {
    const channelMatch = raw.match(/channel\s*id\s*(\d+)/i) || raw.match(/channel\s+(\d+)/i);
    destination = channelMatch?.[1] || "";
  }

  const missing = [];
  if (!message) missing.push("message");
  if (!destination) {
    missing.push(
      platform === "slack"
        ? "channel"
        : platform === "telegram"
          ? "chatId"
          : platform === "discord"
            ? "channelId"
            : "to"
    );
  }

  const actionType = platform === "slack"
    ? "messaging.slackPost"
    : platform === "telegram"
      ? "messaging.telegramSend"
      : platform === "whatsapp"
        ? "messaging.whatsapp.send"
        : platform === "sms"
          ? "messaging.sms.send"
      : "messaging.discordSend";

  const params = platform === "slack"
    ? { channel: destination, message }
    : platform === "telegram"
      ? { chatId: destination, message }
      : platform === "whatsapp" || platform === "sms"
        ? { to: destination, text: message }
      : { channelId: destination, message };
  if (alias && (platform === "whatsapp" || platform === "sms")) {
    params.toAlias = alias;
  }
  if (recipientLabel && (platform === "telegram" || platform === "whatsapp" || platform === "sms")) {
    params.recipientLabel = recipientLabel;
  }

  return buildIntent({
    name: "send_message",
    actionType,
    params,
    missing,
    confidence: 0.75,
    raw: text
  });
}

function parseCalendarHold(text) {
  const raw = String(text || "").trim();
  const lower = raw.toLowerCase();
  const actionVerb = /\b(schedule|create|add|put|book|set up|hold|block)\b/.test(lower);
  const calendarCue = /\b(calendar|event|appointment|meeting|hold)\b/.test(lower);
  if (!actionVerb || !calendarCue) return null;
  if (/\bcheck (?:my )?(?:calendar|schedule)\b/.test(lower)) return null;

  const range = extractCalendarRange(raw);
  const labelTitle =
    raw.match(/\b(?:called|titled)\s+["']?([^"']+?)["']?(?=\s+(?:on|from|today|tomorrow)\b|$)/i)?.[1]?.trim() ||
    raw.match(/\b(?:calendar|event|meeting|hold)\s+for\s+(.+?)(?=\s+(?:on|from|today|tomorrow)\b|$)/i)?.[1]?.trim() ||
    "";
  const title = range.title || labelTitle;

  const params = {};
  const missing = [];
  if (title) params.title = title;
  else missing.push("title");
  if (range.start) params.start = range.start;
  else missing.push("start");
  if (range.end) params.end = range.end;
  else missing.push("end");
  missing.push("timezone");

  return buildIntent({
    name: "calendar_hold",
    actionType: "calendar.proposeHold",
    params,
    missing,
    confidence: 0.72,
    raw: text
  });
}

function parseSendEmail(text) {
  const raw = String(text || "").trim();
  const lower = raw.toLowerCase();
  if (!/(send|email|mail)/.test(lower)) return null;
  if (!/\b(email|mail)\b/.test(lower)) return null;
  if (/\bmeeting\b/.test(lower) && /\b(notes|summary|recap)\b/.test(lower)) return null;

  const sendTo = extractEmails(raw);
  const alias = sendTo.length ? "" : extractRecipientAlias(raw);
  const subject = extractSubject(raw);
  const body = extractEmailBody(raw);
  const missing = [];
  if (!sendTo.length && !alias) missing.push("to");
  if (!body) missing.push("body");

  const params = {
    sendTo,
    subject: subject || (body ? defaultEmailSubject(raw, body) : "")
  };
  if (body) params.body = body;
  if (alias) {
    params.toAlias = alias;
    params.autonomy = "self";
  }

  return buildIntent({
    name: "send_email",
    actionType: "email.send",
    params,
    missing,
    confidence: 0.72,
    raw: text,
    notes: alias ? `alias:${alias}` : ""
  });
}

function parseFetchDoc(text) {
  const raw = String(text || "");
  const lower = raw.toLowerCase();
  if (!/(fetch|get|open|read)\s+.*(doc|document)/.test(lower)) return null;
  const urlMatch = raw.match(/https?:\/\/docs\.google\.com\/document\/d\/([a-zA-Z0-9_-]+)/);
  const idMatch = raw.match(/\bdoc(?:ument)?\s+id\s*([a-zA-Z0-9_-]+)/i) || raw.match(/\bdoc\s+([a-zA-Z0-9_-]{10,})/i);
  const docId = urlMatch?.[1] || idMatch?.[1] || "";
  if (!docId) {
    return buildIntent({
      name: "fetch_doc",
      actionType: "docs.get",
      missing: ["docId"],
      confidence: 0.65,
      raw: text
    });
  }
  return buildIntent({
    name: "fetch_doc",
    actionType: "docs.get",
    params: { docId },
    confidence: 0.75,
    raw: text
  });
}

function parseRagUse(text) {
  const raw = String(text || "");
  const lower = raw.toLowerCase();
  if (!/\brag\b/.test(lower)) return null;
  const match = raw.match(/\b(?:use|switch to|set)\s+rag\s+([a-zA-Z0-9_-]+)\b/i) ||
    raw.match(/\brag\s+(?:use|set)\s+([a-zA-Z0-9_-]+)\b/i);
  if (!match?.[1]) return null;
  const model = match[1].trim().toLowerCase();
  return buildIntent({
    name: "rag_use",
    actionType: "rag.use",
    params: { model },
    confidence: 0.8,
    raw: text
  });
}

function parseRunScript(text) {
  const raw = String(text || "").toLowerCase();
  if (!/(run|rebuild|refresh|sync)/.test(raw)) return null;

  if (/rag\s+eval|rag\s+evaluation|evaluate\s+rag/.test(raw)) {
    const strict = /strict/.test(raw);
    return buildIntent({
      name: "run_script",
      actionType: "rag.eval",
      params: { strict },
      confidence: 0.7,
      raw: text,
      notes: "rag_eval"
    });
  }
  if (/rag\s+fts|rebuild\s+rag\s+fts/.test(raw)) {
    return buildIntent({
      name: "run_script",
      actionType: "rag.fts",
      confidence: 0.7,
      raw: text,
      notes: "rag_fts"
    });
  }
  if (/signals\s+(run|refresh|ingest)/.test(raw)) {
    return buildIntent({
      name: "run_script",
      actionType: "signals.run",
      confidence: 0.7,
      raw: text,
      notes: "signals_run"
    });
  }
  if (/fireflies\s+(sync|refresh|ingest)/.test(raw)) {
    return buildIntent({
      name: "run_script",
      actionType: "fireflies.sync",
      confidence: 0.7,
      raw: text,
      notes: "fireflies_sync"
    });
  }
  return null;
}

export function routeIntent(text) {
  const raw = String(text || "").trim();
  if (!raw) return null;

  return (
    parseRecordMeeting(raw) ||
    parseMeetingResummarize(raw) ||
    parseMeetingDelete(raw) ||
    parseSummarizeMeeting(raw) ||
    parseMeetingExport(raw) ||
    parseMeetingDraftEmail(raw) ||
    parseMeetingEmail(raw) ||
    parseMeetingRecapDoc(raw) ||
    parseMeetingScheduleFollowup(raw) ||
    parseMeetingCreateTask(raw) ||
    parseMeetingCreateTicket(raw) ||
    parseCalendarHold(raw) ||
    parseSendEmail(raw) ||
    parseTodo(raw) ||
    parseSendMessage(raw) ||
    parseFetchDoc(raw) ||
    parseRagUse(raw) ||
    parseRunScript(raw)
  );
}

export function buildMissingPrompt(intent) {
  if (!intent?.missing?.length) return "";
  const missing = intent.missing;
  if (intent.name === "create_task") {
    return "What should the task say?";
  }
  if (intent.name === "send_message") {
    const needsMessage = missing.includes("message");
    const needsChannel = missing.includes("channel") || missing.includes("channelId") || missing.includes("chatId") || missing.includes("to");
    if (needsMessage && needsChannel) {
      return "Tell me the destination and the message text.";
    }
    if (needsChannel) {
      return "Which destination should I send it to?";
    }
    if (needsMessage) {
      return "What message should I send?";
    }
  }
  if (intent.name === "calendar_hold") {
    const needsTitle = missing.includes("title");
    const needsTime = missing.includes("start") || missing.includes("end");
    if (needsTitle && needsTime) {
      return "What should I call the event, and when should it start and end?";
    }
    if (needsTitle) return "What should I call the calendar hold?";
    if (needsTime) return "When should the calendar hold start and end?";
    if (missing.includes("timezone")) return "Which timezone should I use for the calendar hold?";
  }
  if (intent.name === "fetch_doc") {
    return "Which doc should I fetch? Share a Google Doc link or document ID.";
  }
  if (intent.name === "summarize_meeting") {
    return "Paste the transcript or tell me which recording to summarize.";
  }
  if (intent.name?.startsWith("meeting_") && missing.includes("recordingId")) {
    return "Which recording should I use? Share the recording ID or select a meeting in the Recordings tab.";
  }
  if (intent.name === "meeting_email") {
    if (missing.includes("to") && missing.includes("recordingId")) {
      return "Which recording and which email recipients should I use?";
    }
    if (missing.includes("to")) {
      return "Who should I email the meeting notes to?";
    }
  }
  if (intent.name === "send_email") {
    const needsTo = missing.includes("to");
    const needsBody = missing.includes("body");
    if (needsTo && needsBody) {
      return "Who should I email, and what should the message say?";
    }
    if (needsTo) {
      return "Who should I email? You can say \"my work address\" if it is configured.";
    }
    if (needsBody) {
      return "What should the email say?";
    }
  }
  return `I need: ${missing.join(", ")}.`;
}
