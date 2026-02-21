import crypto from "node:crypto";
import { getDb } from "../../../storage/db.js";
import { nowIso } from "../../../storage/utils.js";
import { getTradingLimits } from "./soul.js";
import { getPaperAccountState, getPaperPositions, resolvePaperAccountId } from "./paperEngine.js";

function makeId() {
  if (crypto.randomUUID) return crypto.randomUUID();
  return crypto.randomBytes(16).toString("hex");
}

function normalizeSymbol(symbol) {
  return String(symbol || "").trim().toUpperCase();
}

function baseAsset(symbol) {
  const raw = normalizeSymbol(symbol);
  if (!raw) return "";
  const first = raw.split(/[-/]/)[0] || raw;
  return first.replace(/PERP$/i, "");
}

function toNumber(value, fallback = null) {
  const num = Number(value);
  return Number.isFinite(num) ? num : fallback;
}

function normalizeSide(value) {
  const raw = String(value || "").toLowerCase();
  if (raw === "sell" || raw === "short") return "sell";
  return "buy";
}

function recordRiskCheck({ accountId, mode, trade, decision, reasons }) {
  const db = getDb();
  const id = makeId();
  db.prepare(
    `INSERT INTO trading_risk_checks (id, account_id, mode, trade_json, decision, reasons_json, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)`
  ).run(
    id,
    accountId,
    mode,
    JSON.stringify(trade || {}),
    decision,
    JSON.stringify(reasons || []),
    nowIso()
  );
  return id;
}

export function riskCheck({ trade = {}, accountState, mode = "paper", userId = "local" } = {}) {
  const limits = getTradingLimits();
  const reasons = [];
  const normalizedMode = String(mode || "paper").toLowerCase();
  const symbol = normalizeSymbol(trade.symbol);
  if (!symbol) reasons.push("symbol_required");

  const asset = baseAsset(symbol);
  if (limits.allowedAssets.length && asset && !limits.allowedAssets.includes(asset)) {
    reasons.push("asset_not_allowed");
  }

  const side = normalizeSide(trade.side);
  const quantity = toNumber(trade.quantity, null);
  const entryPrice = toNumber(trade.entryPrice ?? trade.entry_price ?? trade.price, null);
  const stopLoss = toNumber(trade.stopLoss ?? trade.stop_loss, null);
  const leverage = toNumber(trade.leverage, 1) || 1;

  if (!Number.isFinite(quantity) || quantity <= 0) reasons.push("quantity_required");
  if (!Number.isFinite(entryPrice) || entryPrice <= 0) reasons.push("entry_price_required");
  if (!Number.isFinite(stopLoss) || stopLoss <= 0) reasons.push("stop_loss_required");

  if (Number.isFinite(leverage) && leverage > limits.maxLeverage) {
    reasons.push("leverage_exceeds_max");
  }

  let account = accountState;
  let openPositions = 0;
  let accountId = "";
  if (normalizedMode === "paper") {
    account = account || getPaperAccountState(userId);
    openPositions = getPaperPositions(userId).length;
    accountId = resolvePaperAccountId(userId);
  } else {
    accountId = `${userId}:live`;
    openPositions = Number(accountState?.openPositions || 0);
  }

  const equity = Number(account?.equity || 0);
  if (!equity || equity <= 0) reasons.push("account_equity_required");

  if (openPositions >= limits.maxOpenPositions) {
    reasons.push("max_open_positions_reached");
  }

  const riskPerUnit = Number.isFinite(entryPrice) && Number.isFinite(stopLoss)
    ? Math.abs(entryPrice - stopLoss)
    : null;
  const riskValue = Number.isFinite(riskPerUnit) && Number.isFinite(quantity)
    ? riskPerUnit * quantity
    : null;
  const riskPct = Number.isFinite(riskValue) && Number.isFinite(equity) && equity > 0
    ? (riskValue / equity) * 100
    : null;

  if (Number.isFinite(riskPct) && riskPct > limits.maxRiskPercent) {
    reasons.push("risk_per_trade_exceeds_max");
  }

  const dailyLossLimit = limits.dailyLossLimit;
  const dailyPnl = Number(account?.dailyPnl || 0);
  if (Number.isFinite(dailyLossLimit) && dailyLossLimit > 0 && dailyPnl <= -Math.abs(dailyLossLimit)) {
    reasons.push("daily_loss_cap_breached");
  }

  const decision = reasons.length ? "fail" : "pass";

  const adjustedQuantity = Number.isFinite(riskPerUnit) && Number.isFinite(equity) && equity > 0
    ? Math.max(0, ((limits.maxRiskPercent / 100) * equity) / riskPerUnit)
    : null;

  const payload = {
    symbol,
    side,
    quantity,
    entryPrice,
    stopLoss,
    leverage,
    assetClass: trade.assetClass || trade.asset_class || "crypto"
  };

  const riskCheckId = recordRiskCheck({
    accountId,
    mode: normalizedMode,
    trade: payload,
    decision,
    reasons
  });

  return {
    ok: decision === "pass",
    decision,
    reasons,
    riskCheckId,
    metrics: {
      equity,
      riskPerUnit,
      riskValue,
      riskPct,
      dailyPnl
    },
    limits,
    adjustedTrade: Number.isFinite(adjustedQuantity) ? { quantity: Number(adjustedQuantity.toFixed(6)), leverage: Math.min(leverage, limits.maxLeverage) } : null,
    accountState: account
  };
}
