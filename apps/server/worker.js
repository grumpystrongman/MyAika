import { initDb } from "./storage/db.js";
import { runMigrations } from "./storage/schema.js";
import { processWorkQueue } from "./src/workers/runner.js";
import { resetStaleWork } from "./src/workers/queue.js";

const workerId = process.env.WORKER_ID || `worker-${process.pid}`;
const intervalMs = Number(process.env.WORKER_POLL_INTERVAL_MS || 5000);
const resetMs = Number(process.env.WORKER_STALE_RESET_MS || 30 * 60 * 1000);
const batchLimit = Number(process.env.WORKER_BATCH_LIMIT || 2);
const types = String(process.env.WORKER_TYPES || "")
  .split(",")
  .map(item => item.trim())
  .filter(Boolean);

initDb();
runMigrations();

async function tick() {
  try {
    resetStaleWork({ maxAgeMs: resetMs });
    await processWorkQueue({ workerId, types, limit: batchLimit });
  } catch {
    // swallow worker errors to keep loop alive
  }
}

if (String(process.env.WORKER_RUN_ONCE || "") === "1") {
  tick().finally(() => process.exit(0));
} else {
  tick();
  setInterval(tick, Math.max(2000, intervalMs));
}

process.on("SIGTERM", () => process.exit(0));
process.on("SIGINT", () => process.exit(0));
