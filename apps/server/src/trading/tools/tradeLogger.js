import fs from "node:fs";
import path from "node:path";
import { repoRoot, ensureDir, nowIso } from "../../../storage/utils.js";

const tradingDir = path.join(repoRoot, "data", "trading");
const TRADE_LOG_PATH = path.join(tradingDir, "TRADE_LOG.jsonl");
const TRADE_STATE_PATH = path.join(tradingDir, "TRADE_STATE.md");
const DAILY_SUMMARY_PATH = path.join(tradingDir, "DAILY_SUMMARY.md");
const ERROR_LOG_PATH = path.join(tradingDir, "ERROR_LOG.md");

function ensureTradingDir() {
  ensureDir(tradingDir);
}

function appendLine(filePath, line) {
  ensureTradingDir();
  fs.appendFileSync(filePath, line + "\n");
}

export function appendTradeLog(record = {}) {
  const payload = {
    ts: nowIso(),
    ...record
  };
  appendLine(TRADE_LOG_PATH, JSON.stringify(payload));
  return { ok: true, path: TRADE_LOG_PATH };
}

export function appendTradeState(state = {}) {
  const stamp = nowIso();
  const header = `\n## ${stamp}\n`;
  appendLine(TRADE_STATE_PATH, header.trimEnd());
  appendLine(TRADE_STATE_PATH, "```json");
  appendLine(TRADE_STATE_PATH, JSON.stringify({ ts: stamp, ...state }, null, 2));
  appendLine(TRADE_STATE_PATH, "```");
  return { ok: true, path: TRADE_STATE_PATH };
}

export function appendDailySummary(summary = {}) {
  const stamp = nowIso();
  appendLine(DAILY_SUMMARY_PATH, `\n## ${stamp}`);
  appendLine(DAILY_SUMMARY_PATH, JSON.stringify({ ts: stamp, ...summary }, null, 2));
  return { ok: true, path: DAILY_SUMMARY_PATH };
}

export function writeErrorLog(error = {}) {
  const stamp = nowIso();
  appendLine(ERROR_LOG_PATH, `\n## ${stamp}`);
  appendLine(ERROR_LOG_PATH, JSON.stringify({ ts: stamp, ...error }, null, 2));
  return { ok: true, path: ERROR_LOG_PATH };
}

export function writeLog(entry = {}) {
  const level = String(entry.level || entry.severity || "info").toLowerCase();
  if (level === "error" || level === "critical") {
    return writeErrorLog(entry);
  }
  return appendTradeState({ type: "log", ...entry });
}

export function getTradeLogPaths() {
  return {
    tradeLog: TRADE_LOG_PATH,
    tradeState: TRADE_STATE_PATH,
    dailySummary: DAILY_SUMMARY_PATH,
    errorLog: ERROR_LOG_PATH
  };
}
