import crypto from "node:crypto";
import { chunkTranscript } from "../rag/chunking.js";
import { getEmbedding } from "../rag/embeddings.js";
import {
  initRagStore,
  upsertMeeting,
  upsertChunks,
  upsertVectors,
  persistHnsw,
  deleteMeetingChunks,
  upsertSignalDocument,
  getSignalDocumentByUrl,
  getSignalDocumentByHash,
  listSignalDedupCandidates,
  listSignalDocuments,
  updateSignalDocument,
  recordSignalsRun,
  updateSignalsRun,
  replaceSignalsTrends
} from "../rag/vectorStore.js";
import { loadSignalsConfig, resolveSourceReliability } from "./config.js";
import { fetchSourceItems } from "./sources.js";
import {
  nowIso,
  normalizeText,
  cleanText,
  limitText,
  normalizeUrl,
  hashContent,
  computeSimhash,
  hammingDistance,
  extractTickers,
  extractCompanies,
  extractCommodities,
  extractRegions,
  extractEventTypes,
  deriveSignalTags,
  computeFreshnessScore,
  extractKeywords,
  buildExpirySummary,
  scoreByFreshnessReliability,
  fetchText,
  sleep,
  dayKeyFromIso,
  isEvergreen,
  buildDocHeader
} from "./utils.js";
import { startSignalsRun, appendRunLog, finalizeSignalsRun } from "./runStore.js";

const SIMHASH_DISTANCE = Number(process.env.SIGNALS_SIMHASH_DISTANCE || 3);
const SIGNALS_MAX_RECENT_DEDUP = Number(process.env.SIGNALS_MAX_RECENT_DEDUP || 1500);
const SIGNALS_DEDUP_LOOKBACK_HOURS = Number(process.env.SIGNALS_DEDUP_LOOKBACK_HOURS || 96);

function buildDocId(seed) {
  return crypto.createHash("sha1").update(String(seed || "")).digest("hex").slice(0, 20);
}

function pickHalfLife(category, config) {
  const map = config.defaults.halfLifeHours || {};
  return Number(map[category] || 72);
}

async function ingestDocIntoRag(doc, maxDocChars) {
  const meetingId = `signals:${doc.doc_id}`;
  const header = buildDocHeader({
    title: doc.title,
    source: doc.source_url || doc.source_id,
    publishedAt: doc.published_at,
    tags: doc.tags || [],
    signalTags: doc.signal_tags || []
  });
  const body = limitText(doc.cleaned_text || doc.summary || doc.raw_text || "", maxDocChars);
  const raw = header ? `${header}\n\n${body}` : body;
  upsertMeeting({
    id: meetingId,
    title: doc.title || "Signals Ingestion",
    occurred_at: doc.published_at || doc.retrieved_at || nowIso(),
    participants_json: "",
    source_group: `signals:${doc.source_id}`,
    source_url: doc.canonical_url || doc.source_url || "",
    raw_transcript: raw,
    created_at: doc.retrieved_at || nowIso()
  });
  const chunks = chunkTranscript({ meetingId, rawText: raw });
  if (!chunks.length) return { meetingId, chunks: 0 };
  upsertChunks(chunks);
  const embeddings = [];
  for (const chunk of chunks) {
    embeddings.push(await getEmbedding(chunk.text));
  }
  await upsertVectors(chunks, embeddings);
  return { meetingId, chunks: chunks.length };
}

function buildEntities(text) {
  return {
    tickers: extractTickers(text),
    companies: extractCompanies(text),
    commodities: extractCommodities(text),
    regions: extractRegions(text),
    event_types: extractEventTypes(text)
  };
}

const robotsCache = new Map();
async function allowsCrawl(url) {
  let origin = "";
  try {
    origin = new URL(url).origin;
  } catch {
    return true;
  }
  if (robotsCache.has(origin)) return robotsCache.get(origin);
  try {
    const resp = await fetch(`${origin}/robots.txt`, { headers: { "User-Agent": "AikaSignals/1.0" } });
    if (!resp.ok) {
      robotsCache.set(origin, true);
      return true;
    }
    const text = await resp.text();
    const lines = text.split(/\r?\n/);
    let inStar = false;
    let disallowAll = false;
    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) continue;
      const [key, ...rest] = trimmed.split(":");
      const value = rest.join(":").trim();
      if (/^user-agent$/i.test(key)) {
        inStar = value === "*";
        continue;
      }
      if (inStar && /^disallow$/i.test(key) && value === "/") {
        disallowAll = true;
        break;
      }
    }
    const allowed = !disallowAll;
    robotsCache.set(origin, allowed);
    return allowed;
  } catch {
    robotsCache.set(origin, true);
    return true;
  }
}

