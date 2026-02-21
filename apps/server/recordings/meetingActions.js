import { createCalendarEvent, createGoogleDoc, getGoogleStatus, sendGmailMessage } from "../integrations/google.js";
import { executeAction } from "../src/safety/executeAction.js";
import { writeOutbox } from "../storage/outbox.js";
import { addMemoryEntities } from "../storage/memory_entities.js";
import { getRecording, updateRecording, writeArtifact } from "../storage/recordings.js";
import { indexRecordingToRag } from "../src/rag/recordingsIngest.js";
import { parseNotifyChannels, sendMeetingNotifications } from "../src/notifications/meetingNotifications.js";
import { summarizeTranscript, extractEntities } from "./processor.js";
import { redactStructured } from "./redaction.js";
import {
  buildMeetingNotesMarkdown,
  buildMeetingEmailText,
  buildTranscriptText,
  getRecordingAudioUrl,
  buildAbsoluteUrl,
  resolvePublicBaseUrl
} from "./meetingUtils.js";

export function updateProcessingState(recordingId, patch) {
  const existing = getRecording(recordingId);
  const current = existing?.processing_json || {};
  const next = { ...current, ...patch, updatedAt: new Date().toISOString() };
  updateRecording(recordingId, { processing_json: JSON.stringify(next) });
  return next;
}

export async function summarizeAndPersistRecording({ recording, transcriptText, title, redactionEnabled }) {
  if (!recording) throw new Error("recording_required");
  const summary = await summarizeTranscript(transcriptText || "", title);
  let summaryPayload = {
    tldr: summary.tldr,
    attendees: summary.attendees,
    overview: summary.overview,
    decisions: summary.decisions,
    actionItems: summary.actionItems,
    risks: summary.risks,
    nextSteps: summary.nextSteps,
    discussionPoints: summary.discussionPoints,
    nextMeeting: summary.nextMeeting,
    summaryMarkdown: summary.summaryMarkdown,
    recommendations: summary.recommendations || []
  };
  if (redactionEnabled) {
    summaryPayload = redactStructured(summaryPayload);
  }

  updateRecording(recording.id, {
    summary_json: JSON.stringify(summaryPayload),
    decisions_json: JSON.stringify(summaryPayload.decisions || []),
    tasks_json: JSON.stringify(summaryPayload.actionItems || []),
    risks_json: JSON.stringify(summaryPayload.risks || []),
    next_steps_json: JSON.stringify(summaryPayload.nextSteps || [])
  });

  updateProcessingState(recording.id, { stage: "extracting" });
  const entities = extractEntities(summaryPayload);
  addMemoryEntities(
    entities.map(entity => ({
      ...entity,
      workspaceId: recording.workspace_id || "default",
      recordingId: recording.id
    }))
  );
  return summary;
}

export function exportRecordingArtifacts({ recording, baseUrl } = {}) {
  if (!recording) throw new Error("recording_not_found");
  const notes = buildMeetingNotesMarkdown(recording);
  const transcriptText = buildTranscriptText(recording);
  const notesPath = writeArtifact(recording.id, "meeting_notes.md", notes);
  const transcriptPath = writeArtifact(recording.id, "transcript.txt", transcriptText || "");
  const base = resolvePublicBaseUrl(baseUrl);
  const notesUrl = buildAbsoluteUrl(`/api/recordings/${recording.id}/notes`, base);
  const transcriptUrl = buildAbsoluteUrl(`/api/recordings/${recording.id}/transcript`, base);
  const audioUrl = recording.storage_path
    ? buildAbsoluteUrl(getRecordingAudioUrl(recording.id, recording), base)
    : "";
  return {
    ok: true,
    notesUrl,
    transcriptUrl,
    audioUrl,
    notesPath,
    transcriptPath
  };
}

