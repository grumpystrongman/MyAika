import crypto from "node:crypto";
import { getEmbedding } from "../rag/embeddings.js";
import { initRagStore, upsertMeeting, upsertChunks, upsertVectors } from "../rag/vectorStore.js";

function normalizeRating(value) {
  const rating = String(value || "").toLowerCase();
  return rating === "down" ? "thumbs_down" : "thumbs_up";
}

function limitText(value, max) {
  const text = String(value || "").trim();
  if (!max || text.length <= max) return text;
  return `${text.slice(0, max)}…`;
}

function formatCitations(citations = []) {
  const rows = Array.isArray(citations) ? citations : [];
  if (!rows.length) return "";
  const lines = rows.map(cite => {
    const title = cite?.meeting_title || cite?.title || "Source";
    const when = cite?.occurred_at || "";
    const chunk = cite?.chunk_id || cite?.id || "";
    const snippet = limitText(cite?.snippet || "", 240);
    const bits = [
      `${title}${when ? ` (${when})` : ""}`.trim(),
      chunk ? `chunk ${chunk}` : "",
      snippet ? `“${snippet}”` : ""
    ].filter(Boolean);
    return `- ${bits.join(" · ")}`;
  });
  return lines.join("\n");
}

function buildFeedbackText({ rating, source, question, answer, citations }) {
  const lines = [
    `Feedback: ${rating}`,
    source ? `Source: ${source}` : "",
    question ? `Question: ${question}` : "",
    answer ? `Answer: ${answer}` : "",
    citations ? `Citations:\n${citations}` : ""
  ].filter(Boolean);
  return lines.join("\n");
}

export async function recordFeedback({
  messageId,
  source,
  rating,
  question,
  answer,
  citations
} = {}) {
  initRagStore();
  const feedbackId = messageId || crypto.randomUUID();
  const ratingLabel = normalizeRating(rating);
  const sourceLabel = String(source || "chat").toLowerCase();
  const safeQuestion = limitText(question, 1800);
  const safeAnswer = limitText(answer, 2400);
  const citationsText = formatCitations(citations);
  const text = buildFeedbackText({
    rating: ratingLabel,
    source: sourceLabel,
    question: safeQuestion,
    answer: safeAnswer,
    citations: citationsText
  });

  const occurredAt = new Date().toISOString();
  const meetingId = `feedback:${feedbackId}`;
  const chunkId = `${meetingId}:0`;

  upsertMeeting({
    id: meetingId,
    title: `User Feedback (${ratingLabel.replace("_", " ")})`,
    occurred_at: occurredAt,
    participants_json: "",
    source_url: "",
    raw_transcript: text,
    created_at: occurredAt
  });

  const chunk = {
    chunk_id: chunkId,
    meeting_id: meetingId,
    chunk_index: 0,
    speaker: sourceLabel,
    start_time: null,
    end_time: null,
    text,
    token_count: Math.ceil(text.length / 4),
    created_at: occurredAt
  };

  upsertChunks([chunk]);
  const embedding = await getEmbedding(text);
  await upsertVectors([chunk], [embedding]);

  return { id: feedbackId, meetingId, chunkId, rating: ratingLabel, source: sourceLabel };
}
