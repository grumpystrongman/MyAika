import { listTranscripts, getTranscript } from "../integrations/firefliesClient.js";
import { buildTranscriptText, chunkTranscript } from "./chunking.js";
import { getEmbedding } from "./embeddings.js";
import {
  initRagStore,
  upsertMeeting,
  upsertChunks,
  upsertVectors,
  countChunksForMeeting,
  deleteMeetingChunks,
  upsertMeetingSummary,
  getMeetingSummary,
  recordMeetingEmail,
  getMeetingEmail,
  getMeeting,
  persistHnsw
} from "./vectorStore.js";
import { summarizeTranscript } from "../../recordings/processor.js";
import { sendGmailMessage, getGoogleStatus } from "../../integrations/google.js";
import { writeOutbox } from "../../storage/outbox.js";

let syncRunning = false;
let rateLimitUntil = 0;
let syncTimer = null;
let lastSyncAt = 0;

function parseRecipients(value) {
  return String(value || "")
    .split(/[;,]/)
    .map(item => item.trim())
    .filter(Boolean)
    .filter(addr => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(addr));
}

function normalizeDate(detail) {
  const raw = detail?.date;
  if (raw) {
    const n = Number(raw);
    if (!Number.isNaN(n)) {
      if (n > 1e12) return new Date(n).toISOString();
      if (n > 1e9) return new Date(n * 1000).toISOString();
    }
  }
  const dateString = detail?.dateString || detail?.date_string || "";
  if (dateString) {
    const parsed = new Date(dateString);
    if (!Number.isNaN(parsed.getTime())) return parsed.toISOString();
  }
  return "";
}

function extractParticipants(detail) {
  const attendees = Array.isArray(detail?.meeting_attendees) ? detail.meeting_attendees : [];
  const participantNames = Array.isArray(detail?.participants) ? detail.participants : [];
  const names = [
    ...attendees.map(p => p?.displayName || p?.name || p?.email || ""),
    ...participantNames.map(p => String(p || "").trim())
  ].filter(Boolean);
  return Array.from(new Set(names));
}

function buildEmailText({ title, occurredAt, summary, rawTranscript, sourceUrl }) {
  const decisions = summary?.decisions || [];
  const tasks = summary?.actionItems || [];
  const discussionPoints = summary?.discussionPoints || [];
  const nextSteps = summary?.nextSteps || [];
  const attendees = summary?.attendees || [];
  const tldr = summary?.tldr || "";
  const overview = Array.isArray(summary?.overview) ? summary.overview : [];

  const lines = [
    `Meeting: ${title || "Fireflies Meeting"}`,
    `Date: ${occurredAt || "Unknown"}`,
    sourceUrl ? `Source: ${sourceUrl}` : "",
    "",
    "Executive Summary:",
    tldr || (overview.length ? overview.slice(0, 2).join(" ") : "Summary pending."),
    "",
    `Attendees: ${attendees.length ? attendees.join(", ") : "Not captured"}`,
    "",
    "Decisions:",
    decisions.length ? decisions.map(item => `- ${item}`).join("\n") : "- None captured.",
    "",
    "Action Items:",
    tasks.length
      ? tasks.map(task => `- ${task.owner || "Unassigned"}: ${task.task || task.title || task.text || ""} (Due: ${task.due || "Unspecified"})`).join("\n")
      : "- None captured.",
    "",
    "Discussion Points:",
    discussionPoints.length
      ? discussionPoints.map(point => `- ${point.topic || "Discussion"}: ${point.summary || ""}`).join("\n")
      : "- Not captured.",
    "",
    "Next Steps:",
    nextSteps.length ? nextSteps.map(step => `- ${step}`).join("\n") : "- Follow up to confirm next steps.",
    "",
    "Full Transcript:",
    rawTranscript || "Transcript not available."
  ].filter(Boolean);

  return lines.join("\n");
}

async function ensureSummary({ meetingId, transcriptText, title, force }) {
  const existing = getMeetingSummary(meetingId);
  if (existing && !force) return existing.summary || {};
  const summary = await summarizeTranscript(transcriptText || "", title || "Fireflies Meeting");
  upsertMeetingSummary({ meetingId, summary });
  return summary;
}

