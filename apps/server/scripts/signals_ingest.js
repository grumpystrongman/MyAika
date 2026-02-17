import "dotenv/config";
import { runSignalsIngestion } from "../src/signals/pipeline.js";

function parseArgs(argv = []) {
  const result = { force: false, sourceIds: [] };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--force") {
      result.force = true;
      continue;
    }
    if (arg === "--source" || arg === "--sourceId") {
      const next = argv[i + 1];
      if (next) {
        result.sourceIds.push(next);
        i += 1;
      }
    }
  }
  return result;
}

async function main() {
  const opts = parseArgs(process.argv.slice(2));
  const result = await runSignalsIngestion(opts);
  console.log(JSON.stringify(result, null, 2));
}

main().catch(err => {
  console.error(err?.message || err);
  process.exit(1);
});