export async function sendMeetingEmail({ recording, to, subject, baseUrl, userId, sessionId }) {
  if (!recording) throw new Error("recording_not_found");
  const toRaw = Array.isArray(to) ? to.join(",") : String(to || "").trim();
  if (!toRaw) {
    const err = new Error("email_to_required");
    err.code = "email_to_required";
    err.status = 400;
    throw err;
  }
  const recipients = toRaw.split(/[;,]/).map(v => v.trim()).filter(Boolean);
  if (!recipients.length) {
    const err = new Error("email_to_required");
    err.code = "email_to_required";
    err.status = 400;
    throw err;
  }
  const bad = recipients.find(v => !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v));
  if (bad) {
    const err = new Error("email_to_invalid");
    err.code = "email_to_invalid";
    err.detail = bad;
    err.status = 400;
    throw err;
  }

  const base = resolvePublicBaseUrl(baseUrl);
  const notes = buildMeetingNotesMarkdown(recording);
  const notesUrl = buildAbsoluteUrl(`/api/recordings/${recording.id}/notes`, base);
  const transcriptUrl = buildAbsoluteUrl(`/api/recordings/${recording.id}/transcript`, base);
  const audioUrl = recording.storage_path
    ? buildAbsoluteUrl(getRecordingAudioUrl(recording.id, recording), base)
    : "";
  let googleDocUrl = "";
  const artifacts = Array.isArray(recording.artifacts_json) ? recording.artifacts_json : [];
  const docArtifact = artifacts.find(a => a?.type === "google_doc" && a?.url);
  if (docArtifact?.url) googleDocUrl = String(docArtifact.url);
  if (!googleDocUrl) {
    try {
      const doc = await createGoogleDoc(`${recording.title || "Meeting"} Notes`, notes, recording.created_by || userId || "local");
      if (doc?.documentId) googleDocUrl = `https://docs.google.com/document/d/${doc.documentId}/edit`;
    } catch {
      // ignore; email can still include local links
    }
  }

  const subjectLine = String(subject || `Meeting Notes: ${recording.title || "Meeting"}`);
  const text = buildMeetingEmailText({ recording, notesUrl, transcriptUrl, audioUrl, googleDocUrl });
  const fromName = String(process.env.EMAIL_FROM_NAME || "Aika Meeting Copilot");
  const allowOutboxFallback = String(process.env.EMAIL_OUTBOX_FALLBACK || "0").toLowerCase() === "1";
  const googleStatus = getGoogleStatus(recording.created_by || userId);
  const scopes = new Set(Array.isArray(googleStatus.scopes) ? googleStatus.scopes : []);
  const hasGmailSendScope = scopes.has("https://www.googleapis.com/auth/gmail.send");
  if (!googleStatus.connected || !hasGmailSendScope) {
    const err = new Error("gmail_send_scope_missing");
    err.code = "gmail_send_scope_missing";
    err.detail = "Google needs reconnect with gmail.send scope to send email.";
    err.reconnectUrl = "/api/integrations/google/connect?preset=core";
    err.status = 409;
    throw err;
  }

  const result = await executeAction({
    actionType: "email.send",
    params: { to: recipients, subject: subjectLine },
    context: { userId, sessionId },
    summary: `Send meeting notes email for ${recording.id}`,
    handler: async () => {
      try {
        const sent = await sendGmailMessage({
          to: recipients,
          subject: subjectLine,
          text,
          fromName,
          userId: recording.created_by || userId || "local"
        });
        return {
          ok: true,
          transport: "gmail",
          to: recipients,
          messageId: sent?.id || null,
          links: { notesUrl, transcriptUrl, audioUrl, googleDocUrl }
        };
      } catch (err) {
        if (!allowOutboxFallback) {
          throw err;
        }
        const outbox = writeOutbox({
          type: "meeting_email",
          to: recipients,
          subject: subjectLine,
          text,
          recordingId: recording.id,
          reason: String(err?.message || "gmail_not_configured")
        });
        return {
          ok: true,
          transport: "stub",
          to: recipients,
          outboxId: outbox.id,
          warning: "gmail_send_unavailable_saved_to_outbox",
          links: { notesUrl, transcriptUrl, audioUrl, googleDocUrl }
        };
      }
    }
  });

  if (result.status === "approval_required") {
    return { status: "approval_required", approval: result.approval };
  }
  return result.data;
}

