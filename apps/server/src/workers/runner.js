import { claimWork, completeWork, resetStaleWork } from "./queue.js";
import { queueFirefliesSync } from "../rag/firefliesIngest.js";
import { queueTradingSourceCrawl, crawlTradingSources } from "../trading/knowledgeRag.js";
import { crawlTradingRssSources } from "../trading/rssIngest.js";
import { crawlTradingYoutubeSources } from "../trading/youtubeIngest.js";
import { executor } from "../../mcp/index.js";

let workerInterval = null;

async function runTool(name, params, context) {
  return await executor.callTool({ name, params, context });
}

export async function executeWorkItem(job) {
  const payload = job?.payload || {};
  switch (job?.type) {
    case "ingest.fireflies.sync":
      return queueFirefliesSync(payload);
    case "ingest.trading.source":
      return queueTradingSourceCrawl(payload?.id, payload);
    case "ingest.trading.rss":
      return await crawlTradingRssSources(payload);
    case "ingest.trading.knowledge":
      return await crawlTradingSources(payload);
    case "ingest.trading.youtube":
      return await crawlTradingYoutubeSources(payload);
    case "execute.action":
      return await runTool("action.run", payload?.params || {}, payload?.context || {});
    case "execute.desktop":
      return await runTool("desktop.run", payload?.params || {}, payload?.context || {});
    default:
      throw new Error("work_type_unhandled");
  }
}

export async function processWorkQueue({ workerId = "worker", types = [], limit = 2 } = {}) {
  const claimed = claimWork({ workerId, types, limit });
  const results = [];
  for (const job of claimed) {
    try {
      const result = await executeWorkItem(job);
      completeWork({ id: job.id, status: "completed", result });
      results.push({ id: job.id, status: "completed" });
    } catch (err) {
      const shouldRetry = Number(job.maxRetries || 0) >= Number(job.attempt || 0);
      const status = shouldRetry ? "pending" : "failed";
      completeWork({ id: job.id, status, error: err?.message || "work_failed" });
      results.push({ id: job.id, status, error: err?.message || "work_failed" });
    }
  }
  return results;
}

export function startWorkerLoop() {
  if (workerInterval) return;
  const mode = String(process.env.WORKER_EXECUTION_MODE || "inline").toLowerCase();
  if (mode !== "inline") return;
  const workerId = process.env.WORKER_ID || `worker-${process.pid}`;
  const intervalMs = Number(process.env.WORKER_POLL_INTERVAL_MS || 5000);
  const resetMs = Number(process.env.WORKER_STALE_RESET_MS || 30 * 60 * 1000);

  workerInterval = setInterval(() => {
    try {
      resetStaleWork({ maxAgeMs: resetMs });
      processWorkQueue({ workerId }).catch(() => {});
    } catch {
      // ignore worker loop failures
    }
  }, Math.max(2000, intervalMs));
}

export function stopWorkerLoop() {
  if (workerInterval) clearInterval(workerInterval);
  workerInterval = null;
}
