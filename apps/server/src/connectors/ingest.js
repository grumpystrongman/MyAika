import crypto from "node:crypto";
import { chunkTranscript } from "../rag/chunking.js";
import { getEmbedding } from "../rag/embeddings.js";
import {
  upsertMeeting,
  upsertChunks,
  upsertVectors,
  persistHnsw,
  getMeeting,
  deleteMeetingChunks,
  upsertRagCollection,
  upsertKnowledgeDocument,
  getKnowledgeDocumentByHash,
  listKnowledgeDedupCandidates
} from "../rag/vectorStore.js";
import { hashContent, computeSimhash, hammingDistance, computeFreshnessScore } from "../signals/utils.js";
import { normalizeText, limitText } from "./utils.js";

const MAX_DOC_CHARS = Number(process.env.CONNECTOR_MAX_DOC_CHARS || 60000);
const DEDUP_LOOKBACK_HOURS = Number(process.env.CONNECTOR_DEDUP_LOOKBACK_HOURS || 720);
const SIMHASH_DISTANCE = Number(process.env.CONNECTOR_SIMHASH_DISTANCE || 3);
const FRESHNESS_HALFLIFE_HOURS = Number(process.env.CONNECTOR_FRESHNESS_HALFLIFE_HOURS || 720);

const EVERGREEN_TAGS = new Set([
  "doc", "docs", "guide", "manual", "reference", "policy", "playbook", "runbook"
]);

const dedupCache = new Map();

function nowIso() {
  return new Date().toISOString();
}

function hashSeed(input) {
  return crypto.createHash("sha1").update(String(input || "")).digest("hex").slice(0, 16);
}

function normalizeCollectionId(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, "-")
    .replace(/^-+|-+$/g, "") || "custom";
}

function normalizeTags(tags) {
  if (!Array.isArray(tags)) return [];
  const seen = new Set();
  return tags
    .map(tag => String(tag || "").trim().toLowerCase())
    .filter(Boolean)
    .filter(tag => {
      if (seen.has(tag)) return false;
      seen.add(tag);
      return true;
    });
}

function buildHeader({ title, sourceUrl, tags }) {
  const parts = [];
  if (title) parts.push(`Title: ${title}`);
  if (sourceUrl) parts.push(`Source: ${sourceUrl}`);
  if (tags?.length) parts.push(`Tags: ${tags.join(", ")}`);
  return parts.join("\n");
}

function scoreReliability(sourceUrl = "", tags = []) {
  let score = 0.7;
  const lowerTags = tags.map(tag => String(tag || "").toLowerCase());
  if (lowerTags.some(tag => ["policy", "official", "runbook"].includes(tag))) {
    score = 0.85;
  }
  if (lowerTags.some(tag => ["chat", "thread", "message"].includes(tag))) {
    score = 0.6;
  }
  try {
    const host = new URL(sourceUrl).hostname.toLowerCase();
    if (host.endsWith(".gov")) score = Math.max(score, 0.9);
    if (host.endsWith(".edu")) score = Math.max(score, 0.85);
  } catch {
    // ignore
  }
  return Math.min(0.95, Math.max(0.2, score));
}

function isEvergreen(tags = []) {
  return tags.some(tag => EVERGREEN_TAGS.has(String(tag || "").toLowerCase()));
}

function getDedupCandidates(collectionId) {
  const now = Date.now();
  const cached = dedupCache.get(collectionId);
  if (cached && now - cached.ts < 5 * 60_000) {
    return cached.items;
  }
  const items = listKnowledgeDedupCandidates({
    sinceHours: DEDUP_LOOKBACK_HOURS,
    limit: 2000,
    collectionId
  }) || [];
  dedupCache.set(collectionId, { ts: now, items });
  return items;
}

export function ensureConnectorCollection({ id, title, description } = {}) {
  const resolvedId = normalizeCollectionId(id);
  const resolvedTitle = title || `${resolvedId.charAt(0).toUpperCase()}${resolvedId.slice(1)} Connector`;
  return upsertRagCollection({
    id: resolvedId,
    title: resolvedTitle,
    description: description || `${resolvedTitle} knowledge`,
    kind: "custom"
  });
}

