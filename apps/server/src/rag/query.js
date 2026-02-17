import OpenAI from "openai";
import { getEmbedding } from "./embeddings.js";
import { searchChunkIds, getChunksByIds, listMeetingSummaries } from "./vectorStore.js";

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

export async function answerRagQuestion(question, { topK = 8, filters = {}, conversationContext = "" } = {}) {
  const query = String(question || "").trim();
  const convoPrefix = conversationContext ? `Conversation context:\n${conversationContext}\n\n` : "";
  if (!query) {
    return { answer: "Question required.", citations: [], debug: { retrievedCount: 0, filters } };
  }

  const autoRange = parseRelativeDateRange(query);
  const effectiveFilters = {
    ...(filters || {}),
    dateFrom: filters?.dateFrom || autoRange?.dateFrom,
    dateTo: filters?.dateTo || autoRange?.dateTo
  };
  const effectiveTopK = Number(topK || process.env.RAG_TOP_K || 8);
  const useSummaryMode = wantsSummary(query) && (effectiveFilters.dateFrom || effectiveFilters.dateTo);
  if (useSummaryMode) {
    const summaryRows = listMeetingSummaries({
      dateFrom: effectiveFilters.dateFrom,
      dateTo: effectiveFilters.dateTo,
      meetingType: effectiveFilters.meetingType,
      meetingIdPrefix: effectiveFilters.meetingIdPrefix,
      limit: Math.max(6, effectiveTopK)
    });
    if (summaryRows.length) {
      const context = buildSummaryContext(summaryRows);
      let answer = "I don't know based on the provided context.";
      const client = getOpenAIClient();
      if (client && context) {
        const system = "Answer using ONLY the provided context. If the answer is not in the context, say you don't know.";
        const user = `${convoPrefix}Question: ${query}\n\nContext:\n${context}`;
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
      } else if (context) {
        answer = `Context retrieved (${summaryRows.length} meeting summaries). Configure OPENAI_API_KEY for natural-language answers.`;
      }
      const citations = summaryRows.map(row => {
        const summary = row.summary_json ? JSON.parse(row.summary_json) : null;
        const overview = Array.isArray(summary?.overview) ? summary.overview.join(" ") : "";
        const tldr = summary?.tldr || overview || "";
        return {
          meeting_title: row.title || "Meeting",
          occurred_at: row.occurred_at || "",
          chunk_id: `summary:${row.id}`,
          snippet: tldr || "Summary not available."
        };
      });
      return {
        answer,
        citations,
        debug: {
          retrievedCount: summaryRows.length,
          filters: effectiveFilters,
          summaryMode: true,
          autoDateRange: autoRange?.label || null
        }
      };
    }
  }

  const embedding = await getEmbedding(query);
  const searchLimit = Math.max(effectiveTopK * 3, effectiveTopK);
  const matches = await searchChunkIds(embedding, searchLimit);
  const orderedIds = matches.map(m => m.chunk_id).filter(Boolean);
  const rows = getChunksByIds(orderedIds, effectiveFilters);
  const byId = new Map(rows.map(row => [row.chunk_id, row]));
  const ordered = matches
    .map(match => ({ ...byId.get(match.chunk_id), distance: match.distance }))
    .filter(item => item && item.text);
  const top = ordered.slice(0, effectiveTopK);

  let answer = "I don't know based on the provided context.";
  const context = buildContext(top);
  const client = getOpenAIClient();
  if (client && context) {
    const system = "Answer using ONLY the provided context. If the answer is not in the context, say you don't know.";
    const user = `${convoPrefix}Question: ${query}\n\nContext:\n${context}`;
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
  } else if (context) {
    answer = `Context retrieved (${top.length} chunks). Configure OPENAI_API_KEY for natural-language answers.`;
  }

  const citations = top.map(chunk => ({
    meeting_title: chunk.meeting_title || "Meeting",
    occurred_at: chunk.occurred_at || "",
    chunk_id: chunk.chunk_id,
    snippet: chunk.text
  }));

  return {
    answer,
    citations,
    debug: {
      retrievedCount: top.length,
      filters: effectiveFilters,
      autoDateRange: autoRange?.label || null
    }
  };
}
