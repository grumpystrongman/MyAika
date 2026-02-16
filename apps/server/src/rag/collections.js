import OpenAI from "openai";
import {
  listRagCollections,
  getRagCollection,
  upsertRagCollection,
  deleteRagCollection,
  upsertTradingSource
} from "./vectorStore.js";
import { crawlTradingSources } from "../trading/knowledgeRag.js";

function slugify(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40);
}

function buildFallbackSources(topic) {
  const slug = slugify(topic) || "markets";
  return [
    `https://en.wikipedia.org/wiki/${slug}`,
    `https://www.investopedia.com/search?q=${encodeURIComponent(topic)}`
  ];
}

async function suggestSources(topic, maxSources = 6) {
  const apiKey = process.env.OPENAI_API_KEY || "";
  if (!apiKey) return buildFallbackSources(topic).slice(0, maxSources);
  const client = new OpenAI({ apiKey });
  const system = [
    "You suggest canonical, high-quality sources for a new RAG model.",
    "Return JSON only: {\"sources\":[\"https://...\"]}.",
    "Prefer official or widely trusted sources. No paywalls."
  ].join(" ");
  const user = `Topic: ${topic}\nGive ${maxSources} URLs.`;
  try {
    const response = await client.responses.create({
      model: process.env.OPENAI_MODEL || "gpt-4o-mini",
      input: [
        { role: "system", content: [{ type: "input_text", text: system }] },
        { role: "user", content: [{ type: "input_text", text: user }] }
      ],
      max_output_tokens: 200
    });
    const text = response?.output_text || "";
    const match = text.match(/\{[\s\S]*\}/);
    if (match) {
      const parsed = JSON.parse(match[0]);
      const list = Array.isArray(parsed?.sources) ? parsed.sources : [];
      const cleaned = list.map(u => String(u || "").trim()).filter(u => u.startsWith("http"));
      if (cleaned.length) return cleaned.slice(0, maxSources);
    }
  } catch {
    // fallback below
  }
  return buildFallbackSources(topic).slice(0, maxSources);
}

export function listRagModels() {
  const builtins = [
    { id: "trading", title: "Trading Knowledge", description: "Trading sources, RSS, and scenarios.", kind: "built-in" },
    { id: "fireflies", title: "Fireflies Meetings", description: "Meeting transcripts and summaries.", kind: "built-in" }
  ];
  const custom = listRagCollections();
  return [...builtins, ...custom];
}

export async function createRagModel({ topic, name, description = "", sources = [], autoDiscover = true } = {}) {
  const title = String(name || topic || "").trim();
  if (!title) throw new Error("topic_required");
  const id = slugify(title);
  if (!id) throw new Error("invalid_topic");
  if (getRagCollection(id)) throw new Error("rag_model_exists");
  const record = upsertRagCollection({
    id,
    title,
    description: description || `Knowledge model for ${title}`,
    kind: "custom"
  });
  let urlList = Array.isArray(sources) ? sources.map(u => String(u || "").trim()).filter(u => u.startsWith("http")) : [];
  if (!urlList.length && autoDiscover) {
    urlList = await suggestSources(title, 6);
  }
  const unique = Array.from(new Set(urlList));
  unique.forEach(url => {
    upsertTradingSource({
      url,
      tags: ["rag", title.toLowerCase()],
      enabled: true,
      collectionId: id
    });
  });
  if (unique.length) {
    const entries = unique.map(url => ({
      url,
      tags: ["rag"],
      sourceGroup: `${id}::${url}`
    }));
    crawlTradingSources({ entries, collectionId: id }).catch(() => {});
  }
  return {
    id,
    title: record.title,
    description: record.description,
    sources: unique
  };
}

export function removeRagModel(id) {
  deleteRagCollection(id);
}
