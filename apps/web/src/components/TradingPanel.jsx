import { useEffect, useMemo, useRef, useState, useCallback } from "react";
import { forceSimulation, forceManyBody, forceCenter, forceLink, forceCollide } from "d3-force";

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

const VALID_TRADING_TABS = new Set([
  "terminal",
  "paper",
  "backtest",
  "options",
  "qa",
  "knowledge",
  "scenarios"
]);

function formatNumber(value, digits = 2) {
  if (value == null || Number.isNaN(value)) return "--";
  return Number(value).toLocaleString(undefined, { maximumFractionDigits: digits, minimumFractionDigits: digits });
}

function formatScenarioValue(value, suffix = "") {
  if (value == null || Number.isNaN(value)) return "Not enough data";
  return `${value}${suffix}`;
}

function formatSourceLabel(value, maxLen = 26) {
  const raw = String(value || "");
  if (!raw) return "";
  try {
    if (raw.startsWith("http")) {
      const url = new URL(raw);
      const host = url.hostname.replace(/^www\./, "");
      const pathPart = url.pathname.split("/").filter(Boolean)[0] || "";
      const combined = pathPart ? `${host}/${pathPart}` : host;
      return combined.length > maxLen ? `${combined.slice(0, maxLen)}...` : combined;
    }
  } catch {
    // ignore
  }
  return raw.length > maxLen ? `${raw.slice(0, maxLen)}...` : raw;
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

function clampNumber(value, min, max) {
  if (!Number.isFinite(value)) return min;
  return Math.min(max, Math.max(min, value));
}

function formatAxisTime(ts, intervalMs) {
  if (!ts) return "";
  const date = new Date(ts);
  if (intervalMs >= 24 * 60 * 60 * 1000) {
    return date.toLocaleDateString(undefined, { month: "short", day: "numeric" });
  }
  if (intervalMs >= 60 * 60 * 1000) {
    return date.toLocaleString(undefined, { month: "short", day: "numeric", hour: "2-digit" });
  }
  return date.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" });
}

function drawTimeAxis(ctx, times, width, height, padding, intervalMs) {
  if (!times.length) return;
  const ticks = 4;
  const candleWidth = (width - padding * 2) / times.length;
  ctx.fillStyle = "rgba(226, 232, 240, 0.7)";
  ctx.font = "10px 'IBM Plex Mono', monospace";
  ctx.textAlign = "center";
  for (let i = 0; i <= ticks; i += 1) {
    const idx = Math.min(times.length - 1, Math.round((times.length - 1) * (i / ticks)));
    const x = padding + idx * candleWidth + candleWidth * 0.4;
    const label = formatAxisTime(times[idx], intervalMs);
    if (!label) continue;
    ctx.fillText(label, x, height - padding + 16);
  }
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

function classifyPattern(pattern = "") {
  const name = String(pattern || "").toLowerCase();
  if (!name) return { bias: "neutral", strength: 0, note: "" };
  if (name.includes("bullish engulfing")) {
    return { bias: "bullish", strength: 3, note: "Bullish reversal pattern; confirm with follow-through." };
  }
  if (name.includes("bearish engulfing")) {
    return { bias: "bearish", strength: 3, note: "Bearish reversal pattern; confirm with follow-through." };
  }
  if (name.includes("hammer")) {
    return { bias: "bullish", strength: 2, note: "Potential rebound; watch for higher close." };
  }
  if (name.includes("shooting star")) {
    return { bias: "bearish", strength: 2, note: "Potential pullback; watch for lower close." };
  }
  if (name.includes("doji")) {
    return { bias: "neutral", strength: 1, note: "Indecision candle; wait for confirmation." };
  }
  return { bias: "neutral", strength: 1, note: "Continuation candle; defer to the broader trend." };
}

function KnowledgeGraph({ graph, width = 560, height = 360, selectedId = "", onSelect }) {
  const canvasRef = useRef(null);
  const simRef = useRef(null);
  const nodesRef = useRef([]);
  const linksRef = useRef([]);
  const transformRef = useRef({ x: 0, y: 0, k: 1 });
  const dragRef = useRef({ mode: "", node: null, lastX: 0, lastY: 0 });
  const [hovered, setHovered] = useState(null);

  const formatLabel = (node) => {
    const rawId = String(node?.id || "");
    const rawLabel = String(node?.label || "");
    const inferredType = node?.type
      || (rawId.startsWith("tag:") || rawId.startsWith("#") ? "tag" : rawId.startsWith("source:") ? "source" : "");
    if (!rawId && !rawLabel) return { display: "", full: "", type: inferredType || "" };
    if (inferredType === "tag") {
      const tag = (rawLabel || rawId).replace(/^tag:/i, "").replace(/^#/i, "").trim();
      const label = `#${tag}`;
      const short = label.length > 22 ? `${label.slice(0, 22)}...` : label;
      return { display: short, full: label, type: "tag" };
    }
    if (inferredType === "source") {
      const rawValue = node?.value || rawLabel || rawId;
      const value = String(rawValue || "").replace(/^source:/i, "").trim();
      const display = formatSourceLabel(value, 28);
      return { display, full: value, type: "source" };
    }
    const value = rawLabel || rawId;
    const short = value.length > 22 ? `${value.slice(0, 22)}...` : value;
    return { display: short, full: value, type: inferredType || "node" };
  };

  const drawGraph = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    const { x, y, k } = transformRef.current;
    const nodes = nodesRef.current;
    const links = linksRef.current;

    ctx.clearRect(0, 0, width, height);
    ctx.save();
    ctx.translate(x, y);
    ctx.scale(k, k);

    ctx.strokeStyle = "rgba(148, 163, 184, 0.4)";
    links.forEach(link => {
      ctx.lineWidth = Math.max(0.4, Math.min(2, (link.weight || 1) * 0.4)) / k;
      ctx.beginPath();
      ctx.moveTo(link.source.x, link.source.y);
      ctx.lineTo(link.target.x, link.target.y);
      ctx.stroke();
    });

    nodes.forEach(node => {
      const isSelected = selectedId && node.id === selectedId;
      const isHovered = hovered && node.id === hovered.id;
      const radius = node.radius || 6;
      const label = formatLabel(node);
      ctx.beginPath();
      const baseColor = label.type === "source" ? "#22c55e" : label.type === "tag" ? "#0ea5e9" : "#0ea5e9";
      const hoverColor = label.type === "source" ? "#34d399" : "#38bdf8";
      ctx.fillStyle = isSelected ? "#f97316" : isHovered ? hoverColor : baseColor;
      ctx.globalAlpha = isSelected ? 0.95 : 0.85;
      ctx.arc(node.x, node.y, radius, 0, Math.PI * 2);
      ctx.fill();
      if (isHovered || isSelected) {
        ctx.lineWidth = 2 / k;
        ctx.strokeStyle = isSelected ? "#fb923c" : "#7dd3fc";
        ctx.stroke();
      }
      ctx.globalAlpha = 1;
      const fontSize = Math.max(9, 11 / k);
      ctx.font = `${fontSize}px 'IBM Plex Mono', monospace`;
      ctx.textAlign = "center";
      if (label.display) {
        const metrics = ctx.measureText(label.display);
        const textWidth = metrics.width;
        const padX = 4 / k;
        const padY = 2 / k;
        const labelX = node.x;
        const labelY = node.y - radius - 6 / k;
        const boxW = textWidth + padX * 2;
        const boxH = fontSize + padY * 2;
        const boxX = labelX - boxW / 2;
        const boxY = labelY - boxH;
        node._labelBox = { x: boxX, y: boxY, w: boxW, h: boxH };
        ctx.fillStyle = "rgba(15,23,42,0.7)";
        ctx.fillRect(boxX, boxY, boxW, boxH);
        ctx.fillStyle = "#e2e8f0";
        ctx.fillText(label.display, labelX, labelY - padY / 2);
      } else {
        node._labelBox = null;
      }
    });

    ctx.restore();
  }, [hovered, selectedId, width, height]);

  useEffect(() => {
    const nodes = (graph?.nodes || []).map(node => ({
      ...node,
      radius: 6 + Math.min(14, Math.sqrt(node.count || 1) * 2)
    }));
    const nodeById = new Map(nodes.map(node => [node.id, node]));
    const links = (graph?.links || [])
      .map(link => ({
        source: nodeById.get(link.source),
        target: nodeById.get(link.target),
        weight: link.weight || 1
      }))
      .filter(link => link.source && link.target);

    nodesRef.current = nodes;
    linksRef.current = links;
    transformRef.current = { x: width * 0.1, y: height * 0.1, k: 1 };

    if (simRef.current) {
      simRef.current.stop();
    }
    if (!nodes.length) {
      drawGraph();
      return () => {};
    }
    const sim = forceSimulation(nodes)
      .force("link", forceLink(links).id(node => node.id).distance(link => 60 - Math.min(link.weight * 3, 30)).strength(link => Math.min(0.6, 0.1 + link.weight / 10)))
      .force("charge", forceManyBody().strength(-160))
      .force("center", forceCenter(width / 2, height / 2))
      .force("collide", forceCollide().radius(node => (node.radius || 6) + 10))
      .on("tick", drawGraph);

    simRef.current = sim;
    drawGraph();
    return () => {
      sim.stop();
    };
  }, [graph, width, height, drawGraph]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    function getPointer(evt) {
      const rect = canvas.getBoundingClientRect();
      return { x: evt.clientX - rect.left, y: evt.clientY - rect.top };
    }

    function toWorld(point) {
      const { x, y, k } = transformRef.current;
      return { x: (point.x - x) / k, y: (point.y - y) / k };
    }

    function findNode(point) {
      const nodes = nodesRef.current;
      for (const node of nodes) {
        const dx = point.x - node.x;
        const dy = point.y - node.y;
        const r = (node.radius || 6) + 8;
        if (dx * dx + dy * dy <= r * r) {
          return node;
        }
        const box = node._labelBox;
        if (box && point.x >= box.x && point.x <= box.x + box.w && point.y >= box.y && point.y <= box.y + box.h) {
          return node;
        }
      }
      return null;
    }

    function handleDown(evt) {
      const pt = getPointer(evt);
      const world = toWorld(pt);
      const node = findNode(world);
      dragRef.current.lastX = pt.x;
      dragRef.current.lastY = pt.y;
      if (node) {
        dragRef.current.mode = "node";
        dragRef.current.node = node;
        node.fx = node.x;
        node.fy = node.y;
        if (simRef.current) simRef.current.alphaTarget(0.3).restart();
      } else {
        dragRef.current.mode = "pan";
      }
    }

    function handleMove(evt) {
      const pt = getPointer(evt);
      const mode = dragRef.current.mode;
      if (mode === "node" && dragRef.current.node) {
        const world = toWorld(pt);
        dragRef.current.node.fx = world.x;
        dragRef.current.node.fy = world.y;
        drawGraph();
        return;
      }
      if (mode === "pan") {
        const dx = pt.x - dragRef.current.lastX;
        const dy = pt.y - dragRef.current.lastY;
        transformRef.current.x += dx;
        transformRef.current.y += dy;
        dragRef.current.lastX = pt.x;
        dragRef.current.lastY = pt.y;
        drawGraph();
        return;
      }
      const world = toWorld(pt);
      const node = findNode(world);
      setHovered(node);
      canvas.style.cursor = node ? "pointer" : "grab";
    }

    function handleUp(evt) {
      if (dragRef.current.mode === "node" && dragRef.current.node) {
        dragRef.current.node.fx = null;
        dragRef.current.node.fy = null;
        if (simRef.current) simRef.current.alphaTarget(0);
      }
      dragRef.current.mode = "";
      dragRef.current.node = null;
    }

    function handleClick(evt) {
      const pt = getPointer(evt);
      const world = toWorld(pt);
      const node = findNode(world);
      if (node && onSelect) {
        onSelect(node);
      }
    }

    function handleWheel(evt) {
      evt.preventDefault();
      const delta = evt.deltaY > 0 ? 0.9 : 1.1;
      const { x, y, k } = transformRef.current;
      const pt = getPointer(evt);
      const world = { x: (pt.x - x) / k, y: (pt.y - y) / k };
      const nextK = Math.min(2.8, Math.max(0.4, k * delta));
      transformRef.current.k = nextK;
      transformRef.current.x = pt.x - world.x * nextK;
      transformRef.current.y = pt.y - world.y * nextK;
      drawGraph();
    }

    canvas.addEventListener("mousedown", handleDown);
    canvas.addEventListener("mousemove", handleMove);
    canvas.addEventListener("mouseup", handleUp);
    canvas.addEventListener("mouseleave", handleUp);
    canvas.addEventListener("click", handleClick);
    canvas.addEventListener("wheel", handleWheel, { passive: false });
    return () => {
      canvas.removeEventListener("mousedown", handleDown);
      canvas.removeEventListener("mousemove", handleMove);
      canvas.removeEventListener("mouseup", handleUp);
      canvas.removeEventListener("mouseleave", handleUp);
      canvas.removeEventListener("click", handleClick);
      canvas.removeEventListener("wheel", handleWheel);
    };
  }, [drawGraph, onSelect]);

  useEffect(() => {
    drawGraph();
  }, [selectedId, hovered, drawGraph]);

  return (
    <div style={{ display: "grid", gap: 6 }}>
      <canvas ref={canvasRef} width={width} height={height} style={{ width: "100%", borderRadius: 12, background: "#0f172a" }} />
      <div style={{ fontSize: 11, color: "#94a3b8" }}>
        {hovered
          ? `Hover: ${formatLabel(hovered).full || hovered.id} (${hovered.count || 0})`
          : "Drag to move, scroll to zoom, click a node for details."}
      </div>
    </div>
  );
}