async function maybeFetchFullText(item, source, config) {
  if (!source.allow_html) return item.content || item.summary || "";
  const url = item.canonical_url || item.source_url || "";
  if (!url) return item.content || item.summary || "";
  if (url.toLowerCase().endsWith(".pdf")) return item.content || item.summary || "";
  if (!(await allowsCrawl(url))) return item.content || item.summary || "";
  try {
    await sleep(config.defaults.requestDelayMs || 0);
    const html = await fetchText(url, {
      timeoutMs: config.defaults.fetchTimeoutMs,
      retry: config.defaults.retry
    });
    const cleaned = cleanText(html);
    return cleaned || item.content || item.summary || "";
  } catch {
    return item.content || item.summary || "";
  }
}

function buildTrendNote(trend) {
  const tags = new Set(trend.signal_tags || []);
  if (tags.has("energy_supply") || tags.has("energy_inventory")) {
    return "Energy supply and inventory signals can move fuel prices and transport costs.";
  }
  if (tags.has("shipping_disruption")) {
    return "Shipping disruptions can ripple into delivery times, inventories, and price volatility.";
  }
  if (tags.has("extreme_weather") || tags.has("wildfire_risk") || tags.has("drought_risk")) {
    return "Severe weather risk can disrupt operations, logistics, and commodity supply.";
  }
  if (tags.has("regulatory_risk")) {
    return "Regulatory shifts may impact compliance costs and sector sentiment.";
  }
  return "Monitor for second-order impacts across markets and supply chains.";
}

function cosineDistance(a, b) {
  let dot = 0;
  let normA = 0;
  let normB = 0;
  for (let i = 0; i < a.length; i += 1) {
    const va = a[i] || 0;
    const vb = b[i] || 0;
    dot += va * vb;
    normA += va * va;
    normB += vb * vb;
  }
  const denom = Math.sqrt(normA) * Math.sqrt(normB);
  if (!denom) return 1;
  return 1 - (dot / denom);
}

function meanVector(vectors) {
  if (!vectors.length) return [];
  const dim = vectors[0].length;
  const mean = new Array(dim).fill(0);
  vectors.forEach(vec => {
    for (let i = 0; i < dim; i += 1) {
      mean[i] += vec[i] || 0;
    }
  });
  for (let i = 0; i < dim; i += 1) {
    mean[i] /= vectors.length;
  }
  return mean;
}

function kmeans(vectors, k, iterations = 8) {
  if (!vectors.length) return { assignments: [], centroids: [] };
  const actualK = Math.min(k, vectors.length);
  const centroids = [];
  const used = new Set();
  while (centroids.length < actualK) {
    const idx = Math.floor(Math.random() * vectors.length);
    if (used.has(idx)) continue;
    used.add(idx);
    centroids.push([...vectors[idx]]);
  }
  let assignments = new Array(vectors.length).fill(0);
  for (let iter = 0; iter < iterations; iter += 1) {
    assignments = vectors.map(vec => {
      let best = 0;
      let bestDist = Infinity;
      centroids.forEach((centroid, idx) => {
        const dist = cosineDistance(vec, centroid);
        if (dist < bestDist) {
          bestDist = dist;
          best = idx;
        }
      });
      return best;
    });
    for (let i = 0; i < centroids.length; i += 1) {
      const clusterVectors = vectors.filter((_, idx) => assignments[idx] === i);
      if (clusterVectors.length) {
        centroids[i] = meanVector(clusterVectors);
      }
    }
  }
  return { assignments, centroids };
}

