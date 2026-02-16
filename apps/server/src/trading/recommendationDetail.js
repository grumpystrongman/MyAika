import { getScenarioDetail } from "./scenarios.js";
import { queryTradingKnowledge } from "./knowledgeRag.js";

function formatNumber(value, digits = 2) {
  const num = Number(value);
  if (!Number.isFinite(num)) return null;
  return Number(num.toFixed(digits));
}

function computeAtr(candles = [], period = 14) {
  if (!candles.length || candles.length <= period) return null;
  const trs = [];
  for (let i = 1; i < candles.length; i += 1) {
    const prevClose = candles[i - 1].c;
    const high = candles[i].h;
    const low = candles[i].l;
    const tr = Math.max(
      high - low,
      Math.abs(high - prevClose),
      Math.abs(low - prevClose)
    );
    trs.push(tr);
  }
  const slice = trs.slice(-period);
  const avg = slice.reduce((a, b) => a + b, 0) / slice.length;
  return formatNumber(avg, 4);
}

function computeWindowReturn(closes = [], days = 30) {
  if (!closes.length || closes.length <= days) return null;
  const start = closes[closes.length - 1 - days];
  const end = closes[closes.length - 1];
  if (!start) return null;
  return formatNumber(((end - start) / start) * 100, 2);
}

function buildRiskPlan({ lastClose, atr, bias }) {
  if (!lastClose) return {};
  const atrValue = atr || lastClose * 0.015;
  const stopDistance = atrValue * 2;
  const profitDistance = atrValue * 3;
  if (bias === "SELL") {
    return {
      stop: formatNumber(lastClose + stopDistance, 2),
      takeProfit: formatNumber(lastClose - profitDistance, 2),
      riskNote: "Short bias assumes a protective stop above recent swing highs."
    };
  }
  return {
    stop: formatNumber(lastClose - stopDistance, 2),
    takeProfit: formatNumber(lastClose + profitDistance, 2),
    riskNote: "Long bias assumes a protective stop below recent support."
  };
}

function summarizeCitations(citations = [], limit = 4) {
  return citations.slice(0, limit).map(cite => ({
    title: cite.meeting_title || "Knowledge",
    snippet: cite.snippet || "",
    occurred_at: cite.occurred_at || "",
    chunk_id: cite.chunk_id || ""
  }));
}