function CandlestickChart({
  candles,
  vwap = [],
  signals = [],
  width = 640,
  height = 360,
  intervalMs = 60_000,
  view,
  totalCount,
  onViewChange,
  hoverIndex,
  onHoverIndex
}) {
  const canvasRef = useRef(null);
  const [hover, setHover] = useState(null);
  const dragRef = useRef({ active: false, lastX: 0 });

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

    if (signals.length) {
      signals.forEach(signal => {
        const idx = signal.index;
        if (idx == null || idx < 0 || idx >= candles.length) return;
        const candle = candles[idx];
        const x = padding + idx * candleWidth + candleWidth * 0.4;
        const yHigh = padding + (1 - (candle.h - min) / range) * chartH;
        const yLow = padding + (1 - (candle.l - min) / range) * chartH;
        const bias = signal.bias || "neutral";
        const color = bias === "bullish" ? "#16a34a" : bias === "bearish" ? "#dc2626" : "#94a3b8";

        ctx.fillStyle = color;
        ctx.strokeStyle = color;
        ctx.lineWidth = 1;
        ctx.beginPath();
        if (bias === "bullish") {
          ctx.moveTo(x, yLow + 6);
          ctx.lineTo(x - 5, yLow + 16);
          ctx.lineTo(x + 5, yLow + 16);
          ctx.closePath();
          ctx.fill();
        } else if (bias === "bearish") {
          ctx.moveTo(x, yHigh - 6);
          ctx.lineTo(x - 5, yHigh - 16);
          ctx.lineTo(x + 5, yHigh - 16);
          ctx.closePath();
          ctx.fill();
        } else {
          ctx.arc(x, yHigh - 6, 4, 0, Math.PI * 2);
          ctx.fill();
        }
      });
    }

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

    const activeHover = hover != null ? hover : (hoverIndex != null ? hoverIndex : null);
    if (activeHover != null && activeHover >= 0 && activeHover < candles.length) {
      const candle = candles[activeHover];
      const candleWidth = chartW / candles.length;
      const x = padding + activeHover * candleWidth + candleWidth * 0.4;
      ctx.strokeStyle = "rgba(148,163,184,0.6)";
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(x, padding);
      ctx.lineTo(x, padding + chartH);
      ctx.stroke();

      const label = formatAxisTime(candle.t, intervalMs);
      if (label) {
        ctx.fillStyle = "rgba(15, 23, 42, 0.8)";
        ctx.font = "10px 'IBM Plex Mono', monospace";
        const textWidth = ctx.measureText(label).width;
        const boxW = textWidth + 12;
        const boxH = 16;
        ctx.fillRect(x - boxW / 2, height - padding + 4, boxW, boxH);
        ctx.fillStyle = "#e2e8f0";
        ctx.textAlign = "center";
        ctx.fillText(label, x, height - padding + 16);
      }
    }

    drawTimeAxis(ctx, candles.map(c => c.t), w, h, padding, intervalMs);
  }, [candles, hover, vwap, signals, intervalMs, hoverIndex]);

  const onMove = (evt) => {
    const canvas = canvasRef.current;
    if (!canvas || !candles.length) return;
    const rect = canvas.getBoundingClientRect();
    const x = evt.clientX - rect.left;
    const candleWidth = rect.width / candles.length;
    const idx = Math.min(candles.length - 1, Math.max(0, Math.floor(x / candleWidth)));
    setHover(idx);
    if (onHoverIndex && view?.start != null) {
      onHoverIndex(view.start + idx);
    }
  };

  const onLeave = () => {
    setHover(null);
    if (onHoverIndex) onHoverIndex(null);
  };

  const onWheel = (evt) => {
    if (!onViewChange || !view || !totalCount) return;
    evt.preventDefault();
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const x = evt.clientX - rect.left;
    const candleWidth = rect.width / Math.max(1, candles.length);
    const localIdx = Math.min(candles.length - 1, Math.max(0, Math.floor(x / candleWidth)));
    const anchorIndex = view.start + localIdx;
    const scale = evt.deltaY > 0 ? 1.2 : 0.8;
    const minWindow = Math.min(20, totalCount);
    const nextWindow = clampNumber(Math.round(view.window * scale), minWindow, totalCount);
    const anchorRatio = view.window ? (anchorIndex - view.start) / view.window : 0.5;
    const nextStart = clampNumber(Math.round(anchorIndex - anchorRatio * nextWindow), 0, Math.max(0, totalCount - nextWindow));
    const nextOffset = Math.max(0, totalCount - (nextStart + nextWindow));
    onViewChange({ window: nextWindow, offset: nextOffset });
  };

  const onMouseDown = (evt) => {
    if (!onViewChange || !view || !totalCount) return;
    dragRef.current = { active: true, lastX: evt.clientX };
  };

  const onMouseUp = () => {
    dragRef.current.active = false;
  };

  const onMouseDrag = (evt) => {
    if (!dragRef.current.active || !onViewChange || !view || !totalCount) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const candleWidth = rect.width / Math.max(1, candles.length);
    const dx = evt.clientX - dragRef.current.lastX;
    if (Math.abs(dx) < candleWidth) return;
    const deltaBars = Math.round(dx / candleWidth);
    if (!deltaBars) return;
    const nextStart = clampNumber(view.start - deltaBars, 0, Math.max(0, totalCount - view.window));
    const nextOffset = Math.max(0, totalCount - (nextStart + view.window));
    dragRef.current.lastX = evt.clientX;
    onViewChange({ window: view.window, offset: nextOffset });
  };

  const hovered = hover != null ? candles[hover] : null;

  return (
    <div style={{ position: "relative" }}>
      <canvas
        ref={canvasRef}
        width={width}
        height={height}
        onMouseMove={onMove}
        onMouseLeave={onLeave}
        onWheel={onWheel}
        onMouseDown={onMouseDown}
        onMouseUp={onMouseUp}
        onMouseLeaveCapture={onMouseUp}
        onMouseMoveCapture={onMouseDrag}
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
          <div>{formatAxisTime(hovered.t, intervalMs)}</div>
          <div>O {formatNumber(hovered.o)}</div>
          <div>H {formatNumber(hovered.h)}</div>
          <div>L {formatNumber(hovered.l)}</div>
          <div>C {formatNumber(hovered.c)}</div>
        </div>
      )}
    </div>
  );
}

function IndicatorPanel({
  title,
  series = [],
  width = 640,
  height = 120,
  min = null,
  max = null,
  thresholds = [],
  times = [],
  intervalMs = 60_000,
  view,
  totalCount,
  onViewChange,
  hoverIndex,
  onHoverIndex
}) {
  const canvasRef = useRef(null);
  const dragRef = useRef({ active: false, lastX: 0 });

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

    if (hoverIndex != null && hoverIndex >= 0 && hoverIndex < series.length) {
      const x = padding + (hoverIndex / (series.length - 1 || 1)) * chartW;
      ctx.strokeStyle = "rgba(148,163,184,0.6)";
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(x, padding);
      ctx.lineTo(x, padding + chartH);
      ctx.stroke();
    }

    if (times?.length) {
      drawTimeAxis(ctx, times, w, h, padding, intervalMs);
    }
  }, [series, width, height, min, max, thresholds, times, intervalMs, hoverIndex]);

  const handleMove = (evt) => {
    if (!series.length) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const x = evt.clientX - rect.left;
    const step = rect.width / series.length;
    const idx = Math.min(series.length - 1, Math.max(0, Math.floor(x / step)));
    if (onHoverIndex && view?.start != null) onHoverIndex(view.start + idx);
  };

  const handleLeave = () => {
    if (onHoverIndex) onHoverIndex(null);
  };

  const handleWheel = (evt) => {
    if (!onViewChange || !view || !totalCount || !series.length) return;
    evt.preventDefault();
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const x = evt.clientX - rect.left;
    const step = rect.width / series.length;
    const localIdx = Math.min(series.length - 1, Math.max(0, Math.floor(x / step)));
    const anchorIndex = view.start + localIdx;
    const scale = evt.deltaY > 0 ? 1.2 : 0.8;
    const minWindow = Math.min(20, totalCount);
    const nextWindow = clampNumber(Math.round(view.window * scale), minWindow, totalCount);
    const anchorRatio = view.window ? (anchorIndex - view.start) / view.window : 0.5;
    const nextStart = clampNumber(Math.round(anchorIndex - anchorRatio * nextWindow), 0, Math.max(0, totalCount - nextWindow));
    const nextOffset = Math.max(0, totalCount - (nextStart + nextWindow));
    onViewChange({ window: nextWindow, offset: nextOffset });
  };

  const handleDown = (evt) => {
    if (!onViewChange || !view || !totalCount) return;
    dragRef.current = { active: true, lastX: evt.clientX };
  };

  const handleUp = () => {
    dragRef.current.active = false;
  };

  const handleDrag = (evt) => {
    if (!dragRef.current.active || !onViewChange || !view || !totalCount || !series.length) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const step = rect.width / series.length;
    const dx = evt.clientX - dragRef.current.lastX;
    if (Math.abs(dx) < step) return;
    const deltaBars = Math.round(dx / step);
    if (!deltaBars) return;
    const nextStart = clampNumber(view.start - deltaBars, 0, Math.max(0, totalCount - view.window));
    const nextOffset = Math.max(0, totalCount - (nextStart + view.window));
    dragRef.current.lastX = evt.clientX;
    onViewChange({ window: view.window, offset: nextOffset });
  };

  return (
    <div style={{ display: "grid", gap: 6 }}>
      <div style={{ fontSize: 12, color: "#94a3b8" }}>{title}</div>
      <canvas
        ref={canvasRef}
        width={width}
        height={height}
        onMouseMove={handleMove}
        onMouseLeave={handleLeave}
        onWheel={handleWheel}
        onMouseDown={handleDown}
        onMouseUp={handleUp}
        onMouseLeaveCapture={handleUp}
        onMouseMoveCapture={handleDrag}
        style={{ width: "100%", height: "100%", borderRadius: 12, border: "1px solid #1f2937" }}
      />
    </div>
  );
}

