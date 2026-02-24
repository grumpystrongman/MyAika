import crypto from "node:crypto";
import { embeddingsCreate } from "../llm/openaiClient.js";

let cachedDim = null;
let cachedProvider = null;
let cachedModel = null;
let localPipeline = null;
let localPipelinePromise = null;
let localPipelineModel = null;

function normalizeText(text) {
  return String(text || "").replace(/\s+/g, " ").trim();
}

function normalizeProvider(value) {
  const raw = String(value || "").trim().toLowerCase();
  if (!raw) return "openai";
  if (["local", "xenova", "transformers"].includes(raw)) return "local";
  if (["hash", "test", "fake"].includes(raw)) return "hash";
  return "openai";
}

function getEmbeddingProvider() {
  return normalizeProvider(process.env.RAG_EMBEDDINGS_PROVIDER || process.env.EMBEDDINGS_PROVIDER || "openai");
}

function resolveOpenAIEmbeddingModel() {
  return process.env.OPENAI_EMBEDDING_MODEL || "text-embedding-3-small";
}

function resolveLocalEmbeddingModel() {
  return process.env.RAG_LOCAL_EMBEDDING_MODEL || "Xenova/all-MiniLM-L6-v2";
}

function resolveOpenAIEmbeddingDim(model) {
  const name = String(model || "").toLowerCase();
  if (name.includes("3-large")) return 3072;
  if (name.includes("3-small")) return 1536;
  if (name.includes("ada-002")) return 1536;
  return 1536;
}

function resolveLocalEmbeddingDim(model) {
  const name = String(model || "").toLowerCase();
  const hints = [
    { pattern: /(bge|e5|gte)[-_]?large/, dim: 1024 },
    { pattern: /(bge|e5|gte)[-_]?base|mpnet|all-mpnet/, dim: 768 },
    { pattern: /mini[-_ ]?lm|(bge|e5|gte)[-_]?small/, dim: 384 }
  ];
  for (const hint of hints) {
    if (hint.pattern.test(name)) return hint.dim;
  }
  return 384;
}

function resolveEmbeddingDim(provider, model) {
  const override = Number(process.env.RAG_EMBEDDING_DIM || 0);
  if (Number.isFinite(override) && override > 0) return override;
  if (provider === "local") {
    return resolveLocalEmbeddingDim(model || resolveLocalEmbeddingModel());
  }
  return resolveOpenAIEmbeddingDim(model || resolveOpenAIEmbeddingModel());
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

function syncEmbeddingCache(provider, model) {
  if (cachedProvider !== provider || cachedModel !== model) {
    cachedProvider = provider;
    cachedModel = model;
    cachedDim = null;
  }
}

async function getLocalPipeline(model) {
  if (localPipeline && localPipelineModel === model) return localPipeline;
  if (!localPipelinePromise || localPipelineModel !== model) {
    localPipelineModel = model;
    localPipelinePromise = (async () => {
      const { pipeline } = await import("@xenova/transformers");
      return pipeline("feature-extraction", model, { quantized: true });
    })();
  }
  localPipeline = await localPipelinePromise;
  return localPipeline;
}

async function embedLocal(text, model) {
  const cleaned = normalizeText(text);
  const dim = resolveEmbeddingDim("local", model);
  if (!cleaned) {
    cachedDim = dim;
    return new Float32Array(dim);
  }
  try {
    const extractor = await getLocalPipeline(model);
    const output = await extractor(cleaned, { pooling: "mean", normalize: true });
    const raw = output?.data || output;
    const vec = raw instanceof Float32Array ? raw : Float32Array.from(raw || []);
    cachedDim = vec.length || dim;
    return vec.length ? vec : new Float32Array(dim);
  } catch (err) {
    if (allowTestFallback()) {
      const vec = fallbackEmbedding(cleaned, dim);
      cachedDim = vec.length;
      return vec;
    }
    throw err;
  }
}

async function embedOpenAI(text, model) {
  const apiKey = process.env.OPENAI_API_KEY || "";
  const cleaned = normalizeText(text);
  const dim = resolveEmbeddingDim("openai", model);
  if (!cleaned) {
    cachedDim = dim;
    return new Float32Array(dim);
  }
  if (!apiKey) {
    if (allowTestFallback()) {
      const vec = fallbackEmbedding(cleaned, dim);
      cachedDim = vec.length;
      return vec;
    }
    throw new Error("openai_api_key_missing");
  }
  const response = await embeddingsCreate({ model, input: cleaned });
  const embedding = response?.data?.[0]?.embedding || [];
  const vec = embedding instanceof Float32Array ? embedding : Float32Array.from(embedding);
  cachedDim = vec.length || dim;
  return vec;
}

async function embedHash(text, model) {
  const dim = resolveEmbeddingDim("hash", model);
  const vec = fallbackEmbedding(text, dim);
  cachedDim = vec.length;
  return vec;
}

export async function getEmbedding(text) {
  const provider = getEmbeddingProvider();
  const model = provider === "local" ? resolveLocalEmbeddingModel() : resolveOpenAIEmbeddingModel();
  syncEmbeddingCache(provider, model);
  if (provider === "local") return await embedLocal(text, model);
  if (provider === "hash") return await embedHash(text, model);
  return await embedOpenAI(text, model);
}

export async function getEmbeddingDimension(sampleText = "dimension probe") {
  const provider = getEmbeddingProvider();
  const model = provider === "local" ? resolveLocalEmbeddingModel() : resolveOpenAIEmbeddingModel();
  syncEmbeddingCache(provider, model);
  if (cachedDim) return cachedDim;
  const vec = await getEmbedding(sampleText);
  cachedDim = vec.length;
  return cachedDim;
}
