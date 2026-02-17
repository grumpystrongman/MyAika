import OpenAI from "openai";
import { getEmbedding } from "./embeddings.js";
import { searchChunkIds, getChunksByIds, listMeetingSummaries } from "./vectorStore.js";
import { selectMetaRoutes } from "./metaRag.js";

let openaiClient = null;

function getOpenAIClient() {
  const apiKey = process.env.OPENAI_API_KEY || "";
  if (!apiKey) return null;
  if (!openaiClient) openaiClient = new OpenAI({ apiKey });
  return openaiClient;
}

function buildContext(chunks) {
  return chunks.map((chunk, idx) => {
    const header = `[${idx + 1}] ${chunk.meeting_title || "Meeting"} (${chunk.occurred_at || ""}) | ${chunk.chunk_id}`;
    return `${header}\n${chunk.text}`.trim();
  }).join("\n\n");
}

function startOfDay(date) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

function endOfDay(date) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate(), 23, 59, 59, 999);
}

function getWeekStart(date) {
  const day = date.getDay();
  const diff = (day + 6) % 7;
  const start = new Date(date);
  start.setDate(date.getDate() - diff);
  return startOfDay(start);
}

function parseRelativeDateRange(question) {
  const text = String(question || "").toLowerCase();
  const now = new Date();
  if (!text) return null;

  const lastDaysMatch = text.match(/\b(last|past)\s+(\d+)\s+days?\b/);
  if (lastDaysMatch) {
    const days = Number(lastDaysMatch[2]);
    if (Number.isFinite(days) && days > 0) {
      const end = endOfDay(now);
      const start = startOfDay(new Date(now.getTime() - days * 86400000));
      return { dateFrom: start.toISOString(), dateTo: end.toISOString(), label: `past_${days}_days` };
    }
  }

  if (text.includes("last week") || text.includes("past week")) {
    const end = endOfDay(now);
    const start = startOfDay(new Date(now.getTime() - 7 * 86400000));
    return { dateFrom: start.toISOString(), dateTo: end.toISOString(), label: "last_week" };
  }

  if (text.includes("this week")) {
    const start = getWeekStart(now);
    const end = endOfDay(now);
    return { dateFrom: start.toISOString(), dateTo: end.toISOString(), label: "this_week" };
  }

  if (text.includes("yesterday")) {
    const y = new Date(now);
    y.setDate(now.getDate() - 1);
    const start = startOfDay(y);
    const end = endOfDay(y);
    return { dateFrom: start.toISOString(), dateTo: end.toISOString(), label: "yesterday" };
  }

  if (text.includes("today")) {
    const start = startOfDay(now);
    const end = endOfDay(now);
    return { dateFrom: start.toISOString(), dateTo: end.toISOString(), label: "today" };
  }

  if (text.includes("last month") || text.includes("past month")) {
    const end = endOfDay(now);
    const start = startOfDay(new Date(now.getFullYear(), now.getMonth() - 1, now.getDate()));
    return { dateFrom: start.toISOString(), dateTo: end.toISOString(), label: "last_month" };
  }

  return null;
}

function wantsSummary(question) {
  const text = String(question || "").toLowerCase();
  return /\b(summary|summarize|recap|overview)\b/.test(text);
}