async function maybeSendEmail({ meetingId, title, occurredAt, summary, transcriptText, sourceUrl }) {
  const recipients = parseRecipients(process.env.FIREFLIES_EMAIL_TO || "");
  if (!recipients.length) return { sent: false, reason: "no_recipients" };
  const prior = getMeetingEmail(meetingId);
  if (prior?.status === "sent") return { sent: false, reason: "already_sent" };

  const subjectPrefix = process.env.FIREFLIES_EMAIL_SUBJECT_PREFIX || "Fireflies Meeting Notes";
  const subject = `${subjectPrefix}: ${title || "Meeting"}`;
  const text = buildEmailText({
    title,
    occurredAt,
    summary,
    rawTranscript: transcriptText,
    sourceUrl
  });
  const fromName = String(process.env.EMAIL_FROM_NAME || "Aika Meeting Copilot");
  const allowOutboxFallback = String(process.env.EMAIL_OUTBOX_FALLBACK || "0").toLowerCase() === "1";

  try {
    const googleStatus = getGoogleStatus("local");
    const scopes = new Set(Array.isArray(googleStatus?.scopes) ? googleStatus.scopes : []);
    const hasGmailSendScope = scopes.has("https://www.googleapis.com/auth/gmail.send");
    if (!googleStatus?.connected || !hasGmailSendScope) {
      throw new Error("gmail_send_scope_missing");
    }
    const sent = await sendGmailMessage({
      to: recipients,
      subject,
      text,
      fromName,
      userId: "local"
    });
    recordMeetingEmail({ meetingId, to: recipients, subject, status: "sent", sentAt: new Date().toISOString() });
    return { sent: true, messageId: sent?.id || null };
  } catch (err) {
    if (!allowOutboxFallback) {
      recordMeetingEmail({ meetingId, to: recipients, subject, status: "failed", error: String(err?.message || "gmail_send_failed") });
      return { sent: false, error: err?.message || "gmail_send_failed" };
    }
    const outbox = writeOutbox({
      type: "fireflies_email",
      to: recipients,
      subject,
      text,
      meetingId,
      reason: String(err?.message || "gmail_send_failed")
    });
    recordMeetingEmail({ meetingId, to: recipients, subject, status: "outbox", error: String(err?.message || "gmail_send_failed") });
    return { sent: false, outboxId: outbox.id, status: "outbox" };
  }
}

export async function syncFireflies({ limit = 0, force = false, sendEmail } = {}) {
  if (rateLimitUntil && Date.now() < rateLimitUntil) {
    return {
      ok: false,
      error: "fireflies_rate_limited",
      retryAt: new Date(rateLimitUntil).toISOString()
    };
  }
  if (syncRunning) {
    return { ok: false, error: "sync_in_progress" };
  }
  syncRunning = true;
  initRagStore();
  try {
    const maxItems = limit && limit > 0 ? limit : Number.MAX_SAFE_INTEGER;
    const throttleMs = Number(process.env.FIREFLIES_SYNC_THROTTLE_MS || 0);
    const pageSize = Math.min(50, maxItems);
    let cursor = 0;
    const transcripts = [];
    while (cursor !== null && transcripts.length < maxItems) {
      const pageLimit = Math.min(pageSize, maxItems - transcripts.length);
      const page = await listTranscripts({ cursor, limit: pageLimit });
      if (page?.transcripts?.length) {
        transcripts.push(...page.transcripts);
      }
      if (!page?.nextCursor || !page?.transcripts?.length || page.transcripts.length < pageLimit) break;
      cursor = page.nextCursor;
    }

    let syncedMeetings = 0;
    let syncedChunks = 0;
    let skippedMeetings = 0;
    let emailedMeetings = 0;

    const autoEmail = typeof sendEmail === "boolean"
      ? sendEmail
      : String(process.env.FIREFLIES_AUTO_EMAIL || "0").toLowerCase() === "1";

    for (const entry of transcripts) {
      try {
        const transcriptId = entry?.id;
        if (!transcriptId) continue;

        const existingCount = countChunksForMeeting(transcriptId);
        const existingMeeting = existingCount ? getMeeting(transcriptId) : null;
        const existingEmail = autoEmail ? getMeetingEmail(transcriptId) : null;
        const needsEmail = autoEmail && (!existingEmail || existingEmail.status !== "sent");
        const needsIndex = !existingCount || force;
        const needsDetail = needsIndex || !existingMeeting?.raw_transcript || !existingMeeting?.title || !existingMeeting?.occurred_at;

        if (existingCount && !force && !needsEmail) {
          skippedMeetings += 1;
          continue;
        }

        if (force && existingCount) {
          deleteMeetingChunks(transcriptId);
        }

        const detail = needsDetail ? await getTranscript(transcriptId) : null;
        if (needsDetail && !detail) {
          skippedMeetings += 1;
          continue;
        }

        const occurredAt = existingMeeting?.occurred_at || normalizeDate(detail) || "";
        let participants = [];
        if (existingMeeting?.participants_json) {
          try {
            participants = JSON.parse(existingMeeting.participants_json) || [];
          } catch {
            participants = [];
          }
        } else if (detail) {
          participants = extractParticipants(detail);
        }
        const transcriptText =
          existingMeeting?.raw_transcript ||
          buildTranscriptText(detail?.sentences || [], detail?.transcript || detail?.text || "");
        const title = existingMeeting?.title || detail?.title || entry.title || "Fireflies Meeting";
        const sourceUrl = existingMeeting?.source_url || detail?.transcript_url || entry.transcript_url || "";

        if (detail || needsIndex || needsEmail) {
          upsertMeeting({
            id: transcriptId,
            title,
            occurred_at: occurredAt,
            participants_json: JSON.stringify(participants),
            source_url: sourceUrl,
            raw_transcript: transcriptText,
            created_at: new Date().toISOString()
          });
        }

        if (needsIndex) {
          const chunks = chunkTranscript({ meetingId: transcriptId, sentences: detail?.sentences || [], rawText: transcriptText });
          if (!chunks.length) {
            skippedMeetings += 1;
            continue;
          }
          upsertChunks(chunks);
          const embeddings = [];
          for (const chunk of chunks) {
            const embedding = await getEmbedding(chunk.text);
            embeddings.push(embedding);
          }
          await upsertVectors(chunks, embeddings);

          syncedMeetings += 1;
          syncedChunks += chunks.length;
        }

        if (needsEmail) {
          const summary = await ensureSummary({
            meetingId: transcriptId,
            transcriptText,
            title,
            force
          });
          const emailResult = await maybeSendEmail({
            meetingId: transcriptId,
            title,
            occurredAt,
            summary,
            transcriptText,
            sourceUrl
          });
          if (emailResult?.sent) emailedMeetings += 1;
        }
      } catch (err) {
        if (err?.code === "fireflies_rate_limited") {
          if (err.retryAt) rateLimitUntil = err.retryAt;
          throw err;
        }
        console.warn("Fireflies ingest failed:", err?.message || err);
        skippedMeetings += 1;
      } finally {
        if (throttleMs && throttleMs > 0) {
          await new Promise(resolve => setTimeout(resolve, throttleMs));
        }
      }
    }

    await persistHnsw();

    return {
      ok: true,
      syncedMeetings,
      syncedChunks,
      skippedMeetings,
      emailedMeetings
    };
  } catch (err) {
    if (err?.code === "fireflies_rate_limited" && err.retryAt) {
      rateLimitUntil = err.retryAt;
    }
    return {
      ok: false,
      error: err?.code || err?.message || "fireflies_sync_failed",
      retryAt: rateLimitUntil ? new Date(rateLimitUntil).toISOString() : null
    };
  } finally {
    syncRunning = false;
  }
}

