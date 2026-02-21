import { chunkTranscript } from "./chunking.js";
import { getEmbedding } from "./embeddings.js";
import {
  searchChunkIds,
  getChunksByIds,
  getMeeting,
  upsertMeeting,
  deleteMeetingChunks,
  upsertChunks,
  upsertVectors,
  persistHnsw,
  listRagCollections,
  getRagCollection,
  getRagMeta,
  setRagMeta,
  getMeetingStats,
  getKnowledgeHealthSummary,
  listKnowledgeSourceStats
} from "./vectorStore.js";
import { createAssistantProposal, listAssistantProposals } from "../../storage/assistant_change_proposals.js";
import { createSafetyApproval } from "../safety/approvals.js";
import { searchWeb } from "../../integrations/web_search.js";

const META_PREFIX = "rag:meta:";
const META_REFRESH_KEY = "meta_rag:last_refresh";
const BUILTIN_COLLECTIONS = [
  {
    id: "fireflies",
    title: "Fireflies Meetings",
    description: "Meeting transcripts and summaries.",
    kind: "built-in",
    route: { id: "fireflies", filters: { meetingType: "fireflies" } },
    stats: { type: "fireflies" },
    includeKnowledge: false
  },
  {
    id: "trading",
    title: "Trading Knowledge",
    description: "Trading sources, RSS, and scenarios.",
    kind: "built-in",
    route: { id: "trading", filters: { meetingIdPrefix: "trading:" } },
    stats: { type: "trading" },
    includeKnowledge: true
  },
  {
    id: "signals",
    title: "Signals Intelligence",
    description: "Signals, alerts, and macro intelligence.",
    kind: "built-in",
    route: { id: "signals", filters: { meetingIdPrefix: "signals:" } },
    stats: { type: "signals" },
    includeKnowledge: false
  },
  {
    id: "memory",
    title: "Aika Memory",
    description: "Personal memory and preferences stored by Aika.",
    kind: "built-in",
    route: { id: "memory", filters: { meetingIdPrefix: "memory:" } },
    stats: { type: "memory" },
    includeKnowledge: false
  },
  {
    id: "feedback",
    title: "User Feedback",
    description: "User feedback and corrections.",
    kind: "built-in",
    route: { id: "feedback", filters: { meetingIdPrefix: "feedback:" } },
    stats: { type: "feedback" },
    includeKnowledge: false
  },
  {
    id: "recordings",
    title: "Aika Recordings",
    description: "Audio recordings and transcripts captured in Aika.",
    kind: "built-in",
    route: { id: "recordings", filters: { meetingIdPrefix: "recording:" } },
    stats: { type: "recording" },
    includeKnowledge: false
  }
];
const RESERVED_COLLECTIONS = new Set([...BUILTIN_COLLECTIONS.map(item => item.id), "meta"]);

let refreshActive = false;
let refreshTimer = null;
const autoCreateLocks = new Set();

function nowIso() {
  return new Date().toISOString();
}

function metaRagEnabled() {
  return String(process.env.META_RAG_ENABLED || "1") === "1";
}

function autoCreateEnabled() {
  return String(process.env.META_RAG_AUTO_CREATE_ENABLED || "0") === "1";
}

function getMetaTopK() {
  return Math.max(1, Number(process.env.META_RAG_TOP_K || 4));
}

function slugify(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40);
}

function parseMetaCollectionId(meetingId = "") {
  if (!meetingId.startsWith(META_PREFIX)) return "";
  const rest = meetingId.slice(META_PREFIX.length);
  const parts = rest.split(":");
  return parts[0] || "";
}

function resolveRouteForCollection(collectionId) {
  const builtin = BUILTIN_COLLECTIONS.find(item => item.id === collectionId);
  if (builtin?.route) return builtin.route;
  return { id: collectionId, filters: { meetingIdPrefix: `rag:${collectionId}:` } };
}

function formatNumber(value) {
  if (!Number.isFinite(value)) return "0";
  return Number(value).toLocaleString();
}

