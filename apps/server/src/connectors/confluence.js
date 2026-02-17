import { ingestConnectorDocument } from "./ingest.js";
import { fetchJson, parseList, normalizeText, stripHtml } from "./utils.js";
import { setRagMeta } from "../rag/vectorStore.js";

function getConfluenceConfig() {
  const baseUrl = String(process.env.CONFLUENCE_BASE_URL || "").replace(/\/+$/, "");
  const email = String(process.env.CONFLUENCE_EMAIL || "");
  const token = String(process.env.CONFLUENCE_API_TOKEN || "");
  return { baseUrl, email, token };
}

function buildAuthHeader(email, token) {
  const raw = `${email}:${token}`;
  const encoded = Buffer.from(raw).toString("base64");
  return `Basic ${encoded}`;
}

function buildCql({ spaceKeys = [], lookbackDays = 0 } = {}) {
  const clauses = ["type=page"];
  if (spaceKeys.length) {
    clauses.push(`space in (${spaceKeys.map(key => `"${key}"`).join(",")})`);
  }
  if (Number.isFinite(lookbackDays) && lookbackDays > 0) {
    const since = new Date(Date.now() - lookbackDays * 86400000).toISOString().slice(0, 10);
    clauses.push(`lastmodified >= "${since}"`);
  }
  return clauses.join(" AND ");
}

export async function syncConfluence({ limit } = {}) {
  const { baseUrl, email, token } = getConfluenceConfig();
  if (!baseUrl || !email || !token) return { ok: false, error: "confluence_not_configured" };

  const maxItems = Number(limit || process.env.CONFLUENCE_SYNC_LIMIT || 40);
  const lookbackDays = Number(process.env.CONFLUENCE_LOOKBACK_DAYS || 90);
  const spaceKeys = parseList(process.env.CONFLUENCE_SPACE_KEYS);
  const customCql = String(process.env.CONFLUENCE_CQL || "").trim();
  const cql = customCql || buildCql({ spaceKeys, lookbackDays });

  const url = new URL(`${baseUrl}/wiki/rest/api/content/search`);
  url.searchParams.set("cql", cql);
  url.searchParams.set("limit", String(maxItems));
  url.searchParams.set("expand", "body.storage,version,space");

  const data = await fetchJson(url.toString(), {
    headers: {
      "Authorization": buildAuthHeader(email, token),
      "Content-Type": "application/json"
    }
  });

  const results = Array.isArray(data?.results) ? data.results : [];
  const summary = { ok: true, ingested: 0, skipped: 0, errors: [] };

  for (const page of results.slice(0, maxItems)) {
    try {
      const title = page?.title || "Confluence Page";
      const html = page?.body?.storage?.value || "";
      const text = normalizeText(stripHtml(html));
      const spaceKey = page?.space?.key || "";
      const updated = page?.version?.when || "";
      const sourceUrl = page?._links?.base && page?._links?.webui
        ? `${page._links.base}${page._links.webui}`
        : "";
      const result = await ingestConnectorDocument({
        collectionId: "confluence",
        sourceType: "confluence_page",
        title,
        sourceUrl,
        text,
        tags: ["confluence", spaceKey].filter(Boolean),
        metadata: {
          pageId: page?.id || "",
          spaceKey,
          version: page?.version?.number || 0
        },
        sourceGroup: spaceKey ? `confluence:${spaceKey}` : "confluence",
        occurredAt: updated
      });
      if (result?.skipped) summary.skipped += 1;
      else if (result?.ok) summary.ingested += 1;
      else summary.errors.push({ id: page?.id || "", error: result?.error || "ingest_failed" });
    } catch (err) {
      summary.errors.push({ id: page?.id || "", error: err?.message || "confluence_sync_failed" });
    }
  }

  setRagMeta("connector_sync:confluence", new Date().toISOString());
  return summary;
}

export function isConfluenceConfigured() {
  const { baseUrl, email, token } = getConfluenceConfig();
  return Boolean(baseUrl && email && token);
}
