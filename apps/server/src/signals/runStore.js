import fs from "node:fs";
import path from "node:path";
import { getSignalsDataDir } from "./config.js";

function ensureDir(dir) {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

function nowIso() {
  return new Date().toISOString();
}

export function startSignalsRun() {
  const dataDir = getSignalsDataDir();
  const runsDir = path.join(dataDir, "runs");
  const logsDir = path.join(dataDir, "logs");
  ensureDir(runsDir);
  ensureDir(logsDir);
  const runId = `signals_${Date.now()}`;
  const logPath = path.join(logsDir, `${runId}.log`);
  const reportPath = path.join(runsDir, `${runId}.json`);
  const start = nowIso();
  fs.writeFileSync(logPath, `[${start}] run_start ${runId}\n`);
  return {
    runId,
    startedAt: start,
    logPath,
    reportPath
  };
}

export function appendRunLog(run, message) {
  if (!run?.logPath) return;
  const line = `[${nowIso()}] ${message}\n`;
  fs.appendFileSync(run.logPath, line);
}

export function finalizeSignalsRun(run, report) {
  if (!run?.reportPath) return;
  const payload = {
    run_id: run.runId,
    started_at: run.startedAt,
    finished_at: nowIso(),
    ...report
  };
  fs.writeFileSync(run.reportPath, JSON.stringify(payload, null, 2));
}

export function loadSignalsReport(reportPath) {
  try {
    const raw = fs.readFileSync(reportPath, "utf8");
    return JSON.parse(raw || "{}");
  } catch {
    return null;
  }
}