async function clusterTrends(ingestedDocs, config) {
  const docs = ingestedDocs.filter(doc => doc.embedding && doc.embedding.length);
  if (!docs.length) return { trends: [], assignments: [] };
  const vectors = docs.map(doc => doc.embedding);
  const k = config.defaults.clusterCount || 6;
  const { assignments } = kmeans(vectors, k, 6);
  const clusters = new Map();
  assignments.forEach((clusterIdx, docIdx) => {
    const doc = docs[docIdx];
    if (!clusters.has(clusterIdx)) clusters.set(clusterIdx, []);
    clusters.get(clusterIdx).push(doc);
  });
  const trends = [];
  clusters.forEach((clusterDocs, clusterIdx) => {
    if (clusterDocs.length < (config.defaults.minClusterDocs || 3)) return;
    const titles = clusterDocs.map(doc => doc.title || "").join(" ");
    const keywords = extractKeywords(titles, 4);
    const label = keywords.length ? keywords.join(" ") : `Cluster ${clusterIdx + 1}`;
    const topDoc = clusterDocs.slice().sort((a, b) => scoreByFreshnessReliability(b.freshness_score, b.reliability_score) - scoreByFreshnessReliability(a.freshness_score, a.reliability_score))[0];
    const entities = new Set();
    const tickers = new Set();
    const signalTags = new Set();
    clusterDocs.forEach(doc => {
      (doc.entities?.companies || []).forEach(e => entities.add(e));
      (doc.entities?.commodities || []).forEach(e => entities.add(e));
      (doc.tickers || []).forEach(t => tickers.add(t));
      (doc.signal_tags || []).forEach(t => signalTags.add(t));
    });
    const trend = {
      cluster_id: `cluster_${clusterIdx + 1}`,
      label,
      representative_doc_id: topDoc?.doc_id || "",
      representative_title: topDoc?.title || "",
      top_entities: Array.from(entities).slice(0, 8),
      top_tickers: Array.from(tickers).slice(0, 8),
      signal_tags: Array.from(signalTags).slice(0, 6),
      doc_count: clusterDocs.length
    };
    trend.note = buildTrendNote(trend);
    trends.push(trend);
  });
  return { trends, assignments, docs };
}

async function enforceCaps(docs, config) {
  const sourceCap = config.defaults.maxDocsPerSourcePerDay || 30;
  const clusterCap = config.defaults.maxDocsPerClusterPerDay || 12;
  const groupedBySourceDay = new Map();
  docs.forEach(doc => {
    const key = `${doc.source_id || "unknown"}::${doc.day_key || ""}`;
    if (!groupedBySourceDay.has(key)) groupedBySourceDay.set(key, []);
    groupedBySourceDay.get(key).push(doc);
  });
  for (const [key, group] of groupedBySourceDay.entries()) {
    if (group.length <= sourceCap) continue;
    const sorted = group.slice().sort((a, b) => scoreByFreshnessReliability(b.freshness_score, b.reliability_score) - scoreByFreshnessReliability(a.freshness_score, a.reliability_score));
    const overflow = sorted.slice(sourceCap);
    overflow.forEach(doc => {
      updateSignalDocument(doc.doc_id, { stale: 1, stale_reason: "source_cap" });
    });
  }
  if (!clusterCap) return;
  const groupedByClusterDay = new Map();
  docs.forEach(doc => {
    if (!doc.cluster_id) return;
    const key = `${doc.cluster_id}::${doc.day_key || ""}`;
    if (!groupedByClusterDay.has(key)) groupedByClusterDay.set(key, []);
    groupedByClusterDay.get(key).push(doc);
  });
  for (const [key, group] of groupedByClusterDay.entries()) {
    if (group.length <= clusterCap) continue;
    const sorted = group.slice().sort((a, b) => scoreByFreshnessReliability(b.freshness_score, b.reliability_score) - scoreByFreshnessReliability(a.freshness_score, a.reliability_score));
    const overflow = sorted.slice(clusterCap);
    overflow.forEach(doc => {
      updateSignalDocument(doc.doc_id, { stale: 1, stale_reason: "cluster_cap" });
    });
  }
}