export function startFirefliesSyncLoop() {
  const minutes = Number(process.env.FIREFLIES_SYNC_INTERVAL_MINUTES || 0);
  const runOnStartup = String(process.env.FIREFLIES_SYNC_ON_STARTUP || "0") === "1";
  const configuredLimit = Number(process.env.FIREFLIES_SYNC_LIMIT ?? 50);
  const scheduleLimit = Number.isFinite(configuredLimit) ? Math.max(0, Math.floor(configuredLimit)) : 50;
  if (!process.env.FIREFLIES_API_KEY) return;
  if (!minutes || minutes <= 0) {
    if (runOnStartup) {
      syncFireflies({ limit: scheduleLimit }).catch(() => {});
    }
    return;
  }

  const intervalMs = minutes * 60 * 1000;
  const scheduleNext = (delayMs) => {
    if (syncTimer) clearTimeout(syncTimer);
    syncTimer = setTimeout(async () => {
      if (rateLimitUntil && Date.now() < rateLimitUntil) {
        const retryDelay = Math.max(rateLimitUntil - Date.now(), intervalMs);
        scheduleNext(retryDelay);
        return;
      }
      try {
        const result = await syncFireflies({ limit: scheduleLimit });
        lastSyncAt = Date.now();
        if (result?.error === "fireflies_rate_limited" && result.retryAt) {
          rateLimitUntil = new Date(result.retryAt).getTime();
        }
      } catch (err) {
        if (err?.code === "fireflies_rate_limited" && err.retryAt) {
          rateLimitUntil = err.retryAt;
        }
      } finally {
        const nextDelay = rateLimitUntil && Date.now() < rateLimitUntil
          ? Math.max(rateLimitUntil - Date.now(), intervalMs)
          : intervalMs;
        scheduleNext(nextDelay);
      }
    }, Math.max(1000, delayMs || 0));
  };

  scheduleNext(runOnStartup ? 1000 : intervalMs);
}
