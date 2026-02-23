import { ingestConnectorDocument } from "../connectors/ingest.js";

const DEFAULT_COLLECTION = String(process.env.HEALTH_RAG_COLLECTION || "health").trim() || "health";

function normalizeTagList(input) {
  if (Array.isArray(input)) {
    return input.map(item => String(item || "").trim()).filter(Boolean);
  }
  if (typeof input === "string") {
    return input.split(/[;,]/).map(item => item.trim()).filter(Boolean);
  }
  return [];
}

function buildRecordText(record = {}) {
  if (record.text) return String(record.text);
  if (record.summary) return String(record.summary);
  if (record.body) return String(record.body);
  if (record.data) {
    try {
      return JSON.stringify(record.data, null, 2);
    } catch {
      return String(record.data);
    }
  }
  return "";
}

function normalizeRecord(record = {}, { defaultSource, baseTags, sourceGroup } = {}) {
  const sourceType = String(record.source || record.sourceType || defaultSource || "health").trim() || "health";
  const title = String(record.title || record.name || record.type || sourceType).trim();
  const text = buildRecordText(record);
  const tags = [
    "health",
    "phi",
    sourceType,
    ...normalizeTagList(record.tags),
    ...baseTags
  ].filter(Boolean);
  const metadata = {
    ...(record.metadata || {}),
    phi_level: record.phiLevel || "restricted",
    source: sourceType,
    record_type: record.recordType || record.type || "",
    device: record.device || ""
  };
  return {
    sourceType,
    title,
    text,
    tags,
    metadata,
    sourceUrl: record.sourceUrl || record.url || "",
    sourceGroup: record.sourceGroup || sourceGroup || "",
    occurredAt: record.occurredAt || record.timestamp || record.date || ""
  };
}

export async function ingestHealthRecords({
  records = [],
  source,
  tags = [],
  collectionId,
  sourceGroup
} = {}) {
  const baseTags = normalizeTagList(tags);
  const normalizedRecords = Array.isArray(records) ? records : [records];
  const summary = { ok: true, ingested: 0, skipped: 0, errors: [] };
  const limit = Math.min(normalizedRecords.length, 500);

  for (let i = 0; i < limit; i += 1) {
    const record = normalizeRecord(normalizedRecords[i], {
      defaultSource: source,
      baseTags,
      sourceGroup
    });
    if (!record.text) {
      summary.skipped += 1;
      summary.errors.push({ index: i, error: "empty_text" });
      continue;
    }
    const result = await ingestConnectorDocument({
      collectionId: collectionId || DEFAULT_COLLECTION,
      sourceType: record.sourceType,
      title: record.title,
      sourceUrl: record.sourceUrl,
      text: record.text,
      tags: record.tags,
      metadata: record.metadata,
      sourceGroup: record.sourceGroup,
      occurredAt: record.occurredAt
    });
    if (result?.skipped) summary.skipped += 1;
    else if (result?.ok) summary.ingested += 1;
    else summary.errors.push({ index: i, error: result?.error || "ingest_failed" });
  }

  if (summary.errors.length) {
    summary.ok = summary.ingested > 0 || summary.skipped > 0;
  }
  if (normalizedRecords.length > limit) {
    summary.errors.push({ error: "limit_reached", limit });
  }

  return summary;
}
