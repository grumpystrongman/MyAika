import { rebuildChunksFts } from "../src/rag/vectorStore.js";

async function run() {
  const batchSize = Number(process.env.RAG_FTS_BATCH_SIZE || 500);
  const result = rebuildChunksFts({ batchSize });
  console.log(JSON.stringify({ ok: true, ...result }, null, 2));
}

run().catch(err => {
  console.error(JSON.stringify({ ok: false, error: err?.message || String(err) }, null, 2));
  process.exit(1);
});