function buildSummaryContext(summaries = []) {
  return summaries
    .map((row, idx) => {
      const summary = row.summary_json ? JSON.parse(row.summary_json) : null;
      const decisions = row.decisions_json ? JSON.parse(row.decisions_json) : [];
      const tasks = row.tasks_json ? JSON.parse(row.tasks_json) : [];
      const nextSteps = row.next_steps_json ? JSON.parse(row.next_steps_json) : [];
      const overview = Array.isArray(summary?.overview) ? summary.overview.join(" ") : "";
      const tldr = summary?.tldr || overview || summary?.summary || "";
      const taskText = tasks.length
        ? tasks.map(task => task.task || task.title || task.text || "").filter(Boolean).join("; ")
        : "";
      const decisionText = decisions.length ? decisions.join("; ") : "";
      const nextText = nextSteps.length ? nextSteps.join("; ") : "";
      const header = `[S${idx + 1}] ${row.title || "Meeting"} (${row.occurred_at || ""}) | summary:${row.id}`;
      const body = [
        tldr ? `Summary: ${tldr}` : "",
        decisionText ? `Decisions: ${decisionText}` : "",
        taskText ? `Action Items: ${taskText}` : "",
        nextText ? `Next Steps: ${nextText}` : ""
      ].filter(Boolean).join("\n");
      return `${header}\n${body}`.trim();
    })
    .filter(Boolean)
    .join("\n\n");
}

function resolveRoutes(question, ragModel = "auto") {
  const model = String(ragModel || "").trim().toLowerCase();
  const lower = String(question || "").toLowerCase();
  if (model && model !== "auto") {
    if (model === "trading") return [{ id: "trading", filters: { meetingIdPrefix: "trading:" } }];
    if (model === "fireflies") return [{ id: "fireflies", filters: { meetingType: "fireflies" } }];
    if (model === "signals") return [{ id: "signals", filters: { meetingIdPrefix: "signals:" } }];
    if (model === "memory") return [{ id: "memory", filters: { meetingIdPrefix: "memory:" } }];
    if (model === "feedback") return [{ id: "feedback", filters: { meetingIdPrefix: "feedback:" } }];
    if (model === "recordings" || model === "recording") return [{ id: "recordings", filters: { meetingIdPrefix: "recording:" } }];
    if (model === "all") return [{ id: "all", filters: {} }];
    return [{ id: model, filters: { meetingIdPrefix: `rag:${model}:` } }];
  }

  const wantsMeetings = /\b(fireflies|meeting|meetings|transcript|minutes|action items|decisions|recap|summary)\b/i.test(lower);
  const wantsTrading = /\b(stock|stocks|crypto|trading|options|portfolio|ticker|market)\b/i.test(lower);
  const wantsSignals = /\b(signals?|macro|alerts?)\b/i.test(lower);

  const routes = [];
  if (wantsMeetings) routes.push({ id: "fireflies", filters: { meetingType: "fireflies" } });
  if (wantsTrading) routes.push({ id: "trading", filters: { meetingIdPrefix: "trading:" } });
  if (wantsSignals) routes.push({ id: "signals", filters: { meetingIdPrefix: "signals:" } });
  if (!routes.length) routes.push({ id: "all", filters: {} });
  return routes;
}

async function resolveRoutesAsync(question, ragModel = "auto") {
  const normalized = String(ragModel || "").trim().toLowerCase();
  if (normalized === "auto") {
    try {
      const metaRoutes = await selectMetaRoutes(question);
      if (metaRoutes.length) return metaRoutes;
    } catch {
      // fall back to heuristics
    }
  }
  return resolveRoutes(question, ragModel);
}

function deriveCollectionInfo(meetingId = "", chunkId = "") {
  const raw = String(meetingId || chunkId || "");
  if (!raw) return { sourceType: "unknown", collectionId: "" };
  if (raw.startsWith("summary:")) return { sourceType: "summary", collectionId: "fireflies" };
  if (raw.startsWith("memory:")) return { sourceType: "memory", collectionId: "memory" };
  if (raw.startsWith("feedback:")) return { sourceType: "feedback", collectionId: "feedback" };
  if (raw.startsWith("recording:")) return { sourceType: "recording", collectionId: "recordings" };
  if (raw.startsWith("trading:")) return { sourceType: "trading", collectionId: "trading" };
  if (raw.startsWith("signals:")) return { sourceType: "signals", collectionId: "signals" };
  if (raw.startsWith("rag:")) {
    const parts = raw.split(":");
    const collectionId = parts[1] || "custom";
    return { sourceType: "custom", collectionId };
  }
  return { sourceType: "fireflies", collectionId: "fireflies" };
}

