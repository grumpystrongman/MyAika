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
  persistHnsw
} from "./vectorStore.js";

function normalizeText(value) {
  return String(value || "").trim();
}

function resolveOccurredAt(recording) {
  return recording?.started_at || recording?.created_at || new Date().toISOString();
}

function extractParticipants(summary) {
  if (!summary) return [];
  const attendees = summary?.attendees;
  if (Array.isArray(attendees)) {
    return Array.from(new Set(attendees.map(item => String(item || "").trim()).filter(Boolean)));
  }
  return [];
}

export async function indexRecordingToRag({
  recording,
  transcriptText,
  segments,
  summary,
  force = false
} = {}) {
  if (!recording?.id) return { ok: false, error: "recording_missing" };
  initRagStore();

  const meetingId = `recording:${recording.id}`;
  const existingCount = countChunksForMeeting(meetingId);

  if (force && existingCount) {
    deleteMeetingChunks(meetingId);
  }

  const rawTranscript = normalizeText(buildTranscriptText(segments || [], transcriptText || recording?.transcript_text || ""));
  const title = normalizeText(recording?.title || "Aika Recording");
  const occurredAt = resolveOccurredAt(recording);
  const participants = extractParticipants(summary || recording?.summary_json || null);
  const sourceUrl = recording?.storage_url || (recording?.id ? `/api/recordings/${recording.id}/audio` : "");

  upsertMeeting({
    id: meetingId,
    title,
    occurred_at: occurredAt,
    participants_json: JSON.stringify(participants),
    source_url: sourceUrl,
    raw_transcript: rawTranscript,
    created_at: occurredAt
  });

  if (summary) {
    upsertMeetingSummary({ meetingId, summary });
  } else if (recording?.summary_json && !getMeetingSummary(meetingId)) {
    upsertMeetingSummary({ meetingId, summary: recording.summary_json });
  }

  if (existingCount && !force) {
    return { ok: true, skipped: true, meetingId, chunkCount: existingCount };
  }

  const chunks = chunkTranscript({
    meetingId,
    sentences: Array.isArray(segments) ? segments : [],
    rawText: rawTranscript
  });
  if (!chunks.length) {
    return { ok: false, error: "no_chunks", meetingId };
  }

  upsertChunks(chunks);
  const embeddings = [];
  for (const chunk of chunks) {
    const embedding = await getEmbedding(chunk.text);
    embeddings.push(embedding);
  }
  await upsertVectors(chunks, embeddings);
  await persistHnsw();

  return { ok: true, meetingId, chunkCount: chunks.length };
}
