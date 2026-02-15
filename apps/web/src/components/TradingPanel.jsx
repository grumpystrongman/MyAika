import { useEffect, useMemo, useRef, useState } from "react";

const DEFAULTS = {
  crypto: "BTC-USD",
  stock: "SPY"
};

const INTERVALS = [
  { label: "1m", value: "1m" },
  { label: "5m", value: "5m" },
  { label: "15m", value: "15m" },
  { label: "1h", value: "1h" },
  { label: "1d", value: "1d" }
];

const CORE_STRATEGIES = [
  { label: "Volatility Momentum", value: "volatility_momentum" },
  { label: "Mean Reversion", value: "mean_reversion" },
  { label: "Breakout + ATR", value: "breakout_atr" }
];

const GLOSSARY = [
  { term: "Candlestick", def: "A price bar showing open, high, low, close." },
  { term: "Doji", def: "Small real body; indecision candle." },
  { term: "Hammer", def: "Long lower wick; potential reversal." },
  { term: "Engulfing", def: "Candle body that covers prior candle." },
  { term: "Support/Resistance", def: "Zones where price stalls or reverses." },
  { term: "RSI", def: "Momentum oscillator; overbought/oversold." },
  { term: "MACD", def: "Trend + momentum crossover indicator." },
  { term: "VWAP", def: "Volume-weighted average price." },
  { term: "Spread", def: "Difference between bid and ask." },
  { term: "Liquidity", def: "Ease of executing without big slippage." },
  { term: "Stop Loss", def: "Exit to cap downside risk." },
  { term: "Take Profit", def: "Exit to lock gains." }
];

function formatNumber(value, digits = 2) {
  if (value == null || Number.isNaN(value)) return "--";
  return Number(value).toLocaleString(undefined, { maximumFractionDigits: digits, minimumFractionDigits: digits });
}

function intervalToMs(interval) {
  const lookup = {
    "1m": 60_000,
    "5m": 5 * 60_000,
    "15m": 15 * 60_000,
    "1h": 60 * 60_000,
    "1d": 24 * 60 * 60_000
  };
  return lookup[interval] || 60 * 60_000;
}

function computeEMA(values, period) {
  const result = Array(values.length).fill(null);
  if (values.length < period) return result;
  const slice = values.slice(0, period);
  const seed = slice.reduce((a, b) => a + b, 0) / period;
  result[period - 1] = seed;
  const k = 2 / (period + 1);
  let prev = seed;
  for (let i = period; i < values.length; i += 1) {
    const v = values[i];
    prev = v * k + prev * (1 - k);
    result[i] = prev;
  }
  return result;
}

function computeEMASeries(values, period) {
  const result = Array(values.length).fill(null);
  const startIdx = values.findIndex(v => v != null);
  if (startIdx < 0) return result;
  const available = values.slice(startIdx);
  if (available.length < period) return result;
  const seedSlice = available.slice(0, period);
  const seed = seedSlice.reduce((a, b) => a + b, 0) / period;
  result[startIdx + period - 1] = seed;
  const k = 2 / (period + 1);
  let prev = seed;
  for (let i = startIdx + period; i < values.length; i += 1) {
    const v = values[i];
    if (v == null) {
      result[i] = prev;
      continue;
    }
    prev = v * k + prev * (1 - k);
    result[i] = prev;
  }
  return result;
}

function computeRSI(candles, period = 14) {
  const closes = candles.map(c => c.c);
  const result = Array(closes.length).fill(null);
  if (closes.length <= period) return result;
  let gains = 0;
  let losses = 0;
  for (let i = 1; i <= period; i += 1) {
    const diff = closes[i] - closes[i - 1];
    if (diff >= 0) gains += diff;
    else losses -= diff;
  }
  let avgGain = gains / period;
  let avgLoss = losses / period;
  result[period] = avgLoss === 0 ? 100 : 100 - (100 / (1 + avgGain / avgLoss));
  for (let i = period + 1; i < closes.length; i += 1) {
    const diff = closes[i] - closes[i - 1];
    const gain = diff > 0 ? diff : 0;
    const loss = diff < 0 ? -diff : 0;
    avgGain = (avgGain * (period - 1) + gain) / period;
    avgLoss = (avgLoss * (period - 1) + loss) / period;
    const rs = avgLoss === 0 ? 0 : avgGain / avgLoss;
    result[i] = avgLoss === 0 ? 100 : 100 - (100 / (1 + rs));
  }
  return result;
}

function computeMACD(candles) {
  const closes = candles.map(c => c.c);
  const ema12 = computeEMA(closes, 12);
  const ema26 = computeEMA(closes, 26);
  const macd = closes.map((_, idx) => {
    if (ema12[idx] == null || ema26[idx] == null) return null;
    return ema12[idx] - ema26[idx];
  });
  const signal = computeEMASeries(macd, 9);
  const histogram = macd.map((value, idx) => {
    if (value == null || signal[idx] == null) return null;
    return value - signal[idx];
  });
  return { macd, signal, histogram };
}

function computeVWAP(candles) {
  const result = [];
  let cumulativePV = 0;
  let cumulativeVol = 0;
  for (const candle of candles) {
    const price = (candle.h + candle.l + candle.c) / 3;
    const vol = Number(candle.v || 0);
    cumulativePV += price * vol;
    cumulativeVol += vol;
    const vwap = cumulativeVol ? cumulativePV / cumulativeVol : price;
    result.push(vwap);
  }
  return result;
}

function detectPattern(candle, prev) {
  if (!candle) return "";
  const body = Math.abs(candle.c - candle.o);
  const range = candle.h - candle.l || 1;
  const upper = candle.h - Math.max(candle.o, candle.c);
  const lower = Math.min(candle.o, candle.c) - candle.l;

  if (body / range <= 0.12) return "Doji";
  if (lower > body * 2 && upper < body * 0.8) return "Hammer";
  if (upper > body * 2 && lower < body * 0.8) return "Shooting Star";
  if (prev) {
    const prevBody = Math.abs(prev.c - prev.o);
    const bullish = candle.c > candle.o && prev.c < prev.o;
    const bearish = candle.c < candle.o && prev.c > prev.o;
    if (bullish && candle.c >= prev.o && candle.o <= prev.c && body > prevBody) return "Bullish Engulfing";
    if (bearish && candle.o >= prev.c && candle.c <= prev.o && body > prevBody) return "Bearish Engulfing";
  }
  return "Trend Candle";
}

function CandlestickChart({ candles, vwap = [], width = 640, height = 360 }) {
  const canvasRef = useRef(null);
  const [hover, setHover] = useState(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    const w = canvas.width;
    const h = canvas.height;
    ctx.clearRect(0, 0, w, h);
    ctx.fillStyle = "#0f172a";
    ctx.fillRect(0, 0, w, h);
    if (!candles.length) {
      ctx.fillStyle = "rgba(226, 232, 240, 0.8)";
      ctx.font = "14px 'IBM Plex Mono', monospace";
      ctx.fillText("No market data", 20, 28);
      return;
    }

    const padding = 32;
    const chartW = w - padding * 2;
    const chartH = h - padding * 2;

    const highs = candles.map(c => c.h);
    const lows = candles.map(c => c.l);
    const overlayValues = (vwap || []).filter(v => Number.isFinite(v));
    const max = Math.max(...highs, ...(overlayValues.length ? overlayValues : []));
    const min = Math.min(...lows, ...(overlayValues.length ? overlayValues : []));
    const range = max - min || 1;

    ctx.strokeStyle = "rgba(148, 163, 184, 0.25)";
    ctx.lineWidth = 1;
    for (let i = 0; i < 5; i += 1) {
      const y = padding + (chartH / 4) * i;
      ctx.beginPath();
      ctx.moveTo(padding, y);
      ctx.lineTo(padding + chartW, y);
      ctx.stroke();
    }

    const candleWidth = chartW / candles.length;
    candles.forEach((c, idx) => {
      const x = padding + idx * candleWidth + candleWidth * 0.1;
      const center = x + candleWidth * 0.4;
      const openY = padding + (1 - (c.o - min) / range) * chartH;
      const closeY = padding + (1 - (c.c - min) / range) * chartH;
      const highY = padding + (1 - (c.h - min) / range) * chartH;
      const lowY = padding + (1 - (c.l - min) / range) * chartH;
      const bullish = c.c >= c.o;

      ctx.strokeStyle = bullish ? "#22c55e" : "#ef4444";
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(center, highY);
      ctx.lineTo(center, lowY);
      ctx.stroke();

      ctx.fillStyle = bullish ? "#22c55e" : "#ef4444";
      const bodyHeight = Math.max(2, Math.abs(closeY - openY));
      const bodyY = bullish ? closeY : openY;
      ctx.fillRect(x, bodyY, candleWidth * 0.8, bodyHeight);

      if (hover === idx) {
        ctx.strokeStyle = "rgba(255,255,255,0.6)";
        ctx.lineWidth = 1;
        ctx.strokeRect(x - 2, padding, candleWidth * 0.8 + 4, chartH);
      }
    });

    if (vwap?.length) {
      ctx.strokeStyle = "#38bdf8";
      ctx.lineWidth = 2;
      ctx.beginPath();
      vwap.forEach((value, idx) => {
        if (!Number.isFinite(value)) return;
        const x = padding + idx * candleWidth + candleWidth * 0.4;
        const y = padding + (1 - (value - min) / range) * chartH;
        if (idx === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      });
      ctx.stroke();
    }
  }, [candles, hover, vwap]);

  const onMove = (evt) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const x = evt.clientX - rect.left;
    const candleWidth = rect.width / candles.length;
    const idx = Math.min(candles.length - 1, Math.max(0, Math.floor(x / candleWidth)));
    setHover(idx);
  };

  const onLeave = () => setHover(null);

  const hovered = hover != null ? candles[hover] : null;

  return (
    <div style={{ position: "relative" }}>
      <canvas
        ref={canvasRef}
        width={width}
        height={height}
        onMouseMove={onMove}
        onMouseLeave={onLeave}
        style={{ width: "100%", height: "100%", borderRadius: 16, border: "1px solid #1f2937" }}
      />
      {hovered && (
        <div style={{
          position: "absolute",
          top: 12,
          left: 12,
          background: "rgba(15, 23, 42, 0.9)",
          color: "#e2e8f0",
          padding: "8px 10px",
          borderRadius: 10,
          fontSize: 12,
          fontFamily: "'IBM Plex Mono', monospace"
        }}>
          <div>O {formatNumber(hovered.o)}</div>
          <div>H {formatNumber(hovered.h)}</div>
          <div>L {formatNumber(hovered.l)}</div>
          <div>C {formatNumber(hovered.c)}</div>
        </div>
      )}
    </div>
  );
}

function IndicatorPanel({ title, series = [], width = 640, height = 120, min = null, max = null, thresholds = [] }) {
  const canvasRef = useRef(null);
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    const w = canvas.width;
    const h = canvas.height;
    ctx.clearRect(0, 0, w, h);
    ctx.fillStyle = "#0f172a";
    ctx.fillRect(0, 0, w, h);
    if (!series.length) {
      ctx.fillStyle = "rgba(226, 232, 240, 0.8)";
      ctx.font = "12px 'IBM Plex Mono', monospace";
      ctx.fillText("No indicator data", 16, 22);
      return;
    }

    const valid = series.filter(v => Number.isFinite(v));
    if (!valid.length) return;
    const localMin = min != null ? min : Math.min(...valid);
    const localMax = max != null ? max : Math.max(...valid);
    const range = localMax - localMin || 1;
    const padding = 20;
    const chartW = w - padding * 2;
    const chartH = h - padding * 2;

    ctx.strokeStyle = "rgba(148, 163, 184, 0.2)";
    ctx.lineWidth = 1;
    for (let i = 0; i < 4; i += 1) {
      const y = padding + (chartH / 3) * i;
      ctx.beginPath();
      ctx.moveTo(padding, y);
      ctx.lineTo(padding + chartW, y);
      ctx.stroke();
    }

    thresholds.forEach(t => {
      const y = padding + (1 - (t - localMin) / range) * chartH;
      ctx.strokeStyle = "rgba(248, 113, 113, 0.6)";
      ctx.beginPath();
      ctx.moveTo(padding, y);
      ctx.lineTo(padding + chartW, y);
      ctx.stroke();
    });

    ctx.strokeStyle = "#38bdf8";
    ctx.lineWidth = 2;
    ctx.beginPath();
    series.forEach((value, idx) => {
      if (!Number.isFinite(value)) return;
      const x = padding + (idx / (series.length - 1 || 1)) * chartW;
      const y = padding + (1 - (value - localMin) / range) * chartH;
      if (idx === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    });
    ctx.stroke();
  }, [series, width, height, min, max, thresholds]);

  return (
    <div style={{ display: "grid", gap: 6 }}>
      <div style={{ fontSize: 12, color: "#94a3b8" }}>{title}</div>
      <canvas
        ref={canvasRef}
        width={width}
        height={height}
        style={{ width: "100%", height: "100%", borderRadius: 12, border: "1px solid #1f2937" }}
      />
    </div>
  );
}

function MacdPanel({ macd = [], signal = [], histogram = [], width = 640, height = 140 }) {
  const canvasRef = useRef(null);
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    const w = canvas.width;
    const h = canvas.height;
    ctx.clearRect(0, 0, w, h);
    ctx.fillStyle = "#0f172a";
    ctx.fillRect(0, 0, w, h);
    if (!macd.length) {
      ctx.fillStyle = "rgba(226, 232, 240, 0.8)";
      ctx.font = "12px 'IBM Plex Mono', monospace";
      ctx.fillText("No MACD data", 16, 22);
      return;
    }
    const combined = [...macd, ...signal, ...histogram].filter(v => Number.isFinite(v));
    if (!combined.length) return;
    const min = Math.min(...combined, 0);
    const max = Math.max(...combined, 0);
    const range = max - min || 1;
    const padding = 20;
    const chartW = w - padding * 2;
    const chartH = h - padding * 2;

    const zeroY = padding + (1 - (0 - min) / range) * chartH;
    ctx.strokeStyle = "rgba(148, 163, 184, 0.4)";
    ctx.beginPath();
    ctx.moveTo(padding, zeroY);
    ctx.lineTo(padding + chartW, zeroY);
    ctx.stroke();

    const barWidth = chartW / (histogram.length || 1);
    histogram.forEach((value, idx) => {
      if (!Number.isFinite(value)) return;
      const x = padding + idx * barWidth;
      const y = padding + (1 - (value - min) / range) * chartH;
      const barHeight = Math.abs(zeroY - y);
      ctx.fillStyle = value >= 0 ? "rgba(34,197,94,0.6)" : "rgba(239,68,68,0.6)";
      ctx.fillRect(x, Math.min(y, zeroY), barWidth * 0.8, barHeight || 1);
    });

    const drawLine = (series, color) => {
      ctx.strokeStyle = color;
      ctx.lineWidth = 2;
      ctx.beginPath();
      series.forEach((value, idx) => {
        if (!Number.isFinite(value)) return;
        const x = padding + (idx / (series.length - 1 || 1)) * chartW;
        const y = padding + (1 - (value - min) / range) * chartH;
        if (idx === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      });
      ctx.stroke();
    };

    drawLine(macd, "#38bdf8");
    drawLine(signal, "#f59e0b");
  }, [macd, signal, histogram, width, height]);

  return (
    <div style={{ display: "grid", gap: 6 }}>
      <div style={{ fontSize: 12, color: "#94a3b8" }}>MACD</div>
      <canvas
        ref={canvasRef}
        width={width}
        height={height}
        style={{ width: "100%", height: "100%", borderRadius: 12, border: "1px solid #1f2937" }}
      />
    </div>
  );
}