function buildMetaDocText({ collection, meetingStats, knowledgeSummary, sourceStats, connectorSync }) {
  const lines = [];
  lines.push(`Collection: ${collection.title || collection.id}`);
  lines.push(`ID: ${collection.id}`);
  if (collection.kind) lines.push(`Kind: ${collection.kind}`);
  if (collection.description) lines.push(`Description: ${collection.description}`);
  const route = resolveRouteForCollection(collection.id);
  if (route?.filters?.meetingType) {
    lines.push(`Route: meetingType=${route.filters.meetingType}`);
  } else if (route?.filters?.meetingIdPrefix) {
    lines.push(`Route: meetingIdPrefix=${route.filters.meetingIdPrefix}`);
  }

  if (meetingStats) {
    lines.push(`Meeting count: ${formatNumber(meetingStats.count)}`);
    if (meetingStats.latest) lines.push(`Latest meeting: ${meetingStats.latest}`);
  }

  if (knowledgeSummary && knowledgeSummary.total) {
    lines.push(`Knowledge docs: ${formatNumber(knowledgeSummary.total)} (stale ${formatNumber(knowledgeSummary.stale)}, expired ${formatNumber(knowledgeSummary.expired)})`);
    if (knowledgeSummary.lastReviewedAt) lines.push(`Last reviewed: ${knowledgeSummary.lastReviewedAt}`);
  }

  if (connectorSync) {
    lines.push(`Last connector sync: ${connectorSync}`);
  }

  if (Array.isArray(sourceStats) && sourceStats.length) {
    lines.push("Top sources:");
    sourceStats.slice(0, 5).forEach(stat => {
      const label = stat.source_key || stat.source_url || "unknown";
      const lastSeen = stat.last_seen ? `, last ${stat.last_seen}` : "";
      lines.push(`- ${label} (${formatNumber(stat.doc_count)} docs${lastSeen})`);
    });
  }

  return lines.join("\n").trim();
}

async function upsertMetaDocument({ collection, content }) {
  const meetingId = `${META_PREFIX}${collection.id}`;
  const existing = getMeeting(meetingId);
  if (existing && existing.raw_transcript === content) {
    return { meetingId, updated: false, chunks: 0 };
  }

  const occurredAt = nowIso();
  upsertMeeting({
    id: meetingId,
    title: `Meta RAG: ${collection.title || collection.id}`,
    occurred_at: occurredAt,
    participants_json: "",
    source_group: "meta_rag",
    source_url: "",
    raw_transcript: content,
    created_at: occurredAt
  });

  deleteMeetingChunks(meetingId);
  const chunks = chunkTranscript({ meetingId, rawText: content });
  if (!chunks.length) return { meetingId, updated: true, chunks: 0 };
  upsertChunks(chunks);
  const embeddings = [];
  for (const chunk of chunks) {
    embeddings.push(await getEmbedding(chunk.text));
  }
  await upsertVectors(chunks, embeddings);
  return { meetingId, updated: true, chunks: chunks.length };
}

function buildMetaCollections() {
  const custom = listRagCollections({ limit: 200 }).filter(item => !RESERVED_COLLECTIONS.has(item.id));
  const customDecorated = custom.map(item => ({
    ...item,
    kind: item.kind || "custom",
    route: { id: item.id, filters: { meetingIdPrefix: `rag:${item.id}:` } },
    stats: { meetingIdPrefix: `rag:${item.id}:` },
    includeKnowledge: true
  }));
  return [...BUILTIN_COLLECTIONS, ...customDecorated];
}

function collectMetaStats(collection) {
  const meetingStats = getMeetingStats(collection.stats || { meetingIdPrefix: `rag:${collection.id}:` });
  const knowledgeSummary = collection.includeKnowledge
    ? getKnowledgeHealthSummary({ collectionId: collection.id })
    : null;
  const sourceStats = collection.includeKnowledge
    ? listKnowledgeSourceStats({ collectionId: collection.id, limit: 8 })
    : [];
  const connectorSync = getRagMeta(`connector_sync:${collection.id}`) || "";
  return { meetingStats, knowledgeSummary, sourceStats, connectorSync };
}

