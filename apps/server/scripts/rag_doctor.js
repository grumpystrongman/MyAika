import "dotenv/config";
import { getVectorStoreStatus, getRagMeta } from "../src/rag/vectorStore.js";
import { getEmbeddingConfig } from "../src/rag/embeddings.js";

function toNumber(value) {
  const num = Number(value);
  return Number.isFinite(num) ? num : null;
}

function main() {
  const embedding = getEmbeddingConfig();
  const storedDimRaw = getRagMeta("embedding_dim");
  const storedDim = toNumber(storedDimRaw);
  const status = getVectorStoreStatus();
  const mismatch = storedDim !== null && Number(embedding.resolvedDim) !== storedDim;

  const output = {
    ok: !mismatch,
    embedding: {
      provider: embedding.provider,
      model: embedding.model,
      resolvedDim: embedding.resolvedDim,
      storedDim
    },
    vectorStore: {
      dbPath: status.dbPath,
      vecEnabled: status.vecEnabled,
      ftsEnabled: status.ftsEnabled,
      chunks: status.chunks
    }
  };

  console.log(JSON.stringify(output, null, 2));

  if (mismatch) {
    console.error(
      [
        "Embedding dimension mismatch detected.",
        "Options:",
        "1) Keep current RAG store: align RAG_EMBEDDINGS_PROVIDER/RAG_LOCAL_EMBEDDING_MODEL to storedDim.",
        "2) Rebuild/re-ingest RAG data after switching embedding models."
      ].join("\n")
    );
    process.exit(1);
  }
}

main();
