import crypto from "node:crypto";
import { embeddingsCreate } from "../llm/openaiClient.js";

let cachedDim = null;

function normalizeText(text) {
  return String(text || "").replace(/\s+/g, " ").trim();
}

function resolveEmbeddingDim() {
  const override = Number(process.env.RAG_EMBEDDING_DIM || 0);
  if (Number.isFinite(override) && override > 0) return override;
  const model = process.env.OPENAI_EMBEDDING_MODEL || "text-embedding-3-small";
  if (model.includes("3-large")) return 3072;
  if (model.includes("3-small")) return 1536;
  if (model.includes("ada-002")) return 1536;
  return 1536;
}

function allowTestFallback() {
  if (process.env.NODE_ENV === "production") return false;
  return true;
}

function fallbackEmbedding(text, dim) {
  const cleaned = normalizeText(text);
  const size = Number.isFinite(dim) && dim > 0 ? dim : 1536;
  const vec = new Float32Array(size);
  if (!cleaned) return vec;
  const hash = crypto.createHash("sha256").update(cleaned).digest();
  for (let i = 0; i < size; i += 1) {
    const byte = hash[i % hash.length];
    vec[i] = (byte / 127.5) - 1;
  }
  let norm = 0;
  for (let i = 0; i < size; i += 1) {
    norm += vec[i] * vec[i];
  }
  norm = Math.sqrt(norm);
  if (norm > 0) {
    for (let i = 0; i < size; i += 1) {
      vec[i] /= norm;
    }
  }
  return vec;
}

async function embedOpenAI(text) {
  const apiKey = process.env.OPENAI_API_KEY || "";
  const model = process.env.OPENAI_EMBEDDING_MODEL || "text-embedding-3-small";
  const cleaned = normalizeText(text);
  const dim = resolveEmbeddingDim();
  if (!cleaned) return new Float32Array(dim);
  if (!apiKey) {
    if (allowTestFallback()) {
      return fallbackEmbedding(cleaned, dim);
    }
    throw new Error("openai_api_key_missing");
  }
  const response = await embeddingsCreate({ model, input: cleaned });
  const embedding = response?.data?.[0]?.embedding || [];
  return Float32Array.from(embedding);
}

export async function getEmbedding(text) {
  return await embedOpenAI(text);
}

export async function getEmbeddingDimension(sampleText = "dimension probe") {
  if (cachedDim) return cachedDim;
  const vec = await getEmbedding(sampleText);
  cachedDim = vec.length;
  return cachedDim;
}