export async function refreshMetaRag() {
  if (!metaRagEnabled()) return { ok: false, reason: "disabled" };
  if (refreshActive) return { ok: false, reason: "busy" };
  refreshActive = true;
  try {
    const collections = buildMetaCollections();
    let updated = 0;
    let skipped = 0;
    let chunksUpdated = 0;
    for (const collection of collections) {
      const stats = collectMetaStats(collection);
      const content = buildMetaDocText({ collection, ...stats });
      if (!content) {
        skipped += 1;
        continue;
      }
      const result = await upsertMetaDocument({ collection, content });
      if (result.updated) {
        updated += 1;
        chunksUpdated += result.chunks || 0;
      } else {
        skipped += 1;
      }
    }
    if (chunksUpdated > 0) {
      await persistHnsw();
    }
    setRagMeta(META_REFRESH_KEY, nowIso());
    return { ok: true, total: collections.length, updated, skipped };
  } finally {
    refreshActive = false;
  }
}

export async function selectMetaRoutes(question, { topK } = {}) {
  if (!metaRagEnabled()) return [];
  const query = String(question || "").trim();
  if (!query) return [];
  const k = Math.max(1, Number(topK || getMetaTopK()));
  const embedding = await getEmbedding(query);
  const searchLimit = Math.max(k * 5, k, 10);
  const matches = await searchChunkIds(embedding, searchLimit);
  if (!matches.length) return [];
  const orderedIds = matches.map(match => match.chunk_id).filter(Boolean);
  const rows = getChunksByIds(orderedIds, { meetingIdPrefix: META_PREFIX });
  if (!rows.length) return [];
  const rowById = new Map(rows.map(row => [row.chunk_id, row]));
  const best = new Map();
  for (const match of matches) {
    const row = rowById.get(match.chunk_id);
    if (!row) continue;
    const collectionId = parseMetaCollectionId(row.meeting_id || "");
    if (!collectionId) continue;
    if (best.has(collectionId)) continue;
    best.set(collectionId, match.distance ?? 0);
  }
  const ordered = Array.from(best.entries()).sort((a, b) => (a[1] ?? 0) - (b[1] ?? 0));
  return ordered.slice(0, k).map(([collectionId]) => resolveRouteForCollection(collectionId));
}

function buildAutoQueries(topic, queryCount) {
  const queries = [];
  const base = String(topic || "").trim();
  if (!base) return queries;
  queries.push(base);
  queries.push(`${base} official documentation`);
  queries.push(`${base} overview`);
  queries.push(`${base} api reference`);
  queries.push(`${base} best practices`);
  return queries.slice(0, Math.max(1, queryCount));
}

function mergeSearchResults(resultSets, maxSources) {
  const urls = [];
  const details = [];
  const seen = new Set();
  const hostCounts = new Map();
  for (const result of resultSets) {
    const items = Array.isArray(result?.results) ? result.results : [];
    for (const item of items) {
      if (urls.length >= maxSources) break;
      const url = String(item?.url || "").trim();
      if (!url || !url.startsWith("http")) continue;
      if (seen.has(url)) continue;
      let host = "";
      try {
        host = new URL(url).hostname;
      } catch {
        host = "";
      }
      const hostCount = host ? (hostCounts.get(host) || 0) : 0;
      if (host && hostCount >= 2) continue;
      seen.add(url);
      if (host) hostCounts.set(host, hostCount + 1);
      urls.push(url);
      details.push({
        url,
        title: String(item?.title || "").trim(),
        snippet: String(item?.snippet || "").trim()
      });
    }
    if (urls.length >= maxSources) break;
  }
  return { urls, details };
}

function buildFallbackSources(topic) {
  const slug = slugify(topic) || "knowledge";
  return [
    `https://en.wikipedia.org/wiki/${encodeURIComponent(slug)}`,
    `https://duckduckgo.com/?q=${encodeURIComponent(topic)}`
  ];
}

