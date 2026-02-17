import { getProvider } from "../../integrations/store.js";
import { ingestConnectorDocument } from "./ingest.js";
import { fetchJson, parseList, normalizeText } from "./utils.js";
import { setRagMeta } from "../rag/vectorStore.js";

const NOTION_API = "https://api.notion.com/v1";
const NOTION_VERSION = "2022-06-28";

function getNotionToken(userId = "") {
  const stored = getProvider("notion", userId);
  return stored?.token || stored?.access_token || process.env.NOTION_TOKEN || process.env.NOTION_ACCESS_TOKEN || "";
}

function buildHeaders(token) {
  return {
    "Authorization": `Bearer ${token}`,
    "Notion-Version": NOTION_VERSION,
    "Content-Type": "application/json"
  };
}

function extractTitleFromPage(page) {
  const props = page?.properties || {};
  for (const key of Object.keys(props)) {
    const prop = props[key];
    if (prop?.type === "title" && Array.isArray(prop.title)) {
      const title = prop.title.map(t => t.plain_text || "").join("");
      if (title.trim()) return title.trim();
    }
  }
  if (Array.isArray(page?.title)) {
    const title = page.title.map(t => t.plain_text || "").join("");
    if (title.trim()) return title.trim();
  }
  return "Notion Page";
}

function blockToText(block) {
  const type = block?.type;
  if (!type) return "";
  const body = block[type] || {};
  const rich = body.rich_text || body.title || [];
  if (!Array.isArray(rich)) return "";
  const text = rich.map(t => t.plain_text || "").join("");
  return normalizeText(text);
}

async function fetchPageBlocks(pageId, token) {
  const blocks = [];
  let cursor = "";
  while (true) {
    const url = new URL(`${NOTION_API}/blocks/${pageId}/children`);
    url.searchParams.set("page_size", "100");
    if (cursor) url.searchParams.set("start_cursor", cursor);
    const data = await fetchJson(url.toString(), {
      headers: buildHeaders(token)
    });
    const results = Array.isArray(data?.results) ? data.results : [];
    results.forEach(block => blocks.push(block));
    if (!data?.has_more || !data?.next_cursor) break;
    cursor = data.next_cursor;
  }
  return blocks;
}

async function listPagesFromDatabase(databaseId, token, { limit, lookbackIso } = {}) {
  const pages = [];
  let cursor = "";
  while (pages.length < limit) {
    const body = {
      page_size: Math.min(100, limit - pages.length)
    };
    if (lookbackIso) {
      body.filter = {
        timestamp: "last_edited_time",
        last_edited_time: { on_or_after: lookbackIso }
      };
    }
    if (cursor) body.start_cursor = cursor;
    const data = await fetchJson(`${NOTION_API}/databases/${databaseId}/query`, {
      method: "POST",
      headers: buildHeaders(token),
      body: JSON.stringify(body)
    });
    const results = Array.isArray(data?.results) ? data.results : [];
    results.forEach(page => pages.push(page));
    if (!data?.has_more || !data?.next_cursor) break;
    cursor = data.next_cursor;
  }
  return pages;
}

async function searchPages(token, { limit, query, lookbackIso } = {}) {
  const pages = [];
  let cursor = "";
  while (pages.length < limit) {
    const body = {
      page_size: Math.min(100, limit - pages.length),
      filter: { value: "page", property: "object" }
    };
    if (query) body.query = query;
    if (cursor) body.start_cursor = cursor;
    const data = await fetchJson(`${NOTION_API}/search`, {
      method: "POST",
      headers: buildHeaders(token),
      body: JSON.stringify(body)
    });
    const results = Array.isArray(data?.results) ? data.results : [];
    results.forEach(page => pages.push(page));
    if (!data?.has_more || !data?.next_cursor) break;
    cursor = data.next_cursor;
  }
  if (lookbackIso) {
    return pages.filter(page => {
      const edited = page?.last_edited_time ? Date.parse(page.last_edited_time) : NaN;
      return Number.isFinite(edited) && edited >= Date.parse(lookbackIso);
    });
  }
  return pages;
}

export async function syncNotion({ userId = "local", limit } = {}) {
  const token = getNotionToken(userId);
  if (!token) return { ok: false, error: "notion_token_missing" };

  const maxItems = Number(limit || process.env.NOTION_SYNC_LIMIT || 50);
  const lookbackDays = Number(process.env.NOTION_LOOKBACK_DAYS || 30);
  const lookbackIso = lookbackDays > 0 ? new Date(Date.now() - lookbackDays * 86400000).toISOString() : "";
  const databaseIds = parseList(process.env.NOTION_DATABASE_IDS);
  const pageIds = parseList(process.env.NOTION_PAGE_IDS);
  const searchQuery = String(process.env.NOTION_SEARCH_QUERY || "").trim();

  let pages = [];
  for (const dbId of databaseIds) {
    if (pages.length >= maxItems) break;
    const results = await listPagesFromDatabase(dbId, token, { limit: maxItems - pages.length, lookbackIso });
    pages = pages.concat(results);
  }
  if (pageIds.length) {
    for (const pageId of pageIds) {
      if (pages.length >= maxItems) break;
      const page = await fetchJson(`${NOTION_API}/pages/${pageId}`, {
        headers: buildHeaders(token)
      });
      if (page) pages.push(page);
    }
  }
  if (!pages.length) {
    const results = await searchPages(token, { limit: maxItems, query: searchQuery, lookbackIso });
    pages = pages.concat(results);
  }

  const summary = { ok: true, ingested: 0, skipped: 0, errors: [] };
  for (const page of pages.slice(0, maxItems)) {
    try {
      const pageId = page?.id;
      if (!pageId) continue;
      const title = extractTitleFromPage(page);
      const blocks = await fetchPageBlocks(pageId, token);
      const bodyText = blocks.map(blockToText).filter(Boolean).join("\n");
      const text = normalizeText(`${title}\n${bodyText}`);
      const result = await ingestConnectorDocument({
        collectionId: "notion",
        sourceType: "notion",
        title,
        sourceUrl: page?.url || "",
        text,
        tags: ["notion"],
        metadata: {
          pageId,
          created_time: page?.created_time || "",
          last_edited_time: page?.last_edited_time || ""
        },
        sourceGroup: "notion",
        occurredAt: page?.last_edited_time || page?.created_time || ""
      });
      if (result?.skipped) summary.skipped += 1;
      else if (result?.ok) summary.ingested += 1;
      else summary.errors.push({ id: pageId, error: result?.error || "ingest_failed" });
    } catch (err) {
      summary.errors.push({ id: page?.id || "", error: err?.message || "notion_sync_failed" });
    }
  }

  setRagMeta("connector_sync:notion", new Date().toISOString());
  return summary;
}

export function isNotionConfigured(userId = "local") {
  return Boolean(getNotionToken(userId));
}
