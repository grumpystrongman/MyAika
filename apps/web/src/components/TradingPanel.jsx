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
  const wsRef = useRef(null);

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
    loadScenarioHistory();
  }, [serverUrl]);

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

  const loadKnowledgeItems = async () => {
    if (!serverUrl) return;
    try {
      const resp = await fetch(`${serverUrl}/api/trading/knowledge/list?limit=20`);
      const data = await resp.json();
      if (!resp.ok) throw new Error(data?.error || "knowledge_list_failed");
      setKnowledgeItems(data?.items || []);
      setKnowledgeStatus("");
    } catch (err) {
      setKnowledgeStatus(err?.message || "knowledge_list_failed");
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
              <div style={{ fontWeight: 600, marginBottom: 8 }}>Knowledge Library</div>
              <div style={{ fontSize: 12, color: "#64748b", marginBottom: 8 }}>
                Recent indexed trading notes and sources.
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
                      Start {formatNumber(result.start)} -> End {formatNumber(result.end)} | {result.points} points
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
