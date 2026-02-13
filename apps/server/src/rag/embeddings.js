import OpenAI from "openai";

let localPipelinePromise = null;
let localModelId = null;
let openaiClient = null;
let cachedDim = null;

function normalizeText(text) {
  return String(text || "").replace(/\s+/g, " ").trim();
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
    return embedOpenAI(text);
  }
  return embedLocal(text);
}

export async function getEmbeddingDimension(sampleText = "dimension probe") {
  if (cachedDim) return cachedDim;
  const vec = await getEmbedding(sampleText);
  cachedDim = vec.length;
  return cachedDim;
}