export async function buildRecommendationDetail({
  symbol,
  assetClass = "stock",
  bias = "WATCH",
  windowDays = 120,
  collectionId
} = {}) {
  const detail = await getScenarioDetail({ symbol, assetClass, windowDays, includeCandles: true });
  if (!detail || detail.error) {
    return { symbol, assetClass, bias, error: detail?.error || "analysis_failed" };
  }
  const candles = Array.isArray(detail.candles) ? detail.candles : [];
  const closes = candles.map(c => c.c).filter(v => Number.isFinite(v));
  const lastClose = closes.length ? closes[closes.length - 1] : null;
  const atr = computeAtr(candles, 14);
  const windowReturns = {
    r7d: computeWindowReturn(closes, 7),
    r30d: computeWindowReturn(closes, 30),
    r90d: computeWindowReturn(closes, 90),
    r180d: computeWindowReturn(closes, 180)
  };

  const riskPlan = buildRiskPlan({ lastClose, atr, bias });

  let tradeMemory = null;
  let knowledge = null;
  try {
    tradeMemory = await queryTradingKnowledge(`Trade outcomes and lessons for ${symbol}`, { topK: 4, collectionId });
  } catch {
    tradeMemory = null;
  }
  try {
    knowledge = await queryTradingKnowledge(`Key risks, catalysts, and setups for ${symbol}`, { topK: 6, collectionId });
  } catch {
    knowledge = null;
  }

  const sections = [
    {
      title: "Recommendation Snapshot",
      body: [
        `Bias: ${bias}. Data source: ${detail.provider || "market data"}.`,
        detail.startDate && detail.endDate ? `Window: ${detail.startDate} → ${detail.endDate} (${detail.windowDays}d).` : "",
        lastClose != null ? `Last close: ${formatNumber(lastClose, 2)}.` : "",
        detail.returnPct != null ? `Window return: ${detail.returnPct}%.` : "",
        `Returns: 7d ${windowReturns.r7d ?? "n/a"}%, 30d ${windowReturns.r30d ?? "n/a"}%, 90d ${windowReturns.r90d ?? "n/a"}%.`
      ].filter(Boolean).join(" ")
    },
    {
      title: "Trend & Momentum",
      body: [
        detail.trendLabel ? `Trend: ${detail.trendLabel}.` : "",
        detail.trendSlopePct != null ? `Slope: ${detail.trendSlopePct}% (log-price regression).` : "",
        detail.trendStrengthPct != null ? `Trend strength (R^2): ${detail.trendStrengthPct}%.` : "",
        detail.rsi14 ? `RSI(14): ${detail.rsi14}.` : "",
        detail.ma10 ? `MA10: ${detail.ma10}.` : "",
        detail.ma20 ? `MA20: ${detail.ma20}.` : "",
        detail.ma50 ? `MA50: ${detail.ma50}.` : "",
        detail.ma200 ? `MA200: ${detail.ma200}.` : "",
        detail.maAlignment ? detail.maAlignment : "",
        `Momentum: 5d ${detail.momentum5 ?? "n/a"}%, 10d ${detail.momentum10 ?? "n/a"}%, 20d ${detail.momentum20 ?? "n/a"}%.`
      ].filter(Boolean).join(" ")
    },
    {
      title: "Volatility & Drawdown",
      body: [
        detail.dailyVol ? `Daily vol: ${detail.dailyVol}%.` : "",
        detail.annualVol ? `Annualized vol: ${detail.annualVol}%.` : "",
        detail.volShort ? `Vol (10d): ${detail.volShort}%.` : "",
        detail.volLong ? `Vol (30d): ${detail.volLong}%.` : "",
        detail.volRegime ? detail.volRegime : "",
        detail.atr14 ? `ATR(14): ${detail.atr14}.` : "",
        detail.atrPct ? `ATR%: ${detail.atrPct}%.` : "",
        detail.maxDrawdownPct ? `Max drawdown: ${detail.maxDrawdownPct}%.` : "",
        detail.bestDayPct ? `Best day: ${detail.bestDayPct}%.` : "",
        detail.worstDayPct ? `Worst day: ${detail.worstDayPct}%.` : ""
      ].filter(Boolean).join(" ")
    },
    detail.winRate != null ? {
      title: "Tape & Win/Loss",
      body: [
        `Win rate: ${detail.winRate}% (${detail.upDays || 0} up / ${detail.downDays || 0} down).`,
        detail.avgUp != null ? `Avg up day: ${detail.avgUp}%.` : "",
        detail.avgDown != null ? `Avg down day: ${detail.avgDown}%.` : ""
      ].filter(Boolean).join(" ")
    } : null,
    {
      title: "Liquidity & Volume",
      body: [
        detail.avgVolume ? `Average volume: ${detail.avgVolume}.` : "",
        detail.recentVolume ? `Recent avg volume: ${detail.recentVolume}.` : "",
        detail.lastVolume ? `Last volume: ${detail.lastVolume}.` : "",
        detail.volumeChangePct ? `Volume vs avg: ${detail.volumeChangePct}%.` : ""
      ].filter(Boolean).join(" ")
    },
    {
      title: "Key Levels & Range",
      body: [
        detail.rangeLow ? `Range low: ${detail.rangeLow}.` : "",
        detail.rangeHigh ? `Range high: ${detail.rangeHigh}.` : "",
        detail.rangePct ? `Range span: ${detail.rangePct}%.` : "",
        detail.support ? `Support: ${detail.support}.` : "",
        detail.resistance ? `Resistance: ${detail.resistance}.` : "",
        detail.positionPct ? `Position in range: ${detail.positionPct}% from low.` : "",
        detail.breakoutLabel ? detail.breakoutLabel : ""
      ].filter(Boolean).join(" ")
    },
    {
      title: "Risk Plan",
      body: [
        atr ? `ATR(14): ${atr}.` : "",
        riskPlan.stop != null ? `Stop: ${riskPlan.stop}.` : "",
        riskPlan.takeProfit != null ? `Take profit: ${riskPlan.takeProfit}.` : "",
        riskPlan.riskNote || ""
      ].filter(Boolean).join(" ")
    }
  ].filter(Boolean);

  if (tradeMemory?.citations?.length) {
    sections.push({
      title: "Trade Memory (Your History)",
      bullets: summarizeCitations(tradeMemory.citations, 4)
        .map(item => `${item.title}: ${item.snippet}`.trim())
    });
  }

  if (knowledge?.citations?.length) {
    sections.push({
      title: "RAG Insights",
      bullets: summarizeCitations(knowledge.citations, 5)
        .map(item => `${item.title}: ${item.snippet}`.trim())
    });
  }

  return {
    symbol,
    assetClass,
    bias,
    provider: detail.provider,
    windowDays,
    metrics: {
      lastClose: formatNumber(lastClose, 2),
      returns: windowReturns,
      atr,
      trend: detail.trendLabel || "",
      rsi14: detail.rsi14,
      ma200: detail.ma200,
      maAlignment: detail.maAlignment || "",
      atrPct: detail.atrPct,
      trendStrengthPct: detail.trendStrengthPct,
      volShort: detail.volShort,
      volLong: detail.volLong,
      volRegime: detail.volRegime || "",
      winRate: detail.winRate,
      dailyVol: detail.dailyVol,
      annualVol: detail.annualVol,
      maxDrawdownPct: detail.maxDrawdownPct
    },
    narrative: detail.narrative,
    sections,
    citations: [...(tradeMemory?.citations || []), ...(knowledge?.citations || [])],
    generatedAt: new Date().toISOString()
  };
}
