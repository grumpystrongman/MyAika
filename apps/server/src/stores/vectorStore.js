import * as rag from "../rag/vectorStore.js";
import { resolveStoreContext, withStoreContext } from "./context.js";

export function getVectorStore({ userId, tenantId } = {}) {
  const ctx = resolveStoreContext({ userId, tenantId });
  const run = (fn) => withStoreContext(ctx, fn);
  return {
    ctx,
    init: () => run(() => rag.initRagStore({ userId: ctx.userId })),
    upsertVectors: (chunks, embeddings) => run(() => rag.upsertVectors(chunks, embeddings)),
    searchChunkIds: (embedding, topK) => run(() => rag.searchChunkIds(embedding, topK)),
    searchChunkIdsLexical: (query, topK) => run(() => rag.searchChunkIdsLexical(query, topK)),
    persistHnsw: () => run(() => rag.persistHnsw()),
    getStatus: () => run(() => rag.getVectorStoreStatus()),
    getFtsStatus: () => run(() => rag.getFtsStatus())
  };
}