export default function TradingPanel({ serverUrl = "", fullPage = false }) {
  const [assetClass, setAssetClass] = useState("crypto");
  const [symbol, setSymbol] = useState(DEFAULTS.crypto);
  const [interval, setInterval] = useState("1h");
  const [candles, setCandles] = useState([]);
  const [dataSource, setDataSource] = useState("loading");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [symbolTouched, setSymbolTouched] = useState(false);
  const [showVwap, setShowVwap] = useState(true);
  const [showRsi, setShowRsi] = useState(true);
  const [showMacd, setShowMacd] = useState(true);
  const [liveStatus, setLiveStatus] = useState("");
  const [alpacaFeed, setAlpacaFeed] = useState("iex");
  const [tradeApiUrl, setTradeApiUrl] = useState("http://localhost:8088");
  const [order, setOrder] = useState({
    broker: "coinbase",
    side: "buy",
    quantity: "0.01",
    orderType: "market",
    limitPrice: "",
    mode: "paper"
  });
  const [approvalId, setApprovalId] = useState("");
  const [orderId, setOrderId] = useState("");
  const [tradeStatus, setTradeStatus] = useState("");
  const [assistantInput, setAssistantInput] = useState("");
  const [assistantMessages, setAssistantMessages] = useState([
    { role: "assistant", content: "Trading mode ready. Ask me about this ticker, patterns, or risk." }
  ]);
  const [tradingProfile, setTradingProfile] = useState({ training: { questions: [], notes: "" } });
  const [tradingProfileError, setTradingProfileError] = useState("");
  const [recommendations, setRecommendations] = useState([]);
  const [recommendationsLoading, setRecommendationsLoading] = useState(false);
  const [recommendationsError, setRecommendationsError] = useState("");
  const [recommendationsSource, setRecommendationsSource] = useState("llm");
  const [outcome, setOutcome] = useState({ pnl: "", pnlPct: "", notes: "" });
  const [lessonQuery, setLessonQuery] = useState("");
  const [lessons, setLessons] = useState([]);
  const [lessonStatus, setLessonStatus] = useState("");
  const [tradingTab, setTradingTab] = useState("terminal");
  const [knowledgeTitle, setKnowledgeTitle] = useState("");
  const [knowledgeText, setKnowledgeText] = useState("");
  const [knowledgeTags, setKnowledgeTags] = useState("");
  const [knowledgeStatus, setKnowledgeStatus] = useState("");
  const [knowledgeItems, setKnowledgeItems] = useState([]);
  const [knowledgeQuestion, setKnowledgeQuestion] = useState("");
  const [knowledgeAnswer, setKnowledgeAnswer] = useState("");
  const [knowledgeCitations, setKnowledgeCitations] = useState([]);
  const [knowledgeSyncStatus, setKnowledgeSyncStatus] = useState("");
  const [knowledgeUrl, setKnowledgeUrl] = useState("");
  const [knowledgeUrlTitle, setKnowledgeUrlTitle] = useState("");
  const [knowledgeUrlTags, setKnowledgeUrlTags] = useState("");
  const [knowledgeUrlOcr, setKnowledgeUrlOcr] = useState(true);
  const [knowledgeUrlStatus, setKnowledgeUrlStatus] = useState("");
  const [knowledgeFile, setKnowledgeFile] = useState(null);
  const [knowledgeFileTitle, setKnowledgeFileTitle] = useState("");
  const [knowledgeFileTags, setKnowledgeFileTags] = useState("");
  const [knowledgeFileOcr, setKnowledgeFileOcr] = useState(true);
  const [knowledgeFileStatus, setKnowledgeFileStatus] = useState("");
  const [knowledgeStats, setKnowledgeStats] = useState(null);
  const [knowledgeStatsStatus, setKnowledgeStatsStatus] = useState("");
  const [knowledgeSelectedTag, setKnowledgeSelectedTag] = useState("");
  const [rssSources, setRssSources] = useState([]);
  const [rssStatus, setRssStatus] = useState("");
  const [rssSeedUrl, setRssSeedUrl] = useState("https://rss.feedspot.com/stock_market_news_rss_feeds/");
  const [qaQuestion, setQaQuestion] = useState("");
  const [qaAnswer, setQaAnswer] = useState("");
  const [qaCitations, setQaCitations] = useState([]);
  const [qaStatus, setQaStatus] = useState("");
  const [qaSource, setQaSource] = useState("");
  const [qaAllowFallback, setQaAllowFallback] = useState(true);
  const [sourceList, setSourceList] = useState([]);
  const [sourceStatus, setSourceStatus] = useState("");
  const [newSourceUrl, setNewSourceUrl] = useState("");
  const [newSourceTags, setNewSourceTags] = useState("");
  const [deleteKnowledgeOnRemove, setDeleteKnowledgeOnRemove] = useState(false);
  const [scenarioWindow, setScenarioWindow] = useState(30);
  const [scenarioAssetClass, setScenarioAssetClass] = useState("all");
  const [scenarioResults, setScenarioResults] = useState([]);
  const [scenarioStatus, setScenarioStatus] = useState("");
  const [scenarioHistory, setScenarioHistory] = useState([]);
  const [coreSymbols, setCoreSymbols] = useState("AAPL");
  const [coreStrategy, setCoreStrategy] = useState("volatility_momentum");
  const [coreTimeframe, setCoreTimeframe] = useState("1h");
  const [coreStatus, setCoreStatus] = useState("");
  const [coreDashboard, setCoreDashboard] = useState(null);
  const [coreTrades, setCoreTrades] = useState([]);
  const [backtestSymbol, setBacktestSymbol] = useState("AAPL");
  const [backtestStrategy, setBacktestStrategy] = useState("volatility_momentum");
  const [backtestTimeframe, setBacktestTimeframe] = useState("1h");
  const [backtestGrid, setBacktestGrid] = useState("{\"lookback\":[20,50,80]}");
  const [backtestStatus, setBacktestStatus] = useState("");
  const [backtestResult, setBacktestResult] = useState(null);
  const [backtestArtifacts, setBacktestArtifacts] = useState(null);
  const [backtestArtifactsStatus, setBacktestArtifactsStatus] = useState("");
  const [optionsSymbol, setOptionsSymbol] = useState("AAPL");
  const [optionsProvider, setOptionsProvider] = useState("synthetic");
  const [optionsStatus, setOptionsStatus] = useState("");
  const [optionsChain, setOptionsChain] = useState([]);
  const [optionsUnderlying, setOptionsUnderlying] = useState(0);
  const [optionsStrategy, setOptionsStrategy] = useState("covered_call");
  const [optionsOutcome, setOptionsOutcome] = useState(null);
  const [optionsFilter, setOptionsFilter] = useState("");
  const [optionsChainMinDays, setOptionsChainMinDays] = useState("7");
  const [optionsChainMaxDays, setOptionsChainMaxDays] = useState("60");
  const [optionsStrikeMin, setOptionsStrikeMin] = useState("");
  const [optionsStrikeMax, setOptionsStrikeMax] = useState("");
  const [optionsExpiryFrom, setOptionsExpiryFrom] = useState("");
  const [optionsExpiryTo, setOptionsExpiryTo] = useState("");
  const [optionsScanMinDelta, setOptionsScanMinDelta] = useState("0.2");
  const [optionsScanMaxDelta, setOptionsScanMaxDelta] = useState("0.4");
  const [optionsScanMinIVRank, setOptionsScanMinIVRank] = useState("0.5");
  const [optionsScanMinIVRankHist, setOptionsScanMinIVRankHist] = useState("0.5");
  const [optionsScanMinPOP, setOptionsScanMinPOP] = useState("0.6");
  const [optionsScanMinDays, setOptionsScanMinDays] = useState("14");
  const [optionsScanMaxDays, setOptionsScanMaxDays] = useState("60");
  const [optionsScanResults, setOptionsScanResults] = useState([]);
  const [optionsBacktestStrategy, setOptionsBacktestStrategy] = useState("wheel");
  const [optionsBacktestHoldDays, setOptionsBacktestHoldDays] = useState("30");
  const [optionsBacktestOtmPct, setOptionsBacktestOtmPct] = useState("0.05");
  const [optionsBacktestSpread, setOptionsBacktestSpread] = useState("0.05");
  const [optionsBacktestInitialCash, setOptionsBacktestInitialCash] = useState("10000");
  const [optionsBacktestResult, setOptionsBacktestResult] = useState(null);
  const [optionsPayoff, setOptionsPayoff] = useState([]);
  const [optionsPayoffMin, setOptionsPayoffMin] = useState("");
  const [optionsPayoffMax, setOptionsPayoffMax] = useState("");
  const [optionsOutlook, setOptionsOutlook] = useState("bullish");
  const [optionsGoal, setOptionsGoal] = useState("income");
  const [optionsRisk, setOptionsRisk] = useState("low");
  const [optionsInputs, setOptionsInputs] = useState({
    spot: "",
    strike: "",
    premium: "",
    long_strike: "",
    long_premium: "",
    short_strike: "",
    short_premium: "",
    short_put_strike: "",
    short_put_premium: "",
    long_put_strike: "",
    long_put_premium: "",
    short_call_strike: "",
    short_call_premium: "",
    long_call_strike: "",
    long_call_premium: ""
  });
  const wsRef = useRef(null);

  const regimeSummary = useMemo(() => {
    const labels = coreDashboard?.regime_labels || [];
    if (!labels.length) return [];
    const counts = labels.reduce((acc, label) => {
      acc[label] = (acc[label] || 0) + 1;
      return acc;
    }, {});
    const total = labels.length || 1;
    return Object.entries(counts)
      .map(([label, count]) => ({ label, pct: count / total }))
      .sort((a, b) => b.pct - a.pct);
  }, [coreDashboard]);

  const ensembleWeights = useMemo(() => {
    return coreDashboard?.ensemble_weights || {};
  }, [coreDashboard]);

  const optionsRecommendation = useMemo(() => {
    const mapping = {
      bullish: {
        income: { strategy: "covered_call", note: "If you own shares, sell a call to collect premium." },
        growth: { strategy: "bull_call_spread", note: "Buy a call spread to cap risk." }
      },
      bearish: {
        income: { strategy: "bear_put_spread", note: "Use a put spread for defined risk." },
        growth: { strategy: "bear_put_spread", note: "Directional put spread with capped loss." }
      },
      neutral: {
        income: { strategy: "iron_condor", note: "Collect premium if price stays in a range." },
        growth: { strategy: "iron_condor", note: "Range-bound strategy with defined risk." }
      }
    };
    const rec = mapping[optionsOutlook]?.[optionsGoal] || { strategy: "covered_call", note: "" };
    return rec;
  }, [optionsOutlook, optionsGoal]);

  const filteredOptions = useMemo(() => {
    if (!optionsFilter) return optionsChain;
    const needle = optionsFilter.toLowerCase();
    return optionsChain.filter(opt =>
      String(opt.strike).includes(needle) ||
      String(opt.expiration).toLowerCase().includes(needle) ||
      String(opt.option_type).toLowerCase().includes(needle)
    );
  }, [optionsChain, optionsFilter]);

  const topicNodes = useMemo(() => {
    const nodes = knowledgeStats?.graph?.nodes || [];
    if (!nodes.length) return [];
    const radius = 120;
    const center = { x: 160, y: 130 };
    return nodes.map((node, idx) => {
      const angle = (Math.PI * 2 * idx) / nodes.length;
      const x = center.x + radius * Math.cos(angle);
      const y = center.y + radius * Math.sin(angle);
      const size = 6 + Math.min(10, node.count || 0);
      return { ...node, x, y, size };
    });
  }, [knowledgeStats]);

  const switchAssetClass = (next) => {
    if (next === assetClass) return;
    setAssetClass(next);
    setSymbolTouched(false);
    setSymbol(next === "crypto" ? DEFAULTS.crypto : DEFAULTS.stock);
    setCandles([]);
    setDataSource("loading");
    setError("");
  };

  const applyTickToCandles = (price, size, timeMs, intervalMs) => {
    if (!Number.isFinite(price)) return;
    setCandles(prev => {
      const next = prev.length ? [...prev] : [];
      const bucket = Math.floor(timeMs / intervalMs) * intervalMs;
      if (!next.length) {
        return [{ t: bucket, o: price, h: price, l: price, c: price, v: size }];
      }
      const last = next[next.length - 1];
      if (bucket > last.t) {
        const newCandle = { t: bucket, o: last.c, h: price, l: price, c: price, v: size };
        return [...next.slice(-199), newCandle];
      }
      const updated = {
        ...last,
        h: Math.max(last.h, price),
        l: Math.min(last.l, price),
        c: price,
        v: (Number(last.v || 0) + size)
      };
      next[next.length - 1] = updated;
      return next;
    });
  };

  useEffect(() => {
    try {
      const stored = window.localStorage.getItem("trading_api_url");
      if (stored) setTradeApiUrl(stored);
      const feed = window.localStorage.getItem("alpaca_feed");
      if (feed === "iex" || feed === "sip") setAlpacaFeed(feed);
    } catch {
      // ignore
    }
  }, []);

  useEffect(() => {
    try {
      window.localStorage.setItem("alpaca_feed", alpacaFeed);
    } catch {
      // ignore
    }
  }, [alpacaFeed]);

  useEffect(() => {
    let mounted = true;
    async function loadTradingProfile() {
      if (!serverUrl) return;
      try {
        const resp = await fetch(`${serverUrl}/api/trading/settings`);
        const data = await resp.json();
        if (!mounted) return;
        if (!resp.ok) throw new Error(data?.error || "trading_settings_failed");
        setTradingProfile(data || { training: { questions: [], notes: "" } });
        setTradingProfileError("");
      } catch (err) {
        if (!mounted) return;
        setTradingProfileError(err?.message || "trading_settings_failed");
      }
    }
    loadTradingProfile();
    return () => { mounted = false; };
  }, [serverUrl]);

  async function loadRecommendations() {
    if (!serverUrl) return;
    setRecommendationsLoading(true);
    setRecommendationsError("");
    try {
      const resp = await fetch(`${serverUrl}/api/trading/recommendations`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ assetClass: "all", topN: 12 })
      });
      const data = await resp.json();
      if (!resp.ok) throw new Error(data?.error || "recommendations_failed");
      const picks = Array.isArray(data.picks)
        ? data.picks.map(item => ({
            symbol: item.symbol,
            assetClass: item.assetClass || item.asset_class || "stock",
            bias: item.bias || "WATCH",
            abstract: item.rationale || item.abstract || "",
            confidence: item.confidence
          }))
        : [];
      setRecommendations(picks);
      setRecommendationsSource(data?.source || "llm");
    } catch (err) {
      setRecommendationsError(err?.message || "recommendations_failed");
    } finally {
      setRecommendationsLoading(false);
    }
  }

  useEffect(() => {
    loadRecommendations();
  }, [serverUrl]);

  useEffect(() => {
    loadKnowledgeItems();
    loadSources();
    loadKnowledgeStats();
    loadRssSources();
    loadScenarioHistory();
  }, [serverUrl]);

  useEffect(() => {
    if (tradingTab !== "paper") return;
    fetchCoreDashboard();
    fetchCoreTrades();
  }, [tradingTab, tradeApiUrl]);

  useEffect(() => {
    if (!symbolTouched) {
      setSymbol(assetClass === "crypto" ? DEFAULTS.crypto : DEFAULTS.stock);
    }
  }, [assetClass, symbolTouched]);

  useEffect(() => {
    let mounted = true;
    let pollId = null;
    async function loadCandles() {
      setLoading(true);
      setError("");
      try {
        const resp = await fetch(`/api/market/candles?symbol=${encodeURIComponent(symbol)}&asset=${assetClass}&interval=${interval}`);
        const data = await resp.json();
        if (!mounted) return;
        const rows = Array.isArray(data.candles) ? data.candles : [];
        if (rows.length) {
          setCandles(rows);
          setError("");
        }
        setDataSource(data.source || "unavailable");
        if (data.error) {
          setError(`Market feed unavailable (${data.error}).`);
        }
      } catch (err) {
        if (!mounted) return;
        setError(err?.message || "market_fetch_failed");
      } finally {
        if (mounted) setLoading(false);
      }
    }
    loadCandles();
    if (assetClass === "stock") {
      const intervalMs = intervalToMs(interval);
      const refreshMs = Math.max(15_000, Math.min(60_000, Math.floor(intervalMs / 4)));
      pollId = setInterval(loadCandles, refreshMs);
    }
    return () => {
      mounted = false;
      if (pollId) clearInterval(pollId);
    };
  }, [symbol, assetClass, interval]);

  useEffect(() => {
    if (assetClass !== "crypto" || !symbol) {
      if (wsRef.current) {
        wsRef.current.close();
        wsRef.current = null;
      }
      setLiveStatus("");
      return undefined;
    }
    const intervalMs = intervalToMs(interval);
    const ws = new WebSocket("wss://ws-feed.exchange.coinbase.com");
    wsRef.current = ws;
    setLiveStatus("Connecting to live feed...");

    ws.onopen = () => {
      setLiveStatus("Live feed connected");
      ws.send(JSON.stringify({
        type: "subscribe",
        product_ids: [symbol],
        channels: ["ticker"]
      }));
    };

    ws.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        if (data?.type !== "ticker") return;
        const price = Number(data.price);
        if (!Number.isFinite(price)) return;
        const size = Number(data.last_size || 0);
        const time = data.time ? new Date(data.time).getTime() : Date.now();
        setDataSource("coinbase-ws");
        applyTickToCandles(price, size, time, intervalMs);
      } catch {
        // ignore ws errors
      }
    };

    ws.onerror = () => {
      setLiveStatus("Live feed error");
    };

    ws.onclose = () => {
      setLiveStatus("Live feed closed");
    };

    return () => {
      ws.close();
      if (wsRef.current === ws) wsRef.current = null;
    };
  }, [assetClass, symbol, interval]);

  useEffect(() => {
    if (assetClass !== "stock" || !symbol || !serverUrl) {
      setLiveStatus("");
      return undefined;
    }
    const intervalMs = intervalToMs(interval);
    const feedParam = alpacaFeed || "iex";
    const url = `${serverUrl}/api/trading/stream?symbol=${encodeURIComponent(symbol)}&interval=${encodeURIComponent(interval)}&feed=${encodeURIComponent(feedParam)}`;
    let source;
    try {
      source = new EventSource(url);
    } catch (err) {
      setLiveStatus("Stock stream unavailable");
      return undefined;
    }
    setLiveStatus("Stock stream connecting...");

    source.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data || "{}");
        if (data.type === "status") {
          setLiveStatus(`Stock stream ${data.status}`);
        }
        if (data.type === "trade") {
          const price = Number(data.price);
          const size = Number(data.size || 0);
          const time = data.timestamp ? new Date(data.timestamp).getTime() : Date.now();
          setDataSource("alpaca-ws");
          applyTickToCandles(price, size, time, intervalMs);
        }
        if (data.type === "error") {
          setLiveStatus("Stock stream error");
          if (data.message) setError(data.message);
        }
      } catch {
        // ignore
      }
    };

    source.onerror = () => {
      setLiveStatus("Stock stream error");
    };

    return () => {
      source.close();
    };
  }, [assetClass, symbol, interval, serverUrl, alpacaFeed]);

  const last = candles[candles.length - 1];
  const prev = candles[candles.length - 2];
  const change = last && prev ? last.c - prev.c : 0;
  const changePct = last && prev ? (change / prev.c) * 100 : 0;
  const liveTag = dataSource && String(dataSource).includes("ws") ? " (live)" : "";

  const patterns = useMemo(() => {
    if (candles.length < 3) return [];
    const items = [];
    for (let i = candles.length - 1; i >= Math.max(0, candles.length - 4); i -= 1) {
      items.push(detectPattern(candles[i], candles[i - 1]));
    }
    return items;
  }, [candles]);

  const vwapSeries = useMemo(() => (showVwap ? computeVWAP(candles) : []), [candles, showVwap]);
  const rsiSeries = useMemo(() => (showRsi ? computeRSI(candles) : []), [candles, showRsi]);
  const macdSeries = useMemo(() => (showMacd ? computeMACD(candles) : { macd: [], signal: [], histogram: [] }), [candles, showMacd]);

  const cryptoRecs = useMemo(
    () => recommendations.filter(item => item.assetClass === "crypto"),
    [recommendations]
  );
  const stockRecs = useMemo(
    () => recommendations.filter(item => item.assetClass === "stock"),
    [recommendations]
  );

  const trainingContext = useMemo(() => {
    const notes = String(tradingProfile?.training?.notes || "").trim();
    const questions = Array.isArray(tradingProfile?.training?.questions)
      ? tradingProfile.training.questions
      : [];
    const answered = questions
      .map(item => ({
        question: String(item?.question || "").trim(),
        answer: String(item?.answer || "").trim()
      }))
      .filter(item => item.question && item.answer);
    if (!notes && !answered.length) return "";
    const lines = [];
    if (notes) lines.push(`Directives: ${notes}`);
    if (answered.length) {
      lines.push("Guiding Questions:");
      answered.forEach(item => {
        lines.push(`- ${item.question} ${item.answer}`);
      });
    }
    return lines.join("\n");
  }, [tradingProfile]);

  const handlePropose = async () => {
    setTradeStatus("");
    setApprovalId("");
    setOrderId("");
    try {
      const payload = {
        broker: order.broker,
        symbol,
        side: order.side,
        quantity: order.quantity,
        order_type: order.orderType,
        limit_price: order.orderType === "limit" ? order.limitPrice : undefined,
        requested_by: "ui",
        subject: "local",
        asset_class: assetClass,
        mode: order.mode
      };
      const resp = await fetch(`${tradeApiUrl}/trades/propose`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
      });
      const data = await resp.json();
      if (!resp.ok) throw new Error(data?.detail || "trade_propose_failed");
      setApprovalId(data.approval || "");
      setOrderId(data.order_id || "");
      setTradeStatus(`Proposal ${data.decision}`);
    } catch (err) {
      setTradeStatus(err?.message || "trade_propose_failed");
    }
  };

  const handleApproveExecute = async () => {
    if (!approvalId || !orderId) return;
    setTradeStatus("Approving...");
    try {
      const approveResp = await fetch(`${tradeApiUrl}/approvals/${approvalId}/approve`, { method: "POST" });
      if (!approveResp.ok) throw new Error("approval_failed");
      const payload = {
        broker: order.broker,
        symbol,
        side: order.side,
        quantity: order.quantity,
        order_type: order.orderType,
        limit_price: order.orderType === "limit" ? order.limitPrice : undefined,
        order_id: orderId,
        approval_id: approvalId,
        subject: "local"
      };
      const execResp = await fetch(`${tradeApiUrl}/trades/execute`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
      });
      const execData = await execResp.json();
      if (!execResp.ok) throw new Error(execData?.detail || "execute_failed");
      setTradeStatus(`Executed: ${execData.status}`);
    } catch (err) {
      setTradeStatus(err?.message || "execute_failed");
    }
  };

  const sendAssistant = async (overrideText = "") => {
    const content = String(overrideText || assistantInput || "").trim();
    if (!content) return;
    setAssistantInput("");
    setAssistantMessages(prev => [...prev, { role: "user", content }]);
    try {
      let lessonContext = "";
      try {
        const lessonResp = await fetch(`${tradeApiUrl}/trades/lessons/query`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ question: content, limit: 3 })
        });
        const lessonData = await lessonResp.json();
        if (lessonResp.ok && Array.isArray(lessonData.lessons) && lessonData.lessons.length) {
          lessonContext = lessonData.lessons
            .map(item => `- ${item.summary || ""}`)
            .filter(Boolean)
            .join("\n");
        }
      } catch {
        lessonContext = "";
      }
      const prompt = `Trading assistant mode. Provide educational insights, risks, and ask clarifying questions. Symbol=${symbol}. Asset=${assetClass}. Question: ${content}\n${lessonContext ? `\\nRecent loss lessons:\\n${lessonContext}` : ""}${trainingContext ? `\\nTrader preferences:\\n${trainingContext}` : ""}`;
      const resp = await fetch(`${serverUrl}/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userText: prompt })
      });
      const data = await resp.json();
      setAssistantMessages(prev => [...prev, { role: "assistant", content: data?.text || "No response." }]);
    } catch (err) {
      setAssistantMessages(prev => [...prev, { role: "assistant", content: "Unable to reach Aika chat." }]);
    }
  };

  const recordOutcome = async () => {
    setLessonStatus("");
    try {
      const payload = {
        broker: order.broker,
        symbol,
        side: order.side,
        quantity: order.quantity,
        pnl: outcome.pnl,
        pnl_pct: outcome.pnlPct,
        notes: outcome.notes,
        order_id: orderId || undefined
      };
      const resp = await fetch(`${tradeApiUrl}/trades/outcome`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
      });
      const data = await resp.json();
      if (!resp.ok) throw new Error(data?.detail || "outcome_failed");
      setLessonStatus(data.lesson_summary ? "Loss lesson saved." : "Outcome saved.");
      if (serverUrl) {
        fetch(`${serverUrl}/api/trading/outcome`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            symbol,
            side: order.side,
            quantity: order.quantity,
            pnl: outcome.pnl,
            pnl_pct: outcome.pnlPct,
            notes: outcome.notes
          })
        }).catch(() => {});
      }
    } catch (err) {
      setLessonStatus(err?.message || "outcome_failed");
    }
  };

  const fetchLessons = async () => {
    setLessonStatus("Loading lessons...");
    try {
      const question = lessonQuery || `Recent losses on ${symbol}`;
      const resp = await fetch(`${tradeApiUrl}/trades/lessons/query`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ question, limit: 5 })
      });
      const data = await resp.json();
      if (!resp.ok) throw new Error(data?.detail || "lesson_query_failed");
      setLessons(data.lessons || []);
      setLessonStatus("");
    } catch (err) {
      setLessonStatus(err?.message || "lesson_query_failed");
    }
  };

  const loadKnowledgeItems = async (tagOverride) => {
    if (!serverUrl) return;
    try {
      const tag = typeof tagOverride === "string" ? tagOverride : knowledgeSelectedTag;
      const query = new URLSearchParams({ limit: "20" });
      if (tag) query.set("tag", tag);
      const resp = await fetch(`${serverUrl}/api/trading/knowledge/list?${query.toString()}`);
      const data = await resp.json();
      if (!resp.ok) throw new Error(data?.error || "knowledge_list_failed");
      setKnowledgeItems(data?.items || []);
      setKnowledgeStatus("");
    } catch (err) {
      setKnowledgeStatus(err?.message || "knowledge_list_failed");
    }
  };

  const loadKnowledgeStats = async () => {
    if (!serverUrl) return;
    setKnowledgeStatsStatus("Loading knowledge stats...");
    try {
      const resp = await fetch(`${serverUrl}/api/trading/knowledge/stats?limit=500`);
      const data = await resp.json();
      if (!resp.ok) throw new Error(data?.error || "knowledge_stats_failed");
      setKnowledgeStats(data);
      setKnowledgeStatsStatus("");
    } catch (err) {
      setKnowledgeStatsStatus(err?.message || "knowledge_stats_failed");
    }
  };

  const loadSources = async () => {
    if (!serverUrl) return;
    try {
      const resp = await fetch(`${serverUrl}/api/trading/knowledge/sources?includeDisabled=1`);
      const data = await resp.json();
      if (!resp.ok) throw new Error(data?.error || "source_list_failed");
      setSourceList(data?.items || []);
      setSourceStatus("");
    } catch (err) {
      setSourceStatus(err?.message || "source_list_failed");
    }
  };

  const loadRssSources = async () => {
    if (!serverUrl) return;
    try {
      const resp = await fetch(`${serverUrl}/api/trading/rss/sources?includeDisabled=1`);
      const data = await resp.json();
      if (!resp.ok) throw new Error(data?.error || "rss_sources_failed");
      setRssSources(data?.items || []);
      setRssStatus("");
    } catch (err) {
      setRssStatus(err?.message || "rss_sources_failed");
    }
  };

  const seedRssSources = async () => {
    if (!serverUrl) return;
    setRssStatus("Seeding RSS feeds from Feedspot...");
    try {
      const resp = await fetch(`${serverUrl}/api/trading/rss/seed`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: rssSeedUrl })
      });
      const data = await resp.json();
      if (!resp.ok) throw new Error(data?.error || "rss_seed_failed");
      setRssStatus(`Seeded ${data.added || 0} feeds. Disabled ${data.disabled || 0} foreign feeds.`);
      await loadRssSources();
    } catch (err) {
      setRssStatus(err?.message || "rss_seed_failed");
    }
  };

  const crawlRssSources = async () => {
    if (!serverUrl) return;
    setRssStatus("Crawling RSS feeds...");
    try {
      const resp = await fetch(`${serverUrl}/api/trading/rss/crawl`, {
        method: "POST",
        headers: { "Content-Type": "application/json" }
      });
      const data = await resp.json();
      if (!resp.ok) throw new Error(data?.error || "rss_crawl_failed");
      setRssStatus(`Crawled ${data.total || 0} feeds: ${data.ingested || 0} ingested, ${data.skipped || 0} skipped`);
      await loadRssSources();
      await loadKnowledgeItems();
      await loadKnowledgeStats();
    } catch (err) {
      setRssStatus(err?.message || "rss_crawl_failed");
    }
  };

  const toggleRssSource = async (source) => {
    if (!serverUrl || !source?.id) return;
    try {
      const resp = await fetch(`${serverUrl}/api/trading/rss/sources/${source.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ enabled: !source.enabled })
      });
      const data = await resp.json();
      if (!resp.ok) throw new Error(data?.error || "rss_update_failed");
      await loadRssSources();
    } catch (err) {
      setRssStatus(err?.message || "rss_update_failed");
    }
  };

  const crawlRssSource = async (source) => {
    if (!serverUrl || !source?.id) return;
    setRssStatus(`Queued crawl for ${source.url}`);
    try {
      const resp = await fetch(`${serverUrl}/api/trading/rss/sources/${source.id}/crawl`, {
        method: "POST",
        headers: { "Content-Type": "application/json" }
      });
      const data = await resp.json();
      if (!resp.ok) throw new Error(data?.error || "rss_crawl_failed");
      await loadRssSources();
    } catch (err) {
      setRssStatus(err?.message || "rss_crawl_failed");
    }
  };

  const removeRssSource = async (source) => {
    if (!serverUrl || !source?.id) return;
    const confirmed = window.confirm(`Remove this RSS source?\n${source.url}`);
    if (!confirmed) return;
    setRssStatus("Removing RSS source...");
    try {
      const resp = await fetch(`${serverUrl}/api/trading/rss/sources/${source.id}`, {
        method: "DELETE"
      });
      const data = await resp.json();
      if (!resp.ok) throw new Error(data?.error || "rss_delete_failed");
      setRssStatus("RSS source removed.");
      await loadRssSources();
    } catch (err) {
      setRssStatus(err?.message || "rss_delete_failed");
    }
  };

  const syncKnowledgeSources = async () => {
    if (!serverUrl) return;
    setKnowledgeSyncStatus("Crawling sources...");
    try {
      const resp = await fetch(`${serverUrl}/api/trading/knowledge/crawl`, {
        method: "POST",
        headers: { "Content-Type": "application/json" }
      });
      const data = await resp.json();
      if (!resp.ok) throw new Error(data?.error || "knowledge_sync_failed");
      const visited = Number(data?.visited || data?.total || 0);
      setKnowledgeSyncStatus(`Crawled ${visited} pages: ${data.ingested || 0} ingested, ${data.skipped || 0} skipped`);
      await loadKnowledgeItems();
      await loadKnowledgeStats();
    } catch (err) {
      setKnowledgeSyncStatus(err?.message || "knowledge_sync_failed");
    }
  };

  const addSource = async () => {
    if (!serverUrl) return;
    const url = newSourceUrl.trim();
    if (!url) {
      setSourceStatus("Source URL is required.");
      return;
    }
    setSourceStatus("Adding source and queuing crawl...");
    try {
      const resp = await fetch(`${serverUrl}/api/trading/knowledge/sources`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          url,
          tags: newSourceTags.split(/[;,]/).map(t => t.trim()).filter(Boolean)
        })
      });
      const data = await resp.json();
      if (!resp.ok) throw new Error(data?.error || "source_add_failed");
      setSourceStatus("Source added. Crawl queued in background.");
      setNewSourceUrl("");
      setNewSourceTags("");
      await loadSources();
    } catch (err) {
      setSourceStatus(err?.message || "source_add_failed");
    }
  };

  const toggleSource = async (source) => {
    if (!serverUrl || !source?.id) return;
    try {
      const resp = await fetch(`${serverUrl}/api/trading/knowledge/sources/${source.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ enabled: !source.enabled })
      });
      const data = await resp.json();
      if (!resp.ok) throw new Error(data?.error || "source_update_failed");
      await loadSources();
    } catch (err) {
      setSourceStatus(err?.message || "source_update_failed");
    }
  };

  const crawlSource = async (source) => {
    if (!serverUrl || !source?.id) return;
    setSourceStatus(`Queued crawl for ${source.url}`);
    try {
      const resp = await fetch(`${serverUrl}/api/trading/knowledge/sources/${source.id}/crawl`, {
        method: "POST",
        headers: { "Content-Type": "application/json" }
      });
      const data = await resp.json();
      if (!resp.ok) throw new Error(data?.error || "source_crawl_failed");
    } catch (err) {
      setSourceStatus(err?.message || "source_crawl_failed");
    }
  };

  const removeSource = async (source) => {
    if (!serverUrl || !source?.id) return;
    const confirmed = window.confirm(`Remove this source?\n${source.url}`);
    if (!confirmed) return;
    setSourceStatus(deleteKnowledgeOnRemove ? "Removing source and deleting knowledge..." : "Removing source...");
    try {
      const resp = await fetch(`${serverUrl}/api/trading/knowledge/sources/${source.id}?deleteKnowledge=${deleteKnowledgeOnRemove ? "1" : "0"}`, {
        method: "DELETE"
      });
      const data = await resp.json();
      if (!resp.ok) throw new Error(data?.error || "source_delete_failed");
      setSourceStatus(deleteKnowledgeOnRemove ? `Removed. Deleted ${data.deletedCount || 0} knowledge items.` : "Removed source.");
      await loadSources();
      if (deleteKnowledgeOnRemove) await loadKnowledgeItems();
      if (deleteKnowledgeOnRemove) await loadKnowledgeStats();
    } catch (err) {
      setSourceStatus(err?.message || "source_delete_failed");
    }
  };

  const saveHowTo = async () => {
    if (!serverUrl) return;
    const title = knowledgeTitle.trim();
    const text = knowledgeText.trim();
    if (!title || !text) {
      setKnowledgeStatus("Title and text are required.");
      return;
    }
    setKnowledgeStatus("Saving...");
    try {
      const resp = await fetch(`${serverUrl}/api/trading/knowledge/ingest`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title,
          text,
          tags: knowledgeTags.split(/[;,]/).map(t => t.trim()).filter(Boolean)
        })
      });
      const data = await resp.json();
      if (!resp.ok) throw new Error(data?.error || "knowledge_ingest_failed");
      setKnowledgeStatus(`Saved. ${data.chunks || 0} chunks indexed.`);
      setKnowledgeTitle("");
      setKnowledgeText("");
      setKnowledgeTags("");
      await loadKnowledgeItems();
      await loadKnowledgeStats();
    } catch (err) {
      setKnowledgeStatus(err?.message || "knowledge_ingest_failed");
    }
  };

  const askKnowledge = async () => {
    if (!serverUrl) return;
    const question = knowledgeQuestion.trim();
    if (!question) return;
    setKnowledgeStatus("Thinking...");
    try {
      const resp = await fetch(`${serverUrl}/api/trading/knowledge/ask`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ question })
      });
      const data = await resp.json();
      if (!resp.ok) throw new Error(data?.error || "knowledge_query_failed");
      setKnowledgeAnswer(data.answer || "");
      setKnowledgeCitations(data.citations || []);
      setKnowledgeStatus("");
    } catch (err) {
      setKnowledgeStatus(err?.message || "knowledge_query_failed");
    }
  };

  const ingestKnowledgeUrl = async () => {
    if (!serverUrl) return;
    const url = knowledgeUrl.trim();
    if (!url) {
      setKnowledgeUrlStatus("URL is required.");
      return;
    }
    setKnowledgeUrlStatus("Fetching and indexing...");
    try {
      const resp = await fetch(`${serverUrl}/api/trading/knowledge/ingest-url`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          url,
          title: knowledgeUrlTitle.trim() || undefined,
          tags: knowledgeUrlTags.split(/[;,]/).map(t => t.trim()).filter(Boolean),
          useOcr: knowledgeUrlOcr
        })
      });
      const data = await resp.json();
      if (!resp.ok) throw new Error(data?.error || "knowledge_url_failed");
      setKnowledgeUrlStatus(`Ingested. ${data.chunks || 0} chunks indexed.`);
      setKnowledgeUrl("");
      setKnowledgeUrlTitle("");
      setKnowledgeUrlTags("");
      await loadKnowledgeItems();
      await loadKnowledgeStats();
    } catch (err) {
      setKnowledgeUrlStatus(err?.message || "knowledge_url_failed");
    }
  };

  const uploadKnowledgeFile = async () => {
    if (!serverUrl) return;
    if (!knowledgeFile) {
      setKnowledgeFileStatus("File is required.");
      return;
    }
    setKnowledgeFileStatus("Uploading and indexing...");
    try {
      const form = new FormData();
      form.append("file", knowledgeFile);
      if (knowledgeFileTitle.trim()) form.append("title", knowledgeFileTitle.trim());
      if (knowledgeFileTags.trim()) form.append("tags", knowledgeFileTags.trim());
      form.append("useOcr", knowledgeFileOcr ? "true" : "false");
      const resp = await fetch(`${serverUrl}/api/trading/knowledge/upload`, {
        method: "POST",
        body: form
      });
      const data = await resp.json();
      if (!resp.ok) throw new Error(data?.error || "knowledge_upload_failed");
      setKnowledgeFileStatus(`Ingested. ${data.chunks || 0} chunks indexed.`);
      setKnowledgeFile(null);
      setKnowledgeFileTitle("");
      setKnowledgeFileTags("");
      await loadKnowledgeItems();
      await loadKnowledgeStats();
    } catch (err) {
      setKnowledgeFileStatus(err?.message || "knowledge_upload_failed");
    }
  };

  const askTradingQa = async () => {
    if (!serverUrl) return;
    const question = qaQuestion.trim();
    if (!question) return;
    setQaStatus("Thinking...");
    setQaAnswer("");
    setQaCitations([]);
    setQaSource("");
    try {
      const resp = await fetch(`${serverUrl}/api/trading/knowledge/ask-deep`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ question, allowFallback: qaAllowFallback })
      });
      const data = await resp.json();
      if (!resp.ok) throw new Error(data?.error || "qa_failed");
      setQaAnswer(data?.answer || "");
      setQaCitations(data?.citations || []);
      setQaSource(data?.source || "");
      setQaStatus("");
    } catch (err) {
      setQaStatus(err?.message || "qa_failed");
    }
  };

  const runScenario = async () => {
    if (!serverUrl) return;
    setScenarioStatus("Running scenarios...");
    try {
      const resp = await fetch(`${serverUrl}/api/trading/scenarios/run`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          assetClass: scenarioAssetClass,
          windowDays: scenarioWindow,
          useDailyPicks: true
        })
      });
      const data = await resp.json();
      if (!resp.ok) throw new Error(data?.error || "scenario_run_failed");
      setScenarioResults(data.results || []);
      setScenarioStatus("");
      const historyResp = await fetch(`${serverUrl}/api/trading/scenarios?limit=6`);
      const historyData = await historyResp.json();
      if (historyResp.ok) setScenarioHistory(historyData.items || []);
    } catch (err) {
      setScenarioStatus(err?.message || "scenario_run_failed");
    }
  };

  const loadScenarioHistory = async () => {
    if (!serverUrl) return;
    try {
      const resp = await fetch(`${serverUrl}/api/trading/scenarios?limit=6`);
      const data = await resp.json();
      if (resp.ok) setScenarioHistory(data.items || []);
    } catch {
      // ignore
    }
  };

  const fetchCoreDashboard = async () => {
    if (!tradeApiUrl) return;
    try {
      const resp = await fetch(`${tradeApiUrl}/core/dashboard`);
      const data = await resp.json();
      if (resp.ok) setCoreDashboard(data.latest || null);
    } catch {
      // ignore
    }
  };

  const fetchCoreTrades = async () => {
    if (!tradeApiUrl) return;
    try {
      const resp = await fetch(`${tradeApiUrl}/core/trades?limit=25`);
      const data = await resp.json();
      if (resp.ok) setCoreTrades(data.fills || []);
    } catch {
      // ignore
    }
  };

  const runCorePaper = async () => {
    if (!tradeApiUrl) return;
    setCoreStatus("Running paper cycle...");
    try {
      const resp = await fetch(`${tradeApiUrl}/core/run`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          mode: "paper",
          symbols: coreSymbols.split(",").map(s => s.trim()).filter(Boolean),
          strategy: coreStrategy,
          timeframe: coreTimeframe
        })
      });
      const data = await resp.json();
      if (!resp.ok) throw new Error(data?.detail || "core_run_failed");
      setCoreStatus("Paper run completed.");
      setCoreDashboard(data.run || null);
      setCoreTrades(data.fills || []);
    } catch (err) {
      setCoreStatus(err?.message || "core_run_failed");
    }
  };

  const runBacktest = async () => {
    if (!tradeApiUrl) return;
    setBacktestStatus("Running backtest...");
    setBacktestResult(null);
    setBacktestArtifacts(null);
    setBacktestArtifactsStatus("");
    let gridPayload = {};
    try {
      gridPayload = backtestGrid ? JSON.parse(backtestGrid) : {};
    } catch (err) {
      setBacktestStatus("Grid JSON invalid.");
      return;
    }
    try {
      const resp = await fetch(`${tradeApiUrl}/core/backtest`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          symbol: backtestSymbol.trim() || "AAPL",
          strategy: backtestStrategy,
          timeframe: backtestTimeframe,
          grid: gridPayload,
          walk_forward: { train: 120, test: 40, step: 40, limit: 300 }
        })
      });
      const data = await resp.json();
      if (!resp.ok) throw new Error(data?.detail || "backtest_failed");
      setBacktestResult(data);
      setBacktestStatus("Backtest complete.");
      if (data?.run_id) {
        loadBacktestArtifacts(data.run_id, data.grid?.run_id);
      }
    } catch (err) {
      setBacktestStatus(err?.message || "backtest_failed");
    }
  };

  const loadBacktestArtifacts = async (runId, gridRunId = "") => {
    if (!tradeApiUrl || !runId) return;
    setBacktestArtifactsStatus("Loading artifacts...");
    try {
      const query = gridRunId ? `?grid_run_id=${encodeURIComponent(gridRunId)}` : "";
      const resp = await fetch(`${tradeApiUrl}/core/backtest/artifacts/${runId}${query}`);
      const data = await resp.json();
      if (!resp.ok) throw new Error(data?.detail || "artifacts_failed");
      setBacktestArtifacts(data);
      setBacktestArtifactsStatus("Artifacts loaded.");
    } catch (err) {
      setBacktestArtifactsStatus(err?.message || "artifacts_failed");
    }
  };

  const fetchOptionsChain = async () => {
    if (!tradeApiUrl) return;
    setOptionsStatus("Loading option chain...");
    try {
      const resp = await fetch(`${tradeApiUrl}/core/options/chain`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          symbol: optionsSymbol.trim(),
          provider: optionsProvider,
          limit: 40,
          min_days: Number(optionsChainMinDays || 0),
          max_days: Number(optionsChainMaxDays || 0),
          strike_min: optionsStrikeMin ? Number(optionsStrikeMin) : undefined,
          strike_max: optionsStrikeMax ? Number(optionsStrikeMax) : undefined,
          expiry_from: optionsExpiryFrom || undefined,
          expiry_to: optionsExpiryTo || undefined
        })
      });
      const data = await resp.json();
      if (!resp.ok) throw new Error(data?.detail || "options_chain_failed");
      setOptionsChain(data.contracts || []);
      setOptionsUnderlying(data.underlying_price || 0);
      setOptionsInputs(prev => ({ ...prev, spot: data.underlying_price?.toFixed(2) || prev.spot }));
      setOptionsStatus("");
    } catch (err) {
      setOptionsStatus(err?.message || "options_chain_failed");
    }
  };

  const runOptionsStrategy = async () => {
    if (!tradeApiUrl) return;
    setOptionsOutcome(null);
    setOptionsStatus("Calculating strategy...");
    try {
      const resp = await fetch(`${tradeApiUrl}/core/options/strategy`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ strategy: optionsStrategy, params: optionsInputs })
      });
      const data = await resp.json();
      if (!resp.ok) throw new Error(data?.detail || "options_strategy_failed");
      setOptionsOutcome(data);
      setOptionsStatus("");
    } catch (err) {
      setOptionsStatus(err?.message || "options_strategy_failed");
    }
  };

  const runOptionsScan = async () => {
    if (!tradeApiUrl) return;
    setOptionsStatus("Scanning options...");
    try {
      const resp = await fetch(`${tradeApiUrl}/core/options/scan`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          symbol: optionsSymbol.trim(),
          provider: optionsProvider,
          limit: 25,
          filters: {
            min_delta: Number(optionsScanMinDelta || 0),
            max_delta: Number(optionsScanMaxDelta || 1),
            min_iv_rank: Number(optionsScanMinIVRank || 0),
            min_iv_rank_hist: Number(optionsScanMinIVRankHist || 0),
            min_pop: Number(optionsScanMinPOP || 0),
            min_days: Number(optionsScanMinDays || 0),
            max_days: Number(optionsScanMaxDays || 365),
            abs_delta: true,
            side: "short"
          }
        })
      });
      const data = await resp.json();
      if (!resp.ok) throw new Error(data?.detail || "options_scan_failed");
      setOptionsScanResults(data.results || []);
      setOptionsStatus("");
    } catch (err) {
      setOptionsStatus(err?.message || "options_scan_failed");
    }
  };

  const runOptionsBacktest = async () => {
    if (!tradeApiUrl) return;
    setOptionsStatus("Running options backtest...");
    setOptionsBacktestResult(null);
    try {
      const resp = await fetch(`${tradeApiUrl}/core/options/backtest`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          symbol: optionsSymbol.trim(),
          strategy: optionsBacktestStrategy,
          hold_days: Number(optionsBacktestHoldDays || 30),
          otm_pct: Number(optionsBacktestOtmPct || 0.05),
          spread_width: Number(optionsBacktestSpread || 0.05),
          initial_cash: Number(optionsBacktestInitialCash || 10000),
          timeframe: "1d"
        })
      });
      const data = await resp.json();
      if (!resp.ok) throw new Error(data?.detail || "options_backtest_failed");
      setOptionsBacktestResult(data);
      setOptionsStatus("");
    } catch (err) {
      setOptionsStatus(err?.message || "options_backtest_failed");
    }
  };

  const buildPayoffLegs = () => {
    const num = (value, fallback = 0) => {
      const n = Number(value);
      return Number.isFinite(n) ? n : fallback;
    };
    const spot = num(optionsInputs.spot, optionsUnderlying || 0);
    const strike = num(optionsInputs.strike, spot);
    const premium = num(optionsInputs.premium, 0);
    const longStrike = num(optionsInputs.long_strike, strike);
    const longPremium = num(optionsInputs.long_premium, 0);
    const shortStrike = num(optionsInputs.short_strike, strike);
    const shortPremium = num(optionsInputs.short_premium, 0);
    const legs = [];
    if (optionsStrategy === "covered_call") {
      legs.push({ instrument: "stock", side: "long", quantity: 100, entry: spot });
      legs.push({ option_type: "call", side: "short", strike, premium, quantity: 1, multiplier: 100 });
    } else if (optionsStrategy === "cash_secured_put") {
      legs.push({ option_type: "put", side: "short", strike, premium, quantity: 1, multiplier: 100 });
    } else if (optionsStrategy === "bull_call_spread") {
      legs.push({ option_type: "call", side: "long", strike: longStrike, premium: longPremium, quantity: 1, multiplier: 100 });
      legs.push({ option_type: "call", side: "short", strike: shortStrike, premium: shortPremium, quantity: 1, multiplier: 100 });
    } else if (optionsStrategy === "bear_put_spread") {
      legs.push({ option_type: "put", side: "long", strike: longStrike, premium: longPremium, quantity: 1, multiplier: 100 });
      legs.push({ option_type: "put", side: "short", strike: shortStrike, premium: shortPremium, quantity: 1, multiplier: 100 });
    } else if (optionsStrategy === "iron_condor") {
      legs.push({ option_type: "put", side: "short", strike: num(optionsInputs.short_put_strike, strike), premium: num(optionsInputs.short_put_premium, 0), quantity: 1, multiplier: 100 });
      legs.push({ option_type: "put", side: "long", strike: num(optionsInputs.long_put_strike, strike), premium: num(optionsInputs.long_put_premium, 0), quantity: 1, multiplier: 100 });
      legs.push({ option_type: "call", side: "short", strike: num(optionsInputs.short_call_strike, strike), premium: num(optionsInputs.short_call_premium, 0), quantity: 1, multiplier: 100 });
      legs.push({ option_type: "call", side: "long", strike: num(optionsInputs.long_call_strike, strike), premium: num(optionsInputs.long_call_premium, 0), quantity: 1, multiplier: 100 });
    }
    return { legs, spot };
  };

  const runOptionsPayoff = async () => {
    if (!tradeApiUrl) return;
    const { legs, spot } = buildPayoffLegs();
    if (!legs.length) return;
    const minPrice = optionsPayoffMin ? Number(optionsPayoffMin) : Math.max(1, spot * 0.5);
    const maxPrice = optionsPayoffMax ? Number(optionsPayoffMax) : Math.max(minPrice + 1, spot * 1.5);
    try {
      const resp = await fetch(`${tradeApiUrl}/core/options/payoff`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          legs,
          min_price: minPrice,
          max_price: maxPrice,
          steps: 60
        })
      });
      const data = await resp.json();
      if (!resp.ok) throw new Error(data?.detail || "options_payoff_failed");
      setOptionsPayoff(data.curve || []);
    } catch (err) {
      setOptionsStatus(err?.message || "options_payoff_failed");
    }
  };

  const applyOptionsRecommendation = () => {
    const spot = Number(optionsUnderlying) || Number(optionsInputs.spot) || 0;
    const callStrike = spot ? (spot * 1.05) : 0;
    const putStrike = spot ? (spot * 0.95) : 0;
    setOptionsStrategy(optionsRecommendation.strategy);
    setOptionsInputs(prev => ({
      ...prev,
      spot: spot ? spot.toFixed(2) : prev.spot,
      strike: optionsRecommendation.strategy === "cash_secured_put" ? (putStrike ? putStrike.toFixed(2) : prev.strike) : (callStrike ? callStrike.toFixed(2) : prev.strike),
      long_strike: optionsRecommendation.strategy.includes("spread") ? (spot ? spot.toFixed(2) : prev.long_strike) : prev.long_strike,
      short_strike: optionsRecommendation.strategy.includes("spread") ? (callStrike ? callStrike.toFixed(2) : prev.short_strike) : prev.short_strike,
    }));
  };

  const handleRecommendationAnalyze = (item) => {
    if (!item?.symbol) return;
    const targetClass = item.assetClass === "crypto" ? "crypto" : "stock";
    if (targetClass !== assetClass) {
      switchAssetClass(targetClass);
    }
    setSymbol(item.symbol);
    setSymbolTouched(true);
    sendAssistant(`Analyze ${item.symbol} and explain why it is a ${item.bias} candidate.`);
  };

  const containerStyle = {
    minHeight: fullPage ? "100vh" : "auto",
    background: "linear-gradient(135deg, #f7f8fb 0%, #eef3ff 35%, #fef7f1 100%)",
    borderRadius: fullPage ? 0 : 16,
    padding: fullPage ? "24px 28px" : 16,
    border: fullPage ? "none" : "1px solid #e5e7eb",
    fontFamily: "'Space Grotesk', 'IBM Plex Sans', sans-serif",
    color: "#0f172a"
  };

  return (
    <div style={containerStyle}>
      <style jsx global>{`
        @import url('https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@400;500;600;700&family=IBM+Plex+Mono:wght@400;600&display=swap');
      `}</style>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16, gap: 12 }}>
        <div>
          <div style={{ fontSize: 22, fontWeight: 700 }}>Aika Trading Terminal</div>
          <div style={{ fontSize: 12, color: "#475569" }}>Commercial-grade view with real-time feeds (Coinbase live; Alpaca optional for stocks).</div>
        </div>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 10, alignItems: "center", justifyContent: "flex-end" }}>
          <div style={{ display: "flex", gap: 6 }}>
            {[
              { id: "terminal", label: "Terminal" },
              { id: "paper", label: "Paper" },
              { id: "backtest", label: "Backtest" },
              { id: "options", label: "Options" },
              { id: "qa", label: "Q&A" },
              { id: "knowledge", label: "How-To" },
              { id: "scenarios", label: "Scenarios" }
            ].map(tab => (
              <button
                key={tab.id}
                onClick={() => setTradingTab(tab.id)}
                style={{
                  padding: "6px 10px",
                  borderRadius: 10,
                  border: tradingTab === tab.id ? "2px solid #0ea5e9" : "1px solid #cbd5f5",
                  background: tradingTab === tab.id ? "#e0f2fe" : "#fff",
                  fontWeight: 600
                }}
              >
                {tab.label}
              </button>
            ))}
          </div>
          {tradingTab === "terminal" && (
            <>
              <div style={{ fontSize: 12, color: "#64748b" }}>Asset</div>
              <div style={{ display: "flex", gap: 6 }}>
                <button
                  onClick={() => switchAssetClass("crypto")}
                  style={{
                    padding: "6px 10px",
                    borderRadius: 999,
                    border: assetClass === "crypto" ? "2px solid #0ea5e9" : "1px solid #cbd5f5",
                    background: assetClass === "crypto" ? "#e0f2fe" : "#fff"
                  }}
                >
                  Crypto
                </button>
                <button
                  onClick={() => switchAssetClass("stock")}
                  style={{
                    padding: "6px 10px",
                    borderRadius: 999,
                    border: assetClass === "stock" ? "2px solid #0ea5e9" : "1px solid #cbd5f5",
                    background: assetClass === "stock" ? "#e0f2fe" : "#fff"
                  }}
                >
                  Stocks
                </button>
              </div>
            </>
          )}
          {!fullPage && (
            <a href="/trading" target="_blank" rel="noreferrer" style={{
              padding: "8px 12px",
              borderRadius: 10,
              border: "1px solid #0ea5e9",
              color: "#0ea5e9",
              textDecoration: "none",
              fontWeight: 600
            }}>
              Full Screen
            </a>
          )}
        </div>
      </div>

      {tradingTab === "terminal" && (
      <div style={{
        display: "grid",
        gridTemplateColumns: "1.1fr 2.2fr 1.2fr",
        gap: 16
      }}>
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          <div style={{ background: "#ffffff", borderRadius: 14, padding: 14, border: "1px solid #e5e7eb" }}>
            <div style={{ fontWeight: 600, marginBottom: 8 }}>Ticker</div>
            <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
              <input
                value={symbol}
                onChange={(e) => { setSymbol(e.target.value.toUpperCase()); setSymbolTouched(true); }}
                style={{ flex: 1, padding: 8, borderRadius: 10, border: "1px solid #cbd5f5", fontSize: 14 }}
              />
              <select
                value={interval}
                onChange={(e) => setInterval(e.target.value)}
                style={{ padding: 8, borderRadius: 10, border: "1px solid #cbd5f5" }}
              >
                {INTERVALS.map(i => <option key={i.value} value={i.value}>{i.label}</option>)}
              </select>
            </div>
            <div style={{ marginTop: 10, display: "grid", gap: 6 }}>
              <div style={{ fontSize: 22, fontWeight: 700, fontFamily: "'IBM Plex Mono', monospace" }}>
                {formatNumber(last?.c)}
              </div>
              <div style={{ fontSize: 12, color: change >= 0 ? "#16a34a" : "#dc2626" }}>
                {change >= 0 ? "+" : ""}{formatNumber(change)} ({formatNumber(changePct, 2)}%)
              </div>
              <div style={{ fontSize: 11, color: "#64748b" }}>Data: {dataSource}{liveTag}{loading ? " (loading...)" : ""}</div>
              {error && <div style={{ fontSize: 11, color: "#b91c1c" }}>{error}</div>}
            </div>
          </div>

          <div style={{ background: "#ffffff", borderRadius: 14, padding: 14, border: "1px solid #e5e7eb" }}>
            <div style={{ fontWeight: 600, marginBottom: 8 }}>Order Ticket</div>
            <div style={{ display: "grid", gap: 8, fontSize: 12 }}>
              <label>
                Broker
                <select
                  value={order.broker}
                  onChange={(e) => setOrder({ ...order, broker: e.target.value })}
                  style={{ width: "100%", padding: 6, borderRadius: 8, border: "1px solid #cbd5f5" }}
                >
                  <option value="coinbase">Coinbase</option>
                  <option value="alpaca">Alpaca</option>
                  <option value="schwab">Schwab</option>
                </select>
              </label>
              <div style={{ display: "flex", gap: 6 }}>
                <button onClick={() => setOrder({ ...order, side: "buy" })} style={{
                  flex: 1,
                  padding: "6px 0",
                  borderRadius: 8,
                  border: order.side === "buy" ? "2px solid #22c55e" : "1px solid #cbd5f5",
                  background: order.side === "buy" ? "#dcfce7" : "#fff"
                }}>Buy</button>
                <button onClick={() => setOrder({ ...order, side: "sell" })} style={{
                  flex: 1,
                  padding: "6px 0",
                  borderRadius: 8,
                  border: order.side === "sell" ? "2px solid #ef4444" : "1px solid #cbd5f5",
                  background: order.side === "sell" ? "#fee2e2" : "#fff"
                }}>Sell</button>
              </div>
              <label>
                Quantity
                <input
                  value={order.quantity}
                  onChange={(e) => setOrder({ ...order, quantity: e.target.value })}
                  style={{ width: "100%", padding: 6, borderRadius: 8, border: "1px solid #cbd5f5" }}
                />
              </label>
              <label>
                Order Type
                <select
                  value={order.orderType}
                  onChange={(e) => setOrder({ ...order, orderType: e.target.value })}
                  style={{ width: "100%", padding: 6, borderRadius: 8, border: "1px solid #cbd5f5" }}
                >
                  <option value="market">Market</option>
                  <option value="limit">Limit</option>
                </select>
              </label>
              {order.orderType === "limit" && (
                <label>
                  Limit Price
                  <input
                    value={order.limitPrice}
                    onChange={(e) => setOrder({ ...order, limitPrice: e.target.value })}
                    style={{ width: "100%", padding: 6, borderRadius: 8, border: "1px solid #cbd5f5" }}
                  />
                </label>
              )}
              <label>
                Mode
                <select
                  value={order.mode}
                  onChange={(e) => setOrder({ ...order, mode: e.target.value })}
                  style={{ width: "100%", padding: 6, borderRadius: 8, border: "1px solid #cbd5f5" }}
                >
                  <option value="paper">Paper</option>
                  <option value="live">Live</option>
                </select>
              </label>
            </div>
            <div style={{ display: "flex", gap: 8, marginTop: 10 }}>
              <button onClick={handlePropose} style={{ flex: 1, padding: "8px 10px", borderRadius: 10, border: "1px solid #0ea5e9", background: "#0ea5e9", color: "#fff", fontWeight: 600 }}>
                Propose Trade
              </button>
              <button onClick={handleApproveExecute} disabled={!approvalId} style={{ flex: 1, padding: "8px 10px", borderRadius: 10, border: "1px solid #0f172a", background: "#0f172a", color: "#fff" }}>
                Approve + Execute
              </button>
            </div>
            <div style={{ fontSize: 11, color: "#64748b", marginTop: 8 }}>
              {tradeStatus || "All trades require approval by default."}
            </div>
            {approvalId && <div style={{ fontSize: 11, color: "#2563eb" }}>Approval ID: {approvalId}</div>}
            {orderId && <div style={{ fontSize: 11, color: "#2563eb" }}>Order ID: {orderId}</div>}
            <label style={{ marginTop: 8, fontSize: 12, display: "block" }}>
              Trading API Base URL
              <input
                value={tradeApiUrl}
                onChange={(e) => {
                  setTradeApiUrl(e.target.value);
                  try { window.localStorage.setItem("trading_api_url", e.target.value); } catch {}
                }}
                style={{ width: "100%", padding: 6, borderRadius: 8, border: "1px solid #cbd5f5", marginTop: 4 }}
              />
            </label>
          </div>

          <div style={{ background: "#ffffff", borderRadius: 14, padding: 14, border: "1px solid #e5e7eb" }}>
            <div style={{ fontWeight: 600, marginBottom: 8 }}>Post-Trade Outcome</div>
            <div style={{ display: "grid", gap: 8, fontSize: 12 }}>
              <label>
                PnL
                <input
                  value={outcome.pnl}
                  onChange={(e) => setOutcome({ ...outcome, pnl: e.target.value })}
                  placeholder="-120.50"
                  style={{ width: "100%", padding: 6, borderRadius: 8, border: "1px solid #cbd5f5" }}
                />
              </label>
              <label>
                PnL %
                <input
                  value={outcome.pnlPct}
                  onChange={(e) => setOutcome({ ...outcome, pnlPct: e.target.value })}
                  placeholder="-1.8"
                  style={{ width: "100%", padding: 6, borderRadius: 8, border: "1px solid #cbd5f5" }}
                />
              </label>
              <label>
                Notes (what went wrong / right)
                <textarea
                  value={outcome.notes}
                  onChange={(e) => setOutcome({ ...outcome, notes: e.target.value })}
                  rows={3}
                  style={{ width: "100%", padding: 6, borderRadius: 8, border: "1px solid #cbd5f5" }}
                />
              </label>
              <button onClick={recordOutcome} style={{ padding: "8px 10px", borderRadius: 10, border: "1px solid #0ea5e9", background: "#0ea5e9", color: "#fff", fontWeight: 600 }}>
                Record Outcome
              </button>
              {lessonStatus && <div style={{ fontSize: 11, color: "#2563eb" }}>{lessonStatus}</div>}
            </div>
          </div>

          <div style={{ background: "#ffffff", borderRadius: 14, padding: 14, border: "1px solid #e5e7eb" }}>
            <div style={{ fontWeight: 600, marginBottom: 8 }}>Glossary</div>
            <div style={{ display: "grid", gap: 6, fontSize: 12 }}>
              {GLOSSARY.map(item => (
                <div key={item.term}>
                  <strong>{item.term}:</strong> {item.def}
                </div>
              ))}
            </div>
          </div>
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          <div style={{ background: "#ffffff", borderRadius: 14, padding: 12, border: "1px solid #e5e7eb" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
              <div style={{ fontWeight: 600 }}>Price Action</div>
              <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
                <div style={{ fontSize: 12, color: "#64748b" }}>Pattern: {patterns[0] || "--"}</div>
                {liveStatus && <div style={{ fontSize: 11, color: "#0ea5e9" }}>{liveStatus}</div>}
              </div>
            </div>
            <div style={{ display: "flex", gap: 12, flexWrap: "wrap", marginBottom: 8, fontSize: 11, alignItems: "center" }}>
              <label style={{ display: "flex", gap: 6, alignItems: "center" }}>
                <input type="checkbox" checked={showVwap} onChange={(e) => setShowVwap(e.target.checked)} />
                VWAP
              </label>
              <label style={{ display: "flex", gap: 6, alignItems: "center" }}>
                <input type="checkbox" checked={showRsi} onChange={(e) => setShowRsi(e.target.checked)} />
                RSI
              </label>
              <label style={{ display: "flex", gap: 6, alignItems: "center" }}>
                <input type="checkbox" checked={showMacd} onChange={(e) => setShowMacd(e.target.checked)} />
                MACD
              </label>
              {assetClass === "stock" && (
                <label style={{ display: "flex", gap: 6, alignItems: "center" }}>
                  Alpaca feed
                  <select
                    value={alpacaFeed}
                    onChange={(e) => setAlpacaFeed(e.target.value)}
                    style={{ padding: "2px 6px", borderRadius: 6, border: "1px solid #cbd5f5" }}
                  >
                    <option value="iex">IEX (default)</option>
                    <option value="sip">SIP (paid)</option>
                  </select>
                </label>
              )}
            </div>
            <div style={{ height: 360 }}>
              <CandlestickChart candles={candles} vwap={vwapSeries} width={760} height={360} />
            </div>
            <div style={{ display: "grid", gap: 10, marginTop: 10 }}>
              {showRsi && (
                <IndicatorPanel
                  title="RSI (14)"
                  series={rsiSeries}
                  min={0}
                  max={100}
                  thresholds={[30, 70]}
                  width={760}
                  height={120}
                />
              )}
              {showMacd && (
                <MacdPanel
                  macd={macdSeries.macd}
                  signal={macdSeries.signal}
                  histogram={macdSeries.histogram}
                  width={760}
                  height={140}
                />
              )}
            </div>
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
            <div style={{ background: "#ffffff", borderRadius: 14, padding: 12, border: "1px solid #e5e7eb" }}>
              <div style={{ fontWeight: 600, marginBottom: 8 }}>Candle Signals</div>
              {patterns.map((p, idx) => (
                <div key={`${p}-${idx}`} style={{ fontSize: 12, color: "#475569" }}>? {p}</div>
              ))}
              {patterns.length === 0 && <div style={{ fontSize: 12, color: "#64748b" }}>Not enough data.</div>}
            </div>
            <div style={{ background: "#ffffff", borderRadius: 14, padding: 12, border: "1px solid #e5e7eb" }}>
              <div style={{ fontWeight: 600, marginBottom: 8 }}>Market Depth</div>
              <div style={{ fontSize: 12, color: "#64748b" }}>Connect a broker WS feed to render live depth.</div>
              <div style={{ marginTop: 8, height: 120, background: "linear-gradient(180deg, #e0f2fe 0%, #fef3c7 100%)", borderRadius: 10 }} />
            </div>
          </div>
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          <div style={{ background: "#ffffff", borderRadius: 14, padding: 12, border: "1px solid #e5e7eb" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
              <div style={{ fontWeight: 600 }}>Recommendations</div>
              <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                <span style={{ fontSize: 10, color: "#94a3b8", textTransform: "uppercase" }}>
                  {recommendationsSource || "llm"}
                </span>
                <button onClick={loadRecommendations} style={{ padding: "4px 8px", borderRadius: 8 }}>
                  Refresh
                </button>
              </div>
            </div>
              <div style={{ fontSize: 11, color: "#64748b" }}>
                Ranked picks with rationale (LLM + trading knowledge).
              </div>
            {recommendationsLoading && (
              <div style={{ fontSize: 11, color: "#94a3b8", marginTop: 6 }}>Loading picks…</div>
            )}
            {recommendationsError && (
              <div style={{ fontSize: 11, color: "#b91c1c", marginTop: 6 }}>{recommendationsError}</div>
            )}
            <div style={{ display: "grid", gap: 8, marginTop: 8 }}>
              <div>
                <div style={{ fontSize: 12, fontWeight: 600, marginBottom: 4 }}>Crypto</div>
                {cryptoRecs.length === 0 && <div style={{ fontSize: 11, color: "#94a3b8" }}>No crypto picks.</div>}
                  {cryptoRecs.slice(0, 6).map((item, idx) => (
                    <div
                      key={`${item.symbol}-${idx}`}
                      onClick={() => handleRecommendationAnalyze(item)}
                      style={{ border: "1px solid #e5e7eb", borderRadius: 10, padding: 8, marginBottom: 6, cursor: "pointer" }}
                    >
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                        <div style={{ fontWeight: 600 }}>{idx + 1}. {item.symbol}</div>
                        <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
                          <span style={{
                            fontSize: 10,
                            padding: "2px 6px",
                            borderRadius: 999,
                            background: item.bias === "BUY" ? "#dcfce7" : item.bias === "SELL" ? "#fee2e2" : "#e2e8f0",
                            color: item.bias === "BUY" ? "#15803d" : item.bias === "SELL" ? "#b91c1c" : "#475569"
                          }}>
                            {item.bias}
                          </span>
                          <button
                            onClick={(e) => { e.stopPropagation(); handleRecommendationAnalyze(item); }}
                            style={{ padding: "2px 6px", borderRadius: 6, border: "1px solid #0ea5e9", background: "#e0f2fe", color: "#0ea5e9", fontSize: 10 }}
                          >
                            Analyze
                          </button>
                        </div>
                      </div>
                      {Number.isFinite(item.confidence) && (
                        <div style={{ fontSize: 10, color: "#94a3b8", marginTop: 2 }}>
                          Confidence: {(Number(item.confidence) * 100).toFixed(0)}%
                        </div>
                    )}
                    <div style={{ fontSize: 11, color: "#64748b", marginTop: 4 }}>{item.abstract}</div>
                  </div>
                ))}
              </div>
              <div>
                <div style={{ fontSize: 12, fontWeight: 600, marginBottom: 4 }}>Stocks</div>
                {stockRecs.length === 0 && <div style={{ fontSize: 11, color: "#94a3b8" }}>No stock picks.</div>}
                  {stockRecs.slice(0, 6).map((item, idx) => (
                    <div
                      key={`${item.symbol}-${idx}`}
                      onClick={() => handleRecommendationAnalyze(item)}
                      style={{ border: "1px solid #e5e7eb", borderRadius: 10, padding: 8, marginBottom: 6, cursor: "pointer" }}
                    >
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                      <div style={{ fontWeight: 600 }}>{idx + 1}. {item.symbol}</div>
                      <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
                        <span style={{
                          fontSize: 10,
                          padding: "2px 6px",
                          borderRadius: 999,
                          background: item.bias === "BUY" ? "#dcfce7" : item.bias === "SELL" ? "#fee2e2" : "#e2e8f0",
                          color: item.bias === "BUY" ? "#15803d" : item.bias === "SELL" ? "#b91c1c" : "#475569"
                        }}>
                          {item.bias}
                        </span>
                          <button
                            onClick={(e) => { e.stopPropagation(); handleRecommendationAnalyze(item); }}
                            style={{ padding: "2px 6px", borderRadius: 6, border: "1px solid #0ea5e9", background: "#e0f2fe", color: "#0ea5e9", fontSize: 10 }}
                          >
                            Analyze
                          </button>
                      </div>
                    </div>
                    {Number.isFinite(item.confidence) && (
                      <div style={{ fontSize: 10, color: "#94a3b8", marginTop: 2 }}>
                        Confidence: {(Number(item.confidence) * 100).toFixed(0)}%
                      </div>
                    )}
                    <div style={{ fontSize: 11, color: "#64748b", marginTop: 4 }}>{item.abstract}</div>
                  </div>
                ))}
              </div>
            </div>
          </div>

          <div style={{ background: "#ffffff", borderRadius: 14, padding: 12, border: "1px solid #e5e7eb", height: "100%" }}>
            <div style={{ fontWeight: 600, marginBottom: 6 }}>Aika Trader</div>
            <div style={{ fontSize: 12, color: "#64748b", marginBottom: 8 }}>
              Educational only. Ask for scenarios, risks, or ticker checks.
            </div>
            {tradingProfileError && (
              <div style={{ fontSize: 11, color: "#b91c1c", marginBottom: 6 }}>
                Preferences not loaded: {tradingProfileError}
              </div>
            )}
            <div style={{ display: "flex", flexDirection: "column", gap: 8, maxHeight: 320, overflow: "auto", fontSize: 12 }}>
              {assistantMessages.map((m, idx) => (
                <div key={`${m.role}-${idx}`} style={{
                  padding: 8,
                  borderRadius: 10,
                  background: m.role === "assistant" ? "#f1f5f9" : "#e0f2fe",
                  alignSelf: m.role === "assistant" ? "flex-start" : "flex-end",
                  maxWidth: "95%"
                }}>
                  <strong style={{ textTransform: "capitalize" }}>{m.role}:</strong> {m.content}
                </div>
              ))}
            </div>
            <div style={{ display: "flex", gap: 8, marginTop: 10 }}>
              <input
                value={assistantInput}
                onChange={(e) => setAssistantInput(e.target.value)}
                placeholder={`Ask about ${symbol}...`}
                style={{ flex: 1, padding: 8, borderRadius: 10, border: "1px solid #cbd5f5" }}
              />
              <button onClick={sendAssistant} style={{ padding: "8px 12px", borderRadius: 10, border: "1px solid #0ea5e9", background: "#0ea5e9", color: "#fff", fontWeight: 600 }}>
                Ask
              </button>
            </div>
            <div style={{ marginTop: 10, display: "grid", gap: 6 }}>
              {[
                "Summarize current trend",
                "List key risks for this asset",
                "Is volatility rising?",
                "Give me support and resistance zones",
                "What should I watch before entering?"
                ].map(prompt => (
                  <button
                    key={prompt}
                    onClick={() => { sendAssistant(prompt); }}
                    style={{ padding: "6px 8px", borderRadius: 8, border: "1px solid #e2e8f0", background: "#fff", textAlign: "left", fontSize: 11 }}
                  >
                    {prompt}
                  </button>
              ))}
            </div>
          </div>

          <div style={{ background: "#ffffff", borderRadius: 14, padding: 12, border: "1px solid #e5e7eb" }}>
            <div style={{ fontWeight: 600, marginBottom: 8 }}>Loss Lessons (RAG)</div>
            <div style={{ display: "flex", gap: 8, marginBottom: 8 }}>
              <input
                value={lessonQuery}
                onChange={(e) => setLessonQuery(e.target.value)}
                placeholder={`Ask about past losses on ${symbol}`}
                style={{ flex: 1, padding: 8, borderRadius: 10, border: "1px solid #cbd5f5" }}
              />
              <button onClick={fetchLessons} style={{ padding: "8px 12px", borderRadius: 10, border: "1px solid #0ea5e9", background: "#0ea5e9", color: "#fff", fontWeight: 600 }}>
                Fetch
              </button>
            </div>
            {lessons.length === 0 ? (
              <div style={{ fontSize: 12, color: "#64748b" }}>No lessons fetched yet.</div>
            ) : (
              <div style={{ display: "grid", gap: 8, fontSize: 12 }}>
                {lessons.map((lesson, idx) => (
                  <div key={`${lesson.outcome_id || idx}`} style={{ padding: 8, borderRadius: 10, background: "#f8fafc" }}>
                    <div style={{ fontWeight: 600 }}>{lesson.symbol || symbol}</div>
                    <div>{lesson.summary || "Loss lesson recorded."}</div>
                    {lesson.tags && <div style={{ fontSize: 11, color: "#475569" }}>Tags: {lesson.tags.join(", ")}</div>}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
      )}

      {tradingTab === "paper" && (
        <div style={{ display: "grid", gridTemplateColumns: "1.1fr 1.5fr", gap: 16 }}>
          <div style={{ display: "grid", gap: 12 }}>
            <div style={{ background: "#ffffff", borderRadius: 14, padding: 14, border: "1px solid #e5e7eb" }}>
              <div style={{ fontWeight: 600, marginBottom: 6 }}>Beginner Checklist</div>
              <div style={{ fontSize: 12, color: "#64748b", display: "grid", gap: 6 }}>
                <div>1) Decide direction: bullish, bearish, or neutral.</div>
                <div>2) Pick your max loss first. Never size from profit.</div>
                <div>3) Check breakeven and probability ITM.</div>
                <div>4) Keep position size small while learning.</div>
              </div>
            </div>
            <div style={{ background: "#ffffff", borderRadius: 14, padding: 14, border: "1px solid #e5e7eb" }}>
              <div style={{ fontWeight: 600, marginBottom: 6 }}>Paper Runner</div>
              <div style={{ fontSize: 12, color: "#64748b", marginBottom: 10 }}>
                Deterministic synthetic data runs through the core strategy stack and logs fills.
              </div>
              <div style={{ display: "grid", gap: 8 }}>
                <input
                  value={coreSymbols}
                  onChange={(e) => setCoreSymbols(e.target.value)}
                  placeholder="Symbols (comma-separated)"
                  style={{ padding: 8, borderRadius: 10, border: "1px solid #cbd5f5" }}
                />
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
                  <select
                    value={coreStrategy}
                    onChange={(e) => setCoreStrategy(e.target.value)}
                    style={{ padding: 8, borderRadius: 10, border: "1px solid #cbd5f5" }}
                  >
                    {CORE_STRATEGIES.map(item => (
                      <option key={item.value} value={item.value}>{item.label}</option>
                    ))}
                  </select>
                  <select
                    value={coreTimeframe}
                    onChange={(e) => setCoreTimeframe(e.target.value)}
                    style={{ padding: 8, borderRadius: 10, border: "1px solid #cbd5f5" }}
                  >
                    {INTERVALS.map(item => (
                      <option key={item.value} value={item.value}>{item.label}</option>
                    ))}
                  </select>
                </div>
                <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                  <button
                    onClick={runCorePaper}
                    style={{ padding: "8px 12px", borderRadius: 10, border: "1px solid #0ea5e9", background: "#0ea5e9", color: "#fff", fontWeight: 600 }}
                  >
                    Run Paper Cycle
                  </button>
                  <button
                    onClick={() => { fetchCoreDashboard(); fetchCoreTrades(); }}
                    style={{ padding: "8px 12px", borderRadius: 10, border: "1px solid #e2e8f0", background: "#fff", fontWeight: 600 }}
                  >
                    Refresh
                  </button>
                </div>
                {coreStatus && <div style={{ fontSize: 12, color: "#475569" }}>{coreStatus}</div>}
              </div>
            </div>

            <div style={{ background: "#ffffff", borderRadius: 14, padding: 14, border: "1px solid #e5e7eb" }}>
              <div style={{ fontWeight: 600, marginBottom: 8 }}>Trade Log</div>
              {coreTrades.length === 0 ? (
                <div style={{ fontSize: 12, color: "#94a3b8" }}>No fills yet.</div>
              ) : (
                <div style={{ display: "grid", gap: 8, maxHeight: 320, overflow: "auto" }}>
                  {coreTrades.map((fill, idx) => (
                    <div key={`${fill.order_id || idx}`} style={{ border: "1px solid #e5e7eb", borderRadius: 10, padding: 8 }}>
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                        <div style={{ fontWeight: 600 }}>{fill.symbol}</div>
                        <span style={{ fontSize: 10, color: fill.side === "buy" ? "#16a34a" : "#dc2626" }}>{fill.side}</span>
                      </div>
                      <div style={{ fontSize: 11, color: "#64748b" }}>
                        Qty {Number(fill.quantity || 0).toFixed(4)} @ {formatNumber(fill.price || 0, 4)}
                      </div>
                      <div style={{ fontSize: 10, color: "#94a3b8" }}>
                        Fee {formatNumber(fill.fee || 0, 4)} | {fill.filled_at || ""}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          <div style={{ display: "grid", gap: 12 }}>
            <div style={{ background: "#ffffff", borderRadius: 14, padding: 14, border: "1px solid #e5e7eb" }}>
              <div style={{ fontWeight: 600, marginBottom: 8 }}>Latest Run</div>
              {!coreDashboard ? (
                <div style={{ fontSize: 12, color: "#94a3b8" }}>No paper runs yet.</div>
              ) : (
                <div style={{ display: "grid", gap: 6, fontSize: 12 }}>
                  <div><strong>Run:</strong> {coreDashboard.run_id}</div>
                  <div><strong>Mode:</strong> {coreDashboard.mode}</div>
                  <div><strong>Strategy:</strong> {coreDashboard.strategy}</div>
                  <div><strong>Symbols:</strong> {(coreDashboard.symbols || []).join(", ")}</div>
                  <div><strong>Equity:</strong> {formatNumber(coreDashboard.equity || 0, 2)}</div>
                  <div><strong>Cash:</strong> {formatNumber(coreDashboard.cash || 0, 2)}</div>
                  <div><strong>Exposure:</strong> {formatNumber(coreDashboard.exposure || 0, 2)}</div>
                  <div><strong>Status:</strong> {coreDashboard.status}</div>
                  {coreDashboard.metrics?.backtest && (
                    <div style={{ display: "grid", gap: 4, marginTop: 6 }}>
                      <div><strong>Sharpe:</strong> {formatNumber(coreDashboard.metrics.backtest.sharpe || 0, 2)}</div>
                      <div><strong>Max DD:</strong> {formatNumber(coreDashboard.metrics.backtest.max_drawdown || 0, 2)}</div>
                    </div>
                  )}
                </div>
              )}
            </div>

            <div style={{ background: "#ffffff", borderRadius: 14, padding: 14, border: "1px solid #e5e7eb" }}>
              <div style={{ fontWeight: 600, marginBottom: 8 }}>Risk Flags</div>
              {(coreDashboard?.risk_flags || []).length === 0 ? (
                <div style={{ fontSize: 12, color: "#94a3b8" }}>No risk flags.</div>
              ) : (
                <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                  {(coreDashboard.risk_flags || []).map(flag => (
                    <span key={flag} style={{ fontSize: 10, padding: "2px 8px", borderRadius: 999, background: "#fee2e2", color: "#b91c1c" }}>
                      {flag}
                    </span>
                  ))}
                </div>
              )}
            </div>

            <div style={{ background: "#ffffff", borderRadius: 14, padding: 14, border: "1px solid #e5e7eb" }}>
              <div style={{ fontWeight: 600, marginBottom: 8 }}>Equity Curve</div>
              <IndicatorPanel
                title="Equity"
                series={(coreDashboard?.equity_curve || []).map(value => Number(value))}
                height={160}
              />
              <div style={{ marginTop: 10 }}>
                <IndicatorPanel
                  title="Drawdown"
                  series={(coreDashboard?.drawdown_curve || []).map(value => Number(value))}
                  min={0}
                  max={1}
                  height={120}
                />
              </div>
            </div>

            <div style={{ background: "#ffffff", borderRadius: 14, padding: 14, border: "1px solid #e5e7eb" }}>
              <div style={{ fontWeight: 600, marginBottom: 8 }}>Regime Mix</div>
              {regimeSummary.length === 0 ? (
                <div style={{ fontSize: 12, color: "#94a3b8" }}>No regime labels yet.</div>
              ) : (
                <div style={{ display: "grid", gap: 6 }}>
                  {regimeSummary.map(item => (
                    <div key={item.label} style={{ display: "flex", justifyContent: "space-between", fontSize: 12 }}>
                      <span>{item.label}</span>
                      <span style={{ color: "#64748b" }}>{(item.pct * 100).toFixed(1)}%</span>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div style={{ background: "#ffffff", borderRadius: 14, padding: 14, border: "1px solid #e5e7eb" }}>
              <div style={{ fontWeight: 600, marginBottom: 8 }}>Ensemble Weights</div>
              {Object.keys(ensembleWeights).length === 0 ? (
                <div style={{ fontSize: 12, color: "#94a3b8" }}>No weights available.</div>
              ) : (
                <div style={{ display: "grid", gap: 6 }}>
                  {Object.entries(ensembleWeights).map(([name, weight]) => (
                    <div key={name} style={{ display: "flex", justifyContent: "space-between", fontSize: 12 }}>
                      <span>{name}</span>
                      <span style={{ color: "#64748b" }}>{(Number(weight) * 100).toFixed(1)}%</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {tradingTab === "backtest" && (
        <div style={{ display: "grid", gridTemplateColumns: "1.1fr 1.5fr", gap: 16 }}>
          <div style={{ display: "grid", gap: 12 }}>
            <div style={{ background: "#ffffff", borderRadius: 14, padding: 14, border: "1px solid #e5e7eb" }}>
              <div style={{ fontWeight: 600, marginBottom: 6 }}>Backtest Wizard</div>
              <div style={{ fontSize: 12, color: "#64748b", marginBottom: 10 }}>
                Paste a symbol, pick a strategy, and click Run. Grid search is optional.
              </div>
              <div style={{ display: "grid", gap: 8 }}>
                <input
                  value={backtestSymbol}
                  onChange={(e) => setBacktestSymbol(e.target.value.toUpperCase())}
                  placeholder="Symbol (e.g., AAPL)"
                  style={{ padding: 8, borderRadius: 10, border: "1px solid #cbd5f5" }}
                />
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
                  <select
                    value={backtestStrategy}
                    onChange={(e) => setBacktestStrategy(e.target.value)}
                    style={{ padding: 8, borderRadius: 10, border: "1px solid #cbd5f5" }}
                  >
                    {CORE_STRATEGIES.map(item => (
                      <option key={item.value} value={item.value}>{item.label}</option>
                    ))}
                  </select>
                  <select
                    value={backtestTimeframe}
                    onChange={(e) => setBacktestTimeframe(e.target.value)}
                    style={{ padding: 8, borderRadius: 10, border: "1px solid #cbd5f5" }}
                  >
                    {INTERVALS.map(item => (
                      <option key={item.value} value={item.value}>{item.label}</option>
                    ))}
                  </select>
                </div>
                <textarea
                  value={backtestGrid}
                  onChange={(e) => setBacktestGrid(e.target.value)}
                  rows={5}
                  placeholder='Grid JSON (optional) e.g. {"lookback":[20,50,80]}'
                  style={{ padding: 8, borderRadius: 10, border: "1px solid #cbd5f5", fontFamily: "'IBM Plex Mono', monospace" }}
                />
                <div style={{ display: "flex", gap: 8 }}>
                  <button
                    onClick={runBacktest}
                    style={{ padding: "8px 12px", borderRadius: 10, border: "1px solid #0ea5e9", background: "#0ea5e9", color: "#fff", fontWeight: 600 }}
                  >
                    Run Backtest
                  </button>
                </div>
                {backtestStatus && <div style={{ fontSize: 12, color: "#475569" }}>{backtestStatus}</div>}
              </div>
            </div>

            <div style={{ background: "#ffffff", borderRadius: 14, padding: 14, border: "1px solid #e5e7eb" }}>
              <div style={{ fontWeight: 600, marginBottom: 8 }}>Grid Search</div>
              {!backtestResult?.grid?.best ? (
                <div style={{ fontSize: 12, color: "#94a3b8" }}>Run a backtest to see best params.</div>
              ) : (
                <div style={{ fontSize: 12, display: "grid", gap: 6 }}>
                  <div><strong>Objective:</strong> {backtestResult.grid.objective}</div>
                  <div><strong>Best Params:</strong> {JSON.stringify(backtestResult.grid.best.params)}</div>
                  <div><strong>Best Sharpe:</strong> {formatNumber(backtestResult.grid.best.metrics?.sharpe || 0, 2)}</div>
                </div>
              )}
            </div>
          </div>

          <div style={{ display: "grid", gap: 12 }}>
            <div style={{ background: "#ffffff", borderRadius: 14, padding: 14, border: "1px solid #e5e7eb" }}>
              <div style={{ fontWeight: 600, marginBottom: 8 }}>Backtest Metrics</div>
              {!backtestResult ? (
                <div style={{ fontSize: 12, color: "#94a3b8" }}>No backtest yet.</div>
              ) : (
                <div style={{ display: "grid", gap: 6, fontSize: 12 }}>
                  <div><strong>Run ID:</strong> {backtestResult.run_id}</div>
                  <div><strong>CAGR:</strong> {formatNumber(backtestResult.metrics?.cagr || 0, 3)}</div>
                  <div><strong>Sharpe:</strong> {formatNumber(backtestResult.metrics?.sharpe || 0, 2)}</div>
                  <div><strong>Max Drawdown:</strong> {formatNumber(backtestResult.metrics?.max_drawdown || 0, 2)}</div>
                  {backtestResult.artifacts && (
                    <div><strong>Artifacts:</strong> {backtestResult.artifacts.base_dir} (Run {backtestResult.artifacts.backtest_run})</div>
                  )}
                </div>
              )}
            </div>

            <div style={{ background: "#ffffff", borderRadius: 14, padding: 14, border: "1px solid #e5e7eb" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
                <div style={{ fontWeight: 600 }}>Artifacts (Direct)</div>
                <button
                  onClick={() => loadBacktestArtifacts(backtestResult?.run_id, backtestResult?.grid?.run_id)}
                  style={{ padding: "4px 8px", borderRadius: 8, border: "1px solid #e2e8f0", background: "#fff", fontSize: 11 }}
                >
                  Reload
                </button>
              </div>
              {!backtestArtifacts ? (
                <div style={{ fontSize: 12, color: "#94a3b8" }}>Run a backtest to load artifacts.</div>
              ) : (
                <div style={{ display: "grid", gap: 6, fontSize: 12 }}>
                  <div><strong>Folder:</strong> {backtestArtifacts.base_dir}</div>
                  <div><strong>Equity points:</strong> {(backtestArtifacts.equity_curve || []).length}</div>
                  <div><strong>Trades:</strong> {(backtestArtifacts.trades || []).length}</div>
                  <div><strong>Grid trials:</strong> {(backtestArtifacts.grid?.results || []).length}</div>
                  <div><strong>Walk-forward windows:</strong> {(backtestArtifacts.walk_forward || []).length}</div>
                </div>
              )}
              {backtestArtifactsStatus && (
                <div style={{ marginTop: 8, fontSize: 12, color: "#475569" }}>{backtestArtifactsStatus}</div>
              )}
              <div style={{ marginTop: 8, fontSize: 11, color: "#94a3b8" }}>
                Includes config.json, metrics.json, equity_curve.json, trades.csv, grid_results.json, walk_forward.json.
              </div>
            </div>

            <div style={{ background: "#ffffff", borderRadius: 14, padding: 14, border: "1px solid #e5e7eb" }}>
              <div style={{ fontWeight: 600, marginBottom: 8 }}>Walk-Forward Windows</div>
              {!backtestResult?.walk_forward?.length ? (
                <div style={{ fontSize: 12, color: "#94a3b8" }}>No walk-forward output yet.</div>
              ) : (
                <div style={{ display: "grid", gap: 6, maxHeight: 240, overflow: "auto" }}>
                  {backtestResult.walk_forward.slice(0, 6).map((item, idx) => (
                    <div key={`${item.test_start}-${idx}`} style={{ border: "1px solid #e5e7eb", borderRadius: 10, padding: 8, fontSize: 11 }}>
                      <div><strong>Test:</strong> {item.test_start} -> {item.test_end}</div>
                      <div>Sharpe: {formatNumber(item.metrics?.sharpe || 0, 2)} | MaxDD: {formatNumber(item.metrics?.max_drawdown || 0, 2)}</div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {tradingTab === "options" && (
        <div style={{ display: "grid", gridTemplateColumns: "1.2fr 1.4fr", gap: 16 }}>
          <div style={{ display: "grid", gap: 12 }}>
            <div style={{ background: "#ffffff", borderRadius: 14, padding: 14, border: "1px solid #e5e7eb" }}>
              <div style={{ fontWeight: 600, marginBottom: 6 }}>Options Search (Step 1)</div>
              <div style={{ fontSize: 12, color: "#64748b", marginBottom: 10 }}>
                Type a ticker and load a simple options chain. Default provider is synthetic.
              </div>
              <div style={{ display: "grid", gap: 8 }}>
                <input
                  value={optionsSymbol}
                  onChange={(e) => setOptionsSymbol(e.target.value.toUpperCase())}
                  placeholder="Underlying symbol (e.g., AAPL)"
                  style={{ padding: 8, borderRadius: 10, border: "1px solid #cbd5f5" }}
                />
                <select
                  value={optionsProvider}
                  onChange={(e) => setOptionsProvider(e.target.value)}
                  style={{ padding: 8, borderRadius: 10, border: "1px solid #cbd5f5" }}
                >
                  <option value="synthetic">Synthetic (demo)</option>
                  <option value="polygon">Polygon (API key required)</option>
                </select>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
                  <input
                    value={optionsChainMinDays}
                    onChange={(e) => setOptionsChainMinDays(e.target.value)}
                    placeholder="Min days (7)"
                    style={{ padding: 8, borderRadius: 10, border: "1px solid #cbd5f5" }}
                  />
                  <input
                    value={optionsChainMaxDays}
                    onChange={(e) => setOptionsChainMaxDays(e.target.value)}
                    placeholder="Max days (60)"
                    style={{ padding: 8, borderRadius: 10, border: "1px solid #cbd5f5" }}
                  />
                </div>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
                  <input
                    value={optionsStrikeMin}
                    onChange={(e) => setOptionsStrikeMin(e.target.value)}
                    placeholder="Strike min"
                    style={{ padding: 8, borderRadius: 10, border: "1px solid #cbd5f5" }}
                  />
                  <input
                    value={optionsStrikeMax}
                    onChange={(e) => setOptionsStrikeMax(e.target.value)}
                    placeholder="Strike max"
                    style={{ padding: 8, borderRadius: 10, border: "1px solid #cbd5f5" }}
                  />
                </div>
                <div style={{ fontSize: 11, color: "#94a3b8" }}>Optional expiry range:</div>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
                  <input
                    type="date"
                    value={optionsExpiryFrom}
                    onChange={(e) => setOptionsExpiryFrom(e.target.value)}
                    style={{ padding: 8, borderRadius: 10, border: "1px solid #cbd5f5" }}
                  />
                  <input
                    type="date"
                    value={optionsExpiryTo}
                    onChange={(e) => setOptionsExpiryTo(e.target.value)}
                    style={{ padding: 8, borderRadius: 10, border: "1px solid #cbd5f5" }}
                  />
                </div>
                <button
                  onClick={fetchOptionsChain}
                  style={{ padding: "8px 12px", borderRadius: 10, border: "1px solid #0ea5e9", background: "#0ea5e9", color: "#fff", fontWeight: 600 }}
                >
                  Load Chain
                </button>
                {optionsStatus && <div style={{ fontSize: 12, color: "#475569" }}>{optionsStatus}</div>}
                {optionsUnderlying ? (
                  <div style={{ fontSize: 12, color: "#475569" }}>Underlying price: {formatNumber(optionsUnderlying, 2)}</div>
                ) : null}
              </div>
            </div>

            <div style={{ background: "#ffffff", borderRadius: 14, padding: 14, border: "1px solid #e5e7eb" }}>
              <div style={{ fontWeight: 600, marginBottom: 8 }}>Options Chain (Simplified)</div>
              <input
                value={optionsFilter}
                onChange={(e) => setOptionsFilter(e.target.value)}
                placeholder="Filter by strike, expiry, call/put"
                style={{ padding: 8, borderRadius: 10, border: "1px solid #cbd5f5", marginBottom: 8 }}
              />
              {optionsChain.length === 0 ? (
                <div style={{ fontSize: 12, color: "#94a3b8" }}>Load a chain to see contracts.</div>
              ) : (
                <div style={{ display: "grid", gap: 6, maxHeight: 320, overflow: "auto" }}>
                  {filteredOptions.slice(0, 25).map((opt, idx) => (
                    <div key={`${opt.symbol}-${idx}`} style={{ border: "1px solid #e5e7eb", borderRadius: 10, padding: 8, fontSize: 11 }}>
                      <div style={{ display: "flex", justifyContent: "space-between" }}>
                        <div style={{ fontWeight: 600 }}>{opt.option_type.toUpperCase()} {opt.strike}</div>
                        <div style={{ color: "#64748b" }}>{opt.expiration}</div>
                      </div>
                      <div style={{ color: "#64748b" }}>
                        Bid {formatNumber(opt.bid || 0, 2)} | Ask {formatNumber(opt.ask || 0, 2)} | IV {(Number(opt.iv || 0) * 100).toFixed(1)}%
                      </div>
                      {opt.greeks && (
                        <div style={{ color: "#94a3b8" }}>
                          Delta {formatNumber(opt.greeks.delta || 0, 2)} | Gamma {formatNumber(opt.greeks.gamma || 0, 3)} | Theta {formatNumber(opt.greeks.theta || 0, 2)} | P(ITM) {formatNumber((opt.greeks.prob_itm || 0) * 100, 1)}%
                        </div>
                      )}
                      {opt.greeks && (
                        <div style={{ color: "#cbd5f5" }}>
                          IV Rank {formatNumber((opt.greeks.iv_rank_chain || 0) * 100, 0)}% | IV Rank (Hist) {formatNumber((opt.greeks.iv_rank_hist || 0) * 100, 0)}%
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          <div style={{ display: "grid", gap: 12 }}>
            <div style={{ background: "#ffffff", borderRadius: 14, padding: 14, border: "1px solid #e5e7eb" }}>
              <div style={{ fontWeight: 600, marginBottom: 6 }}>Entry Assistant (Step 0)</div>
              <div style={{ fontSize: 12, color: "#64748b", marginBottom: 10 }}>
                Answer 3 simple questions and get a suggested strategy.
              </div>
              <div style={{ display: "grid", gap: 8 }}>
                <select
                  value={optionsOutlook}
                  onChange={(e) => setOptionsOutlook(e.target.value)}
                  style={{ padding: 8, borderRadius: 10, border: "1px solid #cbd5f5" }}
                >
                  <option value="bullish">Bullish</option>
                  <option value="bearish">Bearish</option>
                  <option value="neutral">Neutral</option>
                </select>
                <select
                  value={optionsGoal}
                  onChange={(e) => setOptionsGoal(e.target.value)}
                  style={{ padding: 8, borderRadius: 10, border: "1px solid #cbd5f5" }}
                >
                  <option value="income">Income</option>
                  <option value="growth">Growth</option>
                </select>
                <select
                  value={optionsRisk}
                  onChange={(e) => setOptionsRisk(e.target.value)}
                  style={{ padding: 8, borderRadius: 10, border: "1px solid #cbd5f5" }}
                >
                  <option value="low">Low Risk</option>
                  <option value="medium">Medium Risk</option>
                  <option value="high">High Risk</option>
                </select>
                <div style={{ fontSize: 12, color: "#334155" }}>
                  <strong>Suggested:</strong> {optionsRecommendation.strategy.replace("_", " ")} — {optionsRecommendation.note}
                </div>
                <button
                  onClick={applyOptionsRecommendation}
                  style={{ padding: "8px 12px", borderRadius: 10, border: "1px solid #0ea5e9", background: "#0ea5e9", color: "#fff", fontWeight: 600 }}
                >
                  Use Suggested Strategy
                </button>
              </div>
            </div>
            <div style={{ background: "#ffffff", borderRadius: 14, padding: 14, border: "1px solid #e5e7eb" }}>
              <div style={{ fontWeight: 600, marginBottom: 6 }}>Strategy Builder (Step 2)</div>
              <div style={{ fontSize: 12, color: "#64748b", marginBottom: 10 }}>
                Pick a beginner-friendly strategy and fill in the fields below.
              </div>
              <div style={{ display: "grid", gap: 8 }}>
                <select
                  value={optionsStrategy}
                  onChange={(e) => setOptionsStrategy(e.target.value)}
                  style={{ padding: 8, borderRadius: 10, border: "1px solid #cbd5f5" }}
                >
                  <option value="covered_call">Covered Call</option>
                  <option value="cash_secured_put">Cash-Secured Put</option>
                  <option value="bull_call_spread">Bull Call Spread</option>
                  <option value="bear_put_spread">Bear Put Spread</option>
                  <option value="iron_condor">Iron Condor</option>
                </select>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
                  <input
                    value={optionsInputs.spot}
                    onChange={(e) => setOptionsInputs(prev => ({ ...prev, spot: e.target.value }))}
                    placeholder="Spot price"
                    style={{ padding: 8, borderRadius: 10, border: "1px solid #cbd5f5" }}
                  />
                  <input
                    value={optionsInputs.strike}
                    onChange={(e) => setOptionsInputs(prev => ({ ...prev, strike: e.target.value }))}
                    placeholder="Strike"
                    style={{ padding: 8, borderRadius: 10, border: "1px solid #cbd5f5" }}
                  />
                </div>
                <input
                  value={optionsInputs.premium}
                  onChange={(e) => setOptionsInputs(prev => ({ ...prev, premium: e.target.value }))}
                  placeholder="Premium (per share)"
                  style={{ padding: 8, borderRadius: 10, border: "1px solid #cbd5f5" }}
                />
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
                  <input
                    value={optionsInputs.long_strike}
                    onChange={(e) => setOptionsInputs(prev => ({ ...prev, long_strike: e.target.value }))}
                    placeholder="Long strike"
                    style={{ padding: 8, borderRadius: 10, border: "1px solid #cbd5f5" }}
                  />
                  <input
                    value={optionsInputs.long_premium}
                    onChange={(e) => setOptionsInputs(prev => ({ ...prev, long_premium: e.target.value }))}
                    placeholder="Long premium"
                    style={{ padding: 8, borderRadius: 10, border: "1px solid #cbd5f5" }}
                  />
                </div>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
                  <input
                    value={optionsInputs.short_strike}
                    onChange={(e) => setOptionsInputs(prev => ({ ...prev, short_strike: e.target.value }))}
                    placeholder="Short strike"
                    style={{ padding: 8, borderRadius: 10, border: "1px solid #cbd5f5" }}
                  />
                  <input
                    value={optionsInputs.short_premium}
                    onChange={(e) => setOptionsInputs(prev => ({ ...prev, short_premium: e.target.value }))}
                    placeholder="Short premium"
                    style={{ padding: 8, borderRadius: 10, border: "1px solid #cbd5f5" }}
                  />
                </div>
                <button
                  onClick={runOptionsStrategy}
                  style={{ padding: "8px 12px", borderRadius: 10, border: "1px solid #0ea5e9", background: "#0ea5e9", color: "#fff", fontWeight: 600 }}
                >
                  Calculate Strategy
                </button>
                {optionsOutcome && (
                  <div style={{ fontSize: 12, color: "#334155" }}>
                    <div><strong>Max Profit:</strong> {formatNumber(optionsOutcome.max_profit || 0, 2)}</div>
                    <div><strong>Max Loss:</strong> {formatNumber(optionsOutcome.max_loss || 0, 2)}</div>
                    <div><strong>Breakeven:</strong> {(optionsOutcome.breakevens || []).map(v => formatNumber(v, 2)).join(", ")}</div>
                  </div>
                )}
              </div>
            </div>

            <div style={{ background: "#ffffff", borderRadius: 14, padding: 14, border: "1px solid #e5e7eb" }}>
              <div style={{ fontWeight: 600, marginBottom: 6 }}>Payoff Chart</div>
              <div style={{ fontSize: 12, color: "#64748b", marginBottom: 8 }}>
                Visualize P/L at expiration for the strategy above.
              </div>
              <div style={{ display: "grid", gap: 8 }}>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
                  <input
                    value={optionsPayoffMin}
                    onChange={(e) => setOptionsPayoffMin(e.target.value)}
                    placeholder="Min price (optional)"
                    style={{ padding: 8, borderRadius: 10, border: "1px solid #cbd5f5" }}
                  />
                  <input
                    value={optionsPayoffMax}
                    onChange={(e) => setOptionsPayoffMax(e.target.value)}
                    placeholder="Max price (optional)"
                    style={{ padding: 8, borderRadius: 10, border: "1px solid #cbd5f5" }}
                  />
                </div>
                <button
                  onClick={runOptionsPayoff}
                  style={{ padding: "8px 12px", borderRadius: 10, border: "1px solid #0ea5e9", background: "#0ea5e9", color: "#fff", fontWeight: 600 }}
                >
                  Show Payoff
                </button>
                {optionsPayoff.length > 0 && (
                  <IndicatorPanel
                    title="Payoff"
                    series={optionsPayoff.map(point => point.pnl)}
                    height={140}
                  />
                )}
              </div>
            </div>

            <div style={{ background: "#ffffff", borderRadius: 14, padding: 14, border: "1px solid #e5e7eb" }}>
              <div style={{ fontWeight: 600, marginBottom: 6 }}>Options Scanner (Step 3)</div>
              <div style={{ fontSize: 12, color: "#64748b", marginBottom: 10 }}>
                Finds contracts with high IV rank, acceptable delta, and good POP for short premium.
              </div>
              <div style={{ display: "grid", gap: 8 }}>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
                  <input
                    value={optionsScanMinDelta}
                    onChange={(e) => setOptionsScanMinDelta(e.target.value)}
                    placeholder="Min delta (0.2)"
                    style={{ padding: 8, borderRadius: 10, border: "1px solid #cbd5f5" }}
                  />
                  <input
                    value={optionsScanMaxDelta}
                    onChange={(e) => setOptionsScanMaxDelta(e.target.value)}
                    placeholder="Max delta (0.4)"
                    style={{ padding: 8, borderRadius: 10, border: "1px solid #cbd5f5" }}
                  />
                </div>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
                  <input
                    value={optionsScanMinIVRank}
                    onChange={(e) => setOptionsScanMinIVRank(e.target.value)}
                    placeholder="Min IV rank (0.5)"
                    style={{ padding: 8, borderRadius: 10, border: "1px solid #cbd5f5" }}
                  />
                  <input
                    value={optionsScanMinIVRankHist}
                    onChange={(e) => setOptionsScanMinIVRankHist(e.target.value)}
                    placeholder="Min IV rank hist (0.5)"
                    style={{ padding: 8, borderRadius: 10, border: "1px solid #cbd5f5" }}
                  />
                </div>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
                  <input
                    value={optionsScanMinPOP}
                    onChange={(e) => setOptionsScanMinPOP(e.target.value)}
                    placeholder="Min POP (0.6)"
                    style={{ padding: 8, borderRadius: 10, border: "1px solid #cbd5f5" }}
                  />
                  <input
                    value={optionsScanMinDays}
                    onChange={(e) => setOptionsScanMinDays(e.target.value)}
                    placeholder="Min days (14)"
                    style={{ padding: 8, borderRadius: 10, border: "1px solid #cbd5f5" }}
                  />
                </div>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
                  <input
                    value={optionsScanMaxDays}
                    onChange={(e) => setOptionsScanMaxDays(e.target.value)}
                    placeholder="Max days (60)"
                    style={{ padding: 8, borderRadius: 10, border: "1px solid #cbd5f5" }}
                  />
                  <div style={{ fontSize: 11, color: "#94a3b8", alignSelf: "center" }}>
                    Leave blank to ignore a filter.
                  </div>
                </div>
                <button
                  onClick={runOptionsScan}
                  style={{ padding: "8px 12px", borderRadius: 10, border: "1px solid #0ea5e9", background: "#0ea5e9", color: "#fff", fontWeight: 600 }}
                >
                  Run Scanner
                </button>
                {optionsScanResults.length > 0 && (
                  <div style={{ display: "grid", gap: 6, maxHeight: 200, overflow: "auto" }}>
                    {optionsScanResults.map((item, idx) => (
                      <div key={`${item.symbol}-${idx}`} style={{ border: "1px solid #e5e7eb", borderRadius: 10, padding: 8, fontSize: 11 }}>
                        <div style={{ fontWeight: 600 }}>{item.option_type.toUpperCase()} {item.strike} - {item.expiration}</div>
                        <div style={{ color: "#64748b" }}>
                          IV Rank {((item.iv_rank || 0) * 100).toFixed(0)}% | IV Rank (Hist) {((item.iv_rank_hist || 0) * 100).toFixed(0)}% | Delta {formatNumber(item.delta, 2)} | POP {(item.pop * 100).toFixed(0)}%
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>

            <div style={{ background: "#ffffff", borderRadius: 14, padding: 14, border: "1px solid #e5e7eb" }}>
              <div style={{ fontWeight: 600, marginBottom: 6 }}>Options Backtest (Step 4)</div>
              <div style={{ fontSize: 12, color: "#64748b", marginBottom: 10 }}>
                Run a simple historical simulation (daily bars) for wheel, covered call, or vertical spreads.
              </div>
              <div style={{ display: "grid", gap: 8 }}>
                <select
                  value={optionsBacktestStrategy}
                  onChange={(e) => setOptionsBacktestStrategy(e.target.value)}
                  style={{ padding: 8, borderRadius: 10, border: "1px solid #cbd5f5" }}
                >
                  <option value="wheel">Wheel</option>
                  <option value="covered_call">Covered Call</option>
                  <option value="bull_call_spread">Bull Call Spread</option>
                  <option value="bear_put_spread">Bear Put Spread</option>
                </select>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
                  <input
                    value={optionsBacktestHoldDays}
                    onChange={(e) => setOptionsBacktestHoldDays(e.target.value)}
                    placeholder="Hold days (30)"
                    style={{ padding: 8, borderRadius: 10, border: "1px solid #cbd5f5" }}
                  />
                  <input
                    value={optionsBacktestInitialCash}
                    onChange={(e) => setOptionsBacktestInitialCash(e.target.value)}
                    placeholder="Initial cash (10000)"
                    style={{ padding: 8, borderRadius: 10, border: "1px solid #cbd5f5" }}
                  />
                </div>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
                  <input
                    value={optionsBacktestOtmPct}
                    onChange={(e) => setOptionsBacktestOtmPct(e.target.value)}
                    placeholder="OTM % (0.05)"
                    style={{ padding: 8, borderRadius: 10, border: "1px solid #cbd5f5" }}
                  />
                  <input
                    value={optionsBacktestSpread}
                    onChange={(e) => setOptionsBacktestSpread(e.target.value)}
                    placeholder="Spread width % (0.05)"
                    style={{ padding: 8, borderRadius: 10, border: "1px solid #cbd5f5" }}
                  />
                </div>
                <button
                  onClick={runOptionsBacktest}
                  style={{ padding: "8px 12px", borderRadius: 10, border: "1px solid #0ea5e9", background: "#0ea5e9", color: "#fff", fontWeight: 600 }}
                >
                  Run Options Backtest
                </button>
                {optionsBacktestResult && (
                  <div style={{ fontSize: 12, color: "#334155" }}>
                    <div><strong>CAGR:</strong> {formatNumber(optionsBacktestResult.metrics?.cagr || 0, 3)}</div>
                    <div><strong>Sharpe:</strong> {formatNumber(optionsBacktestResult.metrics?.sharpe || 0, 2)}</div>
                    <div><strong>Max DD:</strong> {formatNumber(optionsBacktestResult.metrics?.max_drawdown || 0, 2)}</div>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {tradingTab === "qa" && (
        <div style={{ display: "grid", gridTemplateColumns: "1.2fr 1.8fr", gap: 16 }}>
          <div style={{ display: "grid", gap: 12 }}>
            <div style={{ background: "#ffffff", borderRadius: 14, padding: 14, border: "1px solid #e5e7eb" }}>
              <div style={{ fontWeight: 600, marginBottom: 8 }}>Ask Trading Knowledge</div>
              <div style={{ fontSize: 12, color: "#64748b", marginBottom: 10 }}>
                Uses the RAG knowledge base first, then expands with the LLM if needed.
              </div>
              <textarea
                value={qaQuestion}
                onChange={(e) => setQaQuestion(e.target.value)}
                rows={6}
                placeholder="Ask about indicators, strategy, risk management, market structure..."
                style={{ width: "100%", padding: 8, borderRadius: 10, border: "1px solid #cbd5f5" }}
              />
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 8 }}>
                <input
                  type="checkbox"
                  checked={qaAllowFallback}
                  onChange={(e) => setQaAllowFallback(e.target.checked)}
                />
                <span style={{ fontSize: 11, color: "#64748b" }}>Allow LLM fallback for more depth</span>
              </div>
              <div style={{ display: "flex", gap: 8, marginTop: 10 }}>
                <button
                  onClick={askTradingQa}
                  style={{ padding: "8px 12px", borderRadius: 10, border: "1px solid #0ea5e9", background: "#0ea5e9", color: "#fff", fontWeight: 600 }}
                >
                  Ask
                </button>
                {qaStatus && <div style={{ fontSize: 12, color: "#475569", alignSelf: "center" }}>{qaStatus}</div>}
              </div>
              <div style={{ marginTop: 10, display: "grid", gap: 6 }}>
                {[
                  "Explain how RSI should be interpreted and common pitfalls.",
                  "What is the difference between market and limit orders?",
                  "How does VWAP guide intraday execution?",
                  "Summarize best practices for backtesting to avoid overfitting.",
                  "What are key risks in highly volatile crypto assets?"
                ].map(prompt => (
                  <button
                    key={prompt}
                    onClick={() => { setQaQuestion(prompt); }}
                    style={{ padding: "6px 8px", borderRadius: 8, border: "1px solid #e2e8f0", background: "#fff", textAlign: "left", fontSize: 11 }}
                  >
                    {prompt}
                  </button>
                ))}
              </div>
            </div>
          </div>

          <div style={{ display: "grid", gap: 12 }}>
            <div style={{ background: "#ffffff", borderRadius: 14, padding: 14, border: "1px solid #e5e7eb", minHeight: 280 }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
                <div style={{ fontWeight: 600 }}>Answer</div>
                {qaSource && (
                  <span style={{ fontSize: 10, color: "#94a3b8", textTransform: "uppercase" }}>{qaSource}</span>
                )}
              </div>
              {qaAnswer ? (
                <div style={{ fontSize: 12, color: "#334155", whiteSpace: "pre-wrap" }}>{qaAnswer}</div>
              ) : (
                <div style={{ fontSize: 12, color: "#94a3b8" }}>Ask a question to see a response.</div>
              )}
            </div>

            <div style={{ background: "#ffffff", borderRadius: 14, padding: 14, border: "1px solid #e5e7eb" }}>
              <div style={{ fontWeight: 600, marginBottom: 8 }}>Citations</div>
              {qaCitations.length === 0 ? (
                <div style={{ fontSize: 12, color: "#94a3b8" }}>No citations yet.</div>
              ) : (
                <div style={{ display: "grid", gap: 8 }}>
                  {qaCitations.map((cite, idx) => (
                    <div key={`${cite.chunk_id || idx}`} style={{ fontSize: 11, color: "#64748b", background: "#f8fafc", padding: 8, borderRadius: 8 }}>
                      <div style={{ fontWeight: 600 }}>{cite.meeting_title}</div>
                      <div>{cite.chunk_id}</div>
                      <div>{cite.snippet}</div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {tradingTab === "knowledge" && (
        <div style={{ display: "grid", gridTemplateColumns: "1.2fr 1.8fr", gap: 16 }}>
          <div style={{ display: "grid", gap: 12 }}>
            <div style={{ background: "#ffffff", borderRadius: 14, padding: 14, border: "1px solid #e5e7eb" }}>
              <div style={{ fontWeight: 600, marginBottom: 8 }}>Create How-To</div>
              <div style={{ display: "grid", gap: 8 }}>
                <input
                  value={knowledgeTitle}
                  onChange={(e) => setKnowledgeTitle(e.target.value)}
                  placeholder="How-To title (e.g., Risk management checklist)"
                  style={{ padding: 8, borderRadius: 10, border: "1px solid #cbd5f5" }}
                />
                <input
                  value={knowledgeTags}
                  onChange={(e) => setKnowledgeTags(e.target.value)}
                  placeholder="Tags (comma-separated)"
                  style={{ padding: 8, borderRadius: 10, border: "1px solid #cbd5f5" }}
                />
                <textarea
                  value={knowledgeText}
                  onChange={(e) => setKnowledgeText(e.target.value)}
                  rows={6}
                  placeholder="Write the trading how-to or playbook here..."
                  style={{ padding: 8, borderRadius: 10, border: "1px solid #cbd5f5" }}
                />
                <button onClick={saveHowTo} style={{ padding: "8px 12px", borderRadius: 10, border: "1px solid #0ea5e9", background: "#0ea5e9", color: "#fff", fontWeight: 600 }}>
                  Save to Knowledge RAG
                </button>
                {knowledgeStatus && <div style={{ fontSize: 12, color: "#475569" }}>{knowledgeStatus}</div>}
              </div>
            </div>

            <div style={{ background: "#ffffff", borderRadius: 14, padding: 14, border: "1px solid #e5e7eb" }}>
              <div style={{ fontWeight: 600, marginBottom: 8 }}>Import PDFs & Files</div>
              <div style={{ fontSize: 12, color: "#64748b", marginBottom: 10 }}>
                Paste a PDF URL or upload a local file. OCR is used as a fallback for scanned PDFs.
              </div>
              <div style={{ display: "grid", gap: 8, marginBottom: 12 }}>
                <input
                  value={knowledgeUrl}
                  onChange={(e) => setKnowledgeUrl(e.target.value)}
                  placeholder="https://example.com/report.pdf"
                  style={{ padding: 8, borderRadius: 10, border: "1px solid #cbd5f5" }}
                />
                <input
                  value={knowledgeUrlTitle}
                  onChange={(e) => setKnowledgeUrlTitle(e.target.value)}
                  placeholder="Optional title override"
                  style={{ padding: 8, borderRadius: 10, border: "1px solid #cbd5f5" }}
                />
                <input
                  value={knowledgeUrlTags}
                  onChange={(e) => setKnowledgeUrlTags(e.target.value)}
                  placeholder="Tags (comma-separated)"
                  style={{ padding: 8, borderRadius: 10, border: "1px solid #cbd5f5" }}
                />
                <label style={{ fontSize: 11, color: "#64748b", display: "flex", alignItems: "center", gap: 6 }}>
                  <input
                    type="checkbox"
                    checked={knowledgeUrlOcr}
                    onChange={(e) => setKnowledgeUrlOcr(e.target.checked)}
                  />
                  Use OCR fallback for scanned PDFs
                </label>
                <button onClick={ingestKnowledgeUrl} style={{ padding: "6px 10px", borderRadius: 8, border: "1px solid #0ea5e9", background: "#0ea5e9", color: "#fff", fontWeight: 600 }}>
                  Ingest URL
                </button>
                {knowledgeUrlStatus && <div style={{ fontSize: 12, color: "#475569" }}>{knowledgeUrlStatus}</div>}
              </div>

              <div style={{ display: "grid", gap: 8 }}>
                <input
                  type="file"
                  accept=".pdf,.txt,.md,.csv"
                  onChange={(e) => setKnowledgeFile(e.target.files?.[0] || null)}
                  style={{ fontSize: 12 }}
                />
                <input
                  value={knowledgeFileTitle}
                  onChange={(e) => setKnowledgeFileTitle(e.target.value)}
                  placeholder="Optional file title override"
                  style={{ padding: 8, borderRadius: 10, border: "1px solid #cbd5f5" }}
                />
                <input
                  value={knowledgeFileTags}
                  onChange={(e) => setKnowledgeFileTags(e.target.value)}
                  placeholder="Tags (comma-separated)"
                  style={{ padding: 8, borderRadius: 10, border: "1px solid #cbd5f5" }}
                />
                <label style={{ fontSize: 11, color: "#64748b", display: "flex", alignItems: "center", gap: 6 }}>
                  <input
                    type="checkbox"
                    checked={knowledgeFileOcr}
                    onChange={(e) => setKnowledgeFileOcr(e.target.checked)}
                  />
                  Use OCR fallback for scanned PDFs
                </label>
                <button onClick={uploadKnowledgeFile} style={{ padding: "6px 10px", borderRadius: 8, border: "1px solid #0ea5e9", background: "#e0f2fe", color: "#0ea5e9", fontWeight: 600 }}>
                  Upload & Ingest
                </button>
                {knowledgeFileStatus && <div style={{ fontSize: 12, color: "#475569" }}>{knowledgeFileStatus}</div>}
              </div>
            </div>

            <div style={{ background: "#ffffff", borderRadius: 14, padding: 14, border: "1px solid #e5e7eb" }}>
              <div style={{ fontWeight: 600, marginBottom: 6 }}>Online Sources</div>
              <div style={{ fontSize: 12, color: "#64748b", marginBottom: 10 }}>
                Sources are crawled in the background and refreshed on schedule.
              </div>
              <div style={{ display: "grid", gap: 8, marginBottom: 10 }}>
                <input
                  value={newSourceUrl}
                  onChange={(e) => setNewSourceUrl(e.target.value)}
                  placeholder="https://example.com/guide"
                  style={{ padding: 8, borderRadius: 10, border: "1px solid #cbd5f5" }}
                />
                <input
                  value={newSourceTags}
                  onChange={(e) => setNewSourceTags(e.target.value)}
                  placeholder="Tags (comma-separated)"
                  style={{ padding: 8, borderRadius: 10, border: "1px solid #cbd5f5" }}
                />
                <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                  <button onClick={addSource} style={{ padding: "6px 10px", borderRadius: 8, border: "1px solid #0ea5e9", background: "#0ea5e9", color: "#fff", fontWeight: 600 }}>
                    Add + Crawl
                  </button>
                  <button onClick={syncKnowledgeSources} style={{ padding: "6px 10px", borderRadius: 8, border: "1px solid #0ea5e9", background: "#e0f2fe", color: "#0ea5e9", fontWeight: 600 }}>
                    Crawl All
                  </button>
                  <button onClick={loadSources} style={{ padding: "6px 10px", borderRadius: 8, border: "1px solid #e2e8f0", background: "#fff" }}>
                    Refresh List
                  </button>
                </div>
              </div>
              {sourceStatus && <div style={{ fontSize: 12, color: "#475569", marginBottom: 8 }}>{sourceStatus}</div>}
              {knowledgeSyncStatus && <div style={{ fontSize: 12, color: "#475569", marginBottom: 8 }}>{knowledgeSyncStatus}</div>}
              <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 8 }}>
                <input
                  type="checkbox"
                  checked={deleteKnowledgeOnRemove}
                  onChange={(e) => setDeleteKnowledgeOnRemove(e.target.checked)}
                />
                <span style={{ fontSize: 11, color: "#64748b" }}>
                  Delete existing knowledge when removing a source
                </span>
              </div>
              <div style={{ display: "grid", gap: 8, maxHeight: 220, overflow: "auto" }}>
                {sourceList.length === 0 && (
                  <div style={{ fontSize: 12, color: "#94a3b8" }}>No sources added yet.</div>
                )}
                {sourceList.map(source => (
                  <div key={source.id} style={{ border: "1px solid #e5e7eb", borderRadius: 10, padding: 8 }}>
                    <div style={{ fontSize: 12, fontWeight: 600, marginBottom: 4 }}>{source.url}</div>
                    {source.tags?.length > 0 && (
                      <div style={{ fontSize: 11, color: "#64748b" }}>Tags: {source.tags.join(", ")}</div>
                    )}
                    <div style={{ fontSize: 10, color: "#94a3b8", marginTop: 2 }}>
                      Status: {source.last_status || "idle"} {source.last_crawled_at ? `| ${source.last_crawled_at}` : ""}
                    </div>
                    {source.last_error && (
                      <div style={{ fontSize: 10, color: "#b91c1c", marginTop: 2 }}>{source.last_error}</div>
                    )}
                    <div style={{ display: "flex", gap: 6, marginTop: 6, flexWrap: "wrap" }}>
                      <button
                        onClick={() => toggleSource(source)}
                        style={{ padding: "4px 8px", borderRadius: 8, border: "1px solid #e2e8f0", background: "#fff", fontSize: 11 }}
                      >
                        {source.enabled ? "Disable" : "Enable"}
                      </button>
                      <button
                        onClick={() => crawlSource(source)}
                        style={{ padding: "4px 8px", borderRadius: 8, border: "1px solid #0ea5e9", background: "#e0f2fe", color: "#0ea5e9", fontSize: 11 }}
                      >
                        Crawl
                      </button>
                      <button
                        onClick={() => removeSource(source)}
                        style={{ padding: "4px 8px", borderRadius: 8, border: "1px solid #fee2e2", background: "#fff", color: "#b91c1c", fontSize: 11 }}
                      >
                        Remove
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div style={{ background: "#ffffff", borderRadius: 14, padding: 14, border: "1px solid #e5e7eb" }}>
              <div style={{ fontWeight: 600, marginBottom: 6 }}>RSS Feeds (Daily AI Review)</div>
              <div style={{ fontSize: 12, color: "#64748b", marginBottom: 10 }}>
                Feeds are reviewed by AI before ingestion. Foreign-market feeds are disabled by default.
              </div>
              <div style={{ display: "grid", gap: 8, marginBottom: 10 }}>
                <input
                  value={rssSeedUrl}
                  onChange={(e) => setRssSeedUrl(e.target.value)}
                  placeholder="https://rss.feedspot.com/stock_market_news_rss_feeds/"
                  style={{ padding: 8, borderRadius: 10, border: "1px solid #cbd5f5" }}
                />
                <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                  <button onClick={seedRssSources} style={{ padding: "6px 10px", borderRadius: 8, border: "1px solid #0ea5e9", background: "#0ea5e9", color: "#fff", fontWeight: 600 }}>
                    Seed Feedspot
                  </button>
                  <button onClick={crawlRssSources} style={{ padding: "6px 10px", borderRadius: 8, border: "1px solid #0ea5e9", background: "#e0f2fe", color: "#0ea5e9", fontWeight: 600 }}>
                    Crawl Now
                  </button>
                  <button onClick={loadRssSources} style={{ padding: "6px 10px", borderRadius: 8, border: "1px solid #e2e8f0", background: "#fff" }}>
                    Refresh
                  </button>
                </div>
              </div>
              {rssStatus && <div style={{ fontSize: 12, color: "#475569", marginBottom: 8 }}>{rssStatus}</div>}
              <div style={{ display: "grid", gap: 8, maxHeight: 220, overflow: "auto" }}>
                {rssSources.length === 0 && (
                  <div style={{ fontSize: 12, color: "#94a3b8" }}>No RSS feeds added yet.</div>
                )}
                {rssSources.map(source => (
                  <div key={source.id} style={{ border: "1px solid #e5e7eb", borderRadius: 10, padding: 8 }}>
                    <div style={{ fontSize: 12, fontWeight: 600, marginBottom: 4 }}>{source.title || source.url}</div>
                    <div style={{ fontSize: 11, color: "#64748b" }}>{source.url}</div>
                    <div style={{ fontSize: 10, color: "#94a3b8", marginTop: 2 }}>
                      Status: {source.last_status || "idle"} {source.last_crawled_at ? `| ${source.last_crawled_at}` : ""}
                    </div>
                    {source.last_error && (
                      <div style={{ fontSize: 10, color: "#b91c1c", marginTop: 2 }}>{source.last_error}</div>
                    )}
                    <div style={{ display: "flex", gap: 6, marginTop: 6, flexWrap: "wrap" }}>
                      <button
                        onClick={() => toggleRssSource(source)}
                        style={{ padding: "4px 8px", borderRadius: 8, border: "1px solid #e2e8f0", background: "#fff", fontSize: 11 }}
                      >
                        {source.enabled ? "Disable" : "Enable"}
                      </button>
                      <button
                        onClick={() => crawlRssSource(source)}
                        style={{ padding: "4px 8px", borderRadius: 8, border: "1px solid #0ea5e9", background: "#e0f2fe", color: "#0ea5e9", fontSize: 11 }}
                      >
                        Crawl
                      </button>
                      <button
                        onClick={() => removeRssSource(source)}
                        style={{ padding: "4px 8px", borderRadius: 8, border: "1px solid #fee2e2", background: "#fff", color: "#b91c1c", fontSize: 11 }}
                      >
                        Remove
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>

          <div style={{ display: "grid", gap: 12 }}>
            <div style={{ background: "#ffffff", borderRadius: 14, padding: 14, border: "1px solid #e5e7eb" }}>
              <div style={{ fontWeight: 600, marginBottom: 8 }}>Ask Trading Knowledge</div>
              <div style={{ display: "flex", gap: 8, marginBottom: 8 }}>
                <input
                  value={knowledgeQuestion}
                  onChange={(e) => setKnowledgeQuestion(e.target.value)}
                  placeholder="Ask about strategies, risk, setups..."
                  style={{ flex: 1, padding: 8, borderRadius: 10, border: "1px solid #cbd5f5" }}
                />
                <button onClick={askKnowledge} style={{ padding: "8px 12px", borderRadius: 10, border: "1px solid #0ea5e9", background: "#0ea5e9", color: "#fff", fontWeight: 600 }}>
                  Ask
                </button>
              </div>
              {knowledgeAnswer && (
                <div style={{ fontSize: 12, color: "#334155", marginBottom: 8 }}>
                  {knowledgeAnswer}
                </div>
              )}
              {knowledgeCitations.length > 0 && (
                <div style={{ display: "grid", gap: 6 }}>
                  {knowledgeCitations.map((cite, idx) => (
                    <div key={`${cite.chunk_id || idx}`} style={{ fontSize: 11, color: "#64748b", background: "#f8fafc", padding: 8, borderRadius: 8 }}>
                      <div style={{ fontWeight: 600 }}>{cite.meeting_title}</div>
                      <div>{cite.chunk_id}</div>
                      <div>{cite.snippet}</div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div style={{ background: "#ffffff", borderRadius: 14, padding: 14, border: "1px solid #e5e7eb" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
                <div style={{ fontWeight: 600 }}>Knowledge Map</div>
                <button
                  onClick={loadKnowledgeStats}
                  style={{ padding: "4px 8px", borderRadius: 8, border: "1px solid #e2e8f0", background: "#fff", fontSize: 11 }}
                >
                  Refresh
                </button>
              </div>
              {knowledgeStatsStatus && <div style={{ fontSize: 11, color: "#475569", marginBottom: 6 }}>{knowledgeStatsStatus}</div>}
              {!knowledgeStats ? (
                <div style={{ fontSize: 12, color: "#94a3b8" }}>No stats yet.</div>
              ) : (
                <>
                  <div style={{ display: "flex", gap: 12, flexWrap: "wrap", fontSize: 11, color: "#64748b", marginBottom: 10 }}>
                    <span>Docs: {knowledgeStats.totalDocuments || 0}</span>
                    <span>Sources: {(knowledgeStats.sources || []).length}</span>
                    <span>Tags: {knowledgeStats.totalTags || 0}</span>
                    {knowledgeStats.latest && <span>Latest: {knowledgeStats.latest}</span>}
                  </div>
                  <div style={{ border: "1px solid #e2e8f0", borderRadius: 12, padding: 8, background: "#f8fafc" }}>
                    {topicNodes.length === 0 ? (
                      <div style={{ fontSize: 12, color: "#94a3b8" }}>Not enough tag data for a map yet.</div>
                    ) : (
                      <svg width="320" height="260">
                        <circle cx="160" cy="130" r="28" fill="#0ea5e9" opacity="0.15" />
                        <text x="160" y="134" textAnchor="middle" fontSize="11" fill="#0f172a">Trading RAG</text>
                        {topicNodes.map(node => (
                          <g key={node.id} onClick={() => { setKnowledgeSelectedTag(node.id); loadKnowledgeItems(node.id); }} style={{ cursor: "pointer" }}>
                            <line x1="160" y1="130" x2={node.x} y2={node.y} stroke="#cbd5f5" strokeWidth="1" />
                            <circle cx={node.x} cy={node.y} r={node.size} fill={knowledgeSelectedTag === node.id ? "#f97316" : "#38bdf8"} opacity="0.85" />
                            <text x={node.x} y={node.y - node.size - 4} textAnchor="middle" fontSize="9" fill="#334155">
                              {node.id}
                            </text>
                          </g>
                        ))}
                      </svg>
                    )}
                  </div>
                  {knowledgeSelectedTag && (
                    <div style={{ marginTop: 6, fontSize: 11, color: "#475569" }}>
                      Selected tag: <strong>{knowledgeSelectedTag}</strong>
                    </div>
                  )}
                </>
              )}
            </div>

            <div style={{ background: "#ffffff", borderRadius: 14, padding: 14, border: "1px solid #e5e7eb" }}>
              <div style={{ fontWeight: 600, marginBottom: 8 }}>Sources & Age</div>
              {!knowledgeStats || (knowledgeStats.sources || []).length === 0 ? (
                <div style={{ fontSize: 12, color: "#94a3b8" }}>No sources indexed yet.</div>
              ) : (
                <div style={{ display: "grid", gap: 8, maxHeight: 220, overflow: "auto" }}>
                  {(knowledgeStats.sources || []).map((source, idx) => (
                    <div key={`${source.key}-${idx}`} style={{ border: "1px solid #e2e8f0", borderRadius: 10, padding: 8 }}>
                      <div style={{ fontSize: 12, fontWeight: 600 }}>{source.title}</div>
                      {source.source_url && (
                        <div style={{ fontSize: 10, color: "#64748b" }}>{source.source_url}</div>
                      )}
                      <div style={{ fontSize: 10, color: "#94a3b8" }}>
                        Docs: {source.count} {Number.isFinite(source.age_days) ? `| ${source.age_days}d since last update` : ""}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div style={{ background: "#ffffff", borderRadius: 14, padding: 14, border: "1px solid #e5e7eb" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
                <div style={{ fontWeight: 600 }}>Knowledge Library</div>
                {knowledgeSelectedTag && (
                  <button
                    onClick={() => { setKnowledgeSelectedTag(""); loadKnowledgeItems(""); }}
                    style={{ padding: "4px 8px", borderRadius: 8, border: "1px solid #e2e8f0", background: "#fff", fontSize: 11 }}
                  >
                    Clear Tag Filter
                  </button>
                )}
              </div>
              <div style={{ fontSize: 12, color: "#64748b", marginBottom: 8 }}>
                {knowledgeSelectedTag ? `Filtered by tag: ${knowledgeSelectedTag}` : "Recent indexed trading notes and sources."}
              </div>
              <div style={{ display: "grid", gap: 8, maxHeight: 260, overflow: "auto" }}>
                {knowledgeItems.length === 0 && <div style={{ fontSize: 12, color: "#94a3b8" }}>No knowledge indexed yet.</div>}
                {knowledgeItems.map(item => (
                  <div key={item.id} style={{ border: "1px solid #e5e7eb", borderRadius: 10, padding: 8 }}>
                    <div style={{ fontWeight: 600 }}>{item.title}</div>
                    {item.source_url && (
                      <div style={{ fontSize: 11, color: "#64748b" }}>{item.source_url}</div>
                    )}
                    {item.occurred_at && (
                      <div style={{ fontSize: 10, color: "#94a3b8" }}>{item.occurred_at}</div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}

      {tradingTab === "scenarios" && (
        <div style={{ display: "grid", gridTemplateColumns: "1.4fr 1fr", gap: 16 }}>
          <div style={{ background: "#ffffff", borderRadius: 14, padding: 14, border: "1px solid #e5e7eb" }}>
            <div style={{ fontWeight: 600, marginBottom: 8 }}>Scenario Runner</div>
            <div style={{ display: "flex", gap: 8, marginBottom: 10, flexWrap: "wrap" }}>
              <select
                value={scenarioAssetClass}
                onChange={(e) => setScenarioAssetClass(e.target.value)}
                style={{ padding: 8, borderRadius: 10, border: "1px solid #cbd5f5" }}
              >
                <option value="all">All assets</option>
                <option value="stock">Stocks</option>
                <option value="crypto">Crypto</option>
              </select>
              <select
                value={scenarioWindow}
                onChange={(e) => setScenarioWindow(Number(e.target.value))}
                style={{ padding: 8, borderRadius: 10, border: "1px solid #cbd5f5" }}
              >
                <option value={7}>7 days</option>
                <option value={30}>30 days</option>
                <option value={90}>90 days</option>
                <option value={180}>180 days</option>
              </select>
              <button onClick={runScenario} style={{ padding: "8px 12px", borderRadius: 10, border: "1px solid #0ea5e9", background: "#0ea5e9", color: "#fff", fontWeight: 600 }}>
                Run Scenarios
              </button>
            </div>
            {scenarioStatus && <div style={{ fontSize: 12, color: "#475569", marginBottom: 8 }}>{scenarioStatus}</div>}
            <div style={{ display: "grid", gap: 6 }}>
              {scenarioResults.length === 0 && <div style={{ fontSize: 12, color: "#94a3b8" }}>Run a scenario to see results.</div>}
              {scenarioResults.map(result => (
                <div key={`${result.symbol}-${result.windowDays}`} style={{ border: "1px solid #e5e7eb", borderRadius: 10, padding: 8 }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                    <div style={{ fontWeight: 600 }}>{result.symbol}</div>
                    <span style={{ fontSize: 11, color: result.returnPct >= 0 ? "#16a34a" : "#dc2626" }}>
                      {result.returnPct != null ? `${result.returnPct}%` : "n/a"}
                    </span>
                  </div>
                  {result.error ? (
                    <div style={{ fontSize: 11, color: "#b91c1c" }}>{result.error}</div>
                  ) : (
                    <div style={{ fontSize: 11, color: "#64748b" }}>
                      Start {formatNumber(result.start)} to End {formatNumber(result.end)} | {result.points} points
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>

          <div style={{ background: "#ffffff", borderRadius: 14, padding: 14, border: "1px solid #e5e7eb" }}>
            <div style={{ fontWeight: 600, marginBottom: 8 }}>Scenario History</div>
            <div style={{ display: "grid", gap: 8, maxHeight: 360, overflow: "auto" }}>
              {scenarioHistory.length === 0 && <div style={{ fontSize: 12, color: "#94a3b8" }}>No scenario runs yet.</div>}
              {scenarioHistory.map(item => (
                <div key={item.id} style={{ border: "1px solid #e5e7eb", borderRadius: 10, padding: 8 }}>
                  <div style={{ fontWeight: 600 }}>{item.asset_class} - {item.window_days} days</div>
                  <div style={{ fontSize: 11, color: "#64748b" }}>{item.run_at}</div>
                  <div style={{ fontSize: 11, color: "#94a3b8" }}>{(item.results || []).length} assets</div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