export async function runRecordingAction({ recording, actionType, input, userId }) {
  if (!recording) throw new Error("recording_not_found");
  let output = {};
  let status = "completed";

  if (actionType === "meeting.schedule_followup") {
    const fallback = {
      summary: input?.summary || `Follow-up for ${recording.title}`,
      startISO: input?.startISO,
      endISO: input?.endISO,
      description: input?.description || "Follow-up meeting generated by Aika."
    };
    try {
      const event = await createCalendarEvent(fallback, recording.created_by || userId || "local");
      output = { event, provider: "google" };
    } catch {
      output = { draft: fallback, provider: "draft" };
    }
  } else if (actionType === "meeting.draft_email") {
    const body = [
      `Subject: Recap - ${recording.title}`,
      "",
      "Summary:",
      ...(recording.summary_json?.overview || []),
      "",
      "Decisions:",
      ...(recording.summary_json?.decisions || []),
      "",
      "Action Items:",
      ...(recording.summary_json?.actionItems || []).map(a => `- ${a.task} (${a.owner || "Unassigned"})`)
    ].join("\n");
    output = { draft: body };
  } else if (actionType === "meeting.recap_doc") {
    const markdown = (recording.summary_json && JSON.stringify(recording.summary_json, null, 2)) || "";
    try {
      const doc = await createGoogleDoc(`${recording.title} Recap`, markdown, recording.created_by || "local");
      const url = doc?.documentId ? `https://docs.google.com/document/d/${doc.documentId}/edit` : null;
      output = { docId: doc.documentId, url };
    } catch {
      const filePath = writeArtifact(recording.id, "recap.md", markdown);
      output = { localPath: filePath };
    }
  } else if (actionType === "meeting.create_task") {
    output = { task: input || { title: "Follow up", owner: "Unassigned" }, provider: "draft" };
  } else if (actionType === "meeting.create_ticket") {
    output = { ticket: input || { title: "Follow up ticket" }, provider: "draft" };
  } else {
    status = "failed";
    output = { error: "action_not_supported" };
  }

  return { output, status };
}

export async function resummarizeRecording({ recording, userId, sessionId }) {
  if (!recording) throw new Error("recording_not_found");
  if (!String(recording.transcript_text || "").trim()) {
    const err = new Error("transcript_required");
    err.code = "transcript_required";
    throw err;
  }

  updateRecording(recording.id, { status: "processing" });
  updateProcessingState(recording.id, { stage: "summarizing" });
  const summary = await summarizeAndPersistRecording({
    recording,
    transcriptText: recording.transcript_text,
    title: recording.title,
    redactionEnabled: recording.redaction_enabled
  });

  try {
    await indexRecordingToRag({
      recording: {
        ...recording,
        storage_url: recording.storage_url || (recording.storage_path ? `/api/recordings/${recording.id}/audio` : "")
      },
      transcriptText: recording.transcript_text || "",
      segments: recording.diarization_json || [],
      summary,
      force: true
    });
  } catch (err) {
    console.warn("Recording RAG reindex failed:", err?.message || err);
  }

  try {
    const notifyChannels = parseNotifyChannels(process.env.RECORDING_NOTIFY_CHANNELS || "");
    if (notifyChannels.length) {
      await sendMeetingNotifications({
        meetingId: `recording:${recording.id}`,
        title: recording.title || "Aika Recording",
        occurredAt: recording.started_at || recording.created_at || new Date().toISOString(),
        summary,
        sourceUrl: recording.storage_url || (recording.storage_path ? `/api/recordings/${recording.id}/audio` : ""),
        channels: notifyChannels,
        force: true
      });
    }
  } catch (err) {
    console.warn("Recording notification failed:", err?.message || err);
  }

  if (summary?.summaryMarkdown) {
    const filePath = writeArtifact(recording.id, "summary.md", summary.summaryMarkdown);
    const prev = Array.isArray(recording.artifacts_json) ? recording.artifacts_json : [];
    const kept = prev.filter(a => !(a?.type === "local" && a?.name === "summary.md"));
    kept.push({ type: "local", name: "summary.md", path: filePath });
    updateRecording(recording.id, { artifacts_json: JSON.stringify(kept) });
  }

  updateRecording(recording.id, { status: "ready" });
  updateProcessingState(recording.id, { stage: "ready", doneAt: new Date().toISOString() });
  return { ok: true, recording: getRecording(recording.id) };
}
