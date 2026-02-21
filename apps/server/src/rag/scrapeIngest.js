import { ingestConnectorDocument, ensureConnectorCollection } from "../connectors/ingest.js";
import { getRagCollection } from "./vectorStore.js";
import { refreshMetaRag } from "./metaRag.js";

const LEGACY_SCRAPE_COLLECTION = "screenscreen-scrape-website-just-show-th";
const DEFAULT_SCRAPE_COLLECTION = "screenscrape";

function nowIso() {
  return new Date().toISOString();
}

function resolveScrapeCollectionId(explicitId) {
  const env = String(
    explicitId
    || process.env.SCRAPE_RAG_COLLECTION_ID
    || process.env.ACTION_SCRAPE_RAG_COLLECTION
    || ""
  ).trim();
  if (env) return env;
  if (getRagCollection(LEGACY_SCRAPE_COLLECTION)) return LEGACY_SCRAPE_COLLECTION;
  return DEFAULT_SCRAPE_COLLECTION;
}

function buildExtractedText(extracted = []) {
  const items = Array.isArray(extracted) ? extracted : [];
  const sections = [];
  for (const item of items) {
    const label = String(item?.name || item?.selector || `step ${item?.step || ""}`).trim();
    const text = String(item?.text || "").trim();
    if (!text) continue;
    const header = label ? `### ${label}` : "### Extracted";
    sections.push(`${header}\n${text}`.trim());
  }
  return sections.join("\n\n").trim();
}

export async function ingestActionRunToRag(run, { collectionId } = {}) {
  if (!run) return { ok: false, skipped: true, reason: "run_missing" };
  const extractedText = buildExtractedText(run.extracted || []);
  if (!extractedText) return { ok: false, skipped: true, reason: "no_extracted_text" };

  const resolvedCollection = resolveScrapeCollectionId(collectionId);
  ensureConnectorCollection({
    id: resolvedCollection,
    title: "Screen Scrapes",
    description: "Screen scrape results and extracted content."
  });

  const title = run.taskName ? `Screen scrape: ${run.taskName}` : "Screen scrape";
  const meetingId = `rag:${resolvedCollection}:action-run:${run.id}`;
  const metadata = {
    runId: run.id,
    taskName: run.taskName || "",
    workspaceId: run.workspaceId || "",
    extractedCount: Array.isArray(run.extracted) ? run.extracted.length : 0,
    actionsCount: Array.isArray(run.actions) ? run.actions.length : 0
  };
  const occurredAt = run.finishedAt || run.updatedAt || run.createdAt || nowIso();

  const result = await ingestConnectorDocument({
    collectionId: resolvedCollection,
    sourceType: "screen_scrape",
    meetingId,
    title,
    sourceUrl: run.startUrl || "",
    text: extractedText,
    tags: ["screen_scrape", "action_runner"],
    metadata,
    sourceGroup: `action_run:${run.id}`,
    occurredAt
  });

  if (result?.ok) {
    refreshMetaRag().catch(() => {});
  }

  return { ...result, collectionId: resolvedCollection };
}
