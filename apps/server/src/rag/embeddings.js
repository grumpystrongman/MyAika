import OpenAI from "openai";
import crypto from "node:crypto";

let localPipelinePromise = null;
let localModelId = null;
let openaiClient = null;
let cachedDim = null;

function normalizeText(text) {
  return String(text || "").replace(/\s+/g, " ").trim();
}

function resolveFallbackDim(provider) {
  const override = Number(process.env.RAG_EMBEDDING_DIM || 0);
  if (Number.isFinite(override) && override > 0) return override;
  if (provider === "openai") {
    const model = process.env.OPENAI_EMBEDDING_MODEL || "text-embedding-3-small";
    if (model.includes("3-large")) return 3072;
    if (model.includes("3-small")) return 1536;
    if (model.includes("ada-002")) return 1536;
    return 1536;
  }
  return 384;
}

function fallbackEmbedding(text, dim) {
  const cleaned = normalizeText(text);
  const size = Number.isFinite(dim) && dim > 0 ? dim : 384;
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

async function getLocalPipeline() {
  const modelId = process.env.RAG_LOCAL_EMBEDDING_MODEL || "Xenova/all-MiniLM-L6-v2";
  if (!localPipelinePromise || localModelId !== modelId) {
    const { pipeline } = await import("@xenova/transformers");
    localPipelinePromise = pipeline("feature-extraction", modelId, { quantized: true });
    localModelId = modelId;
  }
  return localPipelinePromise;
}

async function embedLocal(text) {
  const cleaned = normalizeText(text);
  if (!cleaned) return new Float32Array();
  const extractor = await getLocalPipeline();
  const output = await extractor(cleaned, { pooling: "mean", normalize: true });
  return new Float32Array(output.data);
}

async function embedOpenAI(text) {
  const apiKey = process.env.OPENAI_API_KEY || "";
  if (!apiKey) throw new Error("openai_api_key_missing");
  if (!openaiClient) openaiClient = new OpenAI({ apiKey });
  const model = process.env.OPENAI_EMBEDDING_MODEL || "text-embedding-3-small";
  const cleaned = normalizeText(text);
  if (!cleaned) return new Float32Array();
  const response = await openaiClient.embeddings.create({ model, input: cleaned });
  const embedding = response?.data?.[0]?.embedding || [];
  return Float32Array.from(embedding);
}

export async function getEmbedding(text) {
  const provider = (process.env.RAG_EMBEDDINGS_PROVIDER || "local").toLowerCase();
  if (provider === "openai") {
    try {
      return await embedOpenAI(text);
    } catch (err) {
      console.warn("OpenAI embeddings failed, using fallback:", err?.message || err);
      return fallbackEmbedding(text, resolveFallbackDim(provider));
    }
  }
  try {
    return await embedLocal(text);
  } catch (err) {
    console.warn("Local embeddings failed, using fallback:", err?.message || err);
    return fallbackEmbedding(text, resolveFallbackDim(provider));
  }
}

export async function getEmbeddingDimension(sampleText = "dimension probe") {
  if (cachedDim) return cachedDim;
  const vec = await getEmbedding(sampleText);
  cachedDim = vec.length;
  return cachedDim;
}
