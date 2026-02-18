import { initDb } from "../storage/db.js";
import { runMigrations } from "../storage/schema.js";
import { runMemoryRetention } from "../src/assistant/memoryRetention.js";

function parseArgs() {
  return {
    dryRun: process.argv.includes("--dry-run") || process.argv.includes("--dryrun")
  };
}

function main() {
  initDb();
  runMigrations();
  const args = parseArgs();
  const result = runMemoryRetention({ userId: "local", dryRun: args.dryRun });
  console.log(JSON.stringify({ ok: true, result }, null, 2));
}

main();