function mergeRouteResults(routeResults, totalTopK, minPerRoute) {
  const combined = [];
  const used = new Set();
  for (const route of routeResults) {
    const items = route.items || [];
    let count = 0;
    for (const item of items) {
      if (used.has(item.chunk_id)) continue;
      combined.push(item);
      used.add(item.chunk_id);
      count += 1;
      if (count >= minPerRoute) break;
    }
  }

  const remaining = [];
  for (const route of routeResults) {
    const items = route.items || [];
    for (const item of items) {
      if (used.has(item.chunk_id)) continue;
      remaining.push(item);
    }
  }
  remaining.sort((a, b) => (a.distance ?? 0) - (b.distance ?? 0));
  for (const item of remaining) {
    if (combined.length >= totalTopK) break;
    if (used.has(item.chunk_id)) continue;
    combined.push(item);
    used.add(item.chunk_id);
  }

  return combined.slice(0, totalTopK);
}

const GAP_STOPWORDS = new Set([
  "the", "a", "an", "and", "are", "as", "at", "be", "by", "for", "from", "has", "have", "how",
  "i", "in", "is", "it", "of", "on", "or", "that", "this", "to", "was", "were", "what", "when",
  "where", "who", "why", "with", "you", "your", "me", "my", "we", "our", "about", "tell", "explain",
  "summarize", "summary", "recap", "meeting", "meetings", "notes", "rag", "model", "collection"
]);

function extractTopic(question) {
  let text = String(question || "").trim();
  if (!text) return "";
  text = text.replace(/^rag:\s*[a-z0-9_-]+/i, "");
  text = text.replace(/^(what is|who is|tell me about|explain|summarize|summary of|recap of)\s+/i, "");
  const tokens = text
    .toLowerCase()
    .replace(/[^a-z0-9\s_-]/g, " ")
    .split(/\s+/)
    .map(token => token.trim())
    .filter(token => token.length > 2 && !GAP_STOPWORDS.has(token));
  if (!tokens.length) return "";
  return tokens.slice(0, 6).join(" ").trim();
}