async function curateSignals(config) {
  const rows = listSignalDocuments({ limit: 2000, includeStale: true, includeExpired: true });
  let expiredCount = 0;
  let staleCount = 0;
  for (const doc of rows) {
    const halfLife = pickHalfLife(doc.category, config);
    const freshness = computeFreshnessScore(doc.published_at || doc.retrieved_at, halfLife);
    const shouldExpire = freshness < config.defaults.freshness.expireThreshold && !isEvergreen(doc);
    const shouldStale = freshness < config.defaults.freshness.staleThreshold;
    if (shouldExpire && !doc.expired) {
      const summaryBullets = buildExpirySummary(doc.cleaned_text || doc.summary || doc.raw_text || "");
      deleteMeetingChunks(doc.meeting_id || `signals:${doc.doc_id}`);
      updateSignalDocument(doc.doc_id, {
        expired: 1,
        stale: 1,
        freshness_score: freshness,
        summary_json: { bullets: summaryBullets, entities: doc.entities || {}, tags: doc.tags || [], dates: { published_at: doc.published_at, retrieved_at: doc.retrieved_at } },
        cleaned_text: ""
      });
      expiredCount += 1;
    } else if (shouldStale && !doc.stale) {
      updateSignalDocument(doc.doc_id, { stale: 1, freshness_score: freshness });
      staleCount += 1;
    } else if (!shouldStale && doc.stale && !doc.expired) {
      updateSignalDocument(doc.doc_id, { stale: 0, freshness_score: freshness });
    }
  }
  return { expiredCount, staleCount };
}

