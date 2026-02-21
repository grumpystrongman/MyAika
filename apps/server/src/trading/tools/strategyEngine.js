import { buildLongTermSignal } from "../signalEngine.js";
import { getScenarioDetail } from "../scenarios.js";

function normalizeSnapshot(snapshot = {}) {
  if (Array.isArray(snapshot)) return snapshot;
  if (Array.isArray(snapshot?.symbols)) return snapshot.symbols;
  if (Array.isArray(snapshot?.data)) return snapshot.data;
  return [];
}

function computeAtr(candles = [], window = 14) {
  if (!Array.isArray(candles) || candles.length < 2) return null;
  const start = Math.max(1, candles.length - window);
  const slice = candles.slice(start);
  let sum = 0;
  let count = 0;
  for (let i = 1; i < slice.length; i += 1) {
    const prev = slice[i - 1];
    const cur = slice[i];
    const high = Number(cur.h ?? cur.high);
    const low = Number(cur.l ?? cur.low);
    const prevClose = Number(prev.c ?? prev.close);
    if (!Number.isFinite(high) || !Number.isFinite(low) || !Number.isFinite(prevClose)) continue;
    const tr = Math.max(high - low, Math.abs(high - prevClose), Math.abs(low - prevClose));
    sum += tr;
    count += 1;
  }
  if (!count) return null;
  return sum / count;
}

function extractLastClose(candles = []) {
  if (!Array.isArray(candles) || !candles.length) return null;
  const last = candles[candles.length - 1];
  const close = Number(last.c ?? last.close);
  return Number.isFinite(close) ? close : null;
}

function toBias(action = "") {
  const upper = String(action || "").toUpperCase();
  if (upper.includes("ACCUMULATE") || upper.includes("BUY")) return "BUY";
  if (upper.includes("AVOID") || upper.includes("REDUCE") || upper.includes("SELL")) return "SELL";
  return "WATCH";
}

export async function strategyEvaluate({ snapshot, horizonDays = 180 } = {}) {
  const items = normalizeSnapshot(snapshot);
  const proposals = [];
  for (const item of items) {
    const symbol = String(item.symbol || "").trim().toUpperCase();
    if (!symbol) continue;
    const assetClass = String(item.assetClass || item.asset_class || "crypto").toLowerCase();
    let detail = null;
    try {
      detail = await getScenarioDetail({ symbol, assetClass, windowDays: horizonDays });
    } catch {
      detail = null;
    }
    const signal = buildLongTermSignal(detail || {}, { horizonDays });
    const bias = toBias(signal.action);
    const lastClose = extractLastClose(item.candles || []);
    const atr = computeAtr(item.candles || []);
    const stopDistance = Number.isFinite(atr) ? atr * 2 : (Number.isFinite(lastClose) ? lastClose * 0.02 : null);
    const entryPrice = Number.isFinite(lastClose) ? lastClose : null;
    const stopLoss = Number.isFinite(entryPrice) && Number.isFinite(stopDistance)
      ? (bias === "SELL" ? entryPrice + stopDistance : entryPrice - stopDistance)
      : null;
    const takeProfit = Number.isFinite(entryPrice) && Number.isFinite(stopDistance)
      ? (bias === "SELL" ? entryPrice - stopDistance * 2 : entryPrice + stopDistance * 2)
      : null;

    proposals.push({
      symbol,
      assetClass,
      bias,
      entryPrice,
      stopLoss,
      takeProfit,
      confidence: signal.confidence || 0.4,
      rationale: signal.reasons?.slice(0, 4) || [],
      source: "scenario"
    });
  }
  return { proposals };
}