function MacdPanel({
  macd = [],
  signal = [],
  histogram = [],
  width = 640,
  height = 140,
  times = [],
  intervalMs = 60_000,
  view,
  totalCount,
  onViewChange,
  hoverIndex,
  onHoverIndex
}) {
  const canvasRef = useRef(null);
  const dragRef = useRef({ active: false, lastX: 0 });

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

    if (hoverIndex != null && hoverIndex >= 0 && hoverIndex < macd.length) {
      const x = padding + (hoverIndex / (macd.length - 1 || 1)) * chartW;
      ctx.strokeStyle = "rgba(148,163,184,0.6)";
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(x, padding);
      ctx.lineTo(x, padding + chartH);
      ctx.stroke();
    }

    if (times?.length) {
      drawTimeAxis(ctx, times, w, h, padding, intervalMs);
    }
  }, [macd, signal, histogram, width, height, times, intervalMs, hoverIndex]);

  const handleMove = (evt) => {
    if (!macd.length) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const x = evt.clientX - rect.left;
    const step = rect.width / macd.length;
    const idx = Math.min(macd.length - 1, Math.max(0, Math.floor(x / step)));
    if (onHoverIndex && view?.start != null) onHoverIndex(view.start + idx);
  };

  const handleLeave = () => {
    if (onHoverIndex) onHoverIndex(null);
  };

  const handleWheel = (evt) => {
    if (!onViewChange || !view || !totalCount || !macd.length) return;
    evt.preventDefault();
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const x = evt.clientX - rect.left;
    const step = rect.width / macd.length;
    const localIdx = Math.min(macd.length - 1, Math.max(0, Math.floor(x / step)));
    const anchorIndex = view.start + localIdx;
    const scale = evt.deltaY > 0 ? 1.2 : 0.8;
    const minWindow = Math.min(20, totalCount);
    const nextWindow = clampNumber(Math.round(view.window * scale), minWindow, totalCount);
    const anchorRatio = view.window ? (anchorIndex - view.start) / view.window : 0.5;
    const nextStart = clampNumber(Math.round(anchorIndex - anchorRatio * nextWindow), 0, Math.max(0, totalCount - nextWindow));
    const nextOffset = Math.max(0, totalCount - (nextStart + nextWindow));
    onViewChange({ window: nextWindow, offset: nextOffset });
  };

  const handleDown = (evt) => {
    if (!onViewChange || !view || !totalCount) return;
    dragRef.current = { active: true, lastX: evt.clientX };
  };

  const handleUp = () => {
    dragRef.current.active = false;
  };

  const handleDrag = (evt) => {
    if (!dragRef.current.active || !onViewChange || !view || !totalCount || !macd.length) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const step = rect.width / macd.length;
    const dx = evt.clientX - dragRef.current.lastX;
    if (Math.abs(dx) < step) return;
    const deltaBars = Math.round(dx / step);
    if (!deltaBars) return;
    const nextStart = clampNumber(view.start - deltaBars, 0, Math.max(0, totalCount - view.window));
    const nextOffset = Math.max(0, totalCount - (nextStart + view.window));
    dragRef.current.lastX = evt.clientX;
    onViewChange({ window: view.window, offset: nextOffset });
  };

  return (
    <div style={{ display: "grid", gap: 6 }}>
      <div style={{ fontSize: 12, color: "#94a3b8" }}>MACD</div>
      <canvas
        ref={canvasRef}
        width={width}
        height={height}
        onMouseMove={handleMove}
        onMouseLeave={handleLeave}
        onWheel={handleWheel}
        onMouseDown={handleDown}
        onMouseUp={handleUp}
        onMouseLeaveCapture={handleUp}
        onMouseMoveCapture={handleDrag}
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
  const [chartView, setChartView] = useState({ window: 120, offset: 0 });
  const [chartHoverIndex, setChartHoverIndex] = useState(null);
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
  const [recommendationsWarnings, setRecommendationsWarnings] = useState([]);
  const [recommendationDetail, setRecommendationDetail] = useState(null);
  const [recommendationDetailStatus, setRecommendationDetailStatus] = useState("");
  const [watchlistQuery, setWatchlistQuery] = useState("");
  const [watchlistResults, setWatchlistResults] = useState([]);
  const [watchlistAssetClass, setWatchlistAssetClass] = useState("stock");
  const [watchlistStatus, setWatchlistStatus] = useState("");
  const [watchlistSaving, setWatchlistSaving] = useState(false);
  const [trackedStocks, setTrackedStocks] = useState([]);
  const [trackedCryptos, setTrackedCryptos] = useState([]);
  const [outcome, setOutcome] = useState({ pnl: "", pnlPct: "", notes: "" });
  const [lessonQuery, setLessonQuery] = useState("");
  const [lessons, setLessons] = useState([]);
  const [lessonStatus, setLessonStatus] = useState("");
  const [tradingTab, setTradingTab] = useState(() => {
    if (typeof window === "undefined") return "terminal";
    const params = new URLSearchParams(window.location.search);
    const tab = params.get("tradingTab");
    return tab && VALID_TRADING_TABS.has(tab) ? tab : "terminal";
  });
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
  const [knowledgeSelectedSource, setKnowledgeSelectedSource] = useState("");
  const [knowledgeSelectedNode, setKnowledgeSelectedNode] = useState("");
  const [knowledgeNodeDetail, setKnowledgeNodeDetail] = useState(null);
  const [knowledgeNodeStatus, setKnowledgeNodeStatus] = useState("");
  const [knowledgePrefsLoaded, setKnowledgePrefsLoaded] = useState(false);
  const [ragModels, setRagModels] = useState([]);
  const [ragModelStatus, setRagModelStatus] = useState("");
  const [activeRagModel, setActiveRagModel] = useState("trading");
  const [newRagTopic, setNewRagTopic] = useState("");
  const [newRagStatus, setNewRagStatus] = useState("");
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
  const [scenarioDetail, setScenarioDetail] = useState(null);
  const [scenarioDetailStatus, setScenarioDetailStatus] = useState("");
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

  const ragModelById = useMemo(() => {
    const map = new Map();
    ragModels.forEach(model => {
      if (model?.id) map.set(model.id, model);
    });
    return map;
  }, [ragModels]);

  const activeRagMeta = useMemo(() => {
    return ragModelById.get(activeRagModel) || { id: activeRagModel || "trading", title: activeRagModel || "trading" };
  }, [ragModelById, activeRagModel]);

  const buildRagFilters = useCallback((modelId) => {
    const selected = String(modelId || activeRagModel || "trading").toLowerCase();
    if (selected === "fireflies") return { meetingType: "fireflies" };
    if (selected === "all") return {};
    if (selected === "trading") return { meetingIdPrefix: "trading:" };
    return { meetingIdPrefix: `rag:${selected}:` };
  }, [activeRagModel]);

  const updateChartView = useCallback((next) => {
    setChartView(prev => ({ ...prev, ...next }));
  }, []);

  const knowledgeSourceInventory = useMemo(() => {
    const inventory = new Map();
    const normalizeKey = (value) => String(value || "").trim();
    const computeAgeDays = (stamp) => {
      if (!stamp) return null;
      const ts = Date.parse(stamp);
      if (!Number.isFinite(ts)) return null;
      return Math.round((Date.now() - ts) / 86400000);
    };
    const upsert = (key, patch) => {
      const normalized = normalizeKey(key);
      if (!normalized) return;
      const existing = inventory.get(normalized) || { key: normalized };
      inventory.set(normalized, { ...existing, ...patch });
    };

    (knowledgeStats?.sources || []).forEach(source => {
      const key = normalizeKey(source.source_url || source.key || source.title);
      upsert(key, {
        key,
        title: source.title || source.key || source.source_url || key,
        source_url: source.source_url || "",
        count: source.count || 0,
        last_seen: source.last_seen || source.lastSeen || "",
        age_days: Number.isFinite(source.age_days) ? source.age_days : null,
        kind: source.kind || "indexed"
      });
    });

    if (activeRagModel !== "fireflies") {
      (sourceList || []).forEach(source => {
        const key = normalizeKey(source.url);
        upsert(key, {
          key,
          title: source.url,
          source_url: source.url,
          enabled: source.enabled,
          last_crawled_at: source.last_crawled_at || "",
          last_status: source.last_status || "",
          kind: "web"
        });
      });
      (rssSources || []).forEach(source => {
        const key = normalizeKey(source.url);
        upsert(key, {
          key,
          title: source.title || source.url,
          source_url: source.url,
          enabled: source.enabled,
          last_crawled_at: source.last_crawled_at || "",
          last_status: source.last_status || "",
          kind: "rss"
        });
      });
    }

    const results = Array.from(inventory.values()).map(item => {
      const lastSeen = item.last_seen || item.last_crawled_at || item.updated_at || "";
      const ageDays = Number.isFinite(item.age_days) ? item.age_days : computeAgeDays(lastSeen);
      return { ...item, last_seen: lastSeen, age_days: ageDays };
    });
    results.sort((a, b) => {
      const countDiff = (b.count || 0) - (a.count || 0);
      if (countDiff) return countDiff;
      return String(b.last_seen || "").localeCompare(String(a.last_seen || ""));
    });
    return results;
  }, [knowledgeStats, sourceList, rssSources, activeRagModel]);

  const knowledgeGraph = useMemo(() => {
    if (activeRagModel === "fireflies") {
      return knowledgeStats?.graph || { nodes: [], links: [] };
    }
    if (knowledgeStats?.graph?.nodes?.length) {
      return knowledgeStats.graph;
    }
    if (!knowledgeSourceInventory.length) return { nodes: [], links: [] };
    const nodes = knowledgeSourceInventory.map(source => ({
      id: `source:${source.key}`,
      label: source.title || formatSourceLabel(source.source_url || source.key, 28),
      value: source.source_url || source.key,
      type: "source",
      count: source.count || 1,
      source_url: source.source_url || ""
    }));
    return { nodes, links: [] };
  }, [knowledgeStats, knowledgeSourceInventory, activeRagModel]);

  const knowledgeLibrary = useMemo(() => {
    if (knowledgeItems.length) {
      return { mode: "docs", items: knowledgeItems };
    }
    if (knowledgeSelectedTag || knowledgeSelectedSource) {
      return { mode: "docs", items: [] };
    }
    if (!knowledgeSourceInventory.length) {
      return { mode: "docs", items: [] };
    }
    const items = knowledgeSourceInventory.map(source => ({
      id: `source:${source.key}`,
      title: source.title || formatSourceLabel(source.source_url || source.key, 32),
      source_url: source.source_url || "",
      occurred_at: source.last_seen || source.last_crawled_at || "",
      isSource: true
    }));
    return { mode: "sources", items };
  }, [knowledgeItems, knowledgeSourceInventory, knowledgeSelectedTag, knowledgeSelectedSource]);


  const switchAssetClass = (next) => {
    if (next === assetClass) return;
    setAssetClass(next);
    setSymbolTouched(false);
    setSymbol(next === "crypto" ? DEFAULTS.crypto : DEFAULTS.stock);
    setCandles([]);
    setDataSource("loading");
    setError("");
  };

  const applyRangeDays = (days) => {
    if (!candles.length) return;
    const bars = Math.max(20, Math.round((days * 86400000) / intervalMs));
    updateChartView({ window: Math.min(candles.length, bars), offset: 0 });
  };

  const resetChartView = () => {
    if (!candles.length) return;
    updateChartView({ window: Math.min(candles.length, 120), offset: 0 });
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

  useEffect(() => {
    const stocks = Array.isArray(tradingProfile?.email?.stocks) ? tradingProfile.email.stocks : [];
    const cryptos = Array.isArray(tradingProfile?.email?.cryptos) ? tradingProfile.email.cryptos : [];
    setTrackedStocks(stocks);
    setTrackedCryptos(cryptos);
  }, [tradingProfile]);

  async function loadRecommendations() {
    if (!serverUrl) {
      setRecommendationsLoading(false);
      setRecommendationsError("Trading server URL not configured.");
      return;
    }
    setRecommendationsLoading(true);
    setRecommendationsError("");
    setRecommendationsWarnings([]);
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 25000);
    try {
      const resp = await fetch(`${serverUrl}/api/trading/recommendations`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ assetClass: "all", topN: 12, horizonDays: 180, includeSignals: true }),
        signal: controller.signal
      });
      const data = await resp.json();
      if (!resp.ok) throw new Error(data?.error || "recommendations_failed");
      const picks = Array.isArray(data.picks)
        ? data.picks.map(item => ({
            symbol: item.symbol,
            assetClass: item.assetClass || item.asset_class || "stock",
            bias: item.bias || "WATCH",
            abstract: item.rationale || item.abstract || "",
            confidence: item.confidence,
            signal: item.signal || null
          }))
        : [];
      setRecommendations(picks);
      setRecommendationsSource(data?.source || "llm");
      setRecommendationsWarnings(Array.isArray(data?.warnings) ? data.warnings : []);
    } catch (err) {
      const message = err?.name === "AbortError"
        ? "Recommendations request timed out."
        : (err?.message || "recommendations_failed");
      setRecommendationsError(message);
    } finally {
      clearTimeout(timeout);
      setRecommendationsLoading(false);
    }
  }

  const saveWatchlists = async (nextStocks, nextCryptos) => {
    if (!serverUrl) return;
    setWatchlistSaving(true);
    setWatchlistStatus("Saving watchlists...");
    try {
      const payload = {
        email: {
          ...(tradingProfile?.email || {}),
          stocks: nextStocks,
          cryptos: nextCryptos
        },
        training: tradingProfile?.training || {}
      };
      const resp = await fetch(`${serverUrl}/api/trading/settings`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
      });
      const data = await resp.json();
      if (!resp.ok) throw new Error(data?.error || "watchlist_save_failed");
      setTradingProfile(data.settings || tradingProfile);
      setWatchlistStatus("Watchlists saved.");
      loadRecommendations();
    } catch (err) {
      setWatchlistStatus(err?.message || "watchlist_save_failed");
    } finally {
      setWatchlistSaving(false);
      setTimeout(() => setWatchlistStatus(""), 2000);
    }
  };

  const addToWatchlist = async (item) => {
    if (!item?.symbol) return;
    const symbolValue = item.symbol.toUpperCase();
    if (item.assetClass === "crypto") {
      const next = Array.from(new Set([...(trackedCryptos || []), symbolValue]));
      setTrackedCryptos(next);
      await saveWatchlists(trackedStocks, next);
      return;
    }
    const next = Array.from(new Set([...(trackedStocks || []), symbolValue]));
    setTrackedStocks(next);
    await saveWatchlists(next, trackedCryptos);
  };

  const removeFromWatchlist = async (symbolValue, targetClass) => {
    if (!symbolValue) return;
    if (targetClass === "crypto") {
      const next = (trackedCryptos || []).filter(item => item !== symbolValue);
      setTrackedCryptos(next);
      await saveWatchlists(trackedStocks, next);
      return;
    }
    const next = (trackedStocks || []).filter(item => item !== symbolValue);
    setTrackedStocks(next);
    await saveWatchlists(next, trackedCryptos);
  };

  useEffect(() => {
    if (!serverUrl) return;
    const query = watchlistQuery.trim();
    if (!query) {
      setWatchlistResults([]);
      return;
    }
    const handle = setTimeout(async () => {
      try {
        const resp = await fetch(`${serverUrl}/api/trading/symbols/search?q=${encodeURIComponent(query)}&assetClass=${encodeURIComponent(watchlistAssetClass)}&limit=12`);
        const data = await resp.json();
        if (!resp.ok) throw new Error(data?.error || "symbol_search_failed");
        setWatchlistResults(Array.isArray(data.results) ? data.results : []);
      } catch {
        setWatchlistResults([]);
      }
    }, 320);
    return () => clearTimeout(handle);
  }, [watchlistQuery, watchlistAssetClass, serverUrl]);

  const loadRagModels = async () => {
    if (!serverUrl) return;
    setRagModelStatus("Loading RAG models...");
    try {
      const resp = await fetch(`${serverUrl}/api/rag/models`);
      const data = await resp.json();
      if (!resp.ok) throw new Error(data?.error || "rag_models_failed");
      const models = Array.isArray(data.models) ? data.models : [];
      setRagModels(models);
      const idSet = new Set(models.map(m => m.id));
      setActiveRagModel(prev => (prev && idSet.has(prev) ? prev : "trading"));
      setRagModelStatus("");
    } catch (err) {
      setRagModelStatus(err?.message || "rag_models_failed");
    }
  };

  const createRagModel = async () => {
    if (!serverUrl) return;
    const topic = newRagTopic.trim();
    if (!topic) return;
    setNewRagStatus("Creating model...");
    try {
      const resp = await fetch(`${serverUrl}/api/rag/models`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ topic })
      });
      const data = await resp.json();
      if (!resp.ok) throw new Error(data?.error || "rag_create_failed");
      const modelId = data?.model?.id || "";
      setNewRagTopic("");
      setNewRagStatus("Model created.");
      await loadRagModels();
      if (modelId) {
        setActiveRagModel(modelId);
        try {
          localStorage.setItem("aika_active_rag_model", modelId);
        } catch {
          // ignore
        }
      }
    } catch (err) {
      setNewRagStatus(err?.message || "rag_create_failed");
    } finally {
      setTimeout(() => setNewRagStatus(""), 2000);
    }
  };

  useEffect(() => {
    loadRecommendations();
  }, [serverUrl]);

  useEffect(() => {
    if (!serverUrl) return;
    try {
      const raw = localStorage.getItem("trading_knowledge_ui");
      if (raw) {
        const saved = JSON.parse(raw);
        if (saved?.selectedNode) setKnowledgeSelectedNode(saved.selectedNode);
        if (saved?.selectedTag) setKnowledgeSelectedTag(saved.selectedTag);
        if (saved?.selectedSource) setKnowledgeSelectedSource(saved.selectedSource);
      }
    } catch {
      // ignore storage errors
    } finally {
      setKnowledgePrefsLoaded(true);
    }
  }, [serverUrl]);

  useEffect(() => {
    if (!serverUrl) return;
    try {
      const stored = localStorage.getItem("aika_active_rag_model");
      if (stored) setActiveRagModel(stored);
    } catch {
      // ignore
    }
    loadRagModels();
  }, [serverUrl]);

  useEffect(() => {
    try {
      if (activeRagModel) localStorage.setItem("aika_active_rag_model", activeRagModel);
    } catch {
      // ignore
    }
  }, [activeRagModel]);

  useEffect(() => {
    if (!serverUrl || !knowledgePrefsLoaded) return;
    setKnowledgeSelectedTag("");
    setKnowledgeSelectedSource("");
    setKnowledgeSelectedNode("");
    setKnowledgeNodeDetail(null);
    loadKnowledgeItems();
    loadSources();
    loadKnowledgeStats();
    loadRssSources();
    loadScenarioHistory();
  }, [serverUrl, knowledgePrefsLoaded, activeRagModel]);

  useEffect(() => {
    if (!knowledgePrefsLoaded) return;
    try {
      const payload = {
        selectedNode: knowledgeSelectedNode,
        selectedTag: knowledgeSelectedTag,
        selectedSource: knowledgeSelectedSource
      };
      localStorage.setItem("trading_knowledge_ui", JSON.stringify(payload));
    } catch {
      // ignore
    }
  }, [knowledgeSelectedNode, knowledgeSelectedTag, knowledgeSelectedSource, knowledgePrefsLoaded]);

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
    setChartView(prev => ({ ...prev, window: 120, offset: 0 }));
    setChartHoverIndex(null);
  }, [symbol, interval]);

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

  const signalEvents = useMemo(() => {
    if (candles.length < 3) return [];
    const lookback = Math.min(12, candles.length - 1);
    const start = Math.max(1, candles.length - lookback);
    const events = [];
    for (let i = start; i < candles.length; i += 1) {
      const pattern = detectPattern(candles[i], candles[i - 1]);
      if (!pattern) continue;
      const meta = classifyPattern(pattern);
      events.push({
        index: i,
        pattern,
        bias: meta.bias,
        strength: meta.strength,
        note: meta.note,
        time: candles[i].t
      });
    }
    return events;
  }, [candles]);

  const latestSignal = signalEvents.length ? signalEvents[signalEvents.length - 1] : null;

  const vwapSeries = useMemo(() => (showVwap ? computeVWAP(candles) : []), [candles, showVwap]);
  const rsiSeries = useMemo(() => (showRsi ? computeRSI(candles) : []), [candles, showRsi]);
  const macdSeries = useMemo(() => (showMacd ? computeMACD(candles) : { macd: [], signal: [], histogram: [] }), [candles, showMacd]);
  const intervalMs = useMemo(() => intervalToMs(interval), [interval]);

  const viewRange = useMemo(() => {
    const total = candles.length;
    if (!total) return { start: 0, end: 0, window: 0, offset: 0, total };
    const minWindow = Math.min(20, total);
    const windowSize = clampNumber(chartView.window || minWindow, minWindow, total);
    const maxOffset = Math.max(0, total - windowSize);
    const offset = clampNumber(chartView.offset || 0, 0, maxOffset);
    const end = total - offset;
    const start = Math.max(0, end - windowSize);
    return { start, end, window: windowSize, offset, total };
  }, [candles.length, chartView.window, chartView.offset]);

  useEffect(() => {
    setChartView(prev => {
      const total = candles.length;
      if (!total) return prev;
      const minWindow = Math.min(20, total);
      const windowSize = clampNumber(prev.window || minWindow, minWindow, total);
      const maxOffset = Math.max(0, total - windowSize);
      const offset = clampNumber(prev.offset || 0, 0, maxOffset);
      if (windowSize === prev.window && offset === prev.offset) return prev;
      return { ...prev, window: windowSize, offset };
    });
  }, [candles.length]);

  const visibleCandles = useMemo(() => candles.slice(viewRange.start, viewRange.end), [candles, viewRange.start, viewRange.end]);
  const visibleVwap = useMemo(() => vwapSeries.slice(viewRange.start, viewRange.end), [vwapSeries, viewRange.start, viewRange.end]);
  const visibleRsi = useMemo(() => rsiSeries.slice(viewRange.start, viewRange.end), [rsiSeries, viewRange.start, viewRange.end]);
  const visibleMacd = useMemo(() => ({
    macd: macdSeries.macd.slice(viewRange.start, viewRange.end),
    signal: macdSeries.signal.slice(viewRange.start, viewRange.end),
    histogram: macdSeries.histogram.slice(viewRange.start, viewRange.end)
  }), [macdSeries, viewRange.start, viewRange.end]);

  const visibleSignals = useMemo(() => {
    if (!signalEvents.length) return [];
    return signalEvents
      .filter(event => event.index >= viewRange.start && event.index < viewRange.end)
      .map(event => ({ ...event, index: event.index - viewRange.start }));
  }, [signalEvents, viewRange.start, viewRange.end]);

  const hoverLocalIndex = useMemo(() => {
    if (chartHoverIndex == null) return null;
    if (chartHoverIndex < viewRange.start || chartHoverIndex >= viewRange.end) return null;
    return chartHoverIndex - viewRange.start;
  }, [chartHoverIndex, viewRange.start, viewRange.end]);

  const cryptoRecs = useMemo(
    () => recommendations.filter(item => item.assetClass === "crypto"),
    [recommendations]
  );
  const stockRecs = useMemo(
    () => recommendations.filter(item => item.assetClass === "stock"),
    [recommendations]
  );

  const weeklyPlan = useMemo(() => {
    return recommendations
      .filter(item => item.signal && typeof item.signal.score === "number")
      .slice()
      .sort((a, b) => (b.signal.score || 0) - (a.signal.score || 0))
      .slice(0, 6);
  }, [recommendations]);

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
    const resolvedOverride = typeof overrideText === "string" ? overrideText : "";
    const content = String(resolvedOverride || assistantInput || "").trim();
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
        body: JSON.stringify({ userText: prompt, ragModel: activeRagModel || "trading" })
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

  const loadKnowledgeItems = async (filters = {}) => {
    if (!serverUrl) return;
    try {
      if (activeRagModel === "fireflies") {
        const type = "fireflies";
        const query = new URLSearchParams({ limit: "20", type });
        const resp = await fetch(`${serverUrl}/api/rag/meetings?${query.toString()}`);
        const data = await resp.json();
        if (!resp.ok) throw new Error(data?.error || "knowledge_list_failed");
        setKnowledgeItems(Array.isArray(data.meetings) ? data.meetings : []);
        setKnowledgeStatus("");
        return;
      }
      const tag = typeof filters?.tag === "string" ? filters.tag : knowledgeSelectedTag;
      const source = typeof filters?.source === "string" ? filters.source : knowledgeSelectedSource;
      const query = new URLSearchParams({ limit: "20", collection: activeRagModel || "trading" });
      if (tag) query.set("tag", tag);
      if (source) query.set("source", source);
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
      if (activeRagModel === "fireflies") {
        const resp = await fetch(`${serverUrl}/api/fireflies/graph?limit=500`);
        const data = await resp.json();
        if (!resp.ok) throw new Error(data?.error || "knowledge_stats_failed");
        const participantSources = Array.isArray(data.topParticipants)
          ? data.topParticipants.map(item => ({
              key: item.name,
              title: item.name,
              count: item.count,
              source_url: "",
              age_days: null
            }))
          : [];
        setKnowledgeStats({
          totalDocuments: data.totalMeetings || 0,
          totalTags: Array.isArray(data.topTopics) ? data.topTopics.length : 0,
          sources: participantSources,
          tags: Array.isArray(data.topTopics) ? data.topTopics : [],
          topSources: participantSources,
          graph: {
            nodes: data.nodes || [],
            links: data.links || []
          }
        });
      } else {
        const resp = await fetch(`${serverUrl}/api/trading/knowledge/stats?limit=500&collection=${encodeURIComponent(activeRagModel || "trading")}`);
        const data = await resp.json();
        if (!resp.ok) throw new Error(data?.error || "knowledge_stats_failed");
        setKnowledgeStats(data);
      }
      setKnowledgeStatsStatus("");
    } catch (err) {
      setKnowledgeStatsStatus(err?.message || "knowledge_stats_failed");
    }
  };

  const parseKnowledgeNode = (node) => {
    if (!node) return null;
    const rawId = String(node.id || "");
    const inferredType = node.type
      || (rawId.startsWith("tag:") || rawId.startsWith("#") ? "tag" : rawId.startsWith("source:") ? "source" : "");
    let value = node.value || node.label || rawId;
    if (inferredType === "tag") {
      value = String(value || "").replace(/^tag:/i, "").replace(/^#/i, "").trim().toLowerCase();
    } else if (inferredType === "source") {
      value = String(value || "").replace(/^source:/i, "").trim();
    }
    return { id: rawId, type: inferredType, value, label: node.label || value };
  };

  const loadKnowledgeNodeDetails = async (nodeId) => {
    if (!serverUrl || !nodeId) return;
    setKnowledgeNodeStatus("Loading node details...");
    try {
      if (activeRagModel === "fireflies") {
        const resp = await fetch(`${serverUrl}/api/fireflies/node?node=${encodeURIComponent(nodeId)}&limitMeetings=8&limitSnippets=6`);
        const data = await resp.json();
        if (!resp.ok) throw new Error(data?.error || "knowledge_node_failed");
        setKnowledgeNodeDetail({
          type: data.type || "node",
          label: data.label || data.nodeId || "",
          count: Array.isArray(data.meetings) ? data.meetings.length : 0,
          docs: Array.isArray(data.meetings) ? data.meetings.map(item => ({
            id: item.id,
            title: item.title,
            occurred_at: item.occurred_at,
            source_url: item.source_url || ""
          })) : [],
          snippets: Array.isArray(data.snippets) ? data.snippets.map(item => ({
            chunk_id: item.chunk_id,
            meeting_title: item.meeting_title,
            occurred_at: item.occurred_at,
            text: item.text
          })) : []
        });
      } else {
        const resp = await fetch(`${serverUrl}/api/trading/knowledge/node?node=${encodeURIComponent(nodeId)}&limitDocs=8&limitSnippets=6&collection=${encodeURIComponent(activeRagModel || "trading")}`);
        const data = await resp.json();
        if (!resp.ok) throw new Error(data?.error || "knowledge_node_failed");
        setKnowledgeNodeDetail(data);
      }
      setKnowledgeNodeStatus("");
    } catch (err) {
      setKnowledgeNodeDetail(null);
      setKnowledgeNodeStatus(err?.message || "knowledge_node_failed");
    }
  };

  const clearKnowledgeFilter = async () => {
    setKnowledgeSelectedTag("");
    setKnowledgeSelectedSource("");
    setKnowledgeSelectedNode("");
    setKnowledgeNodeDetail(null);
    setKnowledgeNodeStatus("");
    await loadKnowledgeItems({ tag: "", source: "" });
  };

  const handleKnowledgeNodeSelect = async (node) => {
    if (!node?.id) return;
    const parsed = parseKnowledgeNode(node);
    setKnowledgeSelectedNode(node.id);
    if (parsed?.type) {
      setKnowledgeNodeDetail({
        type: parsed.type,
        label: parsed.label,
        count: 0,
        docs: [],
        snippets: []
      });
    } else {
      setKnowledgeNodeDetail(null);
    }
    if (parsed?.type === "tag") {
      setKnowledgeSelectedTag(parsed.value);
      setKnowledgeSelectedSource("");
      await loadKnowledgeItems({ tag: parsed.value, source: "" });
    } else if (parsed?.type === "source") {
      setKnowledgeSelectedSource(parsed.value);
      setKnowledgeSelectedTag("");
      await loadKnowledgeItems({ tag: "", source: parsed.value });
    }
    await loadKnowledgeNodeDetails(node.id);
  };

  const loadSources = async () => {
    if (!serverUrl) return;
    try {
      if (activeRagModel === "fireflies") {
        setSourceList([]);
        setSourceStatus("");
        return;
      }
      const resp = await fetch(`${serverUrl}/api/trading/knowledge/sources?includeDisabled=1&collection=${encodeURIComponent(activeRagModel || "trading")}`);
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
      if (activeRagModel === "fireflies") {
        setRssSources([]);
        return;
      }
      const resp = await fetch(`${serverUrl}/api/trading/rss/sources?includeDisabled=1&collection=${encodeURIComponent(activeRagModel || "trading")}`);
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
        body: JSON.stringify({ url: rssSeedUrl, collection: activeRagModel || "trading" })
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
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ collection: activeRagModel || "trading" })
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
        body: JSON.stringify({ enabled: !source.enabled, collection: activeRagModel || "trading" })
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
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ collection: activeRagModel || "trading" })
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
      const resp = await fetch(`${serverUrl}/api/trading/rss/sources/${source.id}?collection=${encodeURIComponent(activeRagModel || "trading")}`, {
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
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ collection: activeRagModel || "trading" })
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
    if (activeRagModel === "fireflies") {
      setSourceStatus("Fireflies knowledge is read-only.");
      return;
    }
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
          tags: newSourceTags.split(/[;,]/).map(t => t.trim()).filter(Boolean),
          collection: activeRagModel || "trading"
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
        body: JSON.stringify({ enabled: !source.enabled, collection: activeRagModel || "trading" })
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
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ collection: activeRagModel || "trading" })
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
      const resp = await fetch(`${serverUrl}/api/trading/knowledge/sources/${source.id}?deleteKnowledge=${deleteKnowledgeOnRemove ? "1" : "0"}&collection=${encodeURIComponent(activeRagModel || "trading")}`, {
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
    if (activeRagModel === "fireflies") {
      setKnowledgeStatus("Fireflies knowledge is read-only.");
      return;
    }
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
          tags: knowledgeTags.split(/[;,]/).map(t => t.trim()).filter(Boolean),
          collection: activeRagModel || "trading"
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
      if (activeRagModel === "fireflies") {
        const resp = await fetch(`${serverUrl}/api/rag/ask`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            question,
            filters: { meetingType: "fireflies" }
          })
        });
        const data = await resp.json();
        if (!resp.ok) throw new Error(data?.error || "knowledge_query_failed");
        setKnowledgeAnswer(data.answer || "");
        setKnowledgeCitations(data.citations || []);
      } else {
        const resp = await fetch(`${serverUrl}/api/trading/knowledge/ask`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ question, collection: activeRagModel || "trading" })
        });
        const data = await resp.json();
        if (!resp.ok) throw new Error(data?.error || "knowledge_query_failed");
        setKnowledgeAnswer(data.answer || "");
        setKnowledgeCitations(data.citations || []);
      }
      setKnowledgeStatus("");
    } catch (err) {
      setKnowledgeStatus(err?.message || "knowledge_query_failed");
    }
  };

  const ingestKnowledgeUrl = async () => {
    if (!serverUrl) return;
    if (activeRagModel === "fireflies") {
      setKnowledgeUrlStatus("Fireflies knowledge is read-only.");
      return;
    }
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
          useOcr: knowledgeUrlOcr,
          collection: activeRagModel || "trading"
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
    if (activeRagModel === "fireflies") {
      setKnowledgeFileStatus("Fireflies knowledge is read-only.");
      return;
    }
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
      form.append("collection", activeRagModel || "trading");
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
      const resp = await fetch(`${serverUrl}/api/rag/ask`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          question,
          topK: 8,
          filters: buildRagFilters(activeRagModel)
        })
      });
      const data = await resp.json();
      if (!resp.ok) throw new Error(data?.error || "qa_failed");
      let answer = data?.answer || "";
      let citations = data?.citations || [];
      let source = activeRagMeta?.title || activeRagModel || "rag";
      const needsFallback = qaAllowFallback && (!answer || /^i\\s+don'?t\\s+know/i.test(answer));
      if (needsFallback) {
        try {
          const fallbackResp = await fetch(`${serverUrl}/chat`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ userText: question, maxOutputTokens: 400, ragModel: activeRagModel || "trading" })
          });
          const fallbackData = await fallbackResp.json();
          if (fallbackResp.ok && fallbackData?.text) {
            answer = fallbackData.text;
            citations = fallbackData.citations || citations;
            source = fallbackData.source || "chat";
          }
        } catch {
          // keep rag answer
        }
      }
      setQaAnswer(answer);
      setQaCitations(citations);
      setQaSource(source);
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

  const openScenarioDetail = async (result) => {
    if (!serverUrl || !result?.symbol) return;
    setScenarioDetailStatus("Loading detailed analysis...");
    setScenarioDetail({
      symbol: result.symbol,
      assetClass: result.assetClass || scenarioAssetClass,
      windowDays: result.windowDays || scenarioWindow
    });
    try {
      const query = new URLSearchParams({
        symbol: result.symbol,
        assetClass: result.assetClass || scenarioAssetClass || "stock",
        windowDays: String(result.windowDays || scenarioWindow || 30)
      });
      const resp = await fetch(`${serverUrl}/api/trading/scenarios/detail?${query.toString()}`);
      const data = await resp.json();
      if (!resp.ok) throw new Error(data?.error || "scenario_detail_failed");
      setScenarioDetail(data);
      setScenarioDetailStatus("");
    } catch (err) {
      setScenarioDetailStatus(err?.message || "scenario_detail_failed");
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

  const handleRecommendationAnalyze = async (item) => {
    if (!item?.symbol || !serverUrl) return;
    const targetClass = item.assetClass === "crypto" ? "crypto" : "stock";
    if (targetClass !== assetClass) {
      switchAssetClass(targetClass);
    }
    setSymbol(item.symbol);
    setSymbolTouched(true);
    setRecommendationDetailStatus("Loading analysis...");
    setRecommendationDetail({
      symbol: item.symbol,
      assetClass: targetClass,
      bias: item.bias
    });
    try {
      const resp = await fetch(`${serverUrl}/api/trading/recommendations/detail`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          symbol: item.symbol,
          assetClass: targetClass,
          bias: item.bias,
          collectionId: activeRagModel && activeRagModel !== "fireflies" ? activeRagModel : undefined
        })
      });
      const data = await resp.json();
      if (!resp.ok) throw new Error(data?.error || "recommendation_detail_failed");
      setRecommendationDetail(data);
      setRecommendationDetailStatus("");
    } catch (err) {
      setRecommendationDetailStatus(err?.message || "recommendation_detail_failed");
    }
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
                <div style={{ fontSize: 12, color: "#64748b" }}>
                  Pattern: {latestSignal?.pattern || "--"} {latestSignal?.bias ? `(${latestSignal.bias})` : ""}
                </div>
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
              <span style={{ color: "#94a3b8" }}>Scroll to zoom • Drag to pan</span>
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
            <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 10 }}>
              {[
                { label: "1W", days: 7 },
                { label: "1M", days: 30 },
                { label: "3M", days: 90 },
                { label: "6M", days: 180 },
                { label: "1Y", days: 365 }
              ].map(range => (
                <button
                  key={range.label}
                  onClick={() => applyRangeDays(range.days)}
                  style={{ padding: "4px 8px", borderRadius: 8, border: "1px solid #e2e8f0", background: "#fff", fontSize: 11 }}
                >
                  {range.label}
                </button>
              ))}
              <button
                onClick={() => updateChartView({ window: Math.max(20, viewRange.total), offset: 0 })}
                style={{ padding: "4px 8px", borderRadius: 8, border: "1px solid #e2e8f0", background: "#f8fafc", fontSize: 11 }}
              >
                All
              </button>
              <button
                onClick={resetChartView}
                style={{ padding: "4px 8px", borderRadius: 8, border: "1px solid #e2e8f0", background: "#f8fafc", fontSize: 11 }}
              >
                Reset
              </button>
            </div>
            <div style={{ height: 360 }}>
              <CandlestickChart
                candles={visibleCandles}
                vwap={visibleVwap}
                signals={visibleSignals}
                width={760}
                height={360}
                intervalMs={intervalMs}
                view={viewRange}
                totalCount={viewRange.total}
                onViewChange={updateChartView}
                hoverIndex={hoverLocalIndex}
                onHoverIndex={setChartHoverIndex}
              />
            </div>
            <div style={{ display: "grid", gap: 10, marginTop: 10 }}>
              {showRsi && (
                <IndicatorPanel
                  title="RSI (14)"
                  series={visibleRsi}
                  min={0}
                  max={100}
                  thresholds={[30, 70]}
                  width={760}
                  height={120}
                  times={visibleCandles.map(c => c.t)}
                  intervalMs={intervalMs}
                  view={viewRange}
                  totalCount={viewRange.total}
                  onViewChange={updateChartView}
                  hoverIndex={hoverLocalIndex}
                  onHoverIndex={setChartHoverIndex}
                />
              )}
              {showMacd && (
                <MacdPanel
                  macd={visibleMacd.macd}
                  signal={visibleMacd.signal}
                  histogram={visibleMacd.histogram}
                  width={760}
                  height={140}
                  times={visibleCandles.map(c => c.t)}
                  intervalMs={intervalMs}
                  view={viewRange}
                  totalCount={viewRange.total}
                  onViewChange={updateChartView}
                  hoverIndex={hoverLocalIndex}
                  onHoverIndex={setChartHoverIndex}
                />
              )}
            </div>
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
            <div style={{ background: "#ffffff", borderRadius: 14, padding: 12, border: "1px solid #e5e7eb" }}>
              <div style={{ fontWeight: 600, marginBottom: 8 }}>Signal Highlights</div>
              {latestSignal ? (
                <div style={{ marginBottom: 10, padding: 8, borderRadius: 10, background: "#f8fafc", border: "1px solid #e2e8f0" }}>
                  <div style={{ fontSize: 11, color: "#64748b", textTransform: "uppercase" }}>Latest signal</div>
                  <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 4 }}>
                    <span style={{
                      fontSize: 10,
                      padding: "2px 6px",
                      borderRadius: 999,
                      background: latestSignal.bias === "bullish" ? "#dcfce7" : latestSignal.bias === "bearish" ? "#fee2e2" : "#e2e8f0",
                      color: latestSignal.bias === "bullish" ? "#15803d" : latestSignal.bias === "bearish" ? "#b91c1c" : "#475569"
                    }}>
                      {latestSignal.bias.toUpperCase()}
                    </span>
                    <div style={{ fontWeight: 600, fontSize: 12 }}>{latestSignal.pattern}</div>
                  </div>
                  <div style={{ fontSize: 11, color: "#64748b", marginTop: 4 }}>
                    {latestSignal.note}
                  </div>
                </div>
              ) : null}
              {signalEvents.length ? (
                <div style={{ display: "grid", gap: 6 }}>
                  {signalEvents.slice(-6).reverse().map((signal, idx) => (
                    <div key={`${signal.pattern}-${signal.index}-${idx}`} style={{ display: "flex", gap: 8, alignItems: "center" }}>
                      <span style={{
                        width: 8,
                        height: 8,
                        borderRadius: 999,
                        background: signal.bias === "bullish" ? "#22c55e" : signal.bias === "bearish" ? "#ef4444" : "#94a3b8"
                      }} />
                      <div style={{ fontSize: 12, color: "#334155" }}>
                        {signal.pattern} · {signal.bias}
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div style={{ fontSize: 12, color: "#64748b" }}>Not enough data.</div>
              )}
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
              <div style={{ fontWeight: 600 }}>Watchlists</div>
              {watchlistSaving && <span style={{ fontSize: 10, color: "#94a3b8" }}>Saving...</span>}
            </div>
            <div style={{ fontSize: 11, color: "#64748b", marginBottom: 8 }}>
              Search tickers and add to your tracked stocks or crypto lists (used for scenarios and recommendations).
            </div>
            <div style={{ display: "flex", gap: 8, marginBottom: 8, flexWrap: "wrap" }}>
              <select
                value={watchlistAssetClass}
                onChange={(e) => setWatchlistAssetClass(e.target.value)}
                style={{ padding: "6px 8px", borderRadius: 8, border: "1px solid #cbd5f5", fontSize: 12 }}
              >
                <option value="stock">Stocks</option>
                <option value="crypto">Crypto</option>
              </select>
              <input
                value={watchlistQuery}
                onChange={(e) => setWatchlistQuery(e.target.value)}
                placeholder="Search ticker or name"
                style={{ flex: 1, minWidth: 180, padding: "6px 8px", borderRadius: 8, border: "1px solid #cbd5f5", fontSize: 12 }}
              />
            </div>
            {watchlistResults.length > 0 && (
              <div style={{ display: "grid", gap: 6, maxHeight: 160, overflow: "auto", marginBottom: 8 }}>
                {watchlistResults.map((item, idx) => (
                  <div key={`${item.symbol}-${idx}`} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", border: "1px solid #e5e7eb", borderRadius: 10, padding: 6 }}>
                    <div>
                      <div style={{ fontWeight: 600, fontSize: 12 }}>{item.symbol}</div>
                      <div style={{ fontSize: 10, color: "#64748b" }}>{item.name || item.exchange || item.assetClass}</div>
                    </div>
                    <button
                      onClick={() => addToWatchlist(item)}
                      style={{ padding: "4px 8px", borderRadius: 8, border: "1px solid #0ea5e9", background: "#e0f2fe", color: "#0ea5e9", fontSize: 11 }}
                    >
                      Add
                    </button>
                  </div>
                ))}
              </div>
            )}
            <div style={{ display: "grid", gap: 6, fontSize: 11 }}>
              <div>
                <div style={{ fontWeight: 600, marginBottom: 4 }}>Tracked Stocks</div>
                {(trackedStocks || []).length === 0 ? (
                  <div style={{ color: "#94a3b8" }}>No stocks tracked yet.</div>
                ) : (
                  <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                    {trackedStocks.map(symbolValue => (
                      <button
                        key={`stock-${symbolValue}`}
                        onClick={() => removeFromWatchlist(symbolValue, "stock")}
                        style={{ padding: "4px 8px", borderRadius: 999, border: "1px solid #e2e8f0", background: "#f8fafc", fontSize: 11 }}
                      >
                        {symbolValue} ×
                      </button>
                    ))}
                  </div>
                )}
              </div>
              <div>
                <div style={{ fontWeight: 600, marginBottom: 4 }}>Tracked Crypto</div>
                {(trackedCryptos || []).length === 0 ? (
                  <div style={{ color: "#94a3b8" }}>No crypto tracked yet.</div>
                ) : (
                  <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                    {trackedCryptos.map(symbolValue => (
                      <button
                        key={`crypto-${symbolValue}`}
                        onClick={() => removeFromWatchlist(symbolValue, "crypto")}
                        style={{ padding: "4px 8px", borderRadius: 999, border: "1px solid #e2e8f0", background: "#f8fafc", fontSize: 11 }}
                      >
                        {symbolValue} ×
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </div>
            {watchlistStatus && <div style={{ fontSize: 11, color: "#475569", marginTop: 6 }}>{watchlistStatus}</div>}
          </div>

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
            {recommendationsWarnings.length > 0 && (
              <div style={{ fontSize: 11, color: "#b45309", marginTop: 6 }}>
                {recommendationsWarnings.join(" ")}
              </div>
            )}
            {weeklyPlan.length > 0 && (
              <div style={{ marginTop: 8, padding: 8, borderRadius: 10, border: "1px solid #e2e8f0", background: "#f8fafc" }}>
                <div style={{ fontWeight: 600, fontSize: 12, marginBottom: 4 }}>Weekly Action Plan</div>
                <div style={{ fontSize: 11, color: "#64748b", marginBottom: 6 }}>
                  Designed for slower, weekly reviews (not intraday trading).
                </div>
                <div style={{ display: "grid", gap: 6 }}>
                  {weeklyPlan.map((item, idx) => (
                    <div key={`${item.symbol}-${idx}`} style={{ display: "flex", justifyContent: "space-between", gap: 8, fontSize: 11 }}>
                      <div style={{ fontWeight: 600 }}>{item.symbol}</div>
                      <div style={{ color: "#475569" }}>{item.signal?.action || "HOLD"} · score {item.signal?.score}</div>
                    </div>
                  ))}
                </div>
              </div>
            )}
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
                          {item.signal?.action && (
                            <span style={{
                              fontSize: 10,
                              padding: "2px 6px",
                              borderRadius: 999,
                              background: item.signal.action.includes("ACCUMULATE") || item.signal.action.includes("BUY")
                                ? "#dbeafe"
                                : item.signal.action.includes("REDUCE") || item.signal.action.includes("AVOID")
                                  ? "#fee2e2"
                                  : "#f1f5f9",
                              color: item.signal.action.includes("ACCUMULATE") || item.signal.action.includes("BUY")
                                ? "#1d4ed8"
                                : item.signal.action.includes("REDUCE") || item.signal.action.includes("AVOID")
                                  ? "#b91c1c"
                                  : "#475569"
                            }}>
                              {item.signal.action}
                            </span>
                          )}
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
                    {item.signal?.score != null && (
                      <div style={{ fontSize: 10, color: "#94a3b8", marginTop: 2 }}>
                        Signal score: {item.signal.score} (horizon {item.signal.horizonDays}d)
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
                        {item.signal?.action && (
                          <span style={{
                            fontSize: 10,
                            padding: "2px 6px",
                            borderRadius: 999,
                            background: item.signal.action.includes("ACCUMULATE") || item.signal.action.includes("BUY")
                              ? "#dbeafe"
                              : item.signal.action.includes("REDUCE") || item.signal.action.includes("AVOID")
                                ? "#fee2e2"
                                : "#f1f5f9",
                            color: item.signal.action.includes("ACCUMULATE") || item.signal.action.includes("BUY")
                              ? "#1d4ed8"
                              : item.signal.action.includes("REDUCE") || item.signal.action.includes("AVOID")
                                ? "#b91c1c"
                                : "#475569"
                          }}>
                            {item.signal.action}
                          </span>
                        )}
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
                    {item.signal?.score != null && (
                      <div style={{ fontSize: 10, color: "#94a3b8", marginTop: 2 }}>
                        Signal score: {item.signal.score} (horizon {item.signal.horizonDays}d)
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
              <button onClick={() => sendAssistant()} style={{ padding: "8px 12px", borderRadius: 10, border: "1px solid #0ea5e9", background: "#0ea5e9", color: "#fff", fontWeight: 600 }}>
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
                      <div><strong>Test:</strong> {item.test_start} to {item.test_end}</div>
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
                Using: {activeRagMeta?.title || activeRagModel || "Trading Knowledge"}. RAG is used first, then the LLM expands if needed.
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
                  <div style={{ fontSize: 12, color: "#334155", whiteSpace: "pre-wrap", maxHeight: 220, overflowY: "auto", paddingRight: 6 }}>
                    {qaAnswer}
                  </div>
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
        <>
          <div style={{ display: "grid", gridTemplateColumns: "1.2fr 1.8fr", gap: 16 }}>
          <div style={{ display: "grid", gap: 12 }}>
            <div style={{ background: "#ffffff", borderRadius: 14, padding: 14, border: "1px solid #e5e7eb" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
                <div style={{ fontWeight: 600 }}>Knowledge Model</div>
                <button onClick={loadRagModels} style={{ padding: "4px 8px", borderRadius: 8, border: "1px solid #e2e8f0", background: "#fff", fontSize: 11 }}>
                  Refresh
                </button>
              </div>
              <div style={{ fontSize: 12, color: "#64748b", marginBottom: 8 }}>
                Select the RAG model that powers the Knowledge Map, sources, and Q&A across the trading page.
              </div>
              <select
                value={activeRagModel}
                onChange={(e) => setActiveRagModel(e.target.value)}
                style={{ width: "100%", padding: 8, borderRadius: 10, border: "1px solid #cbd5f5", marginBottom: 8 }}
              >
                {ragModels.map(model => (
                  <option key={model.id} value={model.id}>
                    {model.title || model.id}
                  </option>
                ))}
              </select>
              <div style={{ fontSize: 11, color: "#475569", marginBottom: 6 }}>
                {activeRagMeta?.description || "Personalized knowledge workspace."}
              </div>
                <div style={{ display: "flex", gap: 10, flexWrap: "wrap", fontSize: 11, color: "#64748b" }}>
                  <span>Docs: {knowledgeStats?.totalDocuments || 0}</span>
                <span>Sources: {knowledgeSourceInventory.length}</span>
                  <span>Tags: {knowledgeStats?.totalTags || 0}</span>
                </div>
              {ragModelStatus && <div style={{ fontSize: 11, color: "#94a3b8", marginTop: 6 }}>{ragModelStatus}</div>}
              <div style={{ marginTop: 10, paddingTop: 10, borderTop: "1px solid #e2e8f0" }}>
                <div style={{ fontWeight: 600, marginBottom: 6, fontSize: 12 }}>Create New RAG Model</div>
                <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                  <input
                    value={newRagTopic}
                    onChange={(e) => setNewRagTopic(e.target.value)}
                    placeholder="Topic (e.g., energy markets, biotech)"
                    style={{ flex: 1, minWidth: 180, padding: 8, borderRadius: 10, border: "1px solid #cbd5f5" }}
                  />
                  <button
                    onClick={createRagModel}
                    style={{ padding: "8px 12px", borderRadius: 10, border: "1px solid #0ea5e9", background: "#0ea5e9", color: "#fff", fontWeight: 600 }}
                  >
                    Create
                  </button>
                </div>
                {newRagStatus && <div style={{ fontSize: 11, color: "#475569", marginTop: 6 }}>{newRagStatus}</div>}
              </div>
            </div>

            <div style={{ background: "#ffffff", borderRadius: 14, padding: 14, border: "1px solid #e5e7eb" }}>
              <div style={{ fontWeight: 600, marginBottom: 8 }}>Create How-To</div>
              {activeRagModel === "fireflies" && (
                <div style={{ fontSize: 11, color: "#94a3b8", marginBottom: 8 }}>
                  Fireflies knowledge is read-only. Switch to Trading Knowledge or a custom model to add content.
                </div>
              )}
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
                Sources are crawled in the background, saved locally, and refreshed on schedule.
              </div>
              {activeRagModel === "fireflies" ? (
                <div style={{ fontSize: 12, color: "#94a3b8" }}>
                  Fireflies sources are read-only. Switch to Trading Knowledge or a custom model to manage web sources.
                </div>
              ) : (
                <>
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
                </>
              )}
            </div>

            <div style={{ background: "#ffffff", borderRadius: 14, padding: 14, border: "1px solid #e5e7eb" }}>
              <div style={{ fontWeight: 600, marginBottom: 6 }}>RSS Feeds (Daily AI Review)</div>
              <div style={{ fontSize: 12, color: "#64748b", marginBottom: 10 }}>
                Feeds are reviewed by AI before ingestion. Foreign-market feeds are disabled by default.
              </div>
              {activeRagModel === "fireflies" ? (
                <div style={{ fontSize: 12, color: "#94a3b8" }}>
                  RSS feeds are not available for Fireflies. Switch to Trading Knowledge or a custom model to manage RSS ingestion.
                </div>
              ) : (
                <>
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
                </>
              )}
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
                <div style={{ fontSize: 12, color: "#334155", marginBottom: 8, whiteSpace: "pre-wrap", maxHeight: 220, overflowY: "auto", paddingRight: 6 }}>
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
                    {!knowledgeGraph?.nodes?.length ? (
                      <div style={{ fontSize: 12, color: "#94a3b8" }}>
                        No knowledge graph nodes yet. Add or crawl sources to see the map populate.
                      </div>
                    ) : (
                      <KnowledgeGraph
                        graph={knowledgeGraph}
                        selectedId={knowledgeSelectedNode || (knowledgeSelectedTag ? `tag:${knowledgeSelectedTag}` : knowledgeSelectedSource ? `source:${knowledgeSelectedSource}` : "")}
                        onSelect={handleKnowledgeNodeSelect}
                      />
                    )}
                  </div>
                  <div style={{ marginTop: 6, fontSize: 11, color: "#94a3b8" }}>
                    Nodes represent tags and sources; size reflects how often they appear. Click a node for details.
                  </div>
                  {(knowledgeSelectedTag || knowledgeSelectedSource) && (
                    <div style={{ marginTop: 6, fontSize: 11, color: "#475569" }}>
                      Selected {knowledgeSelectedTag ? "tag" : "source"}:{" "}
                      <strong>{knowledgeSelectedTag ? `#${knowledgeSelectedTag}` : formatSourceLabel(knowledgeSelectedSource)}</strong>
                    </div>
                  )}
                  {(knowledgeStats?.tags?.length || knowledgeStats?.topSources?.length) && (
                    <div style={{ display: "grid", gap: 6, marginTop: 10, fontSize: 11, color: "#64748b" }}>
                      {knowledgeStats?.tags?.length ? (
                        <div>
                          Top tags: {knowledgeStats.tags.slice(0, 6).map(item => `#${item.tag} (${item.count})`).join(", ")}
                        </div>
                      ) : null}
                      {knowledgeStats?.topSources?.length ? (
                        <div>
                          Top sources: {knowledgeStats.topSources.slice(0, 4).map(item => `${formatSourceLabel(item.title || item.source_url || item.key, 20)} (${item.count})`).join(", ")}
                        </div>
                      ) : null}
                    </div>
                  )}
                </>
              )}
            </div>

            <div style={{ background: "#ffffff", borderRadius: 14, padding: 14, border: "1px solid #e5e7eb" }}>
              <div style={{ fontWeight: 600, marginBottom: 8 }}>Sources & Age</div>
              {knowledgeSourceInventory.length === 0 ? (
                <div style={{ fontSize: 12, color: "#94a3b8" }}>No sources indexed yet.</div>
              ) : (
                <div style={{ display: "grid", gap: 8, maxHeight: 220, overflow: "auto" }}>
                  {knowledgeSourceInventory.map((source, idx) => (
                    <div key={`${source.key}-${idx}`} style={{ border: "1px solid #e2e8f0", borderRadius: 10, padding: 8 }}>
                      <div style={{ fontSize: 12, fontWeight: 600 }}>{source.title || formatSourceLabel(source.source_url || source.key, 30)}</div>
                      {source.source_url && (
                        <div style={{ fontSize: 10, color: "#64748b" }}>{source.source_url}</div>
                      )}
                      <div style={{ fontSize: 10, color: "#94a3b8" }}>
                        {source.kind ? `${source.kind.toUpperCase()} | ` : ""}
                        Docs: {source.count || 0}
                        {Number.isFinite(source.age_days)
                          ? ` | ${source.age_days}d since last update`
                          : source.last_crawled_at
                            ? ` | last crawl ${source.last_crawled_at}`
                            : ""}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div style={{ background: "#ffffff", borderRadius: 14, padding: 14, border: "1px solid #e5e7eb" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
                <div style={{ fontWeight: 600 }}>Knowledge Library</div>
                {(knowledgeSelectedTag || knowledgeSelectedSource) && (
                    <button
                      onClick={clearKnowledgeFilter}
                      style={{ padding: "4px 8px", borderRadius: 8, border: "1px solid #e2e8f0", background: "#fff", fontSize: 11 }}
                    >
                      Clear Filter
                    </button>
                )}
              </div>
              <div style={{ fontSize: 12, color: "#64748b", marginBottom: 8 }}>
                {knowledgeSelectedTag
                  ? `Filtered by tag: #${knowledgeSelectedTag}`
                  : knowledgeSelectedSource
                    ? `Filtered by source: ${formatSourceLabel(knowledgeSelectedSource)}`
                    : "Recent indexed trading notes and sources."}
              </div>
              {knowledgeLibrary.mode === "sources" && (
                <div style={{ fontSize: 11, color: "#94a3b8", marginBottom: 6 }}>
                  Showing configured sources that have not been indexed yet.
                </div>
              )}
              <div style={{ display: "grid", gap: 8, maxHeight: 260, overflow: "auto" }}>
                {knowledgeLibrary.items.length === 0 && <div style={{ fontSize: 12, color: "#94a3b8" }}>No knowledge indexed yet.</div>}
                {knowledgeLibrary.items.map(item => (
                  <div key={item.id} style={{ border: "1px solid #e5e7eb", borderRadius: 10, padding: 8 }}>
                    <div style={{ fontWeight: 600 }}>{item.title}</div>
                    {item.source_url && (
                      <div style={{ fontSize: 11, color: "#64748b" }}>{item.source_url}</div>
                    )}
                    {item.occurred_at && (
                      <div style={{ fontSize: 10, color: "#94a3b8" }}>{item.occurred_at}</div>
                    )}
                    {item.isSource && (
                      <div style={{ fontSize: 10, color: "#94a3b8" }}>Source registered (awaiting crawl/index).</div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>

        {knowledgeNodeDetail && (
          <div style={{
            position: "fixed",
            inset: 0,
            background: "rgba(15,23,42,0.45)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            zIndex: 60,
            padding: 16
          }}>
            <div style={{
              width: "min(760px, 92vw)",
              maxHeight: "80vh",
              overflow: "auto",
              background: "#ffffff",
              borderRadius: 14,
              padding: 16,
              border: "1px solid #e2e8f0",
              boxShadow: "0 24px 60px rgba(15,23,42,0.25)"
            }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
                <div style={{ fontWeight: 700, fontSize: 14 }}>
                  {knowledgeNodeDetail.type === "tag" ? "Tag:" : "Source:"} {knowledgeNodeDetail.type === "tag" ? `#${knowledgeNodeDetail.label}` : formatSourceLabel(knowledgeNodeDetail.label || knowledgeNodeDetail.source_url || "")}
                </div>
                <div style={{ display: "flex", gap: 8 }}>
                  {(knowledgeSelectedTag || knowledgeSelectedSource) && (
                    <button
                      onClick={clearKnowledgeFilter}
                      style={{ padding: "4px 8px", borderRadius: 8, border: "1px solid #e2e8f0", background: "#fff", fontSize: 11 }}
                    >
                      Clear Filter
                    </button>
                  )}
                  <button onClick={() => setKnowledgeNodeDetail(null)} style={{ padding: "4px 8px", borderRadius: 8, border: "1px solid #e2e8f0", background: "#fff", fontSize: 11 }}>
                    Close
                  </button>
                </div>
              </div>
              {knowledgeNodeDetail.type === "source" && knowledgeNodeDetail.source_url && (
                <div style={{ fontSize: 11, color: "#64748b", marginBottom: 8 }}>{knowledgeNodeDetail.source_url}</div>
              )}
              <div style={{ fontSize: 12, color: "#64748b", marginBottom: 10 }}>
                Appears in {knowledgeNodeDetail.count || 0} knowledge item(s).
                {knowledgeNodeDetail.last_seen ? ` Latest: ${knowledgeNodeDetail.last_seen}` : ""}
              </div>
              {knowledgeNodeStatus && (
                <div style={{ fontSize: 12, color: "#94a3b8", marginBottom: 8 }}>{knowledgeNodeStatus}</div>
              )}
              {knowledgeNodeDetail.summary && (
                <div style={{ fontSize: 12, color: "#334155", marginBottom: 10 }}>
                  {knowledgeNodeDetail.summary}
                </div>
              )}
              {knowledgeNodeDetail.type === "tag" && knowledgeNodeDetail.sources?.length ? (
                <div style={{ marginBottom: 10 }}>
                  <div style={{ fontWeight: 600, fontSize: 12, marginBottom: 6 }}>Top sources</div>
                  <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                    {knowledgeNodeDetail.sources.map(source => (
                      <span key={source.key} style={{ fontSize: 11, padding: "4px 8px", borderRadius: 999, border: "1px solid #e2e8f0", background: "#f8fafc" }}>
                        {formatSourceLabel(source.title || source.key, 24)} ({source.count})
                      </span>
                    ))}
                  </div>
                </div>
              ) : null}
              {knowledgeNodeDetail.type === "tag" && knowledgeNodeDetail.related_tags?.length ? (
                <div style={{ marginBottom: 10 }}>
                  <div style={{ fontWeight: 600, fontSize: 12, marginBottom: 6 }}>Related tags</div>
                  <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                    {knowledgeNodeDetail.related_tags.map(tag => (
                      <span key={tag.tag} style={{ fontSize: 11, padding: "4px 8px", borderRadius: 999, border: "1px solid #e2e8f0", background: "#f1f5f9" }}>
                        #{tag.tag} ({tag.count})
                      </span>
                    ))}
                  </div>
                </div>
              ) : null}
              {knowledgeNodeDetail.type === "source" && knowledgeNodeDetail.tags?.length ? (
                <div style={{ marginBottom: 10 }}>
                  <div style={{ fontWeight: 600, fontSize: 12, marginBottom: 6 }}>Top tags</div>
                  <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                    {knowledgeNodeDetail.tags.map(tag => (
                      <span key={tag.tag} style={{ fontSize: 11, padding: "4px 8px", borderRadius: 999, border: "1px solid #e2e8f0", background: "#f1f5f9" }}>
                        #{tag.tag} ({tag.count})
                      </span>
                    ))}
                  </div>
                </div>
              ) : null}
              {knowledgeNodeDetail.snippets?.length ? (
                <div style={{ marginBottom: 12 }}>
                  <div style={{ fontWeight: 600, fontSize: 12, marginBottom: 6 }}>Top snippets</div>
                  <div style={{ display: "grid", gap: 8 }}>
                    {knowledgeNodeDetail.snippets.map(snippet => (
                      <div key={snippet.chunk_id} style={{ border: "1px solid #e5e7eb", borderRadius: 10, padding: 10 }}>
                        <div style={{ fontSize: 11, color: "#475569", fontWeight: 600 }}>
                          {snippet.meeting_title || "Knowledge"} {snippet.occurred_at ? `- ${snippet.occurred_at}` : ""}
                        </div>
                        <div style={{ fontSize: 11, color: "#94a3b8" }}>{snippet.chunk_id}</div>
                        <div style={{ marginTop: 6, fontSize: 12 }}>{snippet.text}</div>
                      </div>
                    ))}
                  </div>
                </div>
              ) : null}
              <div style={{ display: "grid", gap: 8 }}>
                {(knowledgeNodeDetail.docs || []).slice(0, 8).map(item => (
                  <div key={item.id} style={{ border: "1px solid #e5e7eb", borderRadius: 10, padding: 10 }}>
                    <div style={{ fontWeight: 600 }}>{item.title || "Knowledge"}</div>
                    <div style={{ fontSize: 11, color: "#6b7280" }}>{item.occurred_at || "Unknown date"}</div>
                    {item.source_url && (
                      <div style={{ fontSize: 11, color: "#64748b" }}>{item.source_url}</div>
                    )}
                  </div>
                ))}
                {(knowledgeNodeDetail.docs || []).length === 0 && (
                  <div style={{ fontSize: 12, color: "#94a3b8" }}>No knowledge items match this node yet.</div>
                )}
              </div>
            </div>
          </div>
        )}
        </>
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
                <button
                  key={`${result.symbol}-${result.windowDays}`}
                  type="button"
                  onClick={() => openScenarioDetail(result)}
                  style={{
                    border: "1px solid #e5e7eb",
                    borderRadius: 10,
                    padding: 8,
                    textAlign: "left",
                    background: "#fff",
                    cursor: "pointer"
                  }}
                >
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
                </button>
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

      {recommendationDetail && (
        <div style={{
          position: "fixed",
          inset: 0,
          background: "rgba(15,23,42,0.45)",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          zIndex: 70,
          padding: 16
        }}>
          <div style={{
            width: "min(980px, 94vw)",
            maxHeight: "85vh",
            overflow: "auto",
            background: "#ffffff",
            borderRadius: 16,
            padding: 18,
            border: "1px solid #e2e8f0",
            boxShadow: "0 24px 60px rgba(15,23,42,0.25)"
          }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
              <div>
                <div style={{ fontWeight: 700, fontSize: 16 }}>
                  {recommendationDetail.symbol || "Recommendation"} {recommendationDetail.assetClass ? `(${recommendationDetail.assetClass})` : ""}
                </div>
                <div style={{ fontSize: 12, color: "#64748b" }}>
                  Bias: {recommendationDetail.bias || "WATCH"} {recommendationDetail.provider ? `· Provider: ${recommendationDetail.provider}` : ""} {recommendationDetail.generatedAt ? `· ${recommendationDetail.generatedAt}` : ""}
                </div>
              </div>
              <div style={{ display: "flex", gap: 8 }}>
                <button
                  onClick={() => {
                    const targetClass = recommendationDetail.assetClass === "crypto" ? "crypto" : "stock";
                    switchAssetClass(targetClass);
                    if (recommendationDetail.symbol) {
                      setSymbol(recommendationDetail.symbol);
                      setSymbolTouched(true);
                    }
                    setTradingTab("terminal");
                  }}
                  style={{ padding: "6px 10px", borderRadius: 8, border: "1px solid #0ea5e9", background: "#e0f2fe", color: "#0ea5e9", fontSize: 12 }}
                >
                  Use in Terminal
                </button>
                <button
                  onClick={() => { setRecommendationDetail(null); setRecommendationDetailStatus(""); }}
                  style={{ padding: "6px 10px", borderRadius: 8, border: "1px solid #e2e8f0", background: "#fff", fontSize: 12 }}
                >
                  Close
                </button>
              </div>
            </div>
            {recommendationDetailStatus && (
              <div style={{ fontSize: 12, color: "#94a3b8", marginBottom: 10 }}>{recommendationDetailStatus}</div>
            )}
            {recommendationDetail.error ? (
              <div style={{ fontSize: 12, color: "#b91c1c" }}>
                Unable to build analysis: {recommendationDetail.error}. Try again after refreshing data sources.
              </div>
            ) : (
              <>
                {recommendationDetail.metrics && (
                  <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 10, marginBottom: 12 }}>
                    <div style={{ border: "1px solid #e2e8f0", borderRadius: 10, padding: 10 }}>
                      <div style={{ fontSize: 11, color: "#64748b" }}>Last Close</div>
                      <div style={{ fontWeight: 600 }}>{recommendationDetail.metrics.lastClose ?? "n/a"}</div>
                    </div>
                    <div style={{ border: "1px solid #e2e8f0", borderRadius: 10, padding: 10 }}>
                      <div style={{ fontSize: 11, color: "#64748b" }}>ATR (14)</div>
                      <div style={{ fontWeight: 600 }}>{recommendationDetail.metrics.atr ?? "n/a"}</div>
                    </div>
                    <div style={{ border: "1px solid #e2e8f0", borderRadius: 10, padding: 10 }}>
                      <div style={{ fontSize: 11, color: "#64748b" }}>Max Drawdown</div>
                      <div style={{ fontWeight: 600 }}>{recommendationDetail.metrics.maxDrawdownPct ?? "n/a"}%</div>
                    </div>
                  </div>
                )}
                {recommendationDetail.narrative && (
                  <div style={{ marginBottom: 14 }}>
                    <div style={{ fontWeight: 600, marginBottom: 6 }}>Scenario Narrative</div>
                    <div style={{ fontSize: 12, color: "#334155", whiteSpace: "pre-wrap" }}>{recommendationDetail.narrative}</div>
                  </div>
                )}
                {(recommendationDetail.sections || []).map((section, idx) => (
                  <div key={`${section.title}-${idx}`} style={{ marginBottom: 12, border: "1px solid #e5e7eb", borderRadius: 12, padding: 12, background: "#f8fafc" }}>
                    <div style={{ fontWeight: 600, marginBottom: 6 }}>{section.title}</div>
                    {section.body && (
                      <div style={{ fontSize: 12, color: "#334155" }}>{section.body}</div>
                    )}
                    {section.bullets?.length ? (
                      <div style={{ display: "grid", gap: 6, fontSize: 12, color: "#475569", marginTop: 6 }}>
                        {section.bullets.map((bullet, bIdx) => (
                          <div key={`${section.title}-bullet-${bIdx}`}>• {bullet}</div>
                        ))}
                      </div>
                    ) : null}
                  </div>
                ))}
                {recommendationDetail.citations?.length ? (
                  <div style={{ marginTop: 12 }}>
                    <div style={{ fontWeight: 600, marginBottom: 6 }}>Knowledge Citations</div>
                    <div style={{ display: "grid", gap: 8 }}>
                      {recommendationDetail.citations.slice(0, 8).map((cite, idx) => (
                        <div key={`${cite.chunk_id || idx}`} style={{ fontSize: 11, color: "#64748b", background: "#f1f5f9", padding: 8, borderRadius: 8 }}>
                          <div style={{ fontWeight: 600 }}>{cite.meeting_title || "Knowledge"}</div>
                          <div>{cite.chunk_id}</div>
                          <div>{cite.snippet}</div>
                        </div>
                      ))}
                    </div>
                  </div>
                ) : null}
              </>
            )}
          </div>
        </div>
      )}

      {scenarioDetail && (
        <div style={{
          position: "fixed",
          inset: 0,
          background: "rgba(15,23,42,0.45)",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          zIndex: 70,
          padding: 16
        }}>
          <div style={{
            width: "min(920px, 94vw)",
            maxHeight: "82vh",
            overflow: "auto",
            background: "#ffffff",
            borderRadius: 16,
            padding: 18,
            border: "1px solid #e2e8f0",
            boxShadow: "0 24px 60px rgba(15,23,42,0.25)"
          }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
              <div>
                <div style={{ fontWeight: 700, fontSize: 16 }}>
                  {scenarioDetail.symbol || "Scenario Detail"} {scenarioDetail.assetClass ? `(${scenarioDetail.assetClass})` : ""}
                </div>
                <div style={{ fontSize: 12, color: "#64748b" }}>
                  Window: {scenarioDetail.windowDays || scenarioWindow} days · Provider: {scenarioDetail.provider || "unknown"} · Bars: {scenarioDetail.points || "n/a"}
                </div>
              </div>
              <button onClick={() => { setScenarioDetail(null); setScenarioDetailStatus(""); }} style={{ padding: "6px 10px", borderRadius: 8, border: "1px solid #e2e8f0", background: "#fff", fontSize: 12 }}>
                Close
              </button>
            </div>
            {scenarioDetailStatus && (
              <div style={{ fontSize: 12, color: "#94a3b8", marginBottom: 10 }}>{scenarioDetailStatus}</div>
            )}
            {scenarioDetail.error ? (
              <div style={{ fontSize: 12, color: "#b91c1c" }}>
                Unable to build analysis: {scenarioDetail.error}. Try running scenarios again or verify data access.
              </div>
            ) : (
              <>
                <div style={{ marginBottom: 14 }}>
                  <div style={{ fontWeight: 600, marginBottom: 6 }}>Verbose Analysis</div>
                  <div style={{ fontSize: 12, color: "#334155", whiteSpace: "pre-wrap" }}>
                    {scenarioDetail.narrative || "No analysis generated yet."}
                  </div>
                </div>
                <div style={{ marginBottom: 14 }}>
                  <div style={{ fontWeight: 600, marginBottom: 6 }}>Key Metrics</div>
                  <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 10 }}>
                    <div style={{ border: "1px solid #e2e8f0", borderRadius: 10, padding: 10 }}>
                      <div style={{ fontSize: 11, color: "#64748b" }}>Return</div>
                      <div style={{ fontWeight: 600 }}>{formatScenarioValue(scenarioDetail.returnPct, "%")}</div>
                      <div style={{ fontSize: 11, color: "#94a3b8" }}>
                        Start {formatScenarioValue(scenarioDetail.startPrice, "")} · End {formatScenarioValue(scenarioDetail.endPrice, "")}
                      </div>
                    </div>
                    <div style={{ border: "1px solid #e2e8f0", borderRadius: 10, padding: 10 }}>
                      <div style={{ fontSize: 11, color: "#64748b" }}>Range</div>
                      <div style={{ fontWeight: 600 }}>{formatScenarioValue(scenarioDetail.rangePct, "%")}</div>
                      <div style={{ fontSize: 11, color: "#94a3b8" }}>
                        {formatScenarioValue(scenarioDetail.rangeLow, "")} to {formatScenarioValue(scenarioDetail.rangeHigh, "")}
                      </div>
                    </div>
                    <div style={{ border: "1px solid #e2e8f0", borderRadius: 10, padding: 10 }}>
                      <div style={{ fontSize: 11, color: "#64748b" }}>Trend</div>
                      <div style={{ fontWeight: 600 }}>{scenarioDetail.trendLabel || "Not enough data"}</div>
                      <div style={{ fontSize: 11, color: "#94a3b8" }}>Slope {formatScenarioValue(scenarioDetail.trendSlopePct, "%/day")}</div>
                    </div>
                    <div style={{ border: "1px solid #e2e8f0", borderRadius: 10, padding: 10 }}>
                      <div style={{ fontSize: 11, color: "#64748b" }}>Volatility</div>
                      <div style={{ fontWeight: 600 }}>{formatScenarioValue(scenarioDetail.annualVol, "%")}</div>
                      <div style={{ fontSize: 11, color: "#94a3b8" }}>Daily {formatScenarioValue(scenarioDetail.dailyVol, "%")}</div>
                    </div>
                    <div style={{ border: "1px solid #e2e8f0", borderRadius: 10, padding: 10 }}>
                      <div style={{ fontSize: 11, color: "#64748b" }}>Drawdown</div>
                      <div style={{ fontWeight: 600 }}>{formatScenarioValue(scenarioDetail.maxDrawdownPct, "%")}</div>
                      <div style={{ fontSize: 11, color: "#94a3b8" }}>Best {formatScenarioValue(scenarioDetail.bestDayPct, "%")} · Worst {formatScenarioValue(scenarioDetail.worstDayPct, "%")}</div>
                    </div>
                    <div style={{ border: "1px solid #e2e8f0", borderRadius: 10, padding: 10 }}>
                      <div style={{ fontSize: 11, color: "#64748b" }}>Momentum</div>
                      <div style={{ fontWeight: 600 }}>RSI {formatScenarioValue(scenarioDetail.rsi14, "")}</div>
                      <div style={{ fontSize: 11, color: "#94a3b8" }}>
                        5d {formatScenarioValue(scenarioDetail.momentum5, "%")} · 10d {formatScenarioValue(scenarioDetail.momentum10, "%")} · 20d {formatScenarioValue(scenarioDetail.momentum20, "%")}
                      </div>
                    </div>
                    <div style={{ border: "1px solid #e2e8f0", borderRadius: 10, padding: 10 }}>
                      <div style={{ fontSize: 11, color: "#64748b" }}>Moving Averages</div>
                      <div style={{ fontWeight: 600 }}>10d {formatScenarioValue(scenarioDetail.ma10, "")}</div>
                      <div style={{ fontSize: 11, color: "#94a3b8" }}>20d {formatScenarioValue(scenarioDetail.ma20, "")} · 50d {formatScenarioValue(scenarioDetail.ma50, "")}</div>
                    </div>
                    <div style={{ border: "1px solid #e2e8f0", borderRadius: 10, padding: 10 }}>
                      <div style={{ fontSize: 11, color: "#64748b" }}>Long-Term Trend</div>
                      <div style={{ fontWeight: 600 }}>200d {formatScenarioValue(scenarioDetail.ma200, "")}</div>
                      <div style={{ fontSize: 11, color: "#94a3b8" }}>Trend strength {formatScenarioValue(scenarioDetail.trendStrengthPct, "%")}</div>
                    </div>
                    <div style={{ border: "1px solid #e2e8f0", borderRadius: 10, padding: 10 }}>
                      <div style={{ fontSize: 11, color: "#64748b" }}>Win / Loss Tape</div>
                      <div style={{ fontWeight: 600 }}>Win rate {formatScenarioValue(scenarioDetail.winRate, "%")}</div>
                      <div style={{ fontSize: 11, color: "#94a3b8" }}>
                        Avg up {formatScenarioValue(scenarioDetail.avgUp, "%")} · Avg down {formatScenarioValue(scenarioDetail.avgDown, "%")}
                      </div>
                    </div>
                    <div style={{ border: "1px solid #e2e8f0", borderRadius: 10, padding: 10 }}>
                      <div style={{ fontSize: 11, color: "#64748b" }}>ATR & Vol Regime</div>
                      <div style={{ fontWeight: 600 }}>ATR {formatScenarioValue(scenarioDetail.atr14, "")}</div>
                      <div style={{ fontSize: 11, color: "#94a3b8" }}>
                        {scenarioDetail.volRegime || "Vol regime n/a"} · 10d {formatScenarioValue(scenarioDetail.volShort, "%")} · 30d {formatScenarioValue(scenarioDetail.volLong, "%")}
                      </div>
                    </div>
                    <div style={{ border: "1px solid #e2e8f0", borderRadius: 10, padding: 10 }}>
                      <div style={{ fontSize: 11, color: "#64748b" }}>Liquidity</div>
                      <div style={{ fontWeight: 600 }}>{formatScenarioValue(scenarioDetail.avgVolume, "")}</div>
                      <div style={{ fontSize: 11, color: "#94a3b8" }}>Recent {formatScenarioValue(scenarioDetail.recentVolume, "")} · Last {formatScenarioValue(scenarioDetail.lastVolume, "")}</div>
                    </div>
                    <div style={{ border: "1px solid #e2e8f0", borderRadius: 10, padding: 10 }}>
                      <div style={{ fontSize: 11, color: "#64748b" }}>Support/Resistance</div>
                      <div style={{ fontWeight: 600 }}>{formatScenarioValue(scenarioDetail.support, "")}</div>
                      <div style={{ fontSize: 11, color: "#94a3b8" }}>Resistance {formatScenarioValue(scenarioDetail.resistance, "")}</div>
                    </div>
                  </div>
                </div>
                {scenarioDetail.warnings?.length ? (
                  <div style={{ fontSize: 12, color: "#b45309", background: "#fff7ed", border: "1px solid #fed7aa", padding: 10, borderRadius: 10 }}>
                    <div style={{ fontWeight: 600, marginBottom: 4 }}>Data Warnings</div>
                    <div>{scenarioDetail.warnings.join("; ")}</div>
                  </div>
                ) : null}
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