export async function runSignalsIngestion({ sourceIds = [], force = false } = {}) {
  initRagStore();
  const config = loadSignalsConfig();
  const run = startSignalsRun();
  const sources = config.sources.filter(source => source.enabled !== false).filter(source => !sourceIds.length || sourceIds.includes(source.id));
  recordSignalsRun({
    run_id: run.runId,
    status: "running",
    started_at: run.startedAt,
    source_count: sources.length,
    report_path: run.reportPath
  });

  const summary = {
    status: "ok",
    ingested: 0,
    skipped: 0,
    errors: [],
    expired: 0,
    stale: 0,
    sources: []
  };

  const recentCandidates = listSignalDedupCandidates({ sinceHours: SIGNALS_DEDUP_LOOKBACK_HOURS, limit: SIGNALS_MAX_RECENT_DEDUP });
  const dedupList = recentCandidates.map(row => ({
    canonical_url: row.canonical_url,
    content_hash: row.content_hash,
    simhash: row.simhash
  }));
  const seenUrls = new Set();
  const seenHashes = new Set();
  const ingestedDocs = [];

  for (const source of sources) {
    appendRunLog(run, `source_start ${source.id}`);
    const sourceStats = { source_id: source.id, pulled: 0, ingested: 0, skipped: 0, errors: [] };
    try {
      const items = await fetchSourceItems(source, config);
      sourceStats.pulled = items.length;
      const maxDocsPerSource = config.defaults.maxDocsPerSourcePerDay || 20;
      for (const item of items) {
        if (sourceStats.ingested >= maxDocsPerSource) {
          sourceStats.skipped += Math.max(0, items.length - sourceStats.ingested);
          break;
        }
        const canonicalUrl = normalizeUrl(item.canonical_url || "") || normalizeUrl(item.source_url || "") || "";
        if (canonicalUrl && seenUrls.has(canonicalUrl)) {
          sourceStats.skipped += 1;
          continue;
        }
        if (canonicalUrl) seenUrls.add(canonicalUrl);
        if (canonicalUrl && !force && getSignalDocumentByUrl(canonicalUrl)) {
          sourceStats.skipped += 1;
          continue;
        }
        const combined = [item.title, item.summary, item.content].filter(Boolean).join("\n");
        const rawText = normalizeText(combined);
        const fullText = await maybeFetchFullText(item, source, config);
        const cleanedText = cleanText(fullText || rawText || item.summary || "");
        const trimmedText = limitText(cleanedText, config.defaults.maxDocChars);
        if (!trimmedText) {
          sourceStats.skipped += 1;
          continue;
        }
        const contentHash = hashContent(trimmedText);
        if (seenHashes.has(contentHash)) {
          sourceStats.skipped += 1;
          continue;
        }
        seenHashes.add(contentHash);
        if (!force && getSignalDocumentByHash(contentHash)) {
          sourceStats.skipped += 1;
          continue;
        }
        const simhash = computeSimhash(cleanedText);
        if (simhash) {
          const nearDup = dedupList.find(existing => existing.simhash && hammingDistance(existing.simhash, simhash) <= SIMHASH_DISTANCE);
          if (nearDup) {
            sourceStats.skipped += 1;
            continue;
          }
        }
        const title = item.title || source.id;
        const publishedAt = item.published_at || item.retrieved_at || nowIso();
        const seed = canonicalUrl || `${source.id}:${title}:${publishedAt}:${contentHash.slice(0, 8)}`;
        const docId = buildDocId(seed);
        const entities = buildEntities(`${title}\n${trimmedText}`);
        const signalTags = deriveSignalTags(`${title}\n${trimmedText}`);
        const tags = Array.from(new Set([...(source.tags || []), ...signalTags, ...entities.event_types || []]));
        const reliability = resolveSourceReliability(source, config.reliability);
        const halfLife = pickHalfLife(source.category, config);
        const freshness = computeFreshnessScore(publishedAt, halfLife);
        const doc = {
          doc_id: docId,
          source_id: source.id,
          source_title: item.source_title || source.id,
          source_url: item.source_url || source.url,
          canonical_url: canonicalUrl,
          title,
          summary: item.summary || "",
          raw_text: rawText,
          cleaned_text: trimmedText,
          content_hash: contentHash,
          simhash,
          retrieved_at: item.retrieved_at || nowIso(),
          published_at: publishedAt,
          language: item.language || config.defaults.language,
          category: source.category,
          tags,
          signal_tags: signalTags,
          tickers: entities.tickers || [],
          entities,
          freshness_score: freshness,
          reliability_score: reliability,
          stale: 0,
          expired: 0,
          meeting_id: ""
        };
        const ingestion = await ingestDocIntoRag(doc, config.defaults.maxDocChars);
        doc.meeting_id = ingestion.meetingId;
        upsertSignalDocument(doc);
        const docEmbedding = await getEmbedding(`${title}\n${doc.summary || ""}\n${trimmedText.slice(0, 1200)}`);
        ingestedDocs.push({
          ...doc,
          embedding: Array.from(docEmbedding || [])
        });
        sourceStats.ingested += 1;
        summary.ingested += 1;
        dedupList.push({ canonical_url: canonicalUrl, content_hash: contentHash, simhash });
      }
    } catch (err) {
      sourceStats.errors.push(err?.message || "source_failed");
      summary.errors.push({ source: source.id, error: err?.message || "source_failed" });
    }
    summary.sources.push(sourceStats);
    summary.skipped += sourceStats.skipped;
    appendRunLog(run, `source_done ${source.id} pulled=${sourceStats.pulled} ingested=${sourceStats.ingested} skipped=${sourceStats.skipped}`);
    await sleep(config.defaults.requestDelayMs || 0);
  }

  const clustering = await clusterTrends(ingestedDocs, config);
  if (clustering.trends.length) {
    replaceSignalsTrends(run.runId, clustering.trends);
    const labelMap = new Map(clustering.trends.map(trend => [trend.cluster_id, trend.label]));
    clustering.assignments.forEach((clusterIdx, docIdx) => {
      const doc = clustering.docs[docIdx];
      if (!doc) return;
      const clusterId = `cluster_${clusterIdx + 1}`;
      updateSignalDocument(doc.doc_id, { cluster_id: clusterId, cluster_label: labelMap.get(clusterId) || "" });
      doc.cluster_id = clusterId;
    });
  }

  const curated = await curateSignals(config);
  summary.expired = curated.expiredCount;
  summary.stale = curated.staleCount;

  const todaysDocs = ingestedDocs.map(doc => ({
    doc_id: doc.doc_id,
    source_id: doc.source_id,
    day_key: dayKeyFromIso(doc.published_at || doc.retrieved_at),
    freshness_score: doc.freshness_score,
    reliability_score: doc.reliability_score,
    cluster_id: doc.cluster_id || ""
  }));
  await enforceCaps(todaysDocs, config);

  await persistHnsw();

  const finishedAt = nowIso();
  const status = summary.errors.length ? (summary.ingested ? "partial" : "error") : "ok";
  summary.status = status;

  updateSignalsRun(run.runId, {
    status,
    finished_at: finishedAt,
    ingested_count: summary.ingested,
    skipped_count: summary.skipped,
    expired_count: summary.expired,
    error_count: summary.errors.length,
    errors_json: JSON.stringify(summary.errors || []),
    sources_json: JSON.stringify(summary.sources || [])
  });
  finalizeSignalsRun(run, summary);
  appendRunLog(run, `run_done status=${status} ingested=${summary.ingested} skipped=${summary.skipped} expired=${summary.expired}`);

  return {
    run_id: run.runId,
    status,
    started_at: run.startedAt,
    finished_at: finishedAt,
    ingested: summary.ingested,
    skipped: summary.skipped,
    expired: summary.expired,
    stale: summary.stale,
    errors: summary.errors,
    sources: summary.sources
  };
}

