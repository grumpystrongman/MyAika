import { answerRagQuestionRouted } from "../src/rag/router.js";

function parseArgs() {
  const args = process.argv.slice(2);
  const query = args.find(arg => !arg.startsWith("--")) || "Summarize the last meeting notes.";
  const modelArg = args.find(arg => arg.startsWith("--model="));
  const topKArg = args.find(arg => arg.startsWith("--topK="));
  return {
    query,
    ragModel: modelArg ? modelArg.split("=").slice(1).join("=") : "auto",
    topK: topKArg ? Number(topKArg.split("=").slice(1).join("=")) : 6
  };
}

async function run() {
  const { query, ragModel, topK } = parseArgs();
  const result = await answerRagQuestionRouted(query, { ragModel, topK });
  const preview = {
    answer: result.answer,
    citations: result.citations?.slice(0, 3) || [],
    debug: result.debug
  };
  console.log(JSON.stringify(preview, null, 2));
}

run().catch(err => {
  console.error(JSON.stringify({ ok: false, error: err?.message || String(err) }, null, 2));
  process.exit(1);
});
