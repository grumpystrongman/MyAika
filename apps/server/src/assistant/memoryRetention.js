import { pruneMemoryEntries } from "../../storage/memory.js";

let retentionInterval = null;

function parseDays(value) {
  const num = Number(value);
  return Number.isFinite(num) && num > 0 ? num : 0;
}

export function getRetentionConfig() {
  const tier1 = parseDays(process.env.MEMORY_RETENTION_DAYS_TIER1 || "");
  const tier2 = parseDays(process.env.MEMORY_RETENTION_DAYS_TIER2 || "");
  const tier3 = parseDays(process.env.MEMORY_RETENTION_DAYS_TIER3 || "");
  const config = {};
  if (tier1) config[1] = tier1;
  if (tier2) config[2] = tier2;
  if (tier3) config[3] = tier3;
  return config;
}

export function runMemoryRetention({ userId = "local", dryRun = false } = {}) {
  const config = getRetentionConfig();
  const hasConfig = Object.keys(config).length > 0;
  if (!hasConfig) {
    return { skipped: true, reason: "no_retention_configured" };
  }
  return pruneMemoryEntries({ retentionDaysByTier: config, userId, dryRun });
}

export function startMemoryRetentionLoop() {
  if (retentionInterval) return;
  const intervalMs = Number(process.env.MEMORY_RETENTION_INTERVAL_MS || 6 * 60 * 60 * 1000);
  const runOnStartup = String(process.env.MEMORY_RETENTION_RUN_ON_STARTUP || "0") === "1";
  if (runOnStartup) {
    try {
      runMemoryRetention();
    } catch {
      // ignore retention failures
    }
  }
  retentionInterval = setInterval(() => {
    try {
      runMemoryRetention();
    } catch {
      // ignore retention failures
    }
  }, Math.max(60000, intervalMs));
}

export function stopMemoryRetentionLoop() {
  if (retentionInterval) clearInterval(retentionInterval);
  retentionInterval = null;
}
