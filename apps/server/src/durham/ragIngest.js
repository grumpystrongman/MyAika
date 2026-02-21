import crypto from "node:crypto";
import {
  upsertMeeting,
  upsertChunks,
  upsertVectors,
  persistHnsw,
  upsertKnowledgeDocument,
  getKnowledgeDocumentByHash,
  listKnowledgeDedupCandidates,
  upsertRagCollection
} from "../rag/vectorStore.js";
import { getEmbedding } from "../rag/embeddings.js";
import { computeFreshnessScore, hashContent, computeSimhash, hammingDistance, normalizeText } from "../signals/utils.js";
import { addRestaurantDocumentChunk } from "../../storage/restaurants.js";

const DEFAULT_MIN_TOKENS = Number(process.env.DURHAM_CHUNK_MIN_TOKENS || 500);
const DEFAULT_MAX_TOKENS = Number(process.env.DURHAM_CHUNK_MAX_TOKENS || 900);
const DEFAULT_OVERLAP_TOKENS = Number(process.env.DURHAM_CHUNK_OVERLAP_TOKENS || 120);
const DEDUP_LOOKBACK_HOURS = Number(process.env.DURHAM_DEDUP_LOOKBACK_HOURS || 720);
const SIMHASH_DISTANCE = Number(process.env.DURHAM_SIMHASH_DISTANCE || 3);

function nowIso() {
  return new Date().toISOString();
}

function estimateTokens(text) {
  return Math.max(1, Math.ceil(text.length / 4));
}

function splitSentences(text) {
  const cleaned = normalizeText(text);
  if (!cleaned) return [];
  return cleaned.match(/[^.!?]+[.!?]+|[^.!?]+$/g) || [cleaned];
}

function collectOverlap(lines, overlapTokens) {
  if (!lines.length || overlapTokens <= 0) return [];
  let total = 0;
  const overlap = [];
  for (let i = lines.length - 1; i >= 0; i -= 1) {
    const line = lines[i];
    total += estimateTokens(line) + 1;
    overlap.push(line);
    if (total >= overlapTokens) break;
  }
  return overlap.reverse();
}

export function chunkTextByTokens({ meetingId, text, minTokens = DEFAULT_MIN_TOKENS, maxTokens = DEFAULT_MAX_TOKENS, overlapTokens = DEFAULT_OVERLAP_TOKENS } = {}) {
  const sentences = splitSentences(text);
  if (!sentences.length) return [];
  const chunks = [];
  let current = [];
  let currentTokens = 0;
  let index = 0;

  const flush = () => {
    if (!current.length) return;
    const chunkText = current.join(" ").trim();
    if (!chunkText) return;
    chunks.push({
      chunk_id: `${meetingId}:${index}`,
      meeting_id: meetingId,
      chunk_index: index,
      speaker: "",
      start_time: null,
      end_time: null,
      text: chunkText,
      token_count: estimateTokens(chunkText)
    });
    index += 1;
  };

  for (const sentence of sentences) {
    const tokens = estimateTokens(sentence);
    if (currentTokens + tokens > maxTokens && currentTokens >= minTokens) {
      flush();
      current = collectOverlap(current, overlapTokens);
      currentTokens = current.reduce((sum, line) => sum + estimateTokens(line), 0);
    }
    current.push(sentence);
    currentTokens += tokens;
  }

  flush();
  return chunks;
}

function hashSeed(value) {
  return crypto.createHash("sha1").update(String(value || "")).digest("hex").slice(0, 16);
}

function ensureCollection(collectionId, { label } = {}) {
  const resolved = collectionId || "restaurants-local";
  const suffix = label ? ` (${label})` : "";
  upsertRagCollection({
    id: resolved,
    title: `Restaurants${suffix}`,
    description: label
      ? `Restaurant discovery and menu data for ${label}.`
      : "Restaurant discovery and menu data.",
    kind: "custom"
  });
  return resolved;
}

function getDedupCandidates(collectionId) {
  return listKnowledgeDedupCandidates({ sinceHours: DEDUP_LOOKBACK_HOURS, limit: 2000, collectionId });
}

export async function ingestRestaurantDocument({
  restaurant,
  sourceUrl,
  docType,
  text,
  crawlRunId,
  collectionId,
  lastUpdated,
  location,
  collectionLabel
} = {}) {
  const normalizedText = normalizeText(text);
  if (!normalizedText) return { ok: false, error: "empty_text" };
  const resolvedCollection = ensureCollection(collectionId, { label: collectionLabel || location?.label });
  const contentHash = hashContent(normalizedText);
  const simhash = computeSimhash(normalizedText);

  if (getKnowledgeDocumentByHash(contentHash, resolvedCollection)) {
    return { ok: true, skipped: true, reason: "dedup_hash" };
  }
  if (SIMHASH_DISTANCE > 0 && simhash) {
    const candidates = getDedupCandidates(resolvedCollection);
    const nearDup = candidates.find(item => item.simhash && hammingDistance(item.simhash, simhash) <= SIMHASH_DISTANCE);
    if (nearDup) {
      return { ok: true, skipped: true, reason: "dedup_simhash" };
    }
  }

  const restaurantId = restaurant?.restaurant_id || restaurant?.restaurantId || "unknown";
  const meetingId = `rag:${resolvedCollection}:restaurant:${restaurantId}:${docType}:${hashSeed(sourceUrl || normalizedText.slice(0, 80))}`;
  const occurredAt = lastUpdated || nowIso();
  const title = `${restaurant?.name || "Restaurant"} (${docType})`;

  upsertMeeting({
    id: meetingId,
    title,
    occurred_at: occurredAt,
    participants_json: "",
    source_group: `restaurant:${restaurantId}`,
    source_url: sourceUrl || "",
    raw_transcript: normalizedText,
    created_at: occurredAt
  });

  const chunks = chunkTextByTokens({ meetingId, text: normalizedText });
  if (!chunks.length) return { ok: false, error: "chunking_failed" };
  upsertChunks(chunks);
  const embeddings = [];
  for (const chunk of chunks) {
    embeddings.push(await getEmbedding(chunk.text));
  }
  await upsertVectors(chunks, embeddings);
  await persistHnsw();

  const freshness = computeFreshnessScore(occurredAt, 720);
  upsertKnowledgeDocument({
    doc_id: meetingId,
    collection_id: resolvedCollection,
    source_type: docType || "",
    source_url: sourceUrl || "",
    source_group: `restaurant:${restaurantId}`,
    title,
    content_hash: contentHash,
    simhash,
    published_at: occurredAt,
    retrieved_at: nowIso(),
    freshness_score: freshness,
    reliability_score: 0.8,
    stale: false,
    expired: false,
    stale_reason: "",
    reviewed_at: nowIso(),
    tags: ["restaurant", docType].filter(Boolean),
    metadata: {
      restaurant_id: restaurantId,
      restaurant_name: restaurant?.name || "",
      source_url: sourceUrl || "",
      doc_type: docType || "",
      last_updated: occurredAt,
      city: location?.city || "",
      state: location?.state || "",
      postal_code: location?.postalCode || "",
      location_label: location?.label || "",
      crawl_run_id: crawlRunId || ""
    },
    meeting_id: meetingId,
    created_at: occurredAt
  });

  chunks.forEach(chunk => {
    addRestaurantDocumentChunk({
      chunkId: chunk.chunk_id,
      restaurantId,
      sourceUrl,
      docType,
      text: chunk.text,
      createdAt: occurredAt,
      contentHash: hashContent(chunk.text),
      crawlRunId
    });
  });

  return { ok: true, meetingId, chunks: chunks.length, collectionId: resolvedCollection };
}
