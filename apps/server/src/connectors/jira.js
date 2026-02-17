import { ingestConnectorDocument } from "./ingest.js";
import { fetchJson, parseList, normalizeText, stripHtml } from "./utils.js";
import { setRagMeta } from "../rag/vectorStore.js";

function getJiraConfig() {
  const baseUrl = String(process.env.JIRA_BASE_URL || "").replace(/\/+$/, "");
  const email = String(process.env.JIRA_EMAIL || "");
  const token = String(process.env.JIRA_API_TOKEN || "");
  return { baseUrl, email, token };
}

function buildAuthHeader(email, token) {
  const raw = `${email}:${token}`;
  const encoded = Buffer.from(raw).toString("base64");
  return `Basic ${encoded}`;
}

function adfToText(node) {
  if (!node) return "";
  if (Array.isArray(node)) return node.map(adfToText).join(" ");
  if (typeof node === "string") return node;
  const text = node.text || "";
  const content = Array.isArray(node.content) ? node.content.map(adfToText).join(" ") : "";
  return `${text} ${content}`.trim();
}

function issueDescriptionToText(fields) {
  if (!fields) return "";
  if (fields.description) {
    if (typeof fields.description === "string") return fields.description;
    const adf = adfToText(fields.description);
    if (adf) return adf;
  }
  if (fields.renderedFields?.description) {
    return stripHtml(fields.renderedFields.description);
  }
  return "";
}

export async function syncJira({ limit } = {}) {
  const { baseUrl, email, token } = getJiraConfig();
  if (!baseUrl || !email || !token) return { ok: false, error: "jira_not_configured" };

  const maxItems = Number(limit || process.env.JIRA_SYNC_LIMIT || 50);
  const lookbackDays = Number(process.env.JIRA_LOOKBACK_DAYS || 30);
  const projects = parseList(process.env.JIRA_PROJECTS);
  const customJql = String(process.env.JIRA_JQL || "").trim();

  let jql = customJql;
  if (!jql) {
    const projectClause = projects.length ? `project in (${projects.map(p => `"${p}"`).join(",")})` : "";
    const since = lookbackDays > 0 ? `updated >= -${lookbackDays}d` : "";
    jql = [projectClause, since].filter(Boolean).join(" AND ") || "ORDER BY updated DESC";
    if (!jql.includes("ORDER BY")) jql = `${jql} ORDER BY updated DESC`;
  }

  const body = {
    jql,
    maxResults: maxItems,
    fields: [
      "summary",
      "description",
      "updated",
      "created",
      "assignee",
      "reporter",
      "status",
      "project",
      "issuetype"
    ],
    expand: ["renderedFields"]
  };

  const data = await fetchJson(`${baseUrl}/rest/api/3/search`, {
    method: "POST",
    headers: {
      "Authorization": buildAuthHeader(email, token),
      "Content-Type": "application/json"
    },
    body: JSON.stringify(body)
  });

  const issues = Array.isArray(data?.issues) ? data.issues : [];
  const summary = { ok: true, ingested: 0, skipped: 0, errors: [] };

  for (const issue of issues.slice(0, maxItems)) {
    try {
      const key = issue?.key || "";
      const fields = issue?.fields || {};
      const title = `${key} ${fields.summary || ""}`.trim() || key;
      const description = issueDescriptionToText(fields);
      const status = fields.status?.name || "";
      const assignee = fields.assignee?.displayName || "";
      const reporter = fields.reporter?.displayName || "";
      const text = normalizeText([
        `Summary: ${fields.summary || ""}`,
        status ? `Status: ${status}` : "",
        assignee ? `Assignee: ${assignee}` : "",
        reporter ? `Reporter: ${reporter}` : "",
        description
      ].filter(Boolean).join("\n"));
      const result = await ingestConnectorDocument({
        collectionId: "jira",
        sourceType: "jira_issue",
        title,
        sourceUrl: key ? `${baseUrl}/browse/${key}` : "",
        text,
        tags: ["jira", fields.project?.key || ""].filter(Boolean),
        metadata: {
          issueKey: key,
          project: fields.project?.key || "",
          issueType: fields.issuetype?.name || "",
          status
        },
        sourceGroup: fields.project?.key ? `jira:${fields.project.key}` : "jira",
        occurredAt: fields.updated || fields.created || ""
      });
      if (result?.skipped) summary.skipped += 1;
      else if (result?.ok) summary.ingested += 1;
      else summary.errors.push({ id: key, error: result?.error || "ingest_failed" });
    } catch (err) {
      summary.errors.push({ id: issue?.key || "", error: err?.message || "jira_sync_failed" });
    }
  }

  setRagMeta("connector_sync:jira", new Date().toISOString());
  return summary;
}

export function isJiraConfigured() {
  const { baseUrl, email, token } = getJiraConfig();
  return Boolean(baseUrl && email && token);
}