export async function ingestConnectorDocument({
  collectionId,
  sourceType,
  meetingId,
  title,
  sourceUrl,
  text,
  tags = [],
  metadata = {},
  sourceGroup = "",
  occurredAt,
  force = false,
  replaceExisting = false
} = {}) {
  const normalizedText = normalizeText(text);
  if (!normalizedText) {
    return { ok: false, error: "empty_text" };
  }

  const resolvedCollection = normalizeCollectionId(collectionId || sourceType);
  ensureConnectorCollection({ id: resolvedCollection });

  const normalizedTags = normalizeTags([sourceType, ...tags].filter(Boolean));
  const contentHash = hashContent(normalizedText);
  const simhash = computeSimhash(normalizedText);

  if (!force) {
    const existingDoc = getKnowledgeDocumentByHash(contentHash, resolvedCollection);
    if (existingDoc) {
      return { ok: true, skipped: true, reason: "dedup_hash", meetingId: existingDoc.meeting_id || "" };
    }
    if (SIMHASH_DISTANCE > 0 && simhash) {
      const candidates = getDedupCandidates(resolvedCollection);
      const nearDup = candidates.find(item => item.simhash && hammingDistance(item.simhash, simhash) <= SIMHASH_DISTANCE);
      if (nearDup) {
        return { ok: true, skipped: true, reason: "dedup_simhash" };
      }
    }
  }

  const idSeed = sourceUrl || `${title}:${normalizedText.slice(0, 120)}`;
  const resolvedMeetingId = meetingId || `rag:${resolvedCollection}:${sourceType || "doc"}:${hashSeed(idSeed)}`;
  const existing = getMeeting(resolvedMeetingId);
  if (existing) {
    if (!force && !replaceExisting && existing.raw_transcript === normalizedText) {
      return { ok: true, skipped: true, meetingId: resolvedMeetingId, chunks: 0 };
    }
    if (force || replaceExisting) {
      deleteMeetingChunks(resolvedMeetingId);
    }
  }

  const occurred = occurredAt || nowIso();
  const header = buildHeader({ title, sourceUrl, tags: normalizedTags });
  const body = limitText(normalizedText, MAX_DOC_CHARS);
  const raw = header ? `${header}\n\n${body}` : body;
  const halfLife = isEvergreen(normalizedTags) ? FRESHNESS_HALFLIFE_HOURS * 4 : FRESHNESS_HALFLIFE_HOURS;
  const freshness = computeFreshnessScore(occurred, halfLife);
  const reliability = scoreReliability(sourceUrl || "", normalizedTags);

  upsertMeeting({
    id: resolvedMeetingId,
    title: title || `${resolvedCollection} (${sourceType || "doc"})`,
    occurred_at: occurred,
    participants_json: "",
    source_group: sourceGroup || "",
    source_url: sourceUrl || "",
    raw_transcript: raw,
    created_at: occurred
  });

  const chunks = chunkTranscript({ meetingId: resolvedMeetingId, rawText: raw });
  if (!chunks.length) {
    return { ok: false, error: "chunking_failed", meetingId: resolvedMeetingId };
  }
  upsertChunks(chunks);
  const embeddings = [];
  for (const chunk of chunks) {
    const embedding = await getEmbedding(chunk.text);
    embeddings.push(embedding);
  }
  await upsertVectors(chunks, embeddings);
  await persistHnsw();

  upsertKnowledgeDocument({
    doc_id: resolvedMeetingId,
    collection_id: resolvedCollection,
    source_type: sourceType || "",
    source_url: sourceUrl || "",
    source_group: sourceGroup || "",
    title: title || "",
    content_hash: contentHash,
    simhash,
    published_at: occurred,
    retrieved_at: nowIso(),
    freshness_score: freshness,
    reliability_score: reliability,
    stale: false,
    expired: false,
    stale_reason: "",
    reviewed_at: nowIso(),
    tags: normalizedTags,
    metadata: { sourceType: sourceType || "", ...metadata },
    meeting_id: resolvedMeetingId,
    created_at: occurred
  });

  if (!force && SIMHASH_DISTANCE > 0 && simhash) {
    const candidates = getDedupCandidates(resolvedCollection);
    candidates.unshift({ content_hash: contentHash, simhash, source_url: sourceUrl || "", collection_id: resolvedCollection });
  }

  return { ok: true, meetingId: resolvedMeetingId, chunks: chunks.length };
}