export async function maybeCreateAutoRagProposal({ topic, question = "", userId = "local" } = {}) {
  if (!autoCreateEnabled()) return { ok: false, reason: "disabled" };
  const cleanedTopic = String(topic || "").trim();
  if (!cleanedTopic || cleanedTopic.length < 3) return { ok: false, reason: "invalid_topic" };
  const collectionId = slugify(cleanedTopic);
  if (!collectionId) return { ok: false, reason: "invalid_topic" };
  if (RESERVED_COLLECTIONS.has(collectionId)) return { ok: false, reason: "reserved_collection" };
  if (getRagCollection(collectionId)) return { ok: false, reason: "collection_exists" };
  if (autoCreateLocks.has(collectionId)) return { ok: false, reason: "in_progress" };

  const existingProposals = listAssistantProposals(userId, { limit: 100 });
  const duplicate = existingProposals.find(proposal => {
    if (!proposal?.details || proposal.details.kind !== "rag_create") return false;
    const existingId = slugify(proposal.details.collectionId || proposal.details.topic || "");
    return existingId === collectionId;
  });
  if (duplicate) return { ok: false, reason: "proposal_exists", proposal: duplicate };

  autoCreateLocks.add(collectionId);
  try {
    const queryCount = Math.max(1, Number(process.env.META_RAG_AUTO_CREATE_QUERY_COUNT || 3));
    const maxSources = Math.max(1, Number(process.env.META_RAG_AUTO_CREATE_MAX_SOURCES || 8));
    const minSources = Math.max(1, Number(process.env.META_RAG_AUTO_CREATE_MIN_SOURCES || 3));
    const queries = buildAutoQueries(cleanedTopic, queryCount);
    const results = [];
    for (const query of queries) {
      try {
        results.push(await searchWeb(query, Math.max(3, Math.ceil(maxSources / queryCount))));
      } catch {
        results.push(null);
      }
    }
    let { urls, details } = mergeSearchResults(results, maxSources);
    if (urls.length < minSources) {
      const fallback = buildFallbackSources(cleanedTopic);
      fallback.forEach(url => {
        if (urls.length >= maxSources) return;
        if (urls.includes(url)) return;
        urls.push(url);
        details.push({ url, title: "", snippet: "" });
      });
    }
    if (urls.length < minSources) {
      return { ok: false, reason: "insufficient_sources", sources: urls };
    }

    const title = `Create RAG model: ${cleanedTopic}`;
    const summary = `Seed a new RAG model for "${cleanedTopic}" with ${urls.length} web sources.`;
    const approval = createSafetyApproval({
      actionType: "assistant.rag_create",
      summary,
      payloadRedacted: { topic: cleanedTopic, sourceCount: urls.length },
      createdBy: userId,
      reason: "auto_rag"
    });
    const proposal = createAssistantProposal(userId, {
      title,
      summary,
      details: {
        kind: "rag_create",
        topic: cleanedTopic,
        collectionId,
        question,
        sources: urls,
        sourceDetails: details,
        queries,
        createdAt: nowIso()
      },
      status: "pending",
      approvalId: approval?.id || ""
    });
    return { ok: true, proposal, approval };
  } finally {
    autoCreateLocks.delete(collectionId);
  }
}

export function startMetaRagLoop() {
  if (refreshTimer || !metaRagEnabled()) return;
  const intervalMinutes = Number(process.env.META_RAG_REFRESH_INTERVAL_MINUTES || 0);
  const runOnStartup = String(process.env.META_RAG_REFRESH_ON_STARTUP || "1") === "1";
  if (runOnStartup) {
    refreshMetaRag().catch(() => {});
  }
  if (intervalMinutes > 0) {
    refreshTimer = setInterval(() => {
      refreshMetaRag().catch(() => {});
    }, Math.max(60_000, intervalMinutes * 60_000));
  }
}
