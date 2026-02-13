import OpenAI from "openai";
import { getEmbedding } from "./embeddings.js";
import { searchChunkIds, getChunksByIds } from "./vectorStore.js";

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

export async function answerRagQuestion(question, { topK = 8, filters = {} } = {}) {
  const query = String(question || "").trim();
  if (!query) {
    return { answer: "Question required.", citations: [], debug: { retrievedCount: 0, filters } };
  }

  const effectiveTopK = Number(topK || process.env.RAG_TOP_K || 8);
  const embedding = await getEmbedding(query);
  const searchLimit = Math.max(effectiveTopK * 3, effectiveTopK);
  const matches = await searchChunkIds(embedding, searchLimit);
  const orderedIds = matches.map(m => m.chunk_id).filter(Boolean);
  const rows = getChunksByIds(orderedIds, filters);
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
    const user = `Question: ${query}\n\nContext:\n${context}`;
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
      filters
    }
  };
}
