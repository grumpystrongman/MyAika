import fs from "node:fs";
import path from "node:path";
import { repoRoot } from "../../../storage/utils.js";

const SOUL_PATH = path.join(repoRoot, "SOUL.md");

function parseList(value, fallback = []) {
  const raw = String(value || "").trim();
  if (!raw) return fallback;
  return raw.split(/[;,\n]/).map(item => item.trim()).filter(Boolean);
}

export function readSoul() {
  try {
    return fs.readFileSync(SOUL_PATH, "utf-8");
  } catch {
    return "";
  }
}

export function getTradingLimits() {
  const maxRiskPercent = Number(process.env.MAX_RISK_PERCENT || process.env.TRADING_MAX_RISK_PERCENT || 2);
  const maxLeverage = Number(process.env.MAX_LEVERAGE || process.env.TRADING_MAX_LEVERAGE || 5);
  const maxOpenPositions = Number(process.env.MAX_OPEN_POSITIONS || process.env.TRADING_MAX_OPEN_POSITIONS || 2);
  const dailyLossLimit = Number(process.env.DAILY_LOSS_LIMIT || process.env.TRADING_DAILY_LOSS_LIMIT || 0);
  const allowedAssets = parseList(
    process.env.TRADING_ALLOWED_ASSETS || process.env.TRADING_ALLOWED_SYMBOLS || "BTC,ETH,SOL"
  ).map(item => item.toUpperCase());
  const liveToken = String(process.env.LIVE_TRADING_CONFIRMATION_TOKEN || "I ACKNOWLEDGE LIVE TRADING USES REAL FUNDS");

  return {
    maxRiskPercent: Number.isFinite(maxRiskPercent) ? maxRiskPercent : 2,
    maxLeverage: Number.isFinite(maxLeverage) ? maxLeverage : 5,
    maxOpenPositions: Number.isFinite(maxOpenPositions) ? maxOpenPositions : 2,
    dailyLossLimit: Number.isFinite(dailyLossLimit) ? dailyLossLimit : 0,
    allowedAssets,
    liveToken
  };
}

export function getSoulSnapshot() {
  return {
    text: readSoul(),
    limits: getTradingLimits()
  };
}