export async function answerRagQuestionRouted(question, { topK = 8, filters = {}, ragModel = "auto", conversationContext = "" } = {}) {
  const query = String(question || "").trim();
  const convoPrefix = conversationContext ? `Conversation context:\n${conversationContext}\n\n` : "";
  if (!query) {
    return { answer: "Question required.", citations: [], debug: { retrievedCount: 0, filters } };
  }

  const autoRange = parseRelativeDateRange(query);
  const baseFilters = { ...(filters || {}) };
  if (!baseFilters.dateFrom && autoRange?.dateFrom) baseFilters.dateFrom = autoRange.dateFrom;
  if (!baseFilters.dateTo && autoRange?.dateTo) baseFilters.dateTo = autoRange.dateTo;

  const routes = await resolveRoutesAsync(query, ragModel);
  const effectiveTopK = Number(topK || process.env.RAG_TOP_K || 8);
  const minPerRoute = Math.min(3, Math.max(1, Math.floor(effectiveTopK / Math.max(1, routes.length))));
  const useSummaryMode = wantsSummary(query) && (baseFilters.dateFrom || baseFilters.dateTo);

  let summaryContext = "";
  const summaryCitations = [];
  if (useSummaryMode) {
    for (const route of routes) {
      const routeFilters = { ...(route.filters || {}), ...baseFilters };
      const summaryRows = listMeetingSummaries({
        dateFrom: routeFilters.dateFrom,
        dateTo: routeFilters.dateTo,
        meetingType: routeFilters.meetingType,
        meetingIdPrefix: routeFilters.meetingIdPrefix,
        limit: Math.max(6, effectiveTopK)
      });
      if (!summaryRows.length) continue;
      summaryContext = buildSummaryContext(summaryRows);
      summaryRows.forEach(row => {
        const summary = row.summary_json ? JSON.parse(row.summary_json) : null;
        const overview = Array.isArray(summary?.overview) ? summary.overview.join(" ") : "";
        const tldr = summary?.tldr || overview || "";
        const meta = deriveCollectionInfo(row.id, `summary:${row.id}`);
        summaryCitations.push({
          meeting_title: row.title || "Meeting",
          occurred_at: row.occurred_at || "",
          chunk_id: `summary:${row.id}`,
          snippet: tldr || "Summary not available.",
          source_type: meta.sourceType,
          collection_id: meta.collectionId
        });
      });
      if (summaryContext) break;
    }
  }

  const embedding = await getEmbedding(query);
  const searchLimit = Math.max(effectiveTopK * 4, effectiveTopK, 24);
  const matches = await searchChunkIds(embedding, searchLimit);
  const orderedIds = matches.map(m => m.chunk_id).filter(Boolean);

  const routeResults = [];
  for (const route of routes) {
    const routeFilters = { ...(route.filters || {}), ...baseFilters };
    const rows = getChunksByIds(orderedIds, routeFilters).filter(row => {
      if (!row?.meeting_id) return false;
      if (route.id === "meta") return true;
      return !String(row.meeting_id).startsWith("rag:meta:");
    });
    const byId = new Map(rows.map(row => [row.chunk_id, row]));
    const ordered = matches
      .map(match => {
        const row = byId.get(match.chunk_id);
        if (!row || !row.text) return null;
        return { ...row, distance: match.distance, routeId: route.id };
      })
      .filter(Boolean);
    routeResults.push({ id: route.id, filters: routeFilters, items: ordered });
  }

  const mergedChunks = mergeRouteResults(routeResults, effectiveTopK, minPerRoute);
  const context = buildContext(mergedChunks);

  let answer = "I don't know based on the provided context.";
  const combinedContext = [summaryContext, context].filter(Boolean).join("\n\n");
  const client = getOpenAIClient();
  if (client && combinedContext) {
    const system = "Answer using ONLY the provided context. If the answer is not in the context, say you don't know.";
    const user = `${convoPrefix}Question: ${query}\n\nContext:\n${combinedContext}`;
    const model = process.env.OPENAI_MODEL || "gpt-4o-mini";
    const response = await client.responses.create({
      model,
      input: [
        { role: "system", content: [{ type: "input_text", text: system }] },
        { role: "user", content: [{ type: "input_text", text: user }] }
      ],
      max_output_tokens: Number(process.env.OPENAI_MAX_OUTPUT_TOKENS || 300)
    });
    answer = response?.output_text || answer;
  } else if (combinedContext) {
    const totalCitations = mergedChunks.length + summaryCitations.length;
    answer = `Context retrieved (${totalCitations} citations). Configure OPENAI_API_KEY for natural-language answers.`;
  }

  const citations = [
    ...summaryCitations,
    ...mergedChunks.map(chunk => {
      const meta = deriveCollectionInfo(chunk.meeting_id, chunk.chunk_id);
      return {
        meeting_title: chunk.meeting_title || "Meeting",
        occurred_at: chunk.occurred_at || "",
        chunk_id: chunk.chunk_id,
        snippet: chunk.text,
        source_type: meta.sourceType,
        collection_id: meta.collectionId,
        route_id: chunk.routeId || ""
      };
    })
  ];

  const ragUnknown = /i don't know based on the provided context/i.test(String(answer || ""));
  let gap = null;
  if (!citations.length || ragUnknown) {
    const topic = extractTopic(query);
    if (topic) {
      gap = {
        action: "propose_rag_model",
        topic,
        reason: citations.length ? "answer_unknown" : "no_citations"
      };
    }
  }

  return {
    answer,
    citations,
    gap,
    debug: {
      retrievedCount: mergedChunks.length,
      summaryCount: summaryCitations.length,
      filters: baseFilters,
      routes: routes.map(route => route.id),
      autoDateRange: autoRange?.label || null
    }
  };
}
