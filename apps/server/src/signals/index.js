import { loadSignalsConfig } from "./config.js";
import { runSignalsIngestion } from "./pipeline.js";
import { startSignalsScheduler, stopSignalsScheduler } from "./scheduler.js";
import {
  listSignalDocuments,
  getSignalDocument,
  listSignalTrends,
  getSignalsOverview
} from "../rag/vectorStore.js";

export { runSignalsIngestion, startSignalsScheduler, stopSignalsScheduler };

export function getSignalsStatus() {
  const overview = getSignalsOverview();
  const config = loadSignalsConfig();
  return {
    ...overview,
    config: {
      source_count: config.sources.length,
      config_path: config.path,
      ingest_time: process.env.SIGNALS_INGEST_TIME || "06:15",
      timezone: process.env.SIGNALS_TIMEZONE || "America/New_York"
    }
  };
}

export function listSignals({ limit = 50, offset = 0, includeStale = false, includeExpired = false, category = "", sourceId = "", search = "" } = {}) {
  const raw = listSignalDocuments({
    limit: Math.max(limit * 4, limit),
    offset,
    includeStale,
    includeExpired,
    category,
    sourceId,
    search,
    includeSummaries: includeExpired
  });
  const scored = raw.map(doc => ({
    ...doc,
    _score: (doc.freshness_score || 0) * (0.6 + (doc.reliability_score || 0) * 0.4)
  })).sort((a, b) => b._score - a._score);
  const bySource = new Map();
  const diversified = [];
  for (const doc of scored) {
    const key = doc.source_id || "unknown";
    const count = bySource.get(key) || 0;
    if (count >= 2) continue;
    bySource.set(key, count + 1);
    diversified.push(doc);
    if (diversified.length >= limit) break;
  }
  return diversified.map(({ _score, ...doc }) => doc);
}

export function getSignalDoc(docId) {
  return getSignalDocument(docId);
}

export function listSignalsTrends({ runId, limit = 12 } = {}) {
  return listSignalTrends({ runId, limit });
}

