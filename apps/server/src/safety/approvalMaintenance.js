import { cleanupStaleApprovals } from "../../storage/approvals.js";

let maintenanceInterval = null;

function toNumber(value, fallback) {
  const num = Number(value);
  return Number.isFinite(num) ? num : fallback;
}

export function runApprovalCleanupOnce() {
  const days = toNumber(process.env.APPROVAL_STALE_DAYS || process.env.APPROVAL_CLEANUP_DAYS, 7);
  if (!Number.isFinite(days) || days <= 0) return { updated: 0, cutoff: null };
  return cleanupStaleApprovals({ olderThanDays: days, decidedBy: "system", reason: "stale" });
}

export function startApprovalMaintenanceLoop() {
  if (maintenanceInterval) return;
  const intervalMs = toNumber(process.env.APPROVAL_CLEANUP_INTERVAL_MS, 6 * 60 * 60 * 1000);
  if (!Number.isFinite(intervalMs) || intervalMs <= 0) return;
  runApprovalCleanupOnce();
  maintenanceInterval = setInterval(() => {
    try {
      const result = runApprovalCleanupOnce();
      if (result.updated) {
        console.log(`Approval cleanup: ${result.updated} stale approvals denied.`);
      }
    } catch (err) {
      console.warn("approval cleanup failed", err?.message || err);
    }
  }, Math.max(60 * 1000, intervalMs));
}

export function stopApprovalMaintenanceLoop() {
  if (maintenanceInterval) clearInterval(maintenanceInterval);
  maintenanceInterval = null;
}
