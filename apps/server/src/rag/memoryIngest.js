import crypto from "node:crypto";
import { getEmbedding } from "./embeddings.js";
import { initRagStore, upsertMeeting, upsertChunks, upsertVectors } from "./vectorStore.js";

function nowIso() {
  return new Date().toISOString();
}

function limitText(value, max) {
  const text = String(value || "").trim();
  if (!max || text.length <= max) return text;
  return `${text.slice(0, max)}…`;
}

export async function recordMemoryToRag({ memoryId, content, tags = "", source = "memory", occurredAt } = {}) {
  const text = String(content || "").trim();
  if (!text) return null;
  initRagStore();

  const safeId = memoryId ? String(memoryId) : crypto.randomUUID();
  const meetingId = `memory:${safeId}`;
  const chunkId = `${meetingId}:0`;
  const timestamp = occurredAt || nowIso();
  const tagLine = tags ? `Tags: ${tags}` : "";
  const body = [text, tagLine].filter(Boolean).join("\n");
  const title = limitText(text, 80);

  upsertMeeting({
    id: meetingId,
    title: `Memory: ${title || "Note"}`,
    occurred_at: timestamp,
    participants_json: "",
    source_url: "",
    raw_transcript: body,
    created_at: timestamp
  });

  const chunk = {
    chunk_id: chunkId,
    meeting_id: meetingId,
    chunk_index: 0,
    speaker: source,
    start_time: null,
    end_time: null,
    text: body,
    token_count: Math.ceil(body.length / 4),
    created_at: timestamp
  };

  upsertChunks([chunk]);
  const embedding = await getEmbedding(body);
  await upsertVectors([chunk], [embedding]);

  return { meetingId, chunkId };
}
